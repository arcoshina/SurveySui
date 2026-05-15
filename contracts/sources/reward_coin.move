#[allow(deprecated_usage)]
module surveysui::reward_coin;

use sui::coin::{Self, Coin, TreasuryCap};
use sui::url;

const DECIMALS: u8 = 9;
const TOTAL_SUPPLY_CAP: u64 = 1_000_000_000 * 1_000_000_000; // 1 B RWD

const ENotAdmin: u64 = 0;
const EExceedsCap: u64 = 1;

/// One-time witness — must match module name in uppercase
public struct REWARD_COIN has drop {}

/// Shared object wrapping TreasuryCap; admin field enables key rotation
public struct Treasury has key {
    id: UID,
    cap: TreasuryCap<REWARD_COIN>,
    admin: address,
}

fun init(witness: REWARD_COIN, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        witness,
        DECIMALS,
        b"RWD",
        b"SurveySui Reward",
        b"Utility token for SurveySui survey rewards",
        option::some(url::new_unsafe_from_bytes(b"https://surveysui.xyz/rwd.png")),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::share_object(Treasury {
        id: object::new(ctx),
        cap,
        admin: ctx.sender(),
    });
}

/// Mint `amount` RWD to `recipient`. Caller must be the current admin.
public fun mint(
    treasury: &mut Treasury,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == treasury.admin, ENotAdmin);
    let new_supply = coin::total_supply(&treasury.cap) + amount;
    assert!(new_supply <= TOTAL_SUPPLY_CAP, EExceedsCap);
    let c = coin::mint(&mut treasury.cap, amount, ctx);
    transfer::public_transfer(c, recipient);
}

/// Burn `c`. Anyone holding a Coin<REWARD_COIN> may call this.
public fun burn(treasury: &mut Treasury, c: Coin<REWARD_COIN>) {
    let _ = coin::burn(&mut treasury.cap, c);
}

/// Transfer admin rights to `new_admin`. Only the current admin may call this.
public fun transfer_admin(
    treasury: &mut Treasury,
    new_admin: address,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == treasury.admin, ENotAdmin);
    treasury.admin = new_admin;
}

// ── view helpers ──────────────────────────────────────────────────────────────

public fun total_supply(treasury: &Treasury): u64 {
    coin::total_supply(&treasury.cap)
}

public fun admin(treasury: &Treasury): address {
    treasury.admin
}

public fun supply_cap(): u64 {
    TOTAL_SUPPLY_CAP
}

// ── test helpers ──────────────────────────────────────────────────────────────

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(REWARD_COIN {}, ctx);
}
