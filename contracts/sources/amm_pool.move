module surveysui::amm_pool;

use sui::balance::{Self, Balance, Supply};
use sui::coin::{Self, Coin};

// ── error codes ───────────────────────────────────────────────────────────────

const EZeroAmount: u64        = 0;
const EZeroReserve: u64       = 1;
const EInsufficientLiquidity: u64 = 2;

// ── structs ───────────────────────────────────────────────────────────────────

/// Phantom LP token type. `drop` lets `balance::create_supply` accept it as witness.
public struct LP<phantom A, phantom B> has drop {}

/// Shared CPMM pool. `lp_supply` tracks total outstanding LP shares.
public struct Pool<phantom A, phantom B> has key {
    id: UID,
    reserve_a: Balance<A>,
    reserve_b: Balance<B>,
    lp_supply: Supply<LP<A, B>>,
}

// ── public functions ──────────────────────────────────────────────────────────

/// Create a new pool with initial liquidity and share it.
/// LP minted = floor(sqrt(amount_a × amount_b)).
/// Returns LP coins to the caller.
public fun init_pool<A, B>(
    coin_a: Coin<A>,
    coin_b: Coin<B>,
    ctx: &mut TxContext,
): Coin<LP<A, B>> {
    let amount_a = coin::value(&coin_a);
    let amount_b = coin::value(&coin_b);
    assert!(amount_a > 0 && amount_b > 0, EZeroAmount);

    let lp_amount = sqrt_u128((amount_a as u128) * (amount_b as u128));
    assert!(lp_amount > 0, EInsufficientLiquidity);

    let mut pool = Pool<A, B> {
        id: object::new(ctx),
        reserve_a: coin::into_balance(coin_a),
        reserve_b: coin::into_balance(coin_b),
        lp_supply: balance::create_supply(LP<A, B> {}),
    };
    let lp_bal = balance::increase_supply(&mut pool.lp_supply, lp_amount);
    transfer::share_object(pool);
    coin::from_balance(lp_bal, ctx)
}

/// Add liquidity proportional to current reserves.
/// Consumes all of `coin_a`; takes exactly the required amount of `coin_b`
/// and returns any surplus as change.
/// lp_minted = amount_a × total_lp / reserve_a
public fun add_liquidity<A, B>(
    pool: &mut Pool<A, B>,
    coin_a: Coin<A>,
    mut coin_b: Coin<B>,
    ctx: &mut TxContext,
): (Coin<LP<A, B>>, Coin<B>) {
    let amount_a  = coin::value(&coin_a);
    assert!(amount_a > 0, EZeroAmount);

    let reserve_a = balance::value(&pool.reserve_a);
    let reserve_b = balance::value(&pool.reserve_b);
    let total_lp  = balance::supply_value(&pool.lp_supply);

    let required_b = (((amount_a as u128) * (reserve_b as u128)) / (reserve_a as u128)) as u64;
    let lp_amount  = (((amount_a as u128) * (total_lp  as u128)) / (reserve_a as u128)) as u64;
    assert!(lp_amount > 0, EInsufficientLiquidity);

    let coin_b_exact = coin::split(&mut coin_b, required_b, ctx);
    balance::join(&mut pool.reserve_a, coin::into_balance(coin_a));
    balance::join(&mut pool.reserve_b, coin::into_balance(coin_b_exact));

    let lp_bal = balance::increase_supply(&mut pool.lp_supply, lp_amount);
    (coin::from_balance(lp_bal, ctx), coin_b)
}

/// Remove liquidity. Burns LP coins and returns proportional reserves.
/// amount_x = lp_amount × reserve_x / total_lp
public fun remove_liquidity<A, B>(
    pool: &mut Pool<A, B>,
    lp: Coin<LP<A, B>>,
    ctx: &mut TxContext,
): (Coin<A>, Coin<B>) {
    let lp_amount = coin::value(&lp);
    assert!(lp_amount > 0, EZeroAmount);

    let total_lp  = balance::supply_value(&pool.lp_supply);
    let reserve_a = balance::value(&pool.reserve_a);
    let reserve_b = balance::value(&pool.reserve_b);

    let amount_a = (((lp_amount as u128) * (reserve_a as u128)) / (total_lp as u128)) as u64;
    let amount_b = (((lp_amount as u128) * (reserve_b as u128)) / (total_lp as u128)) as u64;
    assert!(amount_a > 0 && amount_b > 0, EInsufficientLiquidity);

    balance::decrease_supply(&mut pool.lp_supply, coin::into_balance(lp));
    let coin_a = coin::from_balance(balance::split(&mut pool.reserve_a, amount_a), ctx);
    let coin_b = coin::from_balance(balance::split(&mut pool.reserve_b, amount_b), ctx);
    (coin_a, coin_b)
}

/// Swap coin_a → coin_b with 0.3% fee (CPMM x·y = k).
public fun swap_a_to_b<A, B>(
    pool: &mut Pool<A, B>,
    coin_a: Coin<A>,
    ctx: &mut TxContext,
): Coin<B> {
    let amount_in = coin::value(&coin_a);
    assert!(amount_in > 0, EZeroAmount);

    let reserve_a = balance::value(&pool.reserve_a);
    let reserve_b = balance::value(&pool.reserve_b);
    assert!(reserve_a > 0 && reserve_b > 0, EZeroReserve);

    let amount_out = compute_amount_out(amount_in, reserve_a, reserve_b);
    assert!(amount_out > 0, EInsufficientLiquidity);

    balance::join(&mut pool.reserve_a, coin::into_balance(coin_a));
    coin::from_balance(balance::split(&mut pool.reserve_b, amount_out), ctx)
}

/// Swap coin_b → coin_a with 0.3% fee (CPMM x·y = k).
public fun swap_b_to_a<A, B>(
    pool: &mut Pool<A, B>,
    coin_b: Coin<B>,
    ctx: &mut TxContext,
): Coin<A> {
    let amount_in = coin::value(&coin_b);
    assert!(amount_in > 0, EZeroAmount);

    let reserve_a = balance::value(&pool.reserve_a);
    let reserve_b = balance::value(&pool.reserve_b);
    assert!(reserve_a > 0 && reserve_b > 0, EZeroReserve);

    let amount_out = compute_amount_out(amount_in, reserve_b, reserve_a);
    assert!(amount_out > 0, EInsufficientLiquidity);

    balance::join(&mut pool.reserve_b, coin::into_balance(coin_b));
    coin::from_balance(balance::split(&mut pool.reserve_a, amount_out), ctx)
}

// ── view functions ────────────────────────────────────────────────────────────

public fun reserve_a<A, B>(pool: &Pool<A, B>): u64 { balance::value(&pool.reserve_a) }
public fun reserve_b<A, B>(pool: &Pool<A, B>): u64 { balance::value(&pool.reserve_b) }
public fun lp_supply<A, B>(pool: &Pool<A, B>): u64  { balance::supply_value(&pool.lp_supply) }

// ── internal helpers ──────────────────────────────────────────────────────────

/// CPMM with 0.3% fee:
/// amount_out = reserve_out × amount_in × 997 / (reserve_in × 1000 + amount_in × 997)
///
/// u256 intermediates: with u64 inputs, `ro * ai * 997` reaches ~2^138, which
/// overflows u128 for pool sizes around 10^18 (1B coins × 9 decimals).
fun compute_amount_out(amount_in: u64, reserve_in: u64, reserve_out: u64): u64 {
    let ai = amount_in  as u256;
    let ri = reserve_in  as u256;
    let ro = reserve_out as u256;
    let ai_with_fee = ai * 997;
    let num = ro * ai_with_fee;
    let den = ri * 1000 + ai_with_fee;
    (num / den) as u64
}

/// Integer floor-sqrt via Newton's method (u128 → u64).
fun sqrt_u128(x: u128): u64 {
    if (x == 0) return 0;
    let mut z = x;
    let mut y = (x + 1) / 2;
    while (y < z) {
        z = y;
        y = (x / y + y) / 2;
    };
    z as u64
}

// ── test-only helpers ─────────────────────────────────────────────────────────

#[test_only]
public fun compute_amount_out_for_test(amount_in: u64, reserve_in: u64, reserve_out: u64): u64 {
    compute_amount_out(amount_in, reserve_in, reserve_out)
}
