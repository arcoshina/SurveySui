module surveysui::survey_vault;
use std::bcs;
use std::hash;
use std::option::{Self, Option};
use std::vector;
use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, ID};
use sui::table::{Self, Table};
use sui::dynamic_field as df;
use sui::sui::SUI;
use sui::tx_context::TxContext;
use surveysui::stacked_survey_reward::{Self, STACKED_SURVEY_REWARD};
use surveysui::survey_pass::{Self, SurveyPass};
use surveysui::amm_pool::{Self, Pool, ProtocolConfig};
use surveysui::survey_registry::{Self, Survey};
use std::type_name;
use std::ascii;
const STATUS_OPEN: u8   = 0;
const STATUS_CLOSED: u8 = 1;
const MIN_PURGE_GRACE_MS: u64 = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PURGE_GRACE_MS: u64 = 92 * 24 * 60 * 60 * 1000;
/// Hard cap on a survey's active lifetime at creation (nominal 90d, relaxed to 92d).
const MAX_SURVEY_DURATION_MS: u64 = 92 * 24 * 60 * 60 * 1000;
/// Liveness fallback: anyone may purge this long after the terminal anchor.
const PURGE_FALLBACK_GRACE_MS: u64 = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_INLINE_ANSWER_BYTES: u64 = 6144;
const MIN_MAX_INLINE_ANSWER_BYTES: u64 = 1024;
const MAX_MAX_INLINE_ANSWER_BYTES: u64 = 32768;
const DEFAULT_MAX_BLOB_ID_BYTES: u64 = 256;
const MIN_MAX_BLOB_ID_BYTES: u64 = 64;
const MAX_MAX_BLOB_ID_BYTES: u64 = 1024;
const ENotCreator: u64           = 0;
const ENoQuota: u64              = 1;
const EExpired: u64              = 2;
const EAlreadyClaimed: u64       = 3;
const EInvalidPass: u64          = 4;
const EVaultClosed: u64          = 5;
const EEmptyAnswers: u64         = 6;
const EInsufficientVaultBalance: u64 = 7;
const EInvalidRewardConfig: u64  = 8;
const ERepeatLimitReached: u64   = 9;
const EInsufficientGasBalance: u64 = 10;
const EInvalidGasDeposit: u64 = 11;
const EDuplicateNullifier: u64 = 12;
const EDuplicateBlobId: u64 = 13;
const EInvalidSurveyVaultMatch: u64 = 14;
const EPurgeTooEarly: u64 = 15;
const EGraceTooShort: u64 = 16;
const ENotClosed: u64 = 17;
const ETicketExpired: u64 = 18;
const EInvalidTicketSig: u64 = 19;
const EInvalidNftType: u64 = 20;
const EInlineAnswerTooLarge: u64 = 21;
const EMaxInlineOutOfRange: u64 = 22;
const ESurveyArchived: u64 = 24;
const EClaimModeMismatch: u64 = 25;
const EInvalidAuthKind: u64 = 26;
const EFeeNotPaid: u64 = 27;
const EFeeAlreadyPaid: u64 = 28;
const EBlobIdTooLarge: u64 = 29;
const EMaxBlobIdOutOfRange: u64 = 30;
const EGasCompTooLow: u64 = 31;
const EVaultAlreadyHasSurvey: u64 = 32;
const EDeadlineTooFar: u64 = 33;
const EGraceTooLong: u64 = 34;
/// Measurement-only entry guard (see bulk_add_answers_for_measurement). Never on mainnet.
const EMeasurementNotAdmin: u64 = 35;
const AUTH_PASS: u8 = 0;
const AUTH_TICKET: u8 = 1;
const CLAIM_MODE_PASS_AUDIENCE: u8 = 0;
const CLAIM_MODE_ONE_TIME_TICKET: u8 = 1;
const SURVEY_STATUS_ARCHIVED: u8 = 1;
public struct AnswerRecord has store, drop {
    kind: u8,
    payload: vector<u8>,
    respondent: address,
    sub_hash: vector<u8>,
    claimed_at_ms: u64,
}
public struct SurveyClaimed has copy, drop {
    vault_id: ID,
    sub_hash: vector<u8>,
    respondent: address,
    kind: u8,
    content_hash: vector<u8>,
    answer_index: u64,
    claimed_at_ms: u64,
}
public struct SurveyClosed has copy, drop {
    vault_id: ID,
    creator: address,
    closed_at_ms: u64,
    remaining_balance_refunded: u64,
}
public struct VaultPurged has copy, drop {
    vault_id: ID,
    survey_id: ID,
    answers_destroyed: u64,
    purged_at_ms: u64,
}
public struct VaultPurgePartial has copy, drop {
    vault_id: ID,
    survey_id: ID,
    answers_purged: u64,
    answers_remaining: u64,
    purged_at_ms: u64,
}
public struct SurveyVault has key {
    id: UID,
    balance: Balance<STACKED_SURVEY_REWARD>,
    per_response: u64,
    repeat_reward: u64,
    repeat_max_times: u64,
    max_responses: u64,
    deadline_ms: u64,
    claimed_count: u64,
    claim_counts: Table<vector<u8>, u64>,
    used_nullifiers: Table<vector<u8>, address>,
    used_blob_ids: Table<vector<u8>, bool>,
    admin_treasury: address,
    creator: address,
    status: u8,
    closed_at_ms: u64,
    gas_balance: Balance<SUI>,
    sponsor_address: address,
    gas_compensation_amount: u64,
    storage_compensation_amount: u64,
    answers_count: u64,
    answers_purged: u64,
    purge_grace_ms: u64,
    max_inline_answer_bytes: u64,
    max_blob_id_bytes: u64,
    fee_paid: bool,
    ticket_fee: u64,
    allowed_nft_type: Option<vector<u8>>,
    survey_registered: bool,
}
#[test_only]
public fun create_for_testing(
    ssr_coin: Coin<STACKED_SURVEY_REWARD>,
    per_response: u64,
    repeat_reward: u64,
    repeat_max_times: u64,
    max_responses: u64,
    deadline_ms: u64,
    admin_treasury: address,
    gas_coin: Coin<SUI>,
    sponsor_address: address,
    gas_compensation_amount: u64,
    storage_compensation_amount: u64,
    ticket_fee: u64,
    allowed_nft_type: Option<vector<u8>>,
    ctx: &mut TxContext,
): SurveyVault {
    assert!(per_response >= 1, EInvalidRewardConfig);
    assert!(repeat_max_times >= 1, EInvalidRewardConfig);
    let per_response_sui = gas_compensation_amount + storage_compensation_amount;
    let required_gas = if (repeat_reward > 0) {
        max_responses * (1 + repeat_max_times) * (per_response_sui + ticket_fee)
    } else {
        max_responses * (per_response_sui + ticket_fee)
    };
    assert!(coin::value(&gas_coin) >= required_gas, EInsufficientGasBalance);
    SurveyVault {
        id: object::new(ctx),
        balance: coin::into_balance(ssr_coin),
        per_response,
        repeat_reward,
        repeat_max_times,
        max_responses,
        deadline_ms,
        claimed_count: 0,
        claim_counts: table::new(ctx),
        used_nullifiers: table::new(ctx),
        used_blob_ids: table::new(ctx),
        admin_treasury,
        creator: ctx.sender(),
        status: STATUS_OPEN,
        closed_at_ms: 0,
        gas_balance: coin::into_balance(gas_coin),
        sponsor_address,
        gas_compensation_amount,
        storage_compensation_amount,
        answers_count: 0,
        answers_purged: 0,
        purge_grace_ms: DEFAULT_PURGE_GRACE_MS,
        max_inline_answer_bytes: DEFAULT_MAX_INLINE_ANSWER_BYTES,
        max_blob_id_bytes: DEFAULT_MAX_BLOB_ID_BYTES,
        fee_paid: true,
        ticket_fee,
        allowed_nft_type,
        survey_registered: false,
    }
}
public fun share_vault(vault: SurveyVault) {
    assert!(vault.fee_paid, EFeeNotPaid);
    transfer::share_object(vault);
}
#[test_only]
public fun share_vault_for_testing(vault: SurveyVault) {
    transfer::share_object(vault);
}
#[test_only]
public fun mark_fee_paid_for_testing(vault: &mut SurveyVault) {
    vault.fee_paid = true;
}
fun assert_claim_survey_vault(
    vault: &SurveyVault,
    survey: &Survey,
    clock: &Clock,
) {
    assert!(vault.status == STATUS_OPEN, EVaultClosed);
    assert!(clock::timestamp_ms(clock) < vault.deadline_ms, EExpired);
    assert!(survey_registry::vault_id(survey) == object::id(vault), EInvalidSurveyVaultMatch);
    assert!(survey_registry::status(survey) != SURVEY_STATUS_ARCHIVED, ESurveyArchived);
}

fun count_allowlist_hits(submitted: &vector<vector<u8>>, allowlist: &vector<vector<u8>>): u64 {
    let mut hits = 0u64;
    let mut j = 0;
    let alen = vector::length(allowlist);
    while (j < alen) {
        let allowed = vector::borrow(allowlist, j);
        let mut i = 0;
        let slen = vector::length(submitted);
        let mut found = false;
        while (i < slen) {
            if (vector::borrow(submitted, i) == allowed) {
                found = true;
                break
            };
            i = i + 1;
        };
        if (found) hits = hits + 1;
        j = j + 1;
    };
    hits
}

fun audience_ok(survey: &Survey, submitted: &vector<vector<u8>>): bool {
    let allowlist = survey_registry::allowed_nullifiers(survey);
    if (vector::is_empty(&allowlist)) {
        true
    } else {
        let hits = count_allowlist_hits(submitted, &allowlist);
        hits >= survey_registry::match_threshold(survey)
    }
}

fun has_attributes_source(survey: &Survey): bool {
    let sources = survey_registry::allowed_sources(survey);
    let mut i = 0;
    let len = vector::length(&sources);
    while (i < len) {
        if (*vector::borrow(&sources, i) == survey_pass::src_attributes()) {
            return true
        };
        i = i + 1;
    };
    false
}

fun pass_satisfies_step1a(
    survey: &Survey,
    pass: &SurveyPass,
    clock: &Clock,
): bool {
    // REVOKED pass 一律不滿足 step1a（CodeReview_R0P1 M4）
    if (!survey_pass::is_active(pass)) { return false };
    if (bff_sources_required(survey)) {
        check_eligibility(pass, &survey_registry::allowed_sources(survey), clock)
    } else if (has_attributes_source(survey)) {
        true
    } else {
        false
    }
}

fun bff_sources_required(survey: &Survey): bool {
    let sources = survey_registry::allowed_sources(survey);
    let mut i = 0;
    let len = vector::length(&sources);
    while (i < len) {
        if (*vector::borrow(&sources, i) != survey_pass::src_attributes()) {
            return true
        };
        i = i + 1;
    };
    false
}

fun nft_type_matches<Nft: key>(vault: &SurveyVault): bool {
    if (option::is_none(&vault.allowed_nft_type)) {
        return false
    };
    let expected = option::borrow(&vault.allowed_nft_type);
    let actual = ascii::into_bytes(type_name::into_string(type_name::with_defining_ids<Nft>()));
    expected == actual
}

fun check_eligibility(pass: &SurveyPass, allowed_sources: &vector<u8>, clock: &Clock): bool {
    let mut i = 0;
    let len = vector::length(allowed_sources);
    while (i < len) {
        let src = *vector::borrow(allowed_sources, i);
        if (src != survey_pass::src_attributes() && survey_pass::is_source_valid(pass, src, clock)) {
            return true
        };
        i = i + 1;
    };
    false
}
/// 刻意寫入 pass 全部槽（含 REVOKED / 過期）的 nullifier 作去重黑名單，
/// 對齊 CertiK F56/F57 By Design——去重集合須寬於資格判定（is_valid）。
fun write_pass_nullifiers(
    vault: &mut SurveyVault,
    pass: &SurveyPass,
    ctx: &TxContext,
) {
    let vault_id_bytes = bcs::to_bytes(&object::id(vault));
    let nullifiers = survey_pass::all_nullifiers(pass);
    let mut n = 0;
    let nlen = vector::length(&nullifiers);
    while (n < nlen) {
        let mut buf = *vector::borrow(&nullifiers, n);
        vector::append(&mut buf, vault_id_bytes);
        let scoped = hash::sha2_256(buf);
        if (table::contains(&vault.used_nullifiers, scoped)) {
            assert!(*table::borrow(&vault.used_nullifiers, scoped) == ctx.sender(), EDuplicateNullifier);
        } else {
            table::add(&mut vault.used_nullifiers, scoped, ctx.sender());
        };
        n = n + 1;
    };
}

fun write_nft_nullifier<Nft: key>(
    vault: &mut SurveyVault,
    nft: &Nft,
    ctx: &TxContext,
) {
    let vault_id_bytes = bcs::to_bytes(&object::id(vault));
    let mut buf = bcs::to_bytes(&object::id(nft));
    vector::append(&mut buf, vault_id_bytes);
    let scoped = hash::sha2_256(buf);
    assert!(!table::contains(&vault.used_nullifiers, scoped), EDuplicateNullifier);
    table::add(&mut vault.used_nullifiers, scoped, ctx.sender());
}

fun step1a_identity_ok<Nft: key>(
    vault: &SurveyVault,
    survey: &Survey,
    use_pass: bool,
    pass: &SurveyPass,
    use_nft: bool,
    _nft: &Nft,
    clock: &Clock,
    ctx: &TxContext,
): bool {
    let mut ok = false;
    if (use_nft) {
        assert!(option::is_some(&vault.allowed_nft_type), EInvalidNftType);
        assert!(nft_type_matches<Nft>(vault), EInvalidNftType);
        ok = true;
    };
    if (use_pass) {
        assert!(survey_pass::owner(pass) == ctx.sender(), EInvalidPass);
        if (pass_satisfies_step1a(survey, pass, clock)) {
            ok = true;
        };
    };
    ok
}

fun assert_ticket_fields_empty(
    ticket_sig: &vector<u8>,
    ephemeral_nullifier: &vector<u8>,
    ticket_expires_at: u64,
) {
    assert!(vector::is_empty(ticket_sig), EInvalidAuthKind);
    assert!(vector::is_empty(ephemeral_nullifier), EInvalidAuthKind);
    assert!(ticket_expires_at == 0, EInvalidAuthKind);
}

fun consume_ticket(
    vault: &mut SurveyVault,
    survey: &Survey,
    config: &surveysui::survey_pass::IssuerConfig,
    ticket_sig: vector<u8>,
    ephemeral_nullifier: vector<u8>,
    expires_at: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(clock::timestamp_ms(clock) < expires_at, ETicketExpired);
    let payload = RealTimeTicketPayload {
        vault_id: object::id(vault),
        survey_id: object::id(survey),
        claimant: ctx.sender(),
        ephemeral_nullifier: *&ephemeral_nullifier,
        expires_at,
    };
    let msg = bcs::to_bytes(&payload);
    assert!(
        sui::ed25519::ed25519_verify(&ticket_sig, &surveysui::survey_pass::issuer_pubkey(config), &msg),
        EInvalidTicketSig
    );
    let vault_id_bytes = bcs::to_bytes(&object::id(vault));
    let mut buf = ephemeral_nullifier;
    vector::append(&mut buf, vault_id_bytes);
    let scoped = hash::sha2_256(buf);
    assert!(!table::contains(&vault.used_nullifiers, scoped), EDuplicateNullifier);
    table::add(&mut vault.used_nullifiers, scoped, ctx.sender());
    if (vault.ticket_fee > 0) {
        assert!(balance::value(&vault.gas_balance) >= vault.ticket_fee, EInsufficientGasBalance);
        let fee_coin = coin::from_balance(
            balance::split(&mut vault.gas_balance, vault.ticket_fee),
            ctx,
        );
        transfer::public_transfer(fee_coin, vault.admin_treasury);
    };
}

public(package) fun apply_nullifiers_and_payout(
    vault: &mut SurveyVault,
    pass: &SurveyPass,
    encrypted_answers: Option<vector<u8>>,
    answer_blob_id: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    write_pass_nullifiers(vault, pass, ctx);
    let payout = process_claim_and_payout(
        vault,
        encrypted_answers,
        answer_blob_id,
        clock,
        ctx,
    );
    deliver_respondent_payout(payout, ctx.sender());
}

/// Unified claim — Step 0 (context) through Step 3 (ticket) then payout.
/// `use_pass` / `use_nft` select which object inputs are validated (ADR Step 1a).
/// When unused, pass `claim_sentinel::VoidNft` or the shared claim-pass sentinel.
public fun claim<Nft: key>(
    vault: &mut SurveyVault,
    survey: &Survey,
    auth_kind: u8,
    use_pass: bool,
    pass: &SurveyPass,
    use_nft: bool,
    nft: &Nft,
    attribute_nullifiers: vector<vector<u8>>,
    issuer_config: &surveysui::survey_pass::IssuerConfig,
    ticket_sig: vector<u8>,
    ephemeral_nullifier: vector<u8>,
    ticket_expires_at: u64,
    encrypted_answers: Option<vector<u8>>,
    answer_blob_id: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_claim_survey_vault(vault, survey, clock);
    if (auth_kind == AUTH_PASS) {
        assert!(survey_registry::claim_mode(survey) == CLAIM_MODE_PASS_AUDIENCE, EClaimModeMismatch);
        assert_ticket_fields_empty(&ticket_sig, &ephemeral_nullifier, ticket_expires_at);
    } else if (auth_kind == AUTH_TICKET) {
        assert!(survey_registry::claim_mode(survey) == CLAIM_MODE_ONE_TIME_TICKET, EClaimModeMismatch);
    } else {
        abort EInvalidAuthKind
    };
    assert!(
        step1a_identity_ok(
            vault,
            survey,
            use_pass,
            pass,
            use_nft,
            nft,
            clock,
            ctx,
        ),
        EInvalidPass,
    );
    if (use_pass && pass_satisfies_step1a(survey, pass, clock)) {
        write_pass_nullifiers(vault, pass, ctx);
    };
    if (use_nft) {
        write_nft_nullifier(vault, nft, ctx);
    };
    assert!(audience_ok(survey, &attribute_nullifiers), EInvalidPass);
    if (auth_kind == AUTH_TICKET) {
        consume_ticket(
            vault,
            survey,
            issuer_config,
            ticket_sig,
            ephemeral_nullifier,
            ticket_expires_at,
            clock,
            ctx,
        );
    };
    let payout = process_claim_and_payout(
        vault,
        encrypted_answers,
        answer_blob_id,
        clock,
        ctx,
    );
    deliver_respondent_payout(payout, ctx.sender());
}

/// Register a survey bound to `vault`; only the vault creator may call (F64).
/// Vault and survey are 1:1; `vault_id` is always taken from the live vault object (F63/F65).
public fun register_survey(
    registry: &mut survey_registry::SurveyRegistry,
    vault: &mut SurveyVault,
    content_hash: vector<u8>,
    encrypted_content: Option<vector<u8>>,
    survey_blob_id: Option<vector<u8>>,
    survey_blob_object_id: Option<ID>,
    schema_hash: vector<u8>,
    pub_key: vector<u8>,
    questions: vector<survey_registry::Question>,
    allowed_sources: vector<u8>,
    allowed_nullifiers: vector<vector<u8>>,
    match_threshold: u64,
    disclosure_rule_blob: Option<vector<u8>>,
    stage1_survey_id: Option<ID>,
    claim_mode: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(vault.creator == ctx.sender(), ENotCreator);
    assert!(!vault.survey_registered, EVaultAlreadyHasSurvey);
    let vault_id = object::id(vault);
    let num_questions = vector::length(&questions);
    let survey = survey_registry::prepare_survey(
        vault_id,
        content_hash,
        encrypted_content,
        survey_blob_id,
        survey_blob_object_id,
        schema_hash,
        pub_key,
        questions,
        allowed_sources,
        allowed_nullifiers,
        match_threshold,
        disclosure_rule_blob,
        stage1_survey_id,
        claim_mode,
        clock,
        ctx,
    );
    survey_registry::commit_survey(registry, survey, num_questions);
    vault.survey_registered = true;
}
public struct RespondentPayout {
    reward: Option<Coin<STACKED_SURVEY_REWARD>>,
    storage_compensation: Option<Coin<SUI>>,
}
fun deliver_respondent_payout(payout: RespondentPayout, recipient: address) {
    let RespondentPayout { reward, storage_compensation } = payout;
    if (option::is_some(&reward)) {
        transfer::public_transfer(option::destroy_some(reward), recipient);
    } else {
        option::destroy_none(reward);
    };
    if (option::is_some(&storage_compensation)) {
        transfer::public_transfer(option::destroy_some(storage_compensation), recipient);
    } else {
        option::destroy_none(storage_compensation);
    };
}
fun process_claim_and_payout(
    vault: &mut SurveyVault,
    encrypted_answers: Option<vector<u8>>,
    answer_blob_id: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
): RespondentPayout {
    let kind: u8;
    let payload: vector<u8>;
    if (option::is_some(&encrypted_answers)) {
        let bytes = option::borrow(&encrypted_answers);
        assert!(!vector::is_empty(bytes), EEmptyAnswers);
        kind = 0;
        payload = *bytes;
    } else if (option::is_some(&answer_blob_id)) {
        let blob_id = option::borrow(&answer_blob_id);
        assert!(!vector::is_empty(blob_id), EEmptyAnswers);
        assert!(vector::length(blob_id) <= vault.max_blob_id_bytes, EBlobIdTooLarge);
        assert!(!table::contains(&vault.used_blob_ids, *blob_id), EDuplicateBlobId);
        table::add(&mut vault.used_blob_ids, *blob_id, true);
        kind = 1;
        payload = *blob_id;
    } else {
        abort EEmptyAnswers
    };
    if (kind == 0) {
        assert!(vector::length(&payload) <= vault.max_inline_answer_bytes, EInlineAnswerTooLarge);
    };
    let key = bcs::to_bytes(&ctx.sender());
    let prior = if (table::contains(&vault.claim_counts, key)) {
        *table::borrow(&vault.claim_counts, key)
    } else {
        0
    };
    let reward_amount: u64;
    if (prior == 0) {
        assert!(vault.claimed_count < vault.max_responses, ENoQuota);
        reward_amount = vault.per_response;
        vault.claimed_count = vault.claimed_count + 1;
        table::add(&mut vault.claim_counts, key, 1);
    } else {
        assert!(vault.repeat_reward > 0, EAlreadyClaimed);
        assert!(prior <= vault.repeat_max_times, ERepeatLimitReached);
        reward_amount = vault.repeat_reward;
        let count_ref = table::borrow_mut(&mut vault.claim_counts, key);
        *count_ref = prior + 1;
    };
    let answer_index = vault.answers_count;
    let now_ms = clock::timestamp_ms(clock);
    let content_hash = hash::sha2_256(copy payload);
    df::add(&mut vault.id, answer_index, AnswerRecord {
        kind,
        payload,
        respondent: ctx.sender(),
        sub_hash: key,
        claimed_at_ms: now_ms,
    });
    vault.answers_count = answer_index + 1;
    event::emit(SurveyClaimed {
        vault_id: object::id(vault),
        sub_hash: key,
        respondent: ctx.sender(),
        kind,
        content_hash,
        answer_index,
        claimed_at_ms: now_ms,
    });
    let reward_coin = if (reward_amount > 0) {
        option::some(coin::from_balance(
            balance::split(&mut vault.balance, reward_amount),
            ctx,
        ))
    } else {
        option::none()
    };
    let sponsor_opt = tx_context::sponsor(ctx);
    let storage_compensation_coin = if (std::option::is_some(&sponsor_opt)) {
        let sponsor = std::option::destroy_some(sponsor_opt);
        if (sponsor == vault.sponsor_address) {
            let mut total_compensation = 0;
            if (balance::value(&vault.gas_balance) >= vault.gas_compensation_amount) {
                total_compensation = total_compensation + vault.gas_compensation_amount;
            };
            if (option::is_some(&answer_blob_id) && balance::value(&vault.gas_balance) >= total_compensation + vault.storage_compensation_amount) {
                total_compensation = total_compensation + vault.storage_compensation_amount;
            };
            if (total_compensation > 0) {
                let compensation = coin::from_balance(
                    balance::split(&mut vault.gas_balance, total_compensation),
                    ctx,
                );
                transfer::public_transfer(compensation, sponsor);
            };
        };
        option::none()
    } else if (
        option::is_some(&answer_blob_id)
            && balance::value(&vault.gas_balance) >= vault.storage_compensation_amount
    ) {
        option::some(coin::from_balance(
            balance::split(&mut vault.gas_balance, vault.storage_compensation_amount),
            ctx,
        ))
    } else {
        option::none()
    };
    RespondentPayout {
        reward: reward_coin,
        storage_compensation: storage_compensation_coin,
    }
}
public struct RealTimeTicketPayload has copy, drop {
    vault_id: ID,
    survey_id: ID,
    claimant: address,
    ephemeral_nullifier: vector<u8>,
    expires_at: u64,
}
public fun close(vault: &mut SurveyVault, clock: &Clock, ctx: &mut TxContext) {
    let now = clock::timestamp_ms(clock);
    let sender = ctx.sender();
    if (sender != vault.creator) {
        assert!(now > vault.deadline_ms, ENotCreator);
    };
    assert!(vault.status == STATUS_OPEN, EVaultClosed);
    assert!(vault.fee_paid, EFeeNotPaid);
    let amount = balance::value(&vault.balance);
    if (amount > 0) {
        let coin = coin::from_balance(
            balance::split(&mut vault.balance, amount),
            ctx,
        );
        transfer::public_transfer(coin, vault.creator);
    };
    let gas_amount = balance::value(&vault.gas_balance);
    if (gas_amount > 0) {
        let gas_coin = coin::from_balance(
            balance::split(&mut vault.gas_balance, gas_amount),
            ctx
        );
        transfer::public_transfer(gas_coin, vault.creator);
    };
    vault.status = STATUS_CLOSED;
    vault.closed_at_ms = if (now > vault.deadline_ms) { vault.deadline_ms } else { now };
    event::emit(SurveyClosed {
        vault_id: object::id(vault),
        creator: vault.creator,
        closed_at_ms: vault.closed_at_ms,
        remaining_balance_refunded: amount,
    });
}
public fun purge(
    registry: &mut survey_registry::SurveyRegistry,
    survey: Survey,
    vault: SurveyVault,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(survey_registry::vault_id(&survey) == object::id(&vault), EInvalidSurveyVaultMatch);
    let vault_id = object::id(&vault);
    let expected_survey = survey_registry::survey_id_for_vault(registry, vault_id);
    assert!(option::is_some(&expected_survey), EInvalidSurveyVaultMatch);
    assert!(option::destroy_some(expected_survey) == object::id(&survey), EInvalidSurveyVaultMatch);
    let now = clock::timestamp_ms(clock);
    let mut vault = vault;
    if (ctx.sender() == vault.creator) {
        assert!(vault.status == STATUS_CLOSED, ENotClosed);
    } else {
        let anchor = if (vault.status == STATUS_CLOSED) {
            vault.closed_at_ms
        } else {
            assert!(now > vault.deadline_ms, EPurgeTooEarly);
            vault.deadline_ms
        };
        let sender = ctx.sender();
        let is_authorized = sender == amm_pool::config_admin(config)
            || amm_pool::is_purge_sponsor(config, sender);
        if (is_authorized) {
            // admin / BFF sponsor: normal grace window.
            assert!(now >= anchor + vault.purge_grace_ms, EPurgeTooEarly);
        } else {
            // anyone else: liveness fallback only, far past the anchor.
            assert!(now >= anchor + PURGE_FALLBACK_GRACE_MS, EPurgeTooEarly);
        };
    };
    let survey_id = object::id(&survey);
    let batch = amm_pool::purge_answers_batch(config);
    let start = vault.answers_purged;
    let end = if (start + batch < vault.answers_count) {
        start + batch
    } else {
        vault.answers_count
    };
    let mut i = start;
    while (i < end) {
        let AnswerRecord { .. } = df::remove<u64, AnswerRecord>(&mut vault.id, i);
        i = i + 1;
    };
    vault.answers_purged = end;
    if (vault.answers_purged < vault.answers_count) {
        event::emit(VaultPurgePartial {
            vault_id,
            survey_id,
            answers_purged: vault.answers_purged,
            answers_remaining: vault.answers_count - vault.answers_purged,
            purged_at_ms: now,
        });
        transfer::share_object(vault);
        survey_registry::share_survey(survey);
        return
    };
    let answers_count = vault.answers_count;
    let SurveyVault {
        id,
        mut balance,
        per_response: _,
        repeat_reward: _,
        repeat_max_times: _,
        max_responses: _,
        deadline_ms: _,
        claimed_count: _,
        claim_counts,
        used_nullifiers,
        used_blob_ids,
        admin_treasury: _,
        creator,
        status: _,
        closed_at_ms: _,
        mut gas_balance,
        sponsor_address: _,
        gas_compensation_amount: _,
        storage_compensation_amount: _,
        answers_count: _,
        answers_purged: _,
        purge_grace_ms: _,
        max_inline_answer_bytes: _,
        max_blob_id_bytes: _,
        fee_paid: _,
        ticket_fee: _,
        allowed_nft_type: _,
        survey_registered: _,
    } = vault;
    let ssr_amount = balance::value(&balance);
    if (ssr_amount > 0) {
        transfer::public_transfer(
            coin::from_balance(balance::split(&mut balance, ssr_amount), ctx),
            creator,
        );
    };
    balance::destroy_zero(balance);
    let gas_amount = balance::value(&gas_balance);
    if (gas_amount > 0) {
        transfer::public_transfer(
            coin::from_balance(balance::split(&mut gas_balance, gas_amount), ctx),
            creator,
        );
    };
    balance::destroy_zero(gas_balance);
    table::drop(claim_counts);
    table::drop(used_nullifiers);
    table::drop(used_blob_ids);
    object::delete(id);
    survey_registry::remove_and_destroy(registry, survey);
    event::emit(VaultPurged {
        vault_id,
        survey_id,
        answers_destroyed: answers_count,
        purged_at_ms: now,
    });
}
public fun create_empty(
    per_response: u64,
    repeat_reward: u64,
    repeat_max_times: u64,
    max_responses: u64,
    deadline_ms: u64,
    admin_treasury: address,
    gas_coin: Coin<SUI>,
    sponsor_address: address,
    gas_compensation_amount: u64,
    storage_compensation_amount: u64,
    ticket_fee: u64,
    purge_grace_ms: u64,
    allowed_nft_type: Option<vector<u8>>,
    config: &ProtocolConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): SurveyVault {
    assert!(per_response >= 1, EInvalidRewardConfig);
    assert!(repeat_max_times >= 1, EInvalidRewardConfig);
    assert!(
        gas_compensation_amount >= amm_pool::min_gas_compensation_mist(config),
        EGasCompTooLow,
    );
    assert!(
        deadline_ms <= clock::timestamp_ms(clock) + MAX_SURVEY_DURATION_MS,
        EDeadlineTooFar,
    );
    // grace 在建立時一次定案、之後不可改:下限保護 sponsor 代付成本回收節奏,
    // 上限(= 預設 92 天)防發起者事後延後平台的強制銷毀能力。
    assert!(purge_grace_ms >= MIN_PURGE_GRACE_MS, EGraceTooShort);
    assert!(purge_grace_ms <= DEFAULT_PURGE_GRACE_MS, EGraceTooLong);
    let per_response_sui = gas_compensation_amount + storage_compensation_amount;
    let required_gas = if (repeat_reward > 0) {
        max_responses * (1 + repeat_max_times) * (per_response_sui + ticket_fee)
    } else {
        max_responses * (per_response_sui + ticket_fee)
    };
    assert!(coin::value(&gas_coin) >= required_gas, EInsufficientGasBalance);
    SurveyVault {
        id: object::new(ctx),
        balance: balance::zero(),
        per_response,
        repeat_reward,
        repeat_max_times,
        max_responses,
        deadline_ms,
        claimed_count: 0,
        claim_counts: table::new(ctx),
        used_nullifiers: table::new(ctx),
        used_blob_ids: table::new(ctx),
        admin_treasury,
        creator: ctx.sender(),
        status: STATUS_OPEN,
        closed_at_ms: 0,
        gas_balance: coin::into_balance(gas_coin),
        sponsor_address,
        gas_compensation_amount,
        storage_compensation_amount,
        answers_count: 0,
        answers_purged: 0,
        purge_grace_ms,
        max_inline_answer_bytes: DEFAULT_MAX_INLINE_ANSWER_BYTES,
        max_blob_id_bytes: DEFAULT_MAX_BLOB_ID_BYTES,
        fee_paid: false,
        ticket_fee,
        allowed_nft_type,
        survey_registered: false,
    }
}
public fun deposit_existing_ssr(
    vault: &mut SurveyVault,
    ssr_coin: Coin<STACKED_SURVEY_REWARD>,
) {
    assert!(!vault.fee_paid, EFeeAlreadyPaid);
    balance::join(&mut vault.balance, coin::into_balance(ssr_coin));
}
fun reward_budget(vault: &SurveyVault): u64 {
    vault.per_response * vault.max_responses
        + vault.repeat_reward * vault.max_responses * vault.repeat_max_times
}
fun royalty_on_budget(budget: u64, effective_fee_bps: u64): u64 {
    let product = (budget as u128) * (effective_fee_bps as u128);
    (product / 10_000) as u64
}
public fun merge_balances(
    vault: &mut SurveyVault,
    new_ssr: Coin<STACKED_SURVEY_REWARD>,
    pool: &Pool,
    config: &ProtocolConfig,
) {
    assert!(!vault.fee_paid, EFeeAlreadyPaid);
    amm_pool::assert_canonical_pool(config, pool);
    balance::join(&mut vault.balance, coin::into_balance(new_ssr));
    let budget = reward_budget(vault);
    let effective_fee_bps = amm_pool::effective(amm_pool::fee_config(pool));
    let fee = royalty_on_budget(budget, effective_fee_bps);
    assert!(balance::value(&vault.balance) >= budget + fee, EInsufficientVaultBalance);
}
public fun split_fee_to_treasury(
    vault: &mut SurveyVault,
    pool: &Pool,
    config: &ProtocolConfig,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    assert!(!vault.fee_paid, EFeeAlreadyPaid);
    amm_pool::assert_canonical_pool(config, pool);
    let budget = reward_budget(vault);
    let effective_fee_bps = amm_pool::effective(amm_pool::fee_config(pool));
    let fee = royalty_on_budget(budget, effective_fee_bps);
    if (fee > 0) {
        let fee_coin = coin::from_balance(
            balance::split(&mut vault.balance, fee),
            ctx,
        );
        transfer::public_transfer(fee_coin, vault.admin_treasury);
    };
    vault.fee_paid = true;
}
public fun per_response(vault: &SurveyVault): u64     { vault.per_response }
public fun repeat_reward(vault: &SurveyVault): u64    { vault.repeat_reward }
public fun repeat_max_times(vault: &SurveyVault): u64 { vault.repeat_max_times }
public fun max_responses(vault: &SurveyVault): u64    { vault.max_responses }
public fun deadline_ms(vault: &SurveyVault): u64      { vault.deadline_ms }
public fun claimed_count(vault: &SurveyVault): u64    { vault.claimed_count }
public fun balance_value(vault: &SurveyVault): u64    { balance::value(&vault.balance) }
public fun status(vault: &SurveyVault): u8            { vault.status }
public fun closed_at_ms(vault: &SurveyVault): u64     { vault.closed_at_ms }
public fun creator(vault: &SurveyVault): address      { vault.creator }
public fun admin_treasury(vault: &SurveyVault): address { vault.admin_treasury }
public fun ticket_fee(vault: &SurveyVault): u64 { vault.ticket_fee }
public fun allowed_nft_type(vault: &SurveyVault): Option<vector<u8>> { vault.allowed_nft_type }
public fun has_claimed(vault: &SurveyVault, respondent: address): bool {
    let key = bcs::to_bytes(&respondent);
    table::contains(&vault.claim_counts, key)
}
public fun claim_count_of(vault: &SurveyVault, respondent: address): u64 {
    let key = bcs::to_bytes(&respondent);
    if (table::contains(&vault.claim_counts, key)) {
        *table::borrow(&vault.claim_counts, key)
    } else {
        0
    }
}
public fun id_of(vault: &SurveyVault): ID { object::id(vault) }
public fun deposit_gas(vault: &mut SurveyVault, gas_coin: Coin<SUI>) {
    assert!(!vault.fee_paid, EFeeAlreadyPaid);
    assert!(coin::value(&gas_coin) > 0, EInvalidGasDeposit);
    balance::join(&mut vault.gas_balance, coin::into_balance(gas_coin));
}
public fun gas_balance_value(vault: &SurveyVault): u64 {
    balance::value(&vault.gas_balance)
}
public fun sponsor_address(vault: &SurveyVault): address {
    vault.sponsor_address
}
public fun gas_compensation_amount(vault: &SurveyVault): u64 {
    vault.gas_compensation_amount
}
public fun set_sponsor_address(vault: &mut SurveyVault, new_sponsor: address, ctx: &TxContext) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    vault.sponsor_address = new_sponsor;
}
public fun set_gas_compensation_amount(
    vault: &mut SurveyVault,
    config: &ProtocolConfig,
    new_amount: u64,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    assert!(new_amount >= amm_pool::min_gas_compensation_mist(config), EGasCompTooLow);
    vault.gas_compensation_amount = new_amount;
}
public fun set_max_inline_answer_bytes(vault: &mut SurveyVault, new_max: u64, ctx: &TxContext) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    assert!(new_max >= MIN_MAX_INLINE_ANSWER_BYTES, EMaxInlineOutOfRange);
    assert!(new_max <= MAX_MAX_INLINE_ANSWER_BYTES, EMaxInlineOutOfRange);
    vault.max_inline_answer_bytes = new_max;
}
public fun set_max_blob_id_bytes(vault: &mut SurveyVault, new_max: u64, ctx: &TxContext) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    assert!(new_max >= MIN_MAX_BLOB_ID_BYTES, EMaxBlobIdOutOfRange);
    assert!(new_max <= MAX_MAX_BLOB_ID_BYTES, EMaxBlobIdOutOfRange);
    vault.max_blob_id_bytes = new_max;
}
public fun storage_compensation_amount(vault: &SurveyVault): u64 {
    vault.storage_compensation_amount
}
public fun purge_grace_ms(vault: &SurveyVault): u64 { vault.purge_grace_ms }
public fun max_inline_answer_bytes(vault: &SurveyVault): u64 { vault.max_inline_answer_bytes }
public fun max_blob_id_bytes(vault: &SurveyVault): u64 { vault.max_blob_id_bytes }
public fun fee_paid(vault: &SurveyVault): bool { vault.fee_paid }
public fun survey_registered(vault: &SurveyVault): bool { vault.survey_registered }
public fun answers_count(vault: &SurveyVault): u64 { vault.answers_count }
public fun answers_purged(vault: &SurveyVault): u64 { vault.answers_purged }
public fun has_answer(vault: &SurveyVault, index: u64): bool {
    df::exists(&vault.id, index)
}
#[test_only]
public fun is_scoped_nullifier_used(
    vault: &SurveyVault,
    raw_nullifier: vector<u8>,
    claimant: address,
): bool {
    let vault_id_bytes = bcs::to_bytes(&object::id(vault));
    let mut buf = raw_nullifier;
    vector::append(&mut buf, vault_id_bytes);
    let scoped = hash::sha2_256(buf);
    table::contains(&vault.used_nullifiers, scoped)
        && *table::borrow(&vault.used_nullifiers, scoped) == claimant
}
#[test_only]
public fun add_answer_for_testing(vault: &mut SurveyVault, payload: vector<u8>) {
    let idx = vault.answers_count;
    df::add(&mut vault.id, idx, AnswerRecord {
        kind: 0,
        payload,
        respondent: @0x0,
        sub_hash: vector[],
        claimed_at_ms: 0,
    });
    vault.answers_count = idx + 1;
}

/// MEASUREMENT ONLY — bulk-insert `count` real AnswerRecord dynamic fields, each
/// carrying a `payload_size`-byte payload, to profile how many answers a single
/// `purge` transaction can destroy. Admin-gated. This entry must live only on the
/// `measurement` git branch / localnet and MUST NOT be merged to main or published
/// to any public network: it lets the admin inflate `answers_count` arbitrarily.
public fun bulk_add_answers_for_measurement(
    vault: &mut SurveyVault,
    count: u64,
    payload_size: u64,
    config: &ProtocolConfig,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == amm_pool::config_admin(config), EMeasurementNotAdmin);
    // Build the payload template once; vector<u8> is copyable, so each record copies it.
    let mut payload = vector<u8>[];
    let mut b = 0;
    while (b < payload_size) {
        vector::push_back(&mut payload, 0u8);
        b = b + 1;
    };
    let mut i = 0;
    while (i < count) {
        let idx = vault.answers_count;
        df::add(&mut vault.id, idx, AnswerRecord {
            kind: 0,
            payload,
            respondent: @0x0,
            sub_hash: vector[],
            claimed_at_ms: 0,
        });
        vault.answers_count = idx + 1;
        i = i + 1;
    };
}
