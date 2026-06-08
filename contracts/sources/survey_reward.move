module surveysui::survey_reward;

use std::string;
use sui::coin::{Self, Coin, TreasuryCap};
use sui::coin_registry;

const DECIMALS: u8 = 9;
const TOTAL_SUPPLY_CAP: u64 = 1_000_000_000 * 1_000_000_000;

const EExceedsCap: u64 = 0;

/// One-time witness — uppercase of module name.
public struct SURVEY_REWARD has drop {}

/// Shared treasury — wraps TreasuryCap so the package can mint and anyone can burn.
public struct SrTreasury has key {
    id: UID,
    cap: TreasuryCap<SURVEY_REWARD>,
}

fun init(witness: SURVEY_REWARD, ctx: &mut TxContext) {
    let (initializer, cap) = coin_registry::new_currency_with_otw(
        witness,
        DECIMALS,
        string::utf8(b"SR"),
        string::utf8(b"Surveysui Reward"),
        string::utf8(b"Survey participation reward token"),
        string::utf8(b""),
        ctx,
    );
    coin_registry::finalize_and_delete_metadata_cap(initializer, ctx);
    transfer::share_object(SrTreasury { id: object::new(ctx), cap });
}

/// Mint SR. Only callable within the surveysui package (amm_pool calls this).
public(package) fun mint(
    treasury: &mut SrTreasury,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SURVEY_REWARD> {
    let new_supply = coin::total_supply(&treasury.cap) + amount;
    assert!(new_supply <= TOTAL_SUPPLY_CAP, EExceedsCap);
    coin::mint(&mut treasury.cap, amount, ctx)
}

/// Burn SR. Package-only — must be called via amm_pool::admin_burn_pair
/// to guarantee an equal amount of SSR is burned in the same call,
/// preserving the SR↔SSR 1:1 reserve invariant.
public(package) fun burn(treasury: &mut SrTreasury, coin: Coin<SURVEY_REWARD>) {
    coin::burn(&mut treasury.cap, coin);
}

public fun total_supply(treasury: &SrTreasury): u64 {
    coin::total_supply(&treasury.cap)
}

public fun supply_cap(): u64 { TOTAL_SUPPLY_CAP }

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(SURVEY_REWARD {}, ctx);
}
