#[test_only]
module surveysui::amm_pool_tests;

use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;
use surveysui::amm_pool::{Self, Pool, ProtocolConfig};
use surveysui::stacked_survey_reward::{Self, SsrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_reward::{Self, SrTreasury};

const ADMIN: address = @0xAD;
const ATTACKER: address = @0xBAD;

fun init_pool_env(sc: &mut ts::Scenario) {
    ts::next_tx(sc, ADMIN);
    {
        let ctx = ts::ctx(sc);
        survey_reward::test_init(ctx);
        stacked_survey_reward::test_init(ctx);
        amm_pool::create_protocol_config(ctx);
    };
    ts::next_tx(sc, ADMIN);
    {
        let mut config = ts::take_shared<ProtocolConfig>(sc);
        let ctx = ts::ctx(sc);
        amm_pool::bootstrap_canonical_pool(&mut config, ADMIN, ctx);
        ts::return_shared(config);
    };
}

#[test]
fun test_compute_bootstrap_one_sui() {
    let out = amm_pool::compute_ssr_amount_for_test(1_000_000_000, 0, 0);
    assert!(out == 1_000_000_000, 1);
}

#[test]
fun test_compute_ratio_spec_example() {
    // Pool: 10 SUI, 5000 SSR base backing → 1 SUI in mints 500 SSR (5e8 base).
    let out = amm_pool::compute_ssr_amount_for_test(
        1_000_000_000,
        10_000_000_000,
        5_000_000_000,
    );
    assert!(out == 500_000_000, 2);
}

#[test]
fun test_invest_and_mint_bootstrap() {
    let mut sc = ts::begin(ADMIN);
    init_pool_env(&mut sc);

    ts::next_tx(&mut sc, ADMIN);
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut sr_treasury = ts::take_shared<SrTreasury>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let ctx = ts::ctx(&mut sc);

        let sui_in = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        let ssr = amm_pool::invest_and_mint(
            &mut pool,
            &config,
            &mut sr_treasury,
            &mut ssr_treasury,
            sui_in,
            1,
            ctx,
        );
        assert!(coin::value(&ssr) == 1_000_000_000, 10);
        assert!(amm_pool::sui_reserve(&pool) == 1_000_000_000, 11);
        assert!(amm_pool::sr_reserve(&pool) == 1_000_000_000, 12);
        coin::burn_for_testing(ssr);

        ts::return_shared(ssr_treasury);
        ts::return_shared(sr_treasury);
        ts::return_shared(config);
        ts::return_shared(pool);
    };

    ts::end(sc);
}

#[test]
fun test_invest_preserves_reserve_ratio() {
    let mut sc = ts::begin(ADMIN);
    init_pool_env(&mut sc);

    ts::next_tx(&mut sc, ADMIN);
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut sr_treasury = ts::take_shared<SrTreasury>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let ctx = ts::ctx(&mut sc);

        let sui1 = coin::mint_for_testing<SUI>(10_000_000_000, ctx);
        let ssr1 = amm_pool::invest_and_mint(
            &mut pool,
            &config,
            &mut sr_treasury,
            &mut ssr_treasury,
            sui1,
            1,
            ctx,
        );
        coin::burn_for_testing(ssr1);

        let sui_before = amm_pool::sui_reserve(&pool);
        let sr_before = amm_pool::sr_reserve(&pool);
        let sui_in2 = 1_000_000_000u64;
        let expected_ssr2 = amm_pool::compute_ssr_amount_for_test(sui_in2, sui_before, sr_before);

        let sui2 = coin::mint_for_testing<SUI>(sui_in2, ctx);
        let ssr2 = amm_pool::invest_and_mint(
            &mut pool,
            &config,
            &mut sr_treasury,
            &mut ssr_treasury,
            sui2,
            1,
            ctx,
        );
        assert!(coin::value(&ssr2) == expected_ssr2, 20);
        coin::burn_for_testing(ssr2);

        ts::return_shared(ssr_treasury);
        ts::return_shared(sr_treasury);
        ts::return_shared(config);
        ts::return_shared(pool);
    };

    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::amm_pool::EInsufficientOutput)]
fun test_min_ssr_out_rejects_slippage() {
    let mut sc = ts::begin(ADMIN);
    init_pool_env(&mut sc);

    ts::next_tx(&mut sc, ADMIN);
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut sr_treasury = ts::take_shared<SrTreasury>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let ctx = ts::ctx(&mut sc);

        let sui_in = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        let ssr = amm_pool::invest_and_mint(
            &mut pool,
            &config,
            &mut sr_treasury,
            &mut ssr_treasury,
            sui_in,
            2_000_000_000,
            ctx,
        );
        coin::burn_for_testing(ssr);

        ts::return_shared(ssr_treasury);
        ts::return_shared(sr_treasury);
        ts::return_shared(config);
        ts::return_shared(pool);
    };

    ts::end(sc);
}

#[test]
fun test_admin_burn_pair_splits_pool_sr() {
    let mut sc = ts::begin(ADMIN);
    init_pool_env(&mut sc);

    ts::next_tx(&mut sc, ADMIN);
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut sr_treasury = ts::take_shared<SrTreasury>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let ctx = ts::ctx(&mut sc);

        let sui_in = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
        let ssr = amm_pool::invest_and_mint(
            &mut pool,
            &config,
            &mut sr_treasury,
            &mut ssr_treasury,
            sui_in,
            1,
            ctx,
        );
        let burn_amount = coin::value(&ssr);
        let sui_before = amm_pool::sui_reserve(&pool);
        let sr_before = amm_pool::sr_reserve(&pool);
        let ssr_supply_before = stacked_survey_reward::total_supply(&ssr_treasury);

        amm_pool::admin_burn_pair(
            &mut pool,
            &mut sr_treasury,
            &mut ssr_treasury,
            ssr,
            ctx,
        );

        assert!(amm_pool::sui_reserve(&pool) == sui_before, 30);
        assert!(amm_pool::sr_reserve(&pool) == sr_before - burn_amount, 31);
        assert!(
            stacked_survey_reward::total_supply(&ssr_treasury) == ssr_supply_before - burn_amount,
            32,
        );

        ts::return_shared(ssr_treasury);
        ts::return_shared(sr_treasury);
        ts::return_shared(config);
        ts::return_shared(pool);
    };

    ts::end(sc);
}

#[test]
fun test_admin_withdraw_sui() {
    let mut sc = ts::begin(ADMIN);
    init_pool_env(&mut sc);

    ts::next_tx(&mut sc, ADMIN);
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut sr_treasury = ts::take_shared<SrTreasury>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let ctx = ts::ctx(&mut sc);

        let sui_in = coin::mint_for_testing<SUI>(2_000_000_000, ctx);
        let ssr = amm_pool::invest_and_mint(
            &mut pool,
            &config,
            &mut sr_treasury,
            &mut ssr_treasury,
            sui_in,
            1,
            ctx,
        );
        coin::burn_for_testing(ssr);

        let sr_before = amm_pool::sr_reserve(&pool);
        let withdrawn = amm_pool::admin_withdraw_sui(&mut pool, 500_000_000, ctx);
        assert!(coin::value(&withdrawn) == 500_000_000, 40);
        assert!(amm_pool::sui_reserve(&pool) == 1_500_000_000, 41);
        assert!(amm_pool::sr_reserve(&pool) == sr_before, 42);
        coin::burn_for_testing(withdrawn);

        ts::return_shared(ssr_treasury);
        ts::return_shared(sr_treasury);
        ts::return_shared(config);
        ts::return_shared(pool);
    };

    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::amm_pool::ENotAdmin)]
fun test_non_admin_cannot_withdraw() {
    let mut sc = ts::begin(ADMIN);
    init_pool_env(&mut sc);

    ts::next_tx(&mut sc, ATTACKER);
    {
        let mut pool = ts::take_shared<Pool>(&sc);
        let ctx = ts::ctx(&mut sc);
        let withdrawn = amm_pool::admin_withdraw_sui(&mut pool, 1, ctx);
        coin::burn_for_testing(withdrawn);
        ts::return_shared(pool);
    };

    ts::end(sc);
}
