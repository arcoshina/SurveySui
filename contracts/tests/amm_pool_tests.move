#[test_only]
module surveysui::amm_pool_tests;

use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;
use surveysui::amm_pool::{Self, Pool};
use surveysui::stacked_survey_reward::{Self, SssrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_sui_reward::{Self, SsrTreasury, SURVEY_SUI_REWARD};

const ADMIN: address = @0xA11CE;
const BOB: address   = @0xCAFE;

// BONDING_DECAY = 1_000_000_000_000 MIST (1 000 SUI)
// At total=0: sSSR = sui_mist × DECAY / (DECAY + 0) = sui_mist  (1:1)
// At total=DECAY: price halves → sSSR = sui_mist / 2

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    survey_sui_reward::test_init(sc.ctx());
    stacked_survey_reward::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    amm_pool::init_pool(ADMIN, sc.ctx());
    sc.next_tx(ADMIN);
    sc
}

// ── tests ─────────────────────────────────────────────────────────────────────

/// Bonding curve: each successive investment yields fewer sSSR per MIST.
#[test]
fun test_bonding_curve_price_increases() {
    // At total=0 the curve mints 1000 sSSR base per MIST (1 SUI → 1000 sSSR).
    let at_zero  = amm_pool::compute_sssr_amount_for_test(1_000_000, 0);
    assert!(at_zero == 1_000_000_000);

    // After DECAY MIST invested the ratio halves
    let at_decay = amm_pool::compute_sssr_amount_for_test(1_000_000, 1_000_000_000_000);
    assert!(at_decay == 500_000_000);

    assert!(at_decay < at_zero);
}

/// invest_and_mint returns ALL sSSR with no fee — fee is taken later in vault.
#[test]
fun test_invest_returns_all_sssr_no_fee() {
    let mut sc = setup();
    {
        let mut pool          = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury  = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);

        let sui_amount = 1_000_000u64;
        let expected   = amm_pool::compute_sssr_amount_for_test(sui_amount, 0);

        let sui_in = coin::mint_for_testing<SUI>(sui_amount, sc.ctx());
        let sssr   = amm_pool::invest_and_mint(
            &mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx(),
        );

        // Full formula output — no fee deducted
        assert!(coin::value(&sssr) == expected);
        // SUI absorbed into pool reserve
        assert!(amm_pool::sui_reserve(&pool) == sui_amount);
        // SSR minted 1:1 with sSSR as backing
        assert!(amm_pool::ssr_reserve(&pool) == expected);
        // total_sui_invested updated
        assert!(amm_pool::total_sui_invested(&pool) == (sui_amount as u128));

        stacked_survey_reward::burn(&mut sssr_treasury, sssr);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };
    sc.end();
}

/// redeem burns sSSR and returns SSR minus 0.3% fee (fee goes to pool.admin).
#[test]
fun test_redeem_burns_sssr_returns_ssr() {
    let mut sc = setup();
    {
        let mut pool          = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury  = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);

        // Invest to put SSR into pool backing
        let sui_in    = coin::mint_for_testing<SUI>(1_000_000, sc.ctx());
        let sssr      = amm_pool::invest_and_mint(
            &mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx(),
        );
        let sssr_amt  = coin::value(&sssr);

        // Redeem: fee = sssr_amt × 30 / 10_000
        let ssr_out   = amm_pool::redeem(&mut pool, &mut sssr_treasury, sssr, sc.ctx());
        let fee       = sssr_amt * 30 / 10_000;
        assert!(coin::value(&ssr_out) == sssr_amt - fee);

        // Pool SSR reserve fully drained (fee sent to admin, ssr_out returned to caller)
        assert!(amm_pool::ssr_reserve(&pool) == 0);

        survey_sui_reward::burn(&mut ssr_treasury, ssr_out);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };
    sc.end();
}

/// Admin can withdraw SUI from pool; non-admin cannot.
#[test]
fun test_admin_withdraw_sui() {
    let mut sc = setup();
    {
        let mut pool          = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury  = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);

        let sui_in = coin::mint_for_testing<SUI>(5_000, sc.ctx());
        let sssr   = amm_pool::invest_and_mint(
            &mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx(),
        );
        stacked_survey_reward::burn(&mut sssr_treasury, sssr);
        assert!(amm_pool::sui_reserve(&pool) == 5_000);

        let withdrawn = amm_pool::admin_withdraw_sui(&mut pool, 2_000, sc.ctx());
        assert!(coin::value(&withdrawn) == 2_000);
        assert!(amm_pool::sui_reserve(&pool) == 3_000);

        coin::burn_for_testing(withdrawn);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::amm_pool::ENotAdmin)]
fun test_non_admin_cannot_withdraw_sui() {
    let mut sc = setup();
    sc.next_tx(BOB);
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        let sui_out  = amm_pool::admin_withdraw_sui(&mut pool, 1, sc.ctx()); // ENotAdmin
        coin::burn_for_testing(sui_out);
        ts::return_shared(pool);
    };
    sc.end();
}
