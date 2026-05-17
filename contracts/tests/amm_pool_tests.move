#[test_only]
module surveysui::amm_pool_tests;

use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use sui::transfer;
use surveysui::amm_pool::{Self, Pool, LP};

const ALICE: address = @0xA71CE;

// Phantom coin types used only in tests — no TreasuryCap needed.
public struct COIN_A has drop {}
public struct COIN_B has drop {}

// ── helpers ───────────────────────────────────────────────────────────────────

/// Init a 10 000 / 10 000 pool and transfer LP to ALICE.
/// Ends with the pool shared; next tx is as ALICE.
fun setup_pool(): ts::Scenario {
    let mut sc = ts::begin(ALICE);
    {
        let coin_a = coin::mint_for_testing<COIN_A>(10_000, sc.ctx());
        let coin_b = coin::mint_for_testing<COIN_B>(10_000, sc.ctx());
        let lp = amm_pool::init_pool(coin_a, coin_b, sc.ctx());
        transfer::public_transfer(lp, ALICE);
    };
    sc.next_tx(ALICE);
    sc
}

// ── tests ─────────────────────────────────────────────────────────────────────

// sqrt(10 000 × 10 000) = 10 000;  caller LP = 10 000 − MINIMUM_LIQUIDITY (1 000) = 9 000.
#[test]
fun test_initial_liquidity_mints_correct_lp() {
    let mut sc = ts::begin(ALICE);
    {
        let coin_a = coin::mint_for_testing<COIN_A>(10_000, sc.ctx());
        let coin_b = coin::mint_for_testing<COIN_B>(10_000, sc.ctx());
        let lp = amm_pool::init_pool(coin_a, coin_b, sc.ctx());
        assert!(coin::value(&lp) == 9_000, 0);
        // sqrt(100 × 400) = sqrt(40 000) = 200
        let coin_a2 = coin::mint_for_testing<COIN_A>(100, sc.ctx());
        let coin_b2 = coin::mint_for_testing<COIN_B>(400, sc.ctx());
        // We can't create a second pool of the same type in a single test because
        // init_pool shares one pool — just verify the first one and clean up.
        transfer::public_transfer(lp, ALICE);
        coin::burn_for_testing(coin_a2);
        coin::burn_for_testing(coin_b2);
    };
    sc.end();
}

// Add 10% more liquidity and check LP minted proportionally.
#[test]
fun test_add_liquidity_proportional() {
    let mut sc = setup_pool();
    {
        let mut pool = ts::take_shared<Pool<COIN_A, COIN_B>>(&sc);
        let coin_a = coin::mint_for_testing<COIN_A>(1_000, sc.ctx());
        let coin_b = coin::mint_for_testing<COIN_B>(1_000, sc.ctx());

        let (lp, change) = amm_pool::add_liquidity(&mut pool, coin_a, coin_b, sc.ctx());

        // 1 000 / 10 000 = 10 % → 1 000 new LP
        assert!(coin::value(&lp) == 1_000, 0);
        // Exact proportion — no surplus coin_b
        assert!(coin::value(&change) == 0, 1);
        assert!(amm_pool::reserve_a(&pool) == 11_000, 2);
        assert!(amm_pool::reserve_b(&pool) == 11_000, 3);
        assert!(amm_pool::lp_supply(&pool) == 11_000, 4);

        transfer::public_transfer(lp, ALICE);
        coin::burn_for_testing(change);
        ts::return_shared(pool);
    };
    sc.end();
}

// After a swap the product k = reserve_a × reserve_b must not decrease
// (fee revenue stays in the pool, so k can only grow).
#[test]
fun test_swap_preserves_k_within_fee() {
    let mut sc = setup_pool();
    {
        let mut pool = ts::take_shared<Pool<COIN_A, COIN_B>>(&sc);
        let k_before = (amm_pool::reserve_a(&pool) as u128) *
                       (amm_pool::reserve_b(&pool) as u128);

        let coin_a    = coin::mint_for_testing<COIN_A>(1_000, sc.ctx());
        let coin_b_out = amm_pool::swap_a_to_b(&mut pool, coin_a, 0, sc.ctx());

        let k_after = (amm_pool::reserve_a(&pool) as u128) *
                      (amm_pool::reserve_b(&pool) as u128);
        assert!(k_after >= k_before, 0);

        coin::burn_for_testing(coin_b_out);
        ts::return_shared(pool);
    };
    sc.end();
}

// amount_out = 10 000 × 1 000 × 997 / (10 000 × 1 000 + 1 000 × 997) = 906
#[test]
fun test_swap_amount_out_matches_formula() {
    let mut sc = setup_pool();
    {
        let mut pool = ts::take_shared<Pool<COIN_A, COIN_B>>(&sc);

        let expected = amm_pool::compute_amount_out_for_test(1_000, 10_000, 10_000);
        assert!(expected == 906, 0);

        let coin_a     = coin::mint_for_testing<COIN_A>(1_000, sc.ctx());
        let coin_b_out = amm_pool::swap_a_to_b(&mut pool, coin_a, 0, sc.ctx());
        assert!(coin::value(&coin_b_out) == expected, 1);

        coin::burn_for_testing(coin_b_out);
        ts::return_shared(pool);
    };
    sc.end();
}

// Remove half the LP → should receive exactly half the reserves.
#[test]
fun test_remove_liquidity_returns_correct_assets() {
    let mut sc = setup_pool();
    {
        let mut pool = ts::take_shared<Pool<COIN_A, COIN_B>>(&sc);
        let mut lp   = ts::take_from_sender<Coin<LP<COIN_A, COIN_B>>>(&sc);

        // Split off half (5 000) of the 10 000 LP
        let lp_half = coin::split(&mut lp, 5_000, sc.ctx());
        let (coin_a, coin_b) = amm_pool::remove_liquidity(&mut pool, lp_half, sc.ctx());

        assert!(coin::value(&coin_a) == 5_000, 0);
        assert!(coin::value(&coin_b) == 5_000, 1);

        coin::burn_for_testing(coin_a);
        coin::burn_for_testing(coin_b);
        ts::return_to_sender(&sc, lp);
        ts::return_shared(pool);
    };
    sc.end();
}

// H1: 1B-scale (1e18 with 9 decimals) reserves + 1e18 swap.
// Under u128 intermediates `ro * ai * 997` ≈ 2^130 overflows and aborts;
// u256 intermediates compute the correct result.
// Expected amount_out = 997 × 10^18 / 1997 ≈ 4.99 × 10^17.
#[test]
fun test_compute_amount_out_no_overflow_at_1b_scale() {
    let one_b = 1_000_000_000_000_000_000u64; // 1B × 10^9
    let out = amm_pool::compute_amount_out_for_test(one_b, one_b, one_b);
    assert!(out > 499_000_000_000_000_000, 0);
    assert!(out < 500_000_000_000_000_000, 1);
}

// End-to-end: a real swap_a_to_b against a 1B/1B pool must succeed and
// preserve the k invariant (k_after >= k_before).
#[test]
fun test_swap_at_1b_scale_preserves_k() {
    let one_b = 1_000_000_000_000_000_000u64;
    let mut sc = ts::begin(ALICE);
    {
        let coin_a = coin::mint_for_testing<COIN_A>(one_b, sc.ctx());
        let coin_b = coin::mint_for_testing<COIN_B>(one_b, sc.ctx());
        let lp = amm_pool::init_pool(coin_a, coin_b, sc.ctx());
        transfer::public_transfer(lp, ALICE);
    };
    sc.next_tx(ALICE);
    {
        let mut pool = ts::take_shared<Pool<COIN_A, COIN_B>>(&sc);
        let k_before = (amm_pool::reserve_a(&pool) as u256) *
                       (amm_pool::reserve_b(&pool) as u256);

        let coin_a    = coin::mint_for_testing<COIN_A>(one_b, sc.ctx());
        let coin_b_out = amm_pool::swap_a_to_b(&mut pool, coin_a, 0, sc.ctx());
        assert!(coin::value(&coin_b_out) > 0, 0);

        let k_after = (amm_pool::reserve_a(&pool) as u256) *
                      (amm_pool::reserve_b(&pool) as u256);
        assert!(k_after >= k_before, 1);

        coin::burn_for_testing(coin_b_out);
        ts::return_shared(pool);
    };
    sc.end();
}

// H2: passing min_out = expected + 1 must abort with ESlippage.
#[test, expected_failure(abort_code = surveysui::amm_pool::ESlippage)]
fun test_swap_aborts_when_amount_out_below_min() {
    let mut sc = setup_pool();
    {
        let mut pool = ts::take_shared<Pool<COIN_A, COIN_B>>(&sc);
        let expected = amm_pool::compute_amount_out_for_test(1_000, 10_000, 10_000);
        let coin_a   = coin::mint_for_testing<COIN_A>(1_000, sc.ctx());
        // expected = 906 → demand 907, must abort
        let coin_b_out = amm_pool::swap_a_to_b(&mut pool, coin_a, expected + 1, sc.ctx());
        coin::burn_for_testing(coin_b_out);
        ts::return_shared(pool);
    };
    sc.end();
}

// H2: min_out == expected succeeds.
#[test]
fun test_swap_succeeds_when_amount_out_meets_min() {
    let mut sc = setup_pool();
    {
        let mut pool = ts::take_shared<Pool<COIN_A, COIN_B>>(&sc);
        let expected = amm_pool::compute_amount_out_for_test(1_000, 10_000, 10_000);
        let coin_a   = coin::mint_for_testing<COIN_A>(1_000, sc.ctx());
        let coin_b_out = amm_pool::swap_a_to_b(&mut pool, coin_a, expected, sc.ctx());
        assert!(coin::value(&coin_b_out) == expected, 0);
        coin::burn_for_testing(coin_b_out);
        ts::return_shared(pool);
    };
    sc.end();
}

// H3: init below the minimum-liquidity threshold (sqrt(a*b) ≤ MINIMUM_LIQUIDITY)
// must abort EInsufficientLiquidity. sqrt(31*31)=31 < 1000.
// (Note: with MINIMUM_LIQUIDITY locked in the pool forever, EZeroReserve is
// no longer reachable from outside — the const remains as defense-in-depth.)
#[test, expected_failure(abort_code = surveysui::amm_pool::EInsufficientLiquidity)]
fun test_init_pool_aborts_when_below_minimum_liquidity() {
    let mut sc = ts::begin(ALICE);
    {
        let coin_a = coin::mint_for_testing<COIN_A>(31, sc.ctx());
        let coin_b = coin::mint_for_testing<COIN_B>(31, sc.ctx());
        let lp = amm_pool::init_pool(coin_a, coin_b, sc.ctx());
        transfer::public_transfer(lp, ALICE);
    };
    sc.end();
}

// H3: caller receives lp_total − MINIMUM_LIQUIDITY; pool keeps the rest forever.
// init(2000, 2000) → sqrt=2000, caller LP=1000, pool.lp_supply=2000.
#[test]
fun test_init_pool_locks_minimum_liquidity() {
    let mut sc = ts::begin(ALICE);
    {
        let coin_a = coin::mint_for_testing<COIN_A>(2_000, sc.ctx());
        let coin_b = coin::mint_for_testing<COIN_B>(2_000, sc.ctx());
        let lp = amm_pool::init_pool(coin_a, coin_b, sc.ctx());
        assert!(coin::value(&lp) == 1_000, 0);
        transfer::public_transfer(lp, ALICE);
    };
    sc.next_tx(ALICE);
    {
        let pool = ts::take_shared<Pool<COIN_A, COIN_B>>(&sc);
        // Supply counts both the caller's 1000 and the locked 1000.
        assert!(amm_pool::lp_supply(&pool) == 2_000, 1);
        ts::return_shared(pool);
    };
    sc.end();
}
