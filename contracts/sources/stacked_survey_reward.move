module surveysui::stacked_survey_reward;

use std::string;
use sui::coin::{Self, Coin, TreasuryCap};
use sui::coin_registry;

const DECIMALS: u8 = 9;
const TOTAL_SUPPLY_CAP: u64 = 1_000_000_000 * 1_000_000_000;

const EExceedsCap: u64 = 0;

/// One-time witness — uppercase of module name.
public struct STACKED_SURVEY_REWARD has drop {}

/// Shared treasury for SSR. Package-internal mint/burn; no public mint.
public struct SsrTreasury has key {
    id: UID,
    cap: TreasuryCap<STACKED_SURVEY_REWARD>,
}

fun init(witness: STACKED_SURVEY_REWARD, ctx: &mut TxContext) {
    let (initializer, cap) = coin_registry::new_currency_with_otw(
        witness,
        DECIMALS,
        string::utf8(b"SSR"),
        string::utf8(b"Stacked Surveysui Reward"),
        string::utf8(b"Stacked survey reward — circulating reward token"),
        string::utf8(b""),
        ctx,
    );
    coin_registry::finalize_and_delete_metadata_cap(initializer, ctx);
    transfer::share_object(SsrTreasury { id: object::new(ctx), cap });
}

/// Mint SSR. Only callable within the surveysui package (amm_pool calls this).
public(package) fun mint(
    treasury: &mut SsrTreasury,
    amount: u64,
    ctx: &mut TxContext,
): Coin<STACKED_SURVEY_REWARD> {
    let new_supply = coin::total_supply(&treasury.cap) + amount;
    assert!(new_supply <= TOTAL_SUPPLY_CAP, EExceedsCap);
    coin::mint(&mut treasury.cap, amount, ctx)
}

/// Burn SSR. Package-only — called by amm_pool::admin_burn_pair, paired with
/// an equal SR burn to preserve the SR↔SSR 1:1 reserve invariant.
public(package) fun burn(treasury: &mut SsrTreasury, coin: Coin<STACKED_SURVEY_REWARD>) {
    coin::burn(&mut treasury.cap, coin);
}

public fun total_supply(treasury: &SsrTreasury): u64 {
    coin::total_supply(&treasury.cap)
}

public fun supply_cap(): u64 { TOTAL_SUPPLY_CAP }

public fun display_ssr(amount: u64): u64 {
    let decimals_to_round = 100000;
    let half = decimals_to_round / 2;
    ((amount + half) / decimals_to_round) * decimals_to_round
}

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(STACKED_SURVEY_REWARD {}, ctx);
}
