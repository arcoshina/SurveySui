module surveysui::survey_pass;

use std::bcs;
use sui::ed25519;
use sui::clock::{Self, Clock};
use sui::table::{Self, Table};
use sui::dynamic_field;
use sui::object::{Self, ID};

// Source types
const SRC_SELF_REPORT: u8 = 1;
const SRC_EMAIL: u8 = 2;
const SRC_SOCIAL: u8 = 3;
const SRC_SELF_PROTOCOL: u8 = 4;
const SRC_WORLD_ID: u8 = 5;

// Status types
const STATUS_ACTIVE: u8 = 0;
const STATUS_REVOKED: u8 = 3;

// Error codes
const EDuplicateNullifier: u64 = 0;
const EInvalidTicketSig: u64 = 1;
const EOwnerMismatch: u64 = 2;
const ETicketExpired: u64 = 3;
const ENotAdmin: u64 = 4;
const ENotActive: u64 = 5;
const EPassRevoked: u64 = 6;

public struct NullifierRegistry has key {
    id: UID,
    used: Table<vector<u8>, address>, // nullifier_hash -> owner address
    passes: Table<address, ID>,
}

public struct IssuerConfig has key {
    id: UID,
    issuer_pubkey: vector<u8>,
    admin: address,
}

public struct SurveyPass has key {
    id: UID,
    owner: address,
    effective_tier: u8,
    credential_sources: vector<u8>,
    created_at: u64,
    expires_at: u64,
    status: u8,
    encrypted_payload: Option<vector<u8>>,
}

public struct CredentialKey has copy, drop, store {
    source: u8
}

public struct CredentialSlot has store {
    commitment: vector<u8>,
    nullifier: vector<u8>, // 存 nullifier_hash
    issued_at: u64,
    expires_at: u64,
}

public struct TicketPayload has copy, drop {
    owner: address,
    source: u8,
    nullifier_hash: vector<u8>,
    commitment: vector<u8>,
    expires_at: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(NullifierRegistry {
        id: object::new(ctx),
        used: table::new(ctx),
        passes: table::new(ctx),
    });
    transfer::share_object(IssuerConfig {
        id: object::new(ctx),
        issuer_pubkey: vector[],
        admin: ctx.sender(),
    });
}

// 根據專案 KYC 方案定義，計算各來源的 trust tier 級別
fun get_source_tier(source: u8): u8 {
    if (source == SRC_SELF_REPORT) { 0 }
    else if (source == SRC_EMAIL) { 0 }
    else if (source == SRC_SOCIAL) { 1 }
    else if (source == SRC_SELF_PROTOCOL) { 2 }
    else if (source == SRC_WORLD_ID) { 2 }
    else { 0 }
}

// 重新計算有效 tier 與過期時間
fun recompute_tier_and_expiry(pass: &mut SurveyPass, clock: &Clock) {
    let now = clock::timestamp_ms(clock);
    let mut max_tier: u8 = 0;
    let mut max_expiry: u64 = 0;
    let sources = &pass.credential_sources;
    let mut i = 0;
    let len = vector::length(sources);
    while (i < len) {
        let src = *vector::borrow(sources, i);
        let key = CredentialKey { source: src };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let slot = dynamic_field::borrow<CredentialKey, CredentialSlot>(&pass.id, key);
            if (slot.expires_at > now) {
                let tier = get_source_tier(src);
                if (tier > max_tier) {
                    max_tier = tier;
                };
                if (slot.expires_at > max_expiry) {
                    max_expiry = slot.expires_at;
                };
            };
        };
        i = i + 1;
    };
    pass.effective_tier = max_tier;
    pass.expires_at = max_expiry;
}

// 驗證 Ticket 簽名
fun verify_ticket(
    config: &IssuerConfig,
    owner: address,
    source: u8,
    nullifier_hash: &vector<u8>,
    commitment: &vector<u8>,
    expires_at: u64,
    bff_sig: &vector<u8>,
    clock: &Clock,
) {
    assert!(clock::timestamp_ms(clock) < expires_at, ETicketExpired);
    let payload = TicketPayload {
        owner,
        source,
        nullifier_hash: *nullifier_hash,
        commitment: *commitment,
        expires_at,
    };
    let msg = bcs::to_bytes(&payload);
    assert!(
        ed25519::ed25519_verify(bff_sig, &config.issuer_pubkey, &msg),
        EInvalidTicketSig
    );
}

// 註冊 nullifier
fun register_nullifier(
    registry: &mut NullifierRegistry,
    nullifier_hash: vector<u8>,
    owner: address,
) {
    if (table::contains(&registry.used, nullifier_hash)) {
        let existing_owner = *table::borrow(&registry.used, nullifier_hash);
        assert!(existing_owner == owner, EDuplicateNullifier);
    } else {
        table::add(&mut registry.used, nullifier_hash, owner);
    };
}

/// Mint a new SurveyPass
public fun mint_pass(
    registry: &mut NullifierRegistry,
    config: &IssuerConfig,
    owner: address,
    source: u8,
    nullifier_hash: vector<u8>,
    commitment: vector<u8>,
    expires_at: u64,
    bff_sig: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == owner, EOwnerMismatch);
    verify_ticket(config, owner, source, &nullifier_hash, &commitment, expires_at, &bff_sig, clock);
    register_nullifier(registry, nullifier_hash, owner);

    let mut pass = SurveyPass {
        id: object::new(ctx),
        owner,
        effective_tier: 0,
        credential_sources: vector[source],
        created_at: clock::timestamp_ms(clock),
        expires_at: 0,
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
    };

    if (table::contains(&registry.passes, owner)) {
        table::remove(&mut registry.passes, owner);
    };
    table::add(&mut registry.passes, owner, object::id(&pass));

    let key = CredentialKey { source };
    let slot = CredentialSlot {
        commitment,
        nullifier: nullifier_hash,
        issued_at: clock::timestamp_ms(clock),
        expires_at,
    };
    dynamic_field::add(&mut pass.id, key, slot);
    recompute_tier_and_expiry(&mut pass, clock);

    transfer::share_object(pass);
}

/// Update or add credential on an existing pass
public fun update_pass_credential(
    pass: &mut SurveyPass,
    registry: &mut NullifierRegistry,
    config: &IssuerConfig,
    source: u8,
    nullifier_hash: vector<u8>,
    commitment: vector<u8>,
    expires_at: u64,
    bff_sig: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pass.status == STATUS_ACTIVE, EPassRevoked);
    let owner = pass.owner;
    assert!(ctx.sender() == owner, EOwnerMismatch);
    verify_ticket(config, owner, source, &nullifier_hash, &commitment, expires_at, &bff_sig, clock);
    register_nullifier(registry, nullifier_hash, owner);

    let key = CredentialKey { source };
    if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
        let slot = dynamic_field::borrow_mut<CredentialKey, CredentialSlot>(&mut pass.id, key);
        slot.commitment = commitment;
        slot.nullifier = nullifier_hash;
        slot.issued_at = clock::timestamp_ms(clock);
        slot.expires_at = expires_at;
    } else {
        vector::push_back(&mut pass.credential_sources, source);
        let slot = CredentialSlot {
            commitment,
            nullifier: nullifier_hash,
            issued_at: clock::timestamp_ms(clock),
            expires_at,
        };
        dynamic_field::add(&mut pass.id, key, slot);
    };

    recompute_tier_and_expiry(pass, clock);
}

public fun revoke_pass(
    pass: &mut SurveyPass,
    config: &IssuerConfig,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    assert!(pass.status == STATUS_ACTIVE, ENotActive);
    pass.status = STATUS_REVOKED;
}

public fun delete_pass(
    registry: &mut NullifierRegistry,
    mut pass: SurveyPass,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == pass.owner, EOwnerMismatch);
    assert!(pass.status == STATUS_REVOKED, ENotActive);
    
    if (table::contains(&registry.passes, pass.owner)) {
        table::remove(&mut registry.passes, pass.owner);
    };

    // 清除所有的 dynamic fields
    let sources = pass.credential_sources;
    let mut i = 0;
    let len = vector::length(&sources);
    while (i < len) {
        let src = *vector::borrow(&sources, i);
        let key = CredentialKey { source: src };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let CredentialSlot { commitment: _, nullifier: _, issued_at: _, expires_at: _ } = 
                dynamic_field::remove<CredentialKey, CredentialSlot>(&mut pass.id, key);
        };
        i = i + 1;
    };

    let SurveyPass {
        id,
        owner: _,
        effective_tier: _,
        credential_sources: _,
        created_at: _,
        expires_at: _,
        status: _,
        encrypted_payload: _,
    } = pass;
    object::delete(id);
}

public fun set_issuer_pubkey(
    config: &mut IssuerConfig,
    pubkey: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    config.issuer_pubkey = pubkey;
}

public fun is_valid(pass: &SurveyPass, clock: &Clock): bool {
    pass.status == STATUS_ACTIVE && clock::timestamp_ms(clock) < pass.expires_at
}

public fun owner(pass: &SurveyPass): address { pass.owner }
public fun status(pass: &SurveyPass): u8 { pass.status }
public fun effective_tier(pass: &SurveyPass): u8 { pass.effective_tier }
public fun expires_at(pass: &SurveyPass): u64 { pass.expires_at }
public fun created_at(pass: &SurveyPass): u64 { pass.created_at }
public fun admin(config: &IssuerConfig): address { config.admin }

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}
