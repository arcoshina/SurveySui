module surveysui::survey_pass;
use std::bcs;
use sui::ed25519;
use sui::clock::{Self, Clock};
use sui::table::{Self, Table};
use sui::dynamic_field;
use sui::object::{Self, ID};
use sui::coin::{Self, Coin};
use sui::hash;
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
const EDuplicateSource: u64 = 10;
const EEmptyNullifier: u64 = 11;
const ECredentialRevoked: u64 = 12;
const EInvalidEscapeClawback: u64 = 13;
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
    /// BFF-signed sponsor clawback floor for `self_delete_sponsored_pass` (MIST).
    escape_clawback_mist: u64,
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
    escape_clawback_mist: u64,
}
/// Canonical credential binding hashed into `CredentialSlot.commitment` at mint/update.
public struct CredentialDigestPayload has copy, drop {
    owner: address,
    source: u8,
    nullifiers: vector<vector<u8>>,
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
    // Shared padding for NFT-only claim PTBs (`use_pass = false`).
    transfer::share_object(SurveyPass {
        id: object::new(ctx),
        owner: @0x0,
        deposit_payer: @0x0,
        credential_sources: vector[],
        created_at: 0,
        status: STATUS_REVOKED,
        encrypted_payload: std::option::none(),
        escape_clawback_mist: 0,
    });
}

fun is_sponsored_pass(pass: &SurveyPass): bool {
    pass.deposit_payer != pass.owner
}

fun apply_mint_escape_clawback(
    pass: &mut SurveyPass,
    deposit_payer: address,
    owner: address,
    escape_clawback_mist: u64,
) {
    if (deposit_payer != owner) {
        assert!(escape_clawback_mist > 0, EInvalidEscapeClawback);
        pass.escape_clawback_mist = escape_clawback_mist;
    } else {
        assert!(escape_clawback_mist == 0, EInvalidEscapeClawback);
    };
}

fun apply_update_escape_clawback(pass: &mut SurveyPass, escape_clawback_mist: u64) {
    if (is_sponsored_pass(pass)) {
        assert!(escape_clawback_mist > 0, EInvalidEscapeClawback);
        pass.escape_clawback_mist = pass.escape_clawback_mist + escape_clawback_mist;
    } else {
        assert!(escape_clawback_mist == 0, EInvalidEscapeClawback);
    };
}

fun required_self_delete_fee(pass: &SurveyPass): u64 {
    let credentials_count = vector::length(&pass.credential_sources);
    let floor = REBATE_FEE_FLOOR * (1 + credentials_count);
    if (pass.escape_clawback_mist > floor) {
        pass.escape_clawback_mist
    } else {
        floor
    }
}
fun credential_digest(
    owner: address,
    source: u8,
    nullifiers: &vector<vector<u8>>,
    expires_at: u64,
): vector<u8> {
    let payload = CredentialDigestPayload {
        owner,
        source,
        nullifiers: *nullifiers,
        expires_at,
    };
    hash::blake2b256(&bcs::to_bytes(&payload))
}

fun slot_commitment_matches(pass: &SurveyPass, source: u8, slot: &CredentialSlot): bool {
    slot.commitment == credential_digest(pass.owner, source, &slot.nullifiers, slot.expires_at)
}

public fun is_source_valid(pass: &SurveyPass, source: u8, clock: &Clock): bool {
    if (pass.status != STATUS_ACTIVE) { return false };
    let key = CredentialKey { source };
    if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
        let slot = dynamic_field::borrow<CredentialKey, CredentialSlot>(&pass.id, key);
        slot.status == CREDENTIAL_ACTIVE
            && clock::timestamp_ms(clock) < slot.expires_at
            && vector::length(&slot.nullifiers) > 0
            && slot_commitment_matches(pass, source, slot)
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
fun assert_unique_extra_sources(primary: u8, extra_sources: &vector<u8>) {
    let mut seen = vector[primary];
    let extra_len = vector::length(extra_sources);
    let mut si = 0;
    while (si < extra_len) {
        let ex_source = *vector::borrow(extra_sources, si);
        let mut j = 0;
        while (j < vector::length(&seen)) {
            assert!(*vector::borrow(&seen, j) != ex_source, EDuplicateSource);
            j = j + 1;
        };
        vector::push_back(&mut seen, ex_source);
        si = si + 1;
    };
}
fun assert_non_empty_nullifiers(nullifiers: &vector<vector<u8>>) {
    let len = vector::length(nullifiers);
    assert!(len > 0, EEmptyNullifier);
    let mut i = 0;
    while (i < len) {
        assert!(!vector::is_empty(vector::borrow(nullifiers, i)), EEmptyNullifier);
        i = i + 1;
    };
}
fun verify_ticket(
    config: &IssuerConfig,
    owner: address,
    source: u8,
    nullifiers: &vector<vector<u8>>,
    commitment: &vector<u8>,
    expires_at: u64,
    escape_clawback_mist: u64,
    bff_sig: &vector<u8>,
    clock: &Clock,
) {
    assert_non_empty_nullifiers(nullifiers);
    assert!(clock::timestamp_ms(clock) < expires_at, ETicketExpired);
    let payload = TicketPayload {
        owner,
        source,
        nullifiers: *nullifiers,
        commitment: *commitment,
        expires_at,
        escape_clawback_mist,
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
    _commitment: vector<u8>,
    expires_at: u64,
    clock: &Clock,
) {
    let key = CredentialKey { source };
    let digest = credential_digest(pass.owner, source, &nullifiers, expires_at);
    if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
        let slot = dynamic_field::borrow_mut<CredentialKey, CredentialSlot>(&mut pass.id, key);
        assert!(slot.status != CREDENTIAL_REVOKED, ECredentialRevoked);
        slot.commitment = digest;
        slot.nullifiers = nullifiers;
        slot.issued_at = clock::timestamp_ms(clock);
        slot.expires_at = expires_at;
        slot.status = CREDENTIAL_ACTIVE;
    } else {
        vector::push_back(&mut pass.credential_sources, source);
        let slot = CredentialSlot {
            commitment: digest,
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
    escape_clawback_mist: u64,
    bff_sig: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == owner, EOwnerMismatch);
    assert!(!table::contains(&registry.passes, owner), EPassAlreadyExists);
    verify_ticket(
        config,
        owner,
        source,
        &nullifiers,
        &commitment,
        expires_at,
        escape_clawback_mist,
        &bff_sig,
        clock,
    );
    register_all_nullifiers(registry, &nullifiers, owner);
    let mut pass = SurveyPass {
        id: object::new(ctx),
        owner,
        deposit_payer,
        credential_sources: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
        escape_clawback_mist: 0,
    };
    apply_mint_escape_clawback(&mut pass, deposit_payer, owner, escape_clawback_mist);
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
    escape_clawback_mist: u64,
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
    assert_unique_extra_sources(source, &extra_sources);
    verify_ticket(
        config,
        owner,
        source,
        &nullifiers,
        &commitment,
        expires_at,
        escape_clawback_mist,
        &bff_sig,
        clock,
    );
    register_all_nullifiers(registry, &nullifiers, owner);
    let mut pass = SurveyPass {
        id: object::new(ctx),
        owner,
        deposit_payer,
        credential_sources: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
        escape_clawback_mist: 0,
    };
    apply_mint_escape_clawback(&mut pass, deposit_payer, owner, escape_clawback_mist);
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
            0,
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
    escape_clawback_mist: u64,
    bff_sig: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pass.status == STATUS_ACTIVE, EPassRevoked);
    let owner = pass.owner;
    assert!(ctx.sender() == owner, EOwnerMismatch);
    verify_ticket(
        config,
        owner,
        source,
        &nullifiers,
        &commitment,
        expires_at,
        escape_clawback_mist,
        &bff_sig,
        clock,
    );
    register_all_nullifiers(registry, &nullifiers, owner);
    apply_update_escape_clawback(pass, escape_clawback_mist);
    apply_credential_slot(pass, source, nullifiers, commitment, expires_at, clock);
}
public fun admin_revoke_pass(
    pass: &mut SurveyPass,
    config: &IssuerConfig,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    assert!(pass.status == STATUS_ACTIVE, ENotActive);
    pass.status = STATUS_REVOKED;
}
/// 永久撤銷單一憑證 slot（黑名單語意）：用於驗證來源帳戶遭駭（如 Google 被入侵）。
/// 刻意「不」釋放 `registry.used` 中的 nullifier —— 該身分對此來源永久失效，
/// 任何地址（含駭客）都無法用同一 nullifier 重新註冊。
/// 錢包遺失的復原不走此函式：應刪除 Pass（憑證仍 ACTIVE 時 `do_delete` 會釋放
/// nullifier），再到新地址重新 mint 並驗證綁回同一 nullifier。
public fun admin_revoke_credential(
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
    mut fee: Coin<SUI>,
    ctx: &mut TxContext,
) {
    assert!(pass.deposit_payer != pass.owner, EOwnerMismatch);
    assert!(ctx.sender() == pass.owner, EOwnerMismatch);
    let required_fee = required_self_delete_fee(&pass);
    assert!(coin::value(&fee) >= required_fee, EFeeTooLow);
    let payment = coin::split(&mut fee, required_fee, ctx);
    transfer::public_transfer(payment, pass.deposit_payer);
    if (coin::value(&fee) > 0) {
        transfer::public_transfer(fee, ctx.sender());
    } else {
        coin::destroy_zero(fee);
    };
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
        escape_clawback_mist: _,
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
            if (
                slot.status == CREDENTIAL_ACTIVE
                    && slot.expires_at > now
                    && vector::length(&slot.nullifiers) > 0
                    && slot_commitment_matches(pass, src, slot)
            ) {
                has_valid = true;
                break
            };
        };
        i = i + 1;
    };
    has_valid
}
/// 回傳 pass 上「全部」credential 槽的 nullifier —— 刻意不過濾 REVOKED / 過期槽。
/// 僅供 vault claim 去重使用（survey_vault::write_pass_nullifiers）：去重集合須比
/// 資格判定（is_valid 僅認 ACTIVE 槽）更寬，防止同一身分透過撤銷/過期/重發繞過
/// 重複領獎（CertiK F56/F57 By Design；見 docs/system_design/PassLifecycle.md）。
/// 呼叫端若需要「有效憑證」語意，請改用 is_valid / is_source_valid。
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
            let mut j = 0;
            let nlen = vector::length(&slot.nullifiers);
            while (j < nlen) {
                vector::push_back(&mut out, *vector::borrow(&slot.nullifiers, j));
                j = j + 1;
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
public fun is_active(pass: &SurveyPass): bool { pass.status == STATUS_ACTIVE }
public fun credential_sources(pass: &SurveyPass): vector<u8> { pass.credential_sources }
public fun created_at(pass: &SurveyPass): u64 { pass.created_at }
public fun escape_clawback_mist(pass: &SurveyPass): u64 { pass.escape_clawback_mist }
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
    assert_unique_extra_sources(source, &extra_sources);
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
        escape_clawback_mist: 0,
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
        credential_sources: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
        escape_clawback_mist: 0,
    };
    if (table::contains(&registry.passes, owner)) {
        table::remove(&mut registry.passes, owner);
    };
    table::add(&mut registry.passes, owner, object::id(&pass));
    apply_credential_slot(&mut pass, source, nullifiers, commitment, expires_at, clock);
    transfer::share_object(pass);
}
#[test_only]
public fun mint_pass_for_testing_with_payer_and_clawback(
    registry: &mut NullifierRegistry,
    owner: address,
    deposit_payer: address,
    source: u8,
    nullifiers: vector<vector<u8>>,
    commitment: vector<u8>,
    expires_at: u64,
    escape_clawback_mist: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    register_all_nullifiers(registry, &nullifiers, owner);
    let mut pass = SurveyPass {
        id: object::new(ctx),
        owner,
        deposit_payer,
        credential_sources: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
        escape_clawback_mist: 0,
    };
    apply_mint_escape_clawback(&mut pass, deposit_payer, owner, escape_clawback_mist);
    if (table::contains(&registry.passes, owner)) {
        table::remove(&mut registry.passes, owner);
    };
    table::add(&mut registry.passes, owner, object::id(&pass));
    apply_credential_slot(&mut pass, source, nullifiers, commitment, expires_at, clock);
    transfer::share_object(pass);
}
#[test_only]
fun test_nullifier_byte(seed: u8): vector<u8> {
    let mut v = vector<u8>[];
    let mut i = 0u8;
    while (i < 32) {
        vector::push_back(&mut v, seed + i);
        i = i + 1;
    };
    v
}

#[test_only]
public fun create_for_testing(
    owner: address,
    expires_at: u64,
    ctx: &mut TxContext,
): SurveyPass {
    let nullifiers = vector[hash::blake2b256(&bcs::to_bytes(&owner))];
    let digest = credential_digest(owner, SRC_EMAIL, &nullifiers, expires_at);
    let mut pass = SurveyPass {
        id: sui::object::new(ctx),
        owner,
        deposit_payer: owner,
        credential_sources: vector[SRC_EMAIL],
        created_at: 0,
        status: STATUS_ACTIVE,
        encrypted_payload: std::option::none(),
        escape_clawback_mist: 0,
    };
    let key = CredentialKey { source: SRC_EMAIL };
    let slot = CredentialSlot {
        commitment: digest,
        nullifiers,
        issued_at: 0,
        expires_at,
        status: CREDENTIAL_ACTIVE,
    };
    sui::dynamic_field::add(&mut pass.id, key, slot);
    pass
}
#[test_only]
public fun issuer_config_for_testing(ctx: &mut TxContext): IssuerConfig {
    IssuerConfig {
        id: object::new(ctx),
        issuer_pubkey: vector[],
        admin: @0x0,
    }
}

#[test_only]
public fun destroy_issuer_config_for_testing(config: IssuerConfig) {
    let IssuerConfig { id, issuer_pubkey: _, admin: _ } = config;
    sui::object::delete(id);
}

#[test_only]
/// Owned empty pass for `use_pass = false` padding in unit tests.
public fun padding_pass_for_testing(ctx: &mut TxContext): SurveyPass {
    SurveyPass {
        id: object::new(ctx),
        owner: ctx.sender(),
        deposit_payer: ctx.sender(),
        credential_sources: vector[],
        created_at: 0,
        status: STATUS_REVOKED,
        encrypted_payload: std::option::none(),
        escape_clawback_mist: 0,
    }
}

#[test_only]
public fun set_slot_commitment_for_testing(
    pass: &mut SurveyPass,
    source: u8,
    commitment: vector<u8>,
) {
    let key = CredentialKey { source };
    let slot = dynamic_field::borrow_mut<CredentialKey, CredentialSlot>(&mut pass.id, key);
    slot.commitment = commitment;
}

#[test_only]
public fun apply_credential_slot_for_testing(
    pass: &mut SurveyPass,
    source: u8,
    nullifiers: vector<vector<u8>>,
    expires_at: u64,
    clock: &Clock,
) {
    apply_credential_slot(pass, source, nullifiers, vector[], expires_at, clock);
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
        escape_clawback_mist: _,
    } = pass;
    sui::object::delete(id);
}
