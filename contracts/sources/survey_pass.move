module surveysui::survey_pass;
use std::bcs;
use sui::ed25519;
use sui::clock::{Self, Clock};
use sui::table::{Self, Table};
use sui::dynamic_field;
use sui::object::{Self, ID};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
const SRC_SELF_REPORT: u8 = 1;
const SRC_EMAIL: u8 = 2;
const SRC_SOCIAL: u8 = 3;
const SRC_SELF_PROTOCOL: u8 = 4;
const SRC_WORLD_ID: u8 = 5;
const SRC_SOCIAL_GOOGLE: u8 = 6;
const SRC_SOCIAL_GITHUB: u8 = 7;
const SRC_ATTRIBUTES: u8 = 8;
const STATUS_ACTIVE: u8 = 0;
const STATUS_REVOKED: u8 = 3;
const CREDENTIAL_ACTIVE: u8 = 0;
const CREDENTIAL_REVOKED: u8 = 1;
const EDuplicateNullifier: u64 = 0;
const EInvalidTicketSig: u64 = 1;
const EOwnerMismatch: u64 = 2;
const ETicketExpired: u64 = 3;
const ENotAdmin: u64 = 4;
const ENotActive: u64 = 5;
const EPassRevoked: u64 = 6;
const EFeeTooLow: u64 = 7;
const EPassAlreadyExists: u64 = 8;
const EExtraTicketsMismatch: u64 = 9;
const REBATE_FEE_FLOOR: u64 = 10_000_000;
public struct NullifierRegistry has key {
    id: UID,
    used: Table<vector<u8>, address>,
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
    deposit_payer: address,
    credential_sources: vector<u8>,
    created_at: u64,
    status: u8,
    encrypted_payload: Option<vector<u8>>,
}
public struct CredentialKey has copy, drop, store {
    source: u8
}
public struct CredentialSlot has store {
    commitment: vector<u8>,
    nullifiers: vector<vector<u8>>,
    issued_at: u64,
    expires_at: u64,
    status: u8,
}
public struct TicketPayload has copy, drop {
    owner: address,
    source: u8,
    nullifiers: vector<vector<u8>>,
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
public fun is_source_valid(pass: &SurveyPass, source: u8, clock: &Clock): bool {
    if (pass.status != STATUS_ACTIVE) { return false };
    let key = CredentialKey { source };
    if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
        let slot = dynamic_field::borrow<CredentialKey, CredentialSlot>(&pass.id, key);
        slot.status == CREDENTIAL_ACTIVE && clock::timestamp_ms(clock) < slot.expires_at
    } else {
        false
    }
}
fun register_all_nullifiers(
    registry: &mut NullifierRegistry,
    nullifiers: &vector<vector<u8>>,
    owner: address,
) {
    let mut i = 0;
    let len = vector::length(nullifiers);
    while (i < len) {
        register_nullifier(registry, *vector::borrow(nullifiers, i), owner);
        i = i + 1;
    }
}
fun verify_ticket(
    config: &IssuerConfig,
    owner: address,
    source: u8,
    nullifiers: &vector<vector<u8>>,
    commitment: &vector<u8>,
    expires_at: u64,
    bff_sig: &vector<u8>,
    clock: &Clock,
) {
    assert!(clock::timestamp_ms(clock) < expires_at, ETicketExpired);
    let payload = TicketPayload {
        owner,
        source,
        nullifiers: *nullifiers,
        commitment: *commitment,
        expires_at,
    };
    let msg = bcs::to_bytes(&payload);
    assert!(
        ed25519::ed25519_verify(bff_sig, &config.issuer_pubkey, &msg),
        EInvalidTicketSig
    );
}
fun apply_credential_slot(
    pass: &mut SurveyPass,
    source: u8,
    nullifiers: vector<vector<u8>>,
    commitment: vector<u8>,
    expires_at: u64,
    clock: &Clock,
) {
    let key = CredentialKey { source };
    if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
        let slot = dynamic_field::borrow_mut<CredentialKey, CredentialSlot>(&mut pass.id, key);
        slot.commitment = commitment;
        slot.nullifiers = nullifiers;
        slot.issued_at = clock::timestamp_ms(clock);
        slot.expires_at = expires_at;
        slot.status = CREDENTIAL_ACTIVE;
    } else {
        vector::push_back(&mut pass.credential_sources, source);
        let slot = CredentialSlot {
            commitment,
            nullifiers,
            issued_at: clock::timestamp_ms(clock),
            expires_at,
            status: CREDENTIAL_ACTIVE,
        };
        dynamic_field::add(&mut pass.id, key, slot);
    };
}
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
public fun mint_pass(
    registry: &mut NullifierRegistry,
    config: &IssuerConfig,
    owner: address,
    deposit_payer: address,
    source: u8,
    nullifiers: vector<vector<u8>>,
    commitment: vector<u8>,
    expires_at: u64,
    bff_sig: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == owner, EOwnerMismatch);
    assert!(!table::contains(&registry.passes, owner), EPassAlreadyExists);
    verify_ticket(config, owner, source, &nullifiers, &commitment, expires_at, &bff_sig, clock);
    register_all_nullifiers(registry, &nullifiers, owner);
    let mut pass = SurveyPass {
        id: object::new(ctx),
        owner,
        deposit_payer,
        credential_sources: vector[source],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
    };
    table::add(&mut registry.passes, owner, object::id(&pass));
    apply_credential_slot(&mut pass, source, nullifiers, commitment, expires_at, clock);
    transfer::share_object(pass);
}
public fun mint_pass_with_extra_credentials(
    registry: &mut NullifierRegistry,
    config: &IssuerConfig,
    owner: address,
    deposit_payer: address,
    source: u8,
    nullifiers: vector<vector<u8>>,
    commitment: vector<u8>,
    expires_at: u64,
    bff_sig: vector<u8>,
    extra_sources: vector<u8>,
    extra_nullifiers: vector<vector<vector<u8>>>,
    extra_commitments: vector<vector<u8>>,
    extra_expires_at: vector<u64>,
    extra_bff_sigs: vector<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == owner, EOwnerMismatch);
    assert!(!table::contains(&registry.passes, owner), EPassAlreadyExists);
    let extra_len = vector::length(&extra_sources);
    assert!(extra_len == vector::length(&extra_nullifiers), EExtraTicketsMismatch);
    assert!(extra_len == vector::length(&extra_commitments), EExtraTicketsMismatch);
    assert!(extra_len == vector::length(&extra_expires_at), EExtraTicketsMismatch);
    assert!(extra_len == vector::length(&extra_bff_sigs), EExtraTicketsMismatch);
    verify_ticket(config, owner, source, &nullifiers, &commitment, expires_at, &bff_sig, clock);
    register_all_nullifiers(registry, &nullifiers, owner);
    let mut pass = SurveyPass {
        id: object::new(ctx),
        owner,
        deposit_payer,
        credential_sources: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
    };
    table::add(&mut registry.passes, owner, object::id(&pass));
    apply_credential_slot(&mut pass, source, nullifiers, commitment, expires_at, clock);
    let mut i = 0;
    while (i < extra_len) {
        let ex_source = *vector::borrow(&extra_sources, i);
        let ex_nullifiers = *vector::borrow(&extra_nullifiers, i);
        let ex_commitment = *vector::borrow(&extra_commitments, i);
        let ex_expires_at = *vector::borrow(&extra_expires_at, i);
        let ex_bff_sig = *vector::borrow(&extra_bff_sigs, i);
        verify_ticket(
            config,
            owner,
            ex_source,
            &ex_nullifiers,
            &ex_commitment,
            ex_expires_at,
            &ex_bff_sig,
            clock,
        );
        register_all_nullifiers(registry, &ex_nullifiers, owner);
        apply_credential_slot(
            &mut pass,
            ex_source,
            ex_nullifiers,
            ex_commitment,
            ex_expires_at,
            clock,
        );
        i = i + 1;
    };
    transfer::share_object(pass);
}
public fun update_pass_credential(
    pass: &mut SurveyPass,
    registry: &mut NullifierRegistry,
    config: &IssuerConfig,
    source: u8,
    nullifiers: vector<vector<u8>>,
    commitment: vector<u8>,
    expires_at: u64,
    bff_sig: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pass.status == STATUS_ACTIVE, EPassRevoked);
    let owner = pass.owner;
    assert!(ctx.sender() == owner, EOwnerMismatch);
    verify_ticket(config, owner, source, &nullifiers, &commitment, expires_at, &bff_sig, clock);
    register_all_nullifiers(registry, &nullifiers, owner);
    apply_credential_slot(pass, source, nullifiers, commitment, expires_at, clock);
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
public fun admin_rescue_revoke(
    registry: &mut NullifierRegistry,
    pass: &mut SurveyPass,
    config: &IssuerConfig,
    source_to_revoke: u8,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    assert!(pass.status == STATUS_ACTIVE, ENotActive);
    let key = CredentialKey { source: source_to_revoke };
    assert!(
        dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key),
        ENotActive,
    );
    let slot = dynamic_field::borrow_mut<CredentialKey, CredentialSlot>(&mut pass.id, key);
    assert!(slot.status == CREDENTIAL_ACTIVE, ENotActive);
    slot.status = CREDENTIAL_REVOKED;
    let nullifiers = *&slot.nullifiers;
    let owner = pass.owner;
    let mut k = 0;
    let klen = vector::length(&nullifiers);
    while (k < klen) {
        let nh = *vector::borrow(&nullifiers, k);
        if (table::contains(&registry.used, nh) && *table::borrow(&registry.used, nh) == owner) {
            table::remove(&mut registry.used, nh);
        };
        k = k + 1;
    };
}
public fun delete_pass(
    registry: &mut NullifierRegistry,
    pass: SurveyPass,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == pass.deposit_payer, EOwnerMismatch);
    do_delete(registry, pass, ctx);
}
public fun self_delete_sponsored_pass(
    registry: &mut NullifierRegistry,
    pass: SurveyPass,
    fee: Coin<SUI>,
    ctx: &mut TxContext,
) {
    assert!(pass.deposit_payer != pass.owner, EOwnerMismatch);
    assert!(ctx.sender() == pass.owner, EOwnerMismatch);
    let credentials_count = vector::length(&pass.credential_sources);
    let required_fee = REBATE_FEE_FLOOR * (1 + credentials_count);
    assert!(coin::value(&fee) >= required_fee, EFeeTooLow);
    transfer::public_transfer(fee, pass.deposit_payer);
    do_delete(registry, pass, ctx);
}
fun do_delete(
    registry: &mut NullifierRegistry,
    mut pass: SurveyPass,
    _ctx: &mut TxContext,
) {
    let owner = pass.owner;
    if (table::contains(&registry.passes, owner)) {
        let current_id = *table::borrow(&registry.passes, owner);
        if (current_id == object::id(&pass)) {
            table::remove(&mut registry.passes, owner);
        };
    };
    let sources = pass.credential_sources;
    let mut i = 0;
    let len = vector::length(&sources);
    while (i < len) {
        let src = *vector::borrow(&sources, i);
        let key = CredentialKey { source: src };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let CredentialSlot { commitment: _, nullifiers, issued_at: _, expires_at: _, status } =
                dynamic_field::remove<CredentialKey, CredentialSlot>(&mut pass.id, key);
            if (pass.status == STATUS_ACTIVE && status == CREDENTIAL_ACTIVE) {
                let mut k = 0;
                let klen = vector::length(&nullifiers);
                while (k < klen) {
                    let nh = *vector::borrow(&nullifiers, k);
                    if (table::contains(&registry.used, nh) && *table::borrow(&registry.used, nh) == owner) {
                        table::remove(&mut registry.used, nh);
                    };
                    k = k + 1;
                };
            };
        };
        i = i + 1;
    };
    let SurveyPass {
        id,
        owner: _,
        deposit_payer: _,
        credential_sources: _,
        created_at: _,
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
    if (pass.status != STATUS_ACTIVE) { return false };
    let now = clock::timestamp_ms(clock);
    let sources = &pass.credential_sources;
    let mut i = 0;
    let len = vector::length(sources);
    let mut has_valid = false;
    while (i < len) {
        let src = *vector::borrow(sources, i);
        let key = CredentialKey { source: src };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let slot = dynamic_field::borrow<CredentialKey, CredentialSlot>(&pass.id, key);
            if (slot.status == CREDENTIAL_ACTIVE && slot.expires_at > now) {
                has_valid = true;
                break
            };
        };
        i = i + 1;
    };
    has_valid
}
public fun all_nullifiers(pass: &SurveyPass): vector<vector<u8>> {
    let mut out = vector<vector<u8>>[];
    let sources = &pass.credential_sources;
    let mut i = 0;
    let len = vector::length(sources);
    while (i < len) {
        let src = *vector::borrow(sources, i);
        let key = CredentialKey { source: src };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let slot = dynamic_field::borrow<CredentialKey, CredentialSlot>(&pass.id, key);
            if (slot.status == CREDENTIAL_ACTIVE) {
                let mut j = 0;
                let nlen = vector::length(&slot.nullifiers);
                while (j < nlen) {
                    vector::push_back(&mut out, *vector::borrow(&slot.nullifiers, j));
                    j = j + 1;
                };
            };
        };
        i = i + 1;
    };
    out
}
public fun src_self_report(): u8 { SRC_SELF_REPORT }
public fun src_email(): u8 { SRC_EMAIL }
public fun src_social(): u8 { SRC_SOCIAL }
public fun src_self_protocol(): u8 { SRC_SELF_PROTOCOL }
public fun src_world_id(): u8 { SRC_WORLD_ID }
public fun src_social_google(): u8 { SRC_SOCIAL_GOOGLE }
public fun src_social_github(): u8 { SRC_SOCIAL_GITHUB }
public fun src_attributes(): u8 { SRC_ATTRIBUTES }
public fun owner(pass: &SurveyPass): address { pass.owner }
public fun status(pass: &SurveyPass): u8 { pass.status }
public fun credential_sources(pass: &SurveyPass): vector<u8> { pass.credential_sources }
public fun created_at(pass: &SurveyPass): u64 { pass.created_at }
public fun admin(config: &IssuerConfig): address { config.admin }
public fun issuer_pubkey(config: &IssuerConfig): vector<u8> { config.issuer_pubkey }
#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}
#[test_only]
public fun mint_pass_for_testing(
    registry: &mut NullifierRegistry,
    owner: address,
    source: u8,
    nullifiers: vector<vector<u8>>,
    commitment: vector<u8>,
    expires_at: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    mint_pass_for_testing_with_payer(registry, owner, owner, source, nullifiers, commitment, expires_at, clock, ctx);
}
#[test_only]
public fun mint_pass_with_extra_for_testing(
    registry: &mut NullifierRegistry,
    owner: address,
    deposit_payer: address,
    source: u8,
    nullifiers: vector<vector<u8>>,
    commitment: vector<u8>,
    expires_at: u64,
    extra_sources: vector<u8>,
    extra_nullifiers: vector<vector<vector<u8>>>,
    extra_commitments: vector<vector<u8>>,
    extra_expires_at: vector<u64>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    register_all_nullifiers(registry, &nullifiers, owner);
    let extra_len = vector::length(&extra_sources);
    let mut i = 0;
    while (i < extra_len) {
        register_all_nullifiers(registry, vector::borrow(&extra_nullifiers, i), owner);
        i = i + 1;
    };
    let mut pass = SurveyPass {
        id: object::new(ctx),
        owner,
        deposit_payer,
        credential_sources: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
    };
    if (table::contains(&registry.passes, owner)) {
        table::remove(&mut registry.passes, owner);
    };
    table::add(&mut registry.passes, owner, object::id(&pass));
    apply_credential_slot(&mut pass, source, nullifiers, commitment, expires_at, clock);
    i = 0;
    while (i < extra_len) {
        let ex_source = *vector::borrow(&extra_sources, i);
        let ex_nullifiers = *vector::borrow(&extra_nullifiers, i);
        let ex_commitment = *vector::borrow(&extra_commitments, i);
        let ex_expires_at = *vector::borrow(&extra_expires_at, i);
        apply_credential_slot(
            &mut pass,
            ex_source,
            ex_nullifiers,
            ex_commitment,
            ex_expires_at,
            clock,
        );
        i = i + 1;
    };
    transfer::share_object(pass);
}
#[test_only]
public fun mint_pass_for_testing_with_payer(
    registry: &mut NullifierRegistry,
    owner: address,
    deposit_payer: address,
    source: u8,
    nullifiers: vector<vector<u8>>,
    commitment: vector<u8>,
    expires_at: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    register_all_nullifiers(registry, &nullifiers, owner);
    let mut pass = SurveyPass {
        id: object::new(ctx),
        owner,
        deposit_payer,
        credential_sources: vector[source],
        created_at: clock::timestamp_ms(clock),
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
        nullifiers,
        issued_at: clock::timestamp_ms(clock),
        expires_at,
        status: CREDENTIAL_ACTIVE,
    };
    dynamic_field::add(&mut pass.id, key, slot);
    transfer::share_object(pass);
}
#[test_only]
public fun create_for_testing(
    owner: address,
    expires_at: u64,
    ctx: &mut TxContext,
): SurveyPass {
    let mut pass = SurveyPass {
        id: sui::object::new(ctx),
        owner,
        deposit_payer: owner,
        credential_sources: vector[SRC_EMAIL],
        created_at: 0,
        status: STATUS_ACTIVE,
        encrypted_payload: std::option::none(),
    };
    let key = CredentialKey { source: SRC_EMAIL };
    let slot = CredentialSlot {
        commitment: vector[],
        nullifiers: vector[],
        issued_at: 0,
        expires_at,
        status: CREDENTIAL_ACTIVE,
    };
    sui::dynamic_field::add(&mut pass.id, key, slot);
    pass
}
#[test_only]
public fun delete_pass_for_testing(pass: SurveyPass) {
    let SurveyPass {
        id,
        owner: _,
        deposit_payer: _,
        credential_sources: _,
        created_at: _,
        status: _,
        encrypted_payload: _,
    } = pass;
    sui::object::delete(id);
}
