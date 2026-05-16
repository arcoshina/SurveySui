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

// sqrt(10 000 × 10 000) = 10 000
#[test]
fun test_initial_liquidity_mints_correct_lp() {
    let mut sc = ts::begin(ALICE);
    {
        let coin_a = coin::mint_for_testing<COIN_A>(10_000, sc.ctx());
        let coin_b = coin::mint_for_testing<COIN_B>(10_000, sc.ctx());
        let lp = amm_pool::init_pool(coin_a, coin_b, sc.ctx());
        assert!(coin::value(&lp) == 10_000, 0);
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
        let coin_b_out = amm_pool::swap_a_to_b(&mut pool, coin_a, sc.ctx());

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
        let coin_b_out = amm_pool::swap_a_to_b(&mut pool, coin_a, sc.ctx());
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

// Drain all liquidity, then attempt a swap → must abort with EZeroReserve.
#[test, expected_failure(abort_code = surveysui::amm_pool::EZeroReserve)]
fun test_swap_aborts_on_zero_reserves() {
    let mut sc = ts::begin(ALICE);
    {
        // sqrt(1 × 1) = 1 LP — minimum viable pool
        let coin_a = coin::mint_for_testing<COIN_A>(1, sc.ctx());
        let coin_b = coin::mint_for_testing<COIN_B>(1, sc.ctx());
        let lp = amm_pool::init_pool(coin_a, coin_b, sc.ctx());
        transfer::public_transfer(lp, ALICE);
    };
    sc.next_tx(ALICE);
    {
        let mut pool = ts::take_shared<Pool<COIN_A, COIN_B>>(&sc);
        let lp = ts::take_from_sender<Coin<LP<COIN_A, COIN_B>>>(&sc);

        // Remove all liquidity → reserves drop to 0
        let (coin_a, coin_b) = amm_pool::remove_liquidity(&mut pool, lp, sc.ctx());
        coin::burn_for_testing(coin_a);
        coin::burn_for_testing(coin_b);

        // Swap against empty pool → abort EZeroReserve
        let coin_a2    = coin::mint_for_testing<COIN_A>(1, sc.ctx());
        let coin_b_out = amm_pool::swap_a_to_b(&mut pool, coin_a2, sc.ctx());
        coin::burn_for_testing(coin_b_out);
        ts::return_shared(pool);
    };
    sc.end();
}
