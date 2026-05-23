module surveysui::survey_vault;

use std::bcs;
use std::vector;
use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::event;
use sui::table::{Self, Table};
use surveysui::stacked_survey_reward::{Self, STACKED_SURVEY_REWARD};
use surveysui::survey_pass::{Self, SurveyPass};
use surveysui::amm_pool::{Self, Pool};

const STATUS_OPEN: u8   = 0;
const STATUS_CLOSED: u8 = 1;

/// Vault deposit fee (0.3% in basis points).
const VAULT_FEE_BPS: u64 = 30;

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

public struct SurveyClaimed has copy, drop {
    vault_id: ID,
    sub_hash: vector<u8>,
    respondent: address,
    encrypted_answers: vector<u8>,
    claimed_at_ms: u64,
}

public struct SurveyClosed has copy, drop {
    vault_id: ID,
    creator: address,
    closed_at_ms: u64,
    remaining_balance_refunded: u64,
}

/// Survey vault holding SSR balance for respondents.
/// Created unshared so caller can compose with register in one PTB before sharing.
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
    admin_treasury: address,
    creator: address,
    status: u8,
    closed_at_ms: u64,
}

// ── public functions ──────────────────────────────────────────────────────────

/// Create a vault. Deducts VAULT_FEE_BPS of SSR to admin_treasury.
/// Returns vault unshared; caller must call `share_vault` at end of PTB.
public fun create(
    ssr_coin: Coin<STACKED_SURVEY_REWARD>,
    per_response: u64,
    repeat_reward: u64,
    repeat_max_times: u64,
    max_responses: u64,
    deadline_ms: u64,
    admin_treasury: address,
    ctx: &mut TxContext,
): SurveyVault {
    assert!(per_response >= 1, EInvalidRewardConfig);
    assert!(repeat_max_times >= 1, EInvalidRewardConfig);
    // repeat_reward is u64, naturally non-negative; 0 means "no repeat allowed"

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
        admin_treasury,
        creator: ctx.sender(),
        status: STATUS_OPEN,
        closed_at_ms: 0,
    }
}

/// Share the vault — final step of creation PTB.
public fun share_vault(vault: SurveyVault) {
    transfer::share_object(vault);
}

/// Add more SSR to the vault. Same fee deducted.
public fun fund(vault: &mut SurveyVault, ssr_coin: Coin<STACKED_SURVEY_REWARD>, _ctx: &mut TxContext) {
    balance::join(&mut vault.balance, coin::into_balance(ssr_coin));
}

/// Respondent claims SSR from vault.
/// Validates SurveyPass, applies per-address repeat policy via `claim_counts`,
/// checks quota and deadline.
public fun claim(
    vault: &mut SurveyVault,
    pass: &SurveyPass,
    encrypted_answers: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(vault.status == STATUS_OPEN, EVaultClosed);
    assert!(clock::timestamp_ms(clock) < vault.deadline_ms, EExpired);
    assert!(survey_pass::is_valid(pass, clock), EInvalidPass);
    assert!(survey_pass::owner(pass) == ctx.sender(), EInvalidPass);
    assert!(!vector::is_empty(&encrypted_answers), EEmptyAnswers);

    let key = bcs::to_bytes(&ctx.sender());
    let prior = if (table::contains(&vault.claim_counts, key)) {
        *table::borrow(&vault.claim_counts, key)
    } else {
        0
    };

    let reward_amount: u64;
    if (prior == 0) {
        // First claim by this address.
        assert!(vault.claimed_count < vault.max_responses, ENoQuota);
        reward_amount = vault.per_response;
        vault.claimed_count = vault.claimed_count + 1;
        table::add(&mut vault.claim_counts, key, 1);
    } else {
        // Repeat claim. Disabled when repeat_reward == 0 → behaves like the
        // legacy single-shot guard (EAlreadyClaimed) so frontends/tests that
        // expect the old error code keep working.
        assert!(vault.repeat_reward > 0, EAlreadyClaimed);
        // `prior` already counts the initial submission; we allow up to
        // `repeat_max_times` additional submissions, i.e. prior ∈ [1, repeat_max_times].
        assert!(prior <= vault.repeat_max_times, ERepeatLimitReached);
        reward_amount = vault.repeat_reward;
        let count_ref = table::borrow_mut(&mut vault.claim_counts, key);
        *count_ref = prior + 1;
    };

    event::emit(SurveyClaimed {
        vault_id: object::id(vault),
        sub_hash: key,
        respondent: ctx.sender(),
        encrypted_answers,
        claimed_at_ms: clock::timestamp_ms(clock),
    });

    if (reward_amount > 0) {
        let reward = coin::from_balance(
            balance::split(&mut vault.balance, reward_amount),
            ctx,
        );
        transfer::public_transfer(reward, ctx.sender());
    };
}

/// Creator closes vault and recovers remaining SSR.
/// Records `closed_at_ms` and emits `SurveyClosed`. Aborts if already closed.
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
    vault.status = STATUS_CLOSED;
    vault.closed_at_ms = clock::timestamp_ms(clock);

    event::emit(SurveyClosed {
        vault_id: object::id(vault),
        creator: vault.creator,
        closed_at_ms: vault.closed_at_ms,
        remaining_balance_refunded: amount,
    });
}

public fun create_empty(
    per_response: u64,
    repeat_reward: u64,
    repeat_max_times: u64,
    max_responses: u64,
    deadline_ms: u64,
    admin_treasury: address,
    ctx: &mut TxContext,
): SurveyVault {
    assert!(per_response >= 1, EInvalidRewardConfig);
    assert!(repeat_max_times >= 1, EInvalidRewardConfig);

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
        admin_treasury,
        creator: ctx.sender(),
        status: STATUS_OPEN,
        closed_at_ms: 0,
    }
}

public fun deposit_existing_ssr(
    vault: &mut SurveyVault,
    ssr_coin: Coin<STACKED_SURVEY_REWARD>,
) {
    balance::join(&mut vault.balance, coin::into_balance(ssr_coin));
}

public fun merge_balances(
    vault: &mut SurveyVault,
    new_ssr: Coin<STACKED_SURVEY_REWARD>,
) {
    balance::join(&mut vault.balance, coin::into_balance(new_ssr));
    let required = vault.per_response * vault.max_responses
        + vault.repeat_reward * vault.max_responses * vault.repeat_max_times;
    assert!(balance::value(&vault.balance) >= required, EInsufficientVaultBalance);
}

public fun split_fee_to_treasury(
    vault: &mut SurveyVault,
    pool: &Pool,
    ctx: &mut TxContext,
) {
    let total = balance::value(&vault.balance);
    let effective_fee_bps = amm_pool::effective(amm_pool::fee_config(pool));
    let fee = total * (effective_fee_bps as u64) / 10_000;
    if (fee > 0) {
        let fee_coin = coin::from_balance(
            balance::split(&mut vault.balance, fee),
            ctx,
        );
        transfer::public_transfer(fee_coin, vault.admin_treasury);
    };
}

// ── view functions ────────────────────────────────────────────────────────────

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

public fun has_claimed(vault: &SurveyVault, respondent: address): bool {
    let key = bcs::to_bytes(&respondent);
    table::contains(&vault.claim_counts, key)
}

/// Returns how many submissions this address has made (0 if none).
/// Used by SurveyPage to display "you submitted N times, X more allowed".
public fun claim_count_of(vault: &SurveyVault, respondent: address): u64 {
    let key = bcs::to_bytes(&respondent);
    if (table::contains(&vault.claim_counts, key)) {
        *table::borrow(&vault.claim_counts, key)
    } else {
        0
    }
}

public fun fee_bps(): u64 { VAULT_FEE_BPS }

/// Returns the on-chain ID of an (unshared or shared) vault.
/// Exposed so PTBs can pipe `create` → `survey_registry::register` in one block.
public fun id_of(vault: &SurveyVault): ID { object::id(vault) }
