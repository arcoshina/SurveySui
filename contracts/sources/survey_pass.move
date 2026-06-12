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
const EFeeMismatch: u64 = 7;
const EPassAlreadyExists: u64 = 8;
const EExtraTicketsMismatch: u64 = 9;
const EEmptyNullifier: u64 = 11;
const ECredentialRevoked: u64 = 12;
const EInvalidEscapeClawback: u64 = 13;
const ETooManySlots: u64 = 14;
const REBATE_FEE_FLOOR: u64 = 25_000_000;
/// 每本 Pass 的憑證槽上限（以 nullifier 為主鍵，一槽一憑證）。
const MAX_CREDENTIAL_SLOTS: u64 = 16;
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
    /// 平行陣列：每槽一條 source（允許重複，如雙 email→[2,2,...]），與 `credential_keys` 同序 1:1。
    /// 維持對外 ABI（BFF Tier / 前端讀此欄）。
    credential_sources: vector<u8>,
    /// 各槽的 nullifier（= dynamic field 主鍵），補 dynamic field 不可枚舉。與 `credential_sources` 同序。
    credential_keys: vector<vector<u8>>,
    created_at: u64,
    status: u8,
    encrypted_payload: Option<vector<u8>>,
    /// BFF-signed sponsor clawback floor for `self_delete_sponsored_pass` (MIST).
    escape_clawback_mist: u64,
}
/// dynamic field 主鍵：以憑證的 nullifier 唯一識別一槽（一槽一憑證）。
public struct CredentialKey has copy, drop, store {
    nullifier: vector<u8>
}
public struct CredentialSlot has store {
    source: u8,
    commitment: vector<u8>,
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
/// 一槽一憑證：以單一 nullifier 為錨。
public struct CredentialDigestPayload has copy, drop {
    owner: address,
    source: u8,
    nullifier: vector<u8>,
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
        credential_keys: vector[],
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
        // 允許 0：代付 Pass 仍可收「自付加綁」的 update（不計入贊助債務）。
        // >0 為代付 update，累加。Sponsor 永不代付 clawback=0 的更新由 BFF 代簽閘門保證
        // （passEscapeClawbackValidation 拒 clawback=0），故 0 只可能是 owner 自付。
        pass.escape_clawback_mist = pass.escape_clawback_mist + escape_clawback_mist;
    } else {
        assert!(escape_clawback_mist == 0, EInvalidEscapeClawback);
    };
}

fun required_self_delete_fee(pass: &SurveyPass): u64 {
    // flat floor：clawback 已精準累加 sponsor 實付淨 gas（≥ 可回收 storage rebate），
    // 故以 max(clawback, REBATE_FEE_FLOOR) 即足額反女巫，不再隨憑證數放大。
    if (pass.escape_clawback_mist > REBATE_FEE_FLOOR) {
        pass.escape_clawback_mist
    } else {
        REBATE_FEE_FLOOR
    }
}
fun credential_digest(
    owner: address,
    source: u8,
    nullifier: &vector<u8>,
    expires_at: u64,
): vector<u8> {
    let payload = CredentialDigestPayload {
        owner,
        source,
        nullifier: *nullifier,
        expires_at,
    };
    hash::blake2b256(&bcs::to_bytes(&payload))
}

fun slot_commitment_matches(pass: &SurveyPass, nullifier: &vector<u8>, slot: &CredentialSlot): bool {
    slot.commitment == credential_digest(pass.owner, slot.source, nullifier, slot.expires_at)
}

/// 槽（單憑證）是否有效：ACTIVE ∧ 未過期 ∧ commitment 相符。
fun slot_is_valid(pass: &SurveyPass, nullifier: &vector<u8>, slot: &CredentialSlot, now: u64): bool {
    slot.status == CREDENTIAL_ACTIVE
        && now < slot.expires_at
        && slot_commitment_matches(pass, nullifier, slot)
}

/// 掃描全槽：任一 `slot.source == source` 且有效即 true（n ≤ MAX_CREDENTIAL_SLOTS）。
public fun is_source_valid(pass: &SurveyPass, source: u8, clock: &Clock): bool {
    if (pass.status != STATUS_ACTIVE) { return false };
    let now = clock::timestamp_ms(clock);
    let keys = &pass.credential_keys;
    let mut i = 0;
    let len = vector::length(keys);
    while (i < len) {
        let nullifier = vector::borrow(keys, i);
        let key = CredentialKey { nullifier: *nullifier };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let slot = dynamic_field::borrow<CredentialKey, CredentialSlot>(&pass.id, key);
            if (slot.source == source && slot_is_valid(pass, nullifier, slot, now)) {
                return true
            };
        };
        i = i + 1;
    };
    false
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
/// 收集一個 nullifier 到去重集合；已存在則 abort（同一次 mint 不可重複 nullifier）。
fun push_unique_nullifier(seen: &mut vector<vector<u8>>, nullifier: vector<u8>) {
    let mut j = 0;
    let len = vector::length(seen);
    while (j < len) {
        assert!(*vector::borrow(seen, j) != nullifier, EDuplicateNullifier);
        j = j + 1;
    };
    vector::push_back(seen, nullifier);
}
/// 確認 primary + 所有 extra ticket 的 nullifier 全域唯一（一槽一 nullifier，跨 source 也不可撞）。
fun assert_unique_extra_nullifiers(
    primary_nullifiers: &vector<vector<u8>>,
    extra_nullifiers: &vector<vector<vector<u8>>>,
) {
    let mut seen = vector<vector<u8>>[];
    let mut i = 0;
    let plen = vector::length(primary_nullifiers);
    while (i < plen) {
        push_unique_nullifier(&mut seen, *vector::borrow(primary_nullifiers, i));
        i = i + 1;
    };
    let mut e = 0;
    let elen = vector::length(extra_nullifiers);
    while (e < elen) {
        let ex = vector::borrow(extra_nullifiers, e);
        let mut k = 0;
        let exlen = vector::length(ex);
        while (k < exlen) {
            push_unique_nullifier(&mut seen, *vector::borrow(ex, k));
            k = k + 1;
        };
        e = e + 1;
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
/// 將一張 ticket 的 nullifiers 各自寫成一槽（一憑證一槽，以 nullifier 為主鍵）。
fun apply_credential_slot(
    pass: &mut SurveyPass,
    source: u8,
    nullifiers: vector<vector<u8>>,
    expires_at: u64,
    clock: &Clock,
) {
    let now = clock::timestamp_ms(clock);
    let mut i = 0;
    let len = vector::length(&nullifiers);
    while (i < len) {
        apply_one_slot(pass, source, *vector::borrow(&nullifiers, i), expires_at, now);
        i = i + 1;
    };
}
/// 單一憑證槽的寫入/刷新。同一 nullifier 既存 → 刷新（REVOKED 不可刷）；不存在 → 受上限保護後新增。
fun apply_one_slot(
    pass: &mut SurveyPass,
    source: u8,
    nullifier: vector<u8>,
    expires_at: u64,
    now: u64,
) {
    let key = CredentialKey { nullifier };
    let digest = credential_digest(pass.owner, source, &nullifier, expires_at);
    if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
        let slot = dynamic_field::borrow_mut<CredentialKey, CredentialSlot>(&mut pass.id, key);
        assert!(slot.status != CREDENTIAL_REVOKED, ECredentialRevoked);
        slot.source = source;
        slot.commitment = digest;
        slot.issued_at = now;
        slot.expires_at = expires_at;
        slot.status = CREDENTIAL_ACTIVE;
    } else {
        assert!(
            vector::length(&pass.credential_keys) < MAX_CREDENTIAL_SLOTS,
            ETooManySlots,
        );
        vector::push_back(&mut pass.credential_sources, source);
        vector::push_back(&mut pass.credential_keys, nullifier);
        let slot = CredentialSlot {
            source,
            commitment: digest,
            issued_at: now,
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
        credential_keys: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
        escape_clawback_mist: 0,
    };
    apply_mint_escape_clawback(&mut pass, deposit_payer, owner, escape_clawback_mist);
    table::add(&mut registry.passes, owner, object::id(&pass));
    apply_credential_slot(&mut pass, source, nullifiers, expires_at, clock);
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
    assert_unique_extra_nullifiers(&nullifiers, &extra_nullifiers);
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
        credential_keys: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
        escape_clawback_mist: 0,
    };
    apply_mint_escape_clawback(&mut pass, deposit_payer, owner, escape_clawback_mist);
    table::add(&mut registry.passes, owner, object::id(&pass));
    apply_credential_slot(&mut pass, source, nullifiers, expires_at, clock);
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
    apply_credential_slot(pass, source, nullifiers, expires_at, clock);
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
/// 批次撤銷一組「列舉的 nullifier」對應的憑證 slot（黑名單語意）：用於驗證來源帳戶遭駭。
/// 一個失控帳號（如一個 gmail）會橫跨多 source（Google OAuth 的 sub nullifier【6】＋
/// email nullifier【2】），故註銷必須列舉失控的「具體 nullifier」、由 admin 批次執行，
/// 而非按 source 一刀切（否則漏掉同帳號跨 source 的另一個 nullifier）。
/// 刻意「不」釋放 `registry.used` 中的 nullifier —— 該身分永久失效，任何地址（含駭客）
/// 都無法以同一 nullifier 重新註冊。錢包遺失的復原不走此函式：應刪除 Pass（憑證仍 ACTIVE
/// 時 `do_delete` 會釋放 nullifier），再到新地址重新 mint 綁回同一 nullifier。
/// 清單中不存在於本 Pass、或已 REVOKED 的 nullifier 一律略過（不 abort），便於批次。
public fun admin_revoke_credential(
    pass: &mut SurveyPass,
    config: &IssuerConfig,
    nullifiers_to_revoke: vector<vector<u8>>,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    assert!(pass.status == STATUS_ACTIVE, ENotActive);
    let mut i = 0;
    let len = vector::length(&nullifiers_to_revoke);
    while (i < len) {
        let key = CredentialKey { nullifier: *vector::borrow(&nullifiers_to_revoke, i) };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let slot = dynamic_field::borrow_mut<CredentialKey, CredentialSlot>(&mut pass.id, key);
            if (slot.status == CREDENTIAL_ACTIVE) {
                slot.status = CREDENTIAL_REVOKED;
            };
        };
        i = i + 1;
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
    let required_fee = required_self_delete_fee(&pass);
    // 精確金額：owner 須付恰好 required_fee，整顆轉付給 deposit_payer，不找零。
    // 前端以 splitCoins 切出精確金額；金額不符（多付或少付）一律 abort，不靜默吞錢。
    assert!(coin::value(&fee) == required_fee, EFeeMismatch);
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
    let keys = pass.credential_keys;
    let mut i = 0;
    let len = vector::length(&keys);
    while (i < len) {
        let nullifier = *vector::borrow(&keys, i);
        let key = CredentialKey { nullifier };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let CredentialSlot { source: _, commitment: _, issued_at: _, expires_at: _, status } =
                dynamic_field::remove<CredentialKey, CredentialSlot>(&mut pass.id, key);
            // 僅 Pass ACTIVE 且槽 ACTIVE 才釋放 nullifier；REVOKED 一律保留＝黑名單持續生效。
            if (pass.status == STATUS_ACTIVE && status == CREDENTIAL_ACTIVE) {
                if (table::contains(&registry.used, nullifier) && *table::borrow(&registry.used, nullifier) == owner) {
                    table::remove(&mut registry.used, nullifier);
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
        credential_keys: _,
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
    let keys = &pass.credential_keys;
    let mut i = 0;
    let len = vector::length(keys);
    let mut has_valid = false;
    while (i < len) {
        let nullifier = vector::borrow(keys, i);
        let key = CredentialKey { nullifier: *nullifier };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let slot = dynamic_field::borrow<CredentialKey, CredentialSlot>(&pass.id, key);
            if (slot_is_valid(pass, nullifier, slot, now)) {
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
    // 一槽一 nullifier，且 `credential_keys` 即各槽主鍵（含 REVOKED / 過期，從不於撤銷時移除），
    // 故全部 nullifier = credential_keys 的複本。
    pass.credential_keys
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
    _commitment: vector<u8>,
    expires_at: u64,
    extra_sources: vector<u8>,
    extra_nullifiers: vector<vector<vector<u8>>>,
    _extra_commitments: vector<vector<u8>>,
    extra_expires_at: vector<u64>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_unique_extra_nullifiers(&nullifiers, &extra_nullifiers);
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
        credential_keys: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
        escape_clawback_mist: 0,
    };
    if (table::contains(&registry.passes, owner)) {
        table::remove(&mut registry.passes, owner);
    };
    table::add(&mut registry.passes, owner, object::id(&pass));
    apply_credential_slot(&mut pass, source, nullifiers, expires_at, clock);
    i = 0;
    while (i < extra_len) {
        let ex_source = *vector::borrow(&extra_sources, i);
        let ex_nullifiers = *vector::borrow(&extra_nullifiers, i);
        let ex_expires_at = *vector::borrow(&extra_expires_at, i);
        apply_credential_slot(
            &mut pass,
            ex_source,
            ex_nullifiers,
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
    _commitment: vector<u8>,
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
        credential_keys: vector[],
        created_at: clock::timestamp_ms(clock),
        status: STATUS_ACTIVE,
        encrypted_payload: option::none(),
        escape_clawback_mist: 0,
    };
    if (table::contains(&registry.passes, owner)) {
        table::remove(&mut registry.passes, owner);
    };
    table::add(&mut registry.passes, owner, object::id(&pass));
    apply_credential_slot(&mut pass, source, nullifiers, expires_at, clock);
    transfer::share_object(pass);
}
#[test_only]
public fun mint_pass_for_testing_with_payer_and_clawback(
    registry: &mut NullifierRegistry,
    owner: address,
    deposit_payer: address,
    source: u8,
    nullifiers: vector<vector<u8>>,
    _commitment: vector<u8>,
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
        credential_keys: vector[],
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
    apply_credential_slot(&mut pass, source, nullifiers, expires_at, clock);
    transfer::share_object(pass);
}
/// 鏡像 `update_pass_credential` 的 clawback + slot 邏輯（略過 ticket 驗簽），
/// 供測試驗證「代付 Pass 收自付/代付 update」的 escape_clawback 行為。
#[test_only]
public fun update_credential_for_testing(
    pass: &mut SurveyPass,
    registry: &mut NullifierRegistry,
    source: u8,
    nullifiers: vector<vector<u8>>,
    _commitment: vector<u8>,
    expires_at: u64,
    escape_clawback_mist: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(pass.status == STATUS_ACTIVE, EPassRevoked);
    assert!(ctx.sender() == pass.owner, EOwnerMismatch);
    register_all_nullifiers(registry, &nullifiers, pass.owner);
    apply_update_escape_clawback(pass, escape_clawback_mist);
    apply_credential_slot(pass, source, nullifiers, expires_at, clock);
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
    let nullifier = hash::blake2b256(&bcs::to_bytes(&owner));
    let digest = credential_digest(owner, SRC_EMAIL, &nullifier, expires_at);
    let mut pass = SurveyPass {
        id: sui::object::new(ctx),
        owner,
        deposit_payer: owner,
        credential_sources: vector[SRC_EMAIL],
        credential_keys: vector[nullifier],
        created_at: 0,
        status: STATUS_ACTIVE,
        encrypted_payload: std::option::none(),
        escape_clawback_mist: 0,
    };
    let key = CredentialKey { nullifier };
    let slot = CredentialSlot {
        source: SRC_EMAIL,
        commitment: digest,
        issued_at: 0,
        expires_at,
        status: CREDENTIAL_ACTIVE,
    };
    sui::dynamic_field::add(&mut pass.id, key, slot);
    pass
}
/// 建立一本只持有「單一指定 source」有效槽的 Pass（不觸碰 NullifierRegistry），供各 source 資格閘門測試。
#[test_only]
public fun create_with_source_for_testing(
    owner: address,
    source: u8,
    expires_at: u64,
    ctx: &mut TxContext,
): SurveyPass {
    let nullifier = hash::blake2b256(&bcs::to_bytes(&vector[source]));
    let digest = credential_digest(owner, source, &nullifier, expires_at);
    let mut pass = SurveyPass {
        id: sui::object::new(ctx),
        owner,
        deposit_payer: owner,
        credential_sources: vector[source],
        credential_keys: vector[nullifier],
        created_at: 0,
        status: STATUS_ACTIVE,
        encrypted_payload: std::option::none(),
        escape_clawback_mist: 0,
    };
    let key = CredentialKey { nullifier };
    let slot = CredentialSlot {
        source,
        commitment: digest,
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
        credential_keys: vector[],
        created_at: 0,
        status: STATUS_REVOKED,
        encrypted_payload: std::option::none(),
        escape_clawback_mist: 0,
    }
}

#[test_only]
public fun set_slot_commitment_for_testing(
    pass: &mut SurveyPass,
    nullifier: vector<u8>,
    commitment: vector<u8>,
) {
    let key = CredentialKey { nullifier };
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
    apply_credential_slot(pass, source, nullifiers, expires_at, clock);
}

#[test_only]
public fun delete_pass_for_testing(pass: SurveyPass) {
    let SurveyPass {
        id,
        owner: _,
        deposit_payer: _,
        credential_sources: _,
        credential_keys: _,
        created_at: _,
        status: _,
        encrypted_payload: _,
        escape_clawback_mist: _,
    } = pass;
    sui::object::delete(id);
}
