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
use surveysui::amm_pool::{Self, Pool};
use surveysui::survey_registry::{Self, Survey};
use std::type_name;
use std::ascii;
const STATUS_OPEN: u8   = 0;
const STATUS_CLOSED: u8 = 1;
const VAULT_FEE_BPS: u64 = 30;
const MIN_PURGE_GRACE_MS: u64 = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PURGE_GRACE_MS: u64 = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_INLINE_ANSWER_BYTES: u64 = 6144;
const MIN_MAX_INLINE_ANSWER_BYTES: u64 = 1024;
const MAX_MAX_INLINE_ANSWER_BYTES: u64 = 32768;
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
    purge_grace_ms: u64,
    max_inline_answer_bytes: u64,
    ticket_fee: u64,
    allowed_nft_type: Option<vector<u8>>,
}
public fun create(
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
        purge_grace_ms: DEFAULT_PURGE_GRACE_MS,
        max_inline_answer_bytes: DEFAULT_MAX_INLINE_ANSWER_BYTES,
        ticket_fee,
        allowed_nft_type,
    }
}
public fun share_vault(vault: SurveyVault) {
    transfer::share_object(vault);
}
public fun fund(vault: &mut SurveyVault, ssr_coin: Coin<STACKED_SURVEY_REWARD>, _ctx: &mut TxContext) {
    balance::join(&mut vault.balance, coin::into_balance(ssr_coin));
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
public(package) fun assert_claim_common(
    vault: &SurveyVault,
    survey: &Survey,
    pass: &SurveyPass,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(vault.status == STATUS_OPEN, EVaultClosed);
    assert!(clock::timestamp_ms(clock) < vault.deadline_ms, EExpired);
    assert!(survey_registry::vault_id(survey) == object::id(vault), EInvalidSurveyVaultMatch);
    assert!(survey_pass::is_valid(pass, clock), EInvalidPass);
    assert!(survey_pass::owner(pass) == ctx.sender(), EInvalidPass);
}
public(package) fun apply_nullifiers_and_payout(
    vault: &mut SurveyVault,
    pass: &SurveyPass,
    encrypted_answers: Option<vector<u8>>,
    answer_blob_id: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
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
    let payout = process_claim_and_payout(
        vault,
        encrypted_answers,
        answer_blob_id,
        clock,
        ctx,
    );
    deliver_respondent_payout(payout, ctx.sender());
}
public fun claim(
    vault: &mut SurveyVault,
    survey: &Survey,
    pass: &SurveyPass,
    encrypted_answers: Option<vector<u8>>,
    answer_blob_id: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_claim_common(vault, survey, pass, clock, ctx);
    assert!(check_eligibility(pass, &survey_registry::allowed_sources(survey), clock), EInvalidPass);
    apply_nullifiers_and_payout(vault, pass, encrypted_answers, answer_blob_id, clock, ctx);
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
    ephemeral_nullifier: vector<u8>,
    expires_at: u64,
}
public fun claim_with_ticket(
    vault: &mut SurveyVault,
    config: &surveysui::survey_pass::IssuerConfig,
    ticket_sig: vector<u8>,
    ephemeral_nullifier: vector<u8>,
    expires_at: u64,
    encrypted_answers: Option<vector<u8>>,
    answer_blob_id: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(vault.status == STATUS_OPEN, EVaultClosed);
    assert!(clock::timestamp_ms(clock) < vault.deadline_ms, EExpired);
    assert!(clock::timestamp_ms(clock) < expires_at, ETicketExpired);
    let payload = RealTimeTicketPayload {
        vault_id: object::id(vault),
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
            ctx
        );
        transfer::public_transfer(fee_coin, vault.admin_treasury);
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
#[allow(deprecated_usage)]
public fun claim_with_nft_marking<T: key>(
    vault: &mut SurveyVault,
    nft: &T,
    encrypted_answers: Option<vector<u8>>,
    answer_blob_id: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(vault.status == STATUS_OPEN, EVaultClosed);
    assert!(clock::timestamp_ms(clock) < vault.deadline_ms, EExpired);
    if (option::is_some(&vault.allowed_nft_type)) {
        let expected = option::borrow(&vault.allowed_nft_type);
        let actual = std::type_name::into_string(std::type_name::get<T>());
        assert!(std::ascii::into_bytes(actual) == *expected, EInvalidNftType);
    };
    let nft_id = object::id(nft);
    let nft_id_bytes = bcs::to_bytes(&nft_id);
    let vault_id_bytes = bcs::to_bytes(&object::id(vault));
    let mut buf = nft_id_bytes;
    vector::append(&mut buf, vault_id_bytes);
    let scoped = hash::sha2_256(buf);
    assert!(!table::contains(&vault.used_nullifiers, scoped), EDuplicateNullifier);
    table::add(&mut vault.used_nullifiers, scoped, ctx.sender());
    let payout = process_claim_and_payout(
        vault,
        encrypted_answers,
        answer_blob_id,
        clock,
        ctx,
    );
    deliver_respondent_payout(payout, ctx.sender());
}
public fun close(vault: &mut SurveyVault, clock: &Clock, ctx: &mut TxContext) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    assert!(vault.status == STATUS_OPEN, EVaultClosed);
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
    vault.closed_at_ms = clock::timestamp_ms(clock);
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
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(survey_registry::vault_id(&survey) == object::id(&vault), EInvalidSurveyVaultMatch);
    let now = clock::timestamp_ms(clock);
    if (ctx.sender() == vault.creator) {
        assert!(vault.status == STATUS_CLOSED, ENotClosed);
    } else {
        let anchor = if (vault.status == STATUS_CLOSED) {
            vault.closed_at_ms
        } else {
            assert!(now > vault.deadline_ms, EPurgeTooEarly);
            vault.deadline_ms
        };
        assert!(now >= anchor + vault.purge_grace_ms, EPurgeTooEarly);
    };
    let vault_id = object::id(&vault);
    let survey_id = object::id(&survey);
    let SurveyVault {
        mut id,
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
        answers_count,
        purge_grace_ms: _,
        max_inline_answer_bytes: _,
        ticket_fee: _,
        allowed_nft_type: _,
    } = vault;
    let mut i = 0;
    while (i < answers_count) {
        let AnswerRecord { .. } = df::remove<u64, AnswerRecord>(&mut id, i);
        i = i + 1;
    };
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
        purge_grace_ms: DEFAULT_PURGE_GRACE_MS,
        max_inline_answer_bytes: DEFAULT_MAX_INLINE_ANSWER_BYTES,
        ticket_fee,
        allowed_nft_type,
    }
}
public fun deposit_existing_ssr(
    vault: &mut SurveyVault,
    ssr_coin: Coin<STACKED_SURVEY_REWARD>,
) {
    balance::join(&mut vault.balance, coin::into_balance(ssr_coin));
}
fun reward_budget(vault: &SurveyVault): u64 {
    vault.per_response * vault.max_responses
        + vault.repeat_reward * vault.max_responses * vault.repeat_max_times
}
fun royalty_on_budget(budget: u64, effective_fee_bps: u64): u64 {
    budget * effective_fee_bps / 10_000
}
public fun merge_balances(
    vault: &mut SurveyVault,
    new_ssr: Coin<STACKED_SURVEY_REWARD>,
    pool: &Pool,
) {
    balance::join(&mut vault.balance, coin::into_balance(new_ssr));
    let budget = reward_budget(vault);
    let effective_fee_bps = amm_pool::effective(amm_pool::fee_config(pool));
    let fee = royalty_on_budget(budget, effective_fee_bps);
    assert!(balance::value(&vault.balance) >= budget + fee, EInsufficientVaultBalance);
}
public fun split_fee_to_treasury(
    vault: &mut SurveyVault,
    pool: &Pool,
    ctx: &mut TxContext,
) {
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
public fun fee_bps(): u64 { VAULT_FEE_BPS }
public fun id_of(vault: &SurveyVault): ID { object::id(vault) }
public fun deposit_gas(vault: &mut SurveyVault, gas_coin: Coin<SUI>) {
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
public fun set_gas_compensation_amount(vault: &mut SurveyVault, new_amount: u64, ctx: &TxContext) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    vault.gas_compensation_amount = new_amount;
}
public fun set_purge_grace_ms(vault: &mut SurveyVault, new_grace_ms: u64, ctx: &TxContext) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    assert!(new_grace_ms >= MIN_PURGE_GRACE_MS, EGraceTooShort);
    vault.purge_grace_ms = new_grace_ms;
}
public fun set_max_inline_answer_bytes(vault: &mut SurveyVault, new_max: u64, ctx: &TxContext) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    assert!(new_max >= MIN_MAX_INLINE_ANSWER_BYTES, EMaxInlineOutOfRange);
    assert!(new_max <= MAX_MAX_INLINE_ANSWER_BYTES, EMaxInlineOutOfRange);
    vault.max_inline_answer_bytes = new_max;
}
public fun storage_compensation_amount(vault: &SurveyVault): u64 {
    vault.storage_compensation_amount
}
public fun purge_grace_ms(vault: &SurveyVault): u64 { vault.purge_grace_ms }
public fun max_inline_answer_bytes(vault: &SurveyVault): u64 { vault.max_inline_answer_bytes }
public fun answers_count(vault: &SurveyVault): u64 { vault.answers_count }
public fun has_answer(vault: &SurveyVault, index: u64): bool {
    df::exists(&vault.id, index)
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
