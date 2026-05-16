module surveysui::survey_vault;

use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::table::{Self, Table};
use surveysui::participant_sbt::{Self, ParticipantSBT};

// ── status constants ──────────────────────────────────────────────────────────

const STATUS_OPEN: u8   = 0;
const STATUS_CLOSED: u8 = 1;

// ── error codes ───────────────────────────────────────────────────────────────

const ENotAdmin: u64       = 0;
const ENotCreator: u64     = 1;
const ENoQuota: u64        = 2;
const EExpired: u64        = 3;
const EAlreadyClaimed: u64 = 4;
const EInvalidSBT: u64     = 5;
const EVaultClosed: u64    = 6;

// ── struct ────────────────────────────────────────────────────────────────────

/// Survey reward escrow. `T` is the coin type (e.g. REWARD_COIN).
/// Created unshared so the caller can compose it in a PTB before sharing.
public struct SurveyVault<phantom T> has key {
    id: UID,
    balance: Balance<T>,
    per_response: u64,
    max_responses: u64,
    deadline_ms: u64,
    claimed_count: u64,
    claimed_subs: Table<vector<u8>, bool>,
    admin: address,
    creator: address,
    status: u8,
}

// ── public functions ──────────────────────────────────────────────────────────

/// Create a vault and return it WITHOUT sharing.
/// The caller must call `share_vault` at the end of the PTB.
/// `admin` is the backend key that will call `claim`; creator = tx sender.
public fun create<T>(
    coin: Coin<T>,
    per_response: u64,
    max_responses: u64,
    deadline_ms: u64,
    admin: address,
    ctx: &mut TxContext,
): SurveyVault<T> {
    SurveyVault {
        id: object::new(ctx),
        balance: coin::into_balance(coin),
        per_response,
        max_responses,
        deadline_ms,
        claimed_count: 0,
        claimed_subs: table::new(ctx),
        admin,
        creator: ctx.sender(),
        status: STATUS_OPEN,
    }
}

/// Share the vault — the final step of the creation PTB.
public fun share_vault<T>(vault: SurveyVault<T>) {
    transfer::share_object(vault);
}

/// Add funds to the vault. Anyone may call this.
public fun fund<T>(vault: &mut SurveyVault<T>, coin: Coin<T>) {
    balance::join(&mut vault.balance, coin::into_balance(coin));
}

/// Admin-only: verify SBT validity and pay out `per_response` coins to `recipient`.
/// Deduplicates by `sub_hash` so a participant cannot claim twice even with a
/// reissued SBT.
public fun claim<T>(
    vault: &mut SurveyVault<T>,
    sbt: &ParticipantSBT,
    recipient: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == vault.admin, ENotAdmin);
    assert!(vault.status == STATUS_OPEN, EVaultClosed);
    assert!(clock::timestamp_ms(clock) < vault.deadline_ms, EExpired);
    assert!(vault.claimed_count < vault.max_responses, ENoQuota);
    assert!(participant_sbt::is_valid(sbt, clock), EInvalidSBT);

    let sub_hash = participant_sbt::sub_hash(sbt);
    assert!(!table::contains(&vault.claimed_subs, sub_hash), EAlreadyClaimed);

    table::add(&mut vault.claimed_subs, sub_hash, true);
    vault.claimed_count = vault.claimed_count + 1;

    let reward = coin::from_balance(
        balance::split(&mut vault.balance, vault.per_response),
        ctx,
    );
    transfer::public_transfer(reward, recipient);
}

/// Creator-only: close the vault and return any remaining balance.
public fun close<T>(vault: &mut SurveyVault<T>, ctx: &mut TxContext) {
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

// ── view functions ────────────────────────────────────────────────────────────

public fun per_response<T>(vault: &SurveyVault<T>): u64  { vault.per_response }
public fun max_responses<T>(vault: &SurveyVault<T>): u64 { vault.max_responses }
public fun deadline_ms<T>(vault: &SurveyVault<T>): u64   { vault.deadline_ms }
public fun claimed_count<T>(vault: &SurveyVault<T>): u64 { vault.claimed_count }
public fun balance_value<T>(vault: &SurveyVault<T>): u64 { balance::value(&vault.balance) }
public fun status<T>(vault: &SurveyVault<T>): u8         { vault.status }
public fun admin<T>(vault: &SurveyVault<T>): address     { vault.admin }
public fun creator<T>(vault: &SurveyVault<T>): address   { vault.creator }
public fun has_claimed<T>(vault: &SurveyVault<T>, sub_hash: vector<u8>): bool {
    table::contains(&vault.claimed_subs, sub_hash)
}
