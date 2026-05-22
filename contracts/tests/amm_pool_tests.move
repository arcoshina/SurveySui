#[test_only]
module surveysui::amm_pool_tests;

use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;
use surveysui::amm_pool::{Self, Pool, FeeConfig};
use surveysui::stacked_survey_reward::{Self, SsrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_reward::{Self, SrTreasury, SURVEY_REWARD};

const ADMIN: address = @0xA11CE;
const BOB: address   = @0xCAFE;

// BONDING_DECAY = 1_000_000_000_000 MIST (1 000 SUI)
// At total=0: SSR = sui_mist × DECAY / (DECAY + 0) = sui_mist  (1:1)
// At total=DECAY: price halves → SSR = sui_mist / 2

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    survey_reward::test_init(sc.ctx());
    stacked_survey_reward::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    amm_pool::init_pool(ADMIN, sc.ctx());
    sc.next_tx(ADMIN);
    sc
}

// ── tests ─────────────────────────────────────────────────────────────────────

/// Bonding curve: each successive investment yields fewer SSR per MIST.
#[test]
fun test_bonding_curve_price_increases() {
    // At total=0 the curve mints 1000 SSR base per MIST (1 SUI → 1000 SSR).
    let at_zero  = amm_pool::compute_ssr_amount_for_test(1_000_000, 0);
    assert!(at_zero == 1_000_000_000);

    // After DECAY MIST invested the ratio halves
    let at_decay = amm_pool::compute_ssr_amount_for_test(1_000_000, 1_000_000_000_000);
    assert!(at_decay == 500_000_000);

    assert!(at_decay < at_zero);
}

/// invest_and_mint returns ALL SSR with no fee — fee is taken later in vault.
#[test]
fun test_invest_returns_all_ssr_no_fee() {
    let mut sc = setup();
    {
        let mut pool         = ts::take_shared<Pool>(&sc);
        let mut sr_treasury  = ts::take_shared<SrTreasury>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);

        let sui_amount = 1_000_000u64;
        let expected   = amm_pool::compute_ssr_amount_for_test(sui_amount, 0);

        let sui_in = coin::mint_for_testing<SUI>(sui_amount, sc.ctx());
        let ssr    = amm_pool::invest_and_mint(
            &mut pool, &mut sr_treasury, &mut ssr_treasury, sui_in, sc.ctx(),
        );

        // Full formula output — no fee deducted
        assert!(coin::value(&ssr) == expected);
        // SUI absorbed into pool reserve
        assert!(amm_pool::sui_reserve(&pool) == sui_amount);
        // SR minted 1:1 with SSR as backing
        assert!(amm_pool::sr_reserve(&pool) == expected);
        // total_sui_invested updated
        assert!(amm_pool::total_sui_invested(&pool) == (sui_amount as u128));

        stacked_survey_reward::burn(&mut ssr_treasury, ssr);
        ts::return_shared(ssr_treasury);
        ts::return_shared(sr_treasury);
        ts::return_shared(pool);
    };
    sc.end();
}

/// redeem burns SSR and returns SR minus 0.3% fee (fee goes to pool.admin).
#[test]
fun test_redeem_burns_ssr_returns_sr() {
    let mut sc = setup();
    {
        let mut pool         = ts::take_shared<Pool>(&sc);
        let mut sr_treasury  = ts::take_shared<SrTreasury>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);

        // Invest to put SR into pool backing
        let sui_in   = coin::mint_for_testing<SUI>(1_000_000, sc.ctx());
        let ssr      = amm_pool::invest_and_mint(
            &mut pool, &mut sr_treasury, &mut ssr_treasury, sui_in, sc.ctx(),
        );
        let ssr_amt  = coin::value(&ssr);

        // Redeem: fee = ssr_amt × 30 / 10_000
        let sr_out   = amm_pool::redeem(&mut pool, &mut ssr_treasury, ssr, sc.ctx());
        let fee      = ssr_amt * 30 / 10_000;
        assert!(coin::value(&sr_out) == ssr_amt - fee);

        // Pool SR reserve fully drained (fee sent to admin, sr_out returned to caller)
        assert!(amm_pool::sr_reserve(&pool) == 0);

        survey_reward::burn(&mut sr_treasury, sr_out);
        ts::return_shared(ssr_treasury);
        ts::return_shared(sr_treasury);
        ts::return_shared(pool);
    };
    sc.end();
}

/// Admin can withdraw SUI from pool; non-admin cannot.
#[test]
fun test_admin_withdraw_sui() {
    let mut sc = setup();
    {
        let mut pool         = ts::take_shared<Pool>(&sc);
        let mut sr_treasury  = ts::take_shared<SrTreasury>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);

        let sui_in = coin::mint_for_testing<SUI>(5_000, sc.ctx());
        let ssr    = amm_pool::invest_and_mint(
            &mut pool, &mut sr_treasury, &mut ssr_treasury, sui_in, sc.ctx(),
        );
        stacked_survey_reward::burn(&mut ssr_treasury, ssr);
        assert!(amm_pool::sui_reserve(&pool) == 5_000);

        let withdrawn = amm_pool::admin_withdraw_sui(&mut pool, 2_000, sc.ctx());
        assert!(coin::value(&withdrawn) == 2_000);
        assert!(amm_pool::sui_reserve(&pool) == 3_000);

        coin::burn_for_testing(withdrawn);
        ts::return_shared(ssr_treasury);
        ts::return_shared(sr_treasury);
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

// ── S1.1 AMM / FeeConfig ──────────────────────────────────────────────────────

/// 1 SUI (1e9 MIST) at total_invested=0 mints exactly 1000 SSR units (1e12 base).
#[test]
fun test_initial_sr_per_sui_one_thousand() {
    let mut sc = setup();
    {
        let mut pool         = ts::take_shared<Pool>(&sc);
        let mut sr_treasury  = ts::take_shared<SrTreasury>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);

        let one_sui = 1_000_000_000u64;
        let ssr = amm_pool::invest_and_mint(
            &mut pool, &mut sr_treasury, &mut ssr_treasury,
            coin::mint_for_testing<SUI>(one_sui, sc.ctx()),
            sc.ctx(),
        );

        // 1 SUI → 1000 SSR units = 1000 × 1e9 base = 1e12
        assert!(coin::value(&ssr) == 1_000_000_000_000);

        stacked_survey_reward::burn(&mut ssr_treasury, ssr);
        ts::return_shared(ssr_treasury);
        ts::return_shared(sr_treasury);
        ts::return_shared(pool);
    };
    sc.end();
}

/// init_pool 後 FeeConfig 預設為 total=2000, discount=5000。
#[test]
fun test_fee_config_default_values() {
    let mut sc = setup();
    {
        let pool = ts::take_shared<Pool>(&sc);
        let fee  = amm_pool::fee_config(&pool);
        assert!(amm_pool::fee_total_bps(fee) == 2000);
        assert!(amm_pool::fee_discount_bps(fee) == 5000);
        ts::return_shared(pool);
    };
    sc.end();
}

/// effective() = total × discount / 10_000；驗 5 組輸入。
#[test]
fun test_fee_config_effective_formula() {
    let mut sc = setup();
    {
        let mut pool = ts::take_shared<Pool>(&sc);

        // default (2000, 5000) → 1000
        assert!(amm_pool::effective(amm_pool::fee_config(&pool)) == 1000);

        amm_pool::set_fee_config(&mut pool, 2000, 0, sc.ctx());
        assert!(amm_pool::effective(amm_pool::fee_config(&pool)) == 0);

        amm_pool::set_fee_config(&mut pool, 2000, 10000, sc.ctx());
        assert!(amm_pool::effective(amm_pool::fee_config(&pool)) == 2000);

        amm_pool::set_fee_config(&mut pool, 1500, 3000, sc.ctx());
        assert!(amm_pool::effective(amm_pool::fee_config(&pool)) == 450);

        amm_pool::set_fee_config(&mut pool, 0, 5000, sc.ctx());
        assert!(amm_pool::effective(amm_pool::fee_config(&pool)) == 0);

        ts::return_shared(pool);
    };
    sc.end();
}

/// 非 admin 呼叫 set_fee_config 必 abort ENotAdmin。
#[test, expected_failure(abort_code = surveysui::amm_pool::ENotAdmin)]
fun test_fee_config_setter_admin_only() {
    let mut sc = setup();
    sc.next_tx(BOB);
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        amm_pool::set_fee_config(&mut pool, 2000, 5000, sc.ctx()); // ENotAdmin
        ts::return_shared(pool);
    };
    sc.end();
}

/// total_fee_bps > 10000 必 abort EInvalidFeeConfig。
#[test, expected_failure(abort_code = surveysui::amm_pool::EInvalidFeeConfig)]
fun test_fee_config_setter_bounds() {
    let mut sc = setup();
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        amm_pool::set_fee_config(&mut pool, 10001, 5000, sc.ctx()); // EInvalidFeeConfig
        ts::return_shared(pool);
    };
    sc.end();
}

/// discount_bps > 10000 也必 abort EInvalidFeeConfig。
#[test, expected_failure(abort_code = surveysui::amm_pool::EInvalidFeeConfig)]
fun test_fee_config_setter_bounds_discount_over() {
    let mut sc = setup();
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        amm_pool::set_fee_config(&mut pool, 2000, 10001, sc.ctx()); // EInvalidFeeConfig
        ts::return_shared(pool);
    };
    sc.end();
}
