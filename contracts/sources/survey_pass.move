module surveysui::survey_pass;

use std::bcs;
use sui::ed25519;
use sui::clock::{Self, Clock};
use sui::table::{Self, Table};
use sui::dynamic_field;
use sui::object::{Self, ID};
use sui::coin::{Self, Coin};
use sui::sui::SUI;

// Source types
const SRC_SELF_REPORT: u8 = 1;
const SRC_EMAIL: u8 = 2;
const SRC_SOCIAL: u8 = 3;
const SRC_SELF_PROTOCOL: u8 = 4;
const SRC_WORLD_ID: u8 = 5;
// 社群具體 provider：以不同 source 值區分，CredentialKey 自然分槽 → 同一 Pass 可並存多張社群卡。
// 皆映射到與 SRC_SOCIAL 相同的 tier 1。保留 SRC_SOCIAL(3) 給舊資料／未知 provider。
const SRC_SOCIAL_GOOGLE: u8 = 6;
const SRC_SOCIAL_GITHUB: u8 = 7;

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
const EFeeTooLow: u64 = 7;

// 自付逃生門：使用者自刪「項目方代付」的 Pass 時，需附 ≥ 此額度的費用轉回項目方，
// 以抵銷其作為 gas owner 拿到的儲存返還，杜絕女巫套利。
// 設為保守上界（高於 Pass + credential slots 的最大實際返還）；此路徑僅在後端不可用時走，
// 寧可讓誠實使用者略多付，也不留套利空間。上線前應以實測返還值校準。
const REBATE_FEE_FLOOR: u64 = 10_000_000; // 0.01 SUI (MIST)

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
    // 鑄造時支付儲存押金的一方（代付鑄造 = 項目方 admin 位址；自付鑄造 = owner）。
    // 刪除授權與儲存返還流向皆依此欄位決定，確保押金回到付款人。
    deposit_payer: address,
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
    nullifiers: vector<vector<u8>>, // index 0 = primary, 1+ = secondary
    issued_at: u64,
    expires_at: u64,
}

public struct TicketPayload has copy, drop {
    owner: address,
    source: u8,
    nullifiers: vector<vector<u8>>,  // index 0 = primary, 1+ = secondary
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
    else if (source == SRC_SOCIAL_GOOGLE) { 1 }
    else if (source == SRC_SOCIAL_GITHUB) { 1 }
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

// 遍歷 nullifiers vector，全部呼叫 register_nullifier
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

// 驗證 Ticket 簽名
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
    verify_ticket(config, owner, source, &nullifiers, &commitment, expires_at, &bff_sig, clock);
    register_all_nullifiers(registry, &nullifiers, owner);

    let mut pass = SurveyPass {
        id: object::new(ctx),
        owner,
        deposit_payer,
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
        nullifiers,
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

    let key = CredentialKey { source };
    if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
        let slot = dynamic_field::borrow_mut<CredentialKey, CredentialSlot>(&mut pass.id, key);
        slot.commitment = commitment;
        slot.nullifiers = nullifiers;
        slot.issued_at = clock::timestamp_ms(clock);
        slot.expires_at = expires_at;
    } else {
        vector::push_back(&mut pass.credential_sources, source);
        let slot = CredentialSlot {
            commitment,
            nullifiers,
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

/// 刪除 Pass。授權直接綁定 `deposit_payer`（押金付款人）：只有付款人本人能執行，
/// 使其成為刪除交易的 gas owner，儲存返還回到付款人。
/// 代付鑄造：deposit_payer = sponsor 位址 → 僅後端（持 sponsor 金鑰）可代刪；使用者自送會 abort，
/// 杜絕「代付鑄造 + 自刪拿返還」抽乾。使用者欲刪除請走後端 /api/pass/delete（免 gas）。
/// 自付鑄造：deposit_payer = owner → owner 自刪，返還回他自己。
public fun delete_pass(
    registry: &mut NullifierRegistry,
    pass: SurveyPass,
    ctx: &mut TxContext,
) {
    // 只有押金付款人本人能執行 → 使其成為 gas owner → 儲存返還回付款人。
    // 代付鑄造：deposit_payer = sponsor（後端代刪）；自付鑄造：deposit_payer = owner（自刪）。
    assert!(ctx.sender() == pass.deposit_payer, EOwnerMismatch);
    do_delete(registry, pass, ctx);
}

/// 自付逃生門：後端不可用時，使用者仍能無需信任地自刪「項目方代付」的 Pass。
/// 使用者自付 gas（成為 gas owner 而拿到儲存返還），但須附 ≥ REBATE_FEE_FLOOR 的費用轉回
/// 項目方以抵銷返還，使其無利可圖（淨值 ≤ 0），杜絕女巫套利。
public fun self_delete_sponsored_pass(
    registry: &mut NullifierRegistry,
    pass: SurveyPass,
    fee: Coin<SUI>,
    ctx: &mut TxContext,
) {
    // 僅適用於「他人代付」（deposit_payer != owner）的 Pass；自付鑄造的 Pass 請走 delete_pass（無須付費）。
    assert!(pass.deposit_payer != pass.owner, EOwnerMismatch);
    // 僅 Pass 擁有者本人可執行
    assert!(ctx.sender() == pass.owner, EOwnerMismatch);
    // 費用須 ≥ 保守上界，確保 >= 實際儲存返還
    assert!(coin::value(&fee) >= REBATE_FEE_FLOOR, EFeeTooLow);
    // 費用退回押金付款人（代付鑄造時 = sponsor）
    transfer::public_transfer(fee, pass.deposit_payer);
    do_delete(registry, pass, ctx);
}

/// 共用的實際銷毀邏輯：移除註冊表項、清除所有 credential dynamic fields 並釋放其 nullifier、
/// 最後 object::delete。儲存返還由協議退給本交易的 gas owner（由呼叫端的授權分流決定）。
fun do_delete(
    registry: &mut NullifierRegistry,
    mut pass: SurveyPass,
    _ctx: &mut TxContext,
) {
    let owner = pass.owner;

    if (table::contains(&registry.passes, owner)) {
        table::remove(&mut registry.passes, owner);
    };

    // 清除 SurveyPass 內部所有 dynamic fields（憑證內容），並釋放其 nullifier。
    // 釋放後同一身分可重新綁定至其他錢包（遷移）；每問卷的防重複改由
    // survey_vault 以 H(nullifier‖vault_id) 在填答層維護。
    let sources = pass.credential_sources;
    let mut i = 0;
    let len = vector::length(&sources);
    while (i < len) {
        let src = *vector::borrow(&sources, i);
        let key = CredentialKey { source: src };
        if (dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
            let CredentialSlot { commitment: _, nullifiers, issued_at: _, expires_at: _ } =
                dynamic_field::remove<CredentialKey, CredentialSlot>(&mut pass.id, key);
            let mut k = 0;
            let klen = vector::length(&nullifiers);
            while (k < klen) {
                let nh = *vector::borrow(&nullifiers, k);
                // 僅釋放確屬本擁有者的 nullifier（register_nullifier 保證一致）
                if (table::contains(&registry.used, nh) && *table::borrow(&registry.used, nh) == owner) {
                    table::remove(&mut registry.used, nh);
                };
                k = k + 1;
            };
        };
        i = i + 1;
    };

    let SurveyPass {
        id,
        owner: _,
        deposit_payer: _,
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

/// 回傳此 Pass 所有憑證 slot 的 nullifier 聯集（防女巫用）。
/// 無憑證的 Pass（自填／測試）回傳空 vector，呼叫端可自然退回位址去重。
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
    // 測試預設 deposit_payer = owner（自付鑄造語意）；需測代付授權分流者用 mint_pass_for_testing_with_payer
    mint_pass_for_testing_with_payer(registry, owner, owner, source, nullifiers, commitment, expires_at, clock, ctx);
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
        nullifiers,
        issued_at: clock::timestamp_ms(clock),
        expires_at,
    };
    dynamic_field::add(&mut pass.id, key, slot);
    recompute_tier_and_expiry(&mut pass, clock);

    transfer::share_object(pass);
}

#[test_only]
public fun create_for_testing(
    owner: address,
    expires_at: u64,
    ctx: &mut TxContext,
): SurveyPass {
    SurveyPass {
        id: sui::object::new(ctx),
        owner,
        deposit_payer: owner,
        effective_tier: 1,
        credential_sources: vector[],
        created_at: 0,
        expires_at,
        status: STATUS_ACTIVE,
        encrypted_payload: std::option::none(),
    }
}

#[test_only]
public fun delete_pass_for_testing(pass: SurveyPass) {
    let SurveyPass {
        id,
        owner: _,
        deposit_payer: _,
        effective_tier: _,
        credential_sources: _,
        created_at: _,
        expires_at: _,
        status: _,
        encrypted_payload: _,
    } = pass;
    sui::object::delete(id);
}

#[test]
fun test_social_provider_sources_tier() {
    // 具體 provider（Google=6 / GitHub=7）與泛稱社群（3）同為 tier 1
    assert!(get_source_tier(SRC_SOCIAL) == 1, 0);
    assert!(get_source_tier(SRC_SOCIAL_GOOGLE) == 1, 1);
    assert!(get_source_tier(SRC_SOCIAL_GITHUB) == 1, 2);
}
