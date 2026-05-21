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

const ENotCreator: u64     = 0;
const ENoQuota: u64        = 1;
const EExpired: u64        = 2;
const EAlreadyClaimed: u64 = 3;
const EInvalidPass: u64    = 4;
const EVaultClosed: u64    = 5;
const EEmptyAnswers: u64   = 6;
const EInsufficientVaultBalance: u64 = 7;

public struct SurveyClaimed has copy, drop {
    vault_id: ID,
    sub_hash: vector<u8>,
    respondent: address,
    encrypted_answers: vector<u8>,
    claimed_at_ms: u64,
}

/// Survey vault holding sSSR balance for respondents.
/// Created unshared so caller can compose with register in one PTB before sharing.
public struct SurveyVault has key {
    id: UID,
    balance: Balance<STACKED_SURVEY_REWARD>,
    per_response: u64,
    max_responses: u64,
    deadline_ms: u64,
    claimed_count: u64,
    claimed_subs: Table<vector<u8>, bool>,
    admin_treasury: address,
    creator: address,
    status: u8,
}

// ── public functions ──────────────────────────────────────────────────────────

/// Create a vault. Deducts VAULT_FEE_BPS of sSSR to admin_treasury.
/// Returns vault unshared; caller must call `share_vault` at end of PTB.
public fun create(
    sssr_coin: Coin<STACKED_SURVEY_REWARD>,
    per_response: u64,
    max_responses: u64,
    deadline_ms: u64,
    admin_treasury: address,
    ctx: &mut TxContext,
): SurveyVault {
    SurveyVault {
        id: object::new(ctx),
        balance: coin::into_balance(sssr_coin),
        per_response,
        max_responses,
        deadline_ms,
        claimed_count: 0,
        claimed_subs: table::new(ctx),
        admin_treasury,
        creator: ctx.sender(),
        status: STATUS_OPEN,
    }
}

/// Share the vault — final step of creation PTB.
public fun share_vault(vault: SurveyVault) {
    transfer::share_object(vault);
}

/// Add more sSSR to the vault. Same fee deducted.
public fun fund(vault: &mut SurveyVault, sssr_coin: Coin<STACKED_SURVEY_REWARD>, _ctx: &mut TxContext) {
    balance::join(&mut vault.balance, coin::into_balance(sssr_coin));
}

/// Respondent claims per_response sSSR from vault.
/// Validates SurveyPass, deduplicates by sub_hash, checks quota and deadline.
public fun claim(
    vault: &mut SurveyVault,
    pass: &SurveyPass,
    encrypted_answers: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(vault.status == STATUS_OPEN, EVaultClosed);
    assert!(clock::timestamp_ms(clock) < vault.deadline_ms, EExpired);
    assert!(vault.claimed_count < vault.max_responses, ENoQuota);
    assert!(survey_pass::is_valid(pass, clock), EInvalidPass);
    assert!(survey_pass::owner(pass) == ctx.sender(), EInvalidPass);
    assert!(!vector::is_empty(&encrypted_answers), EEmptyAnswers);

    let key = bcs::to_bytes(&ctx.sender());
    assert!(!table::contains(&vault.claimed_subs, key), EAlreadyClaimed);

    table::add(&mut vault.claimed_subs, key, true);
    vault.claimed_count = vault.claimed_count + 1;

    event::emit(SurveyClaimed {
        vault_id: object::id(vault),
        sub_hash: key,
        respondent: ctx.sender(),
        encrypted_answers,
        claimed_at_ms: clock::timestamp_ms(clock),
    });

    let reward = coin::from_balance(
        balance::split(&mut vault.balance, vault.per_response),
        ctx,
    );
    transfer::public_transfer(reward, ctx.sender());
}

/// Creator closes vault and recovers remaining sSSR.
public fun close(vault: &mut SurveyVault, ctx: &mut TxContext) {
    assert!(ctx.sender() == vault.creator, ENotCreator);
    let amount = balance::value(&vault.balance);
    if (amount > 0) {
        let coin = coin::from_balance(
            balance::split(&mut vault.balance, amount),
            ctx,
        );
        transfer::public_transfer(coin, vault.creator);
    };
    vault.status = STATUS_CLOSED;
}

public fun create_empty(
    per_response: u64,
    max_responses: u64,
    deadline_ms: u64,
    admin_treasury: address,
    ctx: &mut TxContext,
): SurveyVault {
    SurveyVault {
        id: object::new(ctx),
        balance: balance::zero(),
        per_response,
        max_responses,
        deadline_ms,
        claimed_count: 0,
        claimed_subs: table::new(ctx),
        admin_treasury,
        creator: ctx.sender(),
        status: STATUS_OPEN,
    }
}

public fun deposit_existing_sssr(
    vault: &mut SurveyVault,
    sssr_coin: Coin<STACKED_SURVEY_REWARD>,
) {
    balance::join(&mut vault.balance, coin::into_balance(sssr_coin));
}

public fun merge_balances(
    vault: &mut SurveyVault,
    new_sssr: Coin<STACKED_SURVEY_REWARD>,
) {
    balance::join(&mut vault.balance, coin::into_balance(new_sssr));
    assert!(balance::value(&vault.balance) >= vault.per_response * vault.max_responses, EInsufficientVaultBalance);
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

public fun per_response(vault: &SurveyVault): u64  { vault.per_response }
public fun max_responses(vault: &SurveyVault): u64 { vault.max_responses }
public fun deadline_ms(vault: &SurveyVault): u64   { vault.deadline_ms }
public fun claimed_count(vault: &SurveyVault): u64 { vault.claimed_count }
public fun balance_value(vault: &SurveyVault): u64 { balance::value(&vault.balance) }
public fun status(vault: &SurveyVault): u8         { vault.status }
public fun creator(vault: &SurveyVault): address   { vault.creator }
public fun admin_treasury(vault: &SurveyVault): address { vault.admin_treasury }
public fun has_claimed(vault: &SurveyVault, respondent: address): bool {
    let key = bcs::to_bytes(&respondent);
    table::contains(&vault.claimed_subs, key)
}

public fun fee_bps(): u64 { VAULT_FEE_BPS }

/// Returns the on-chain ID of an (unshared or shared) vault.
/// Exposed so PTBs can pipe `create` → `survey_registry::register` in one block.
public fun id_of(vault: &SurveyVault): ID { object::id(vault) }
