#[test_only]
module surveysui::ptb_seven_steps_tests;

use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use surveysui::amm_pool::{Self, Pool, FeeConfig};
use surveysui::stacked_survey_reward::{Self, SssrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_pass::{Self, PassRegistry, SurveyPass};
use surveysui::survey_registry::{Self, SurveyRegistry};
use surveysui::survey_sui_reward::{Self, SsrTreasury, SURVEY_SUI_REWARD};
use surveysui::survey_vault::{Self, SurveyVault};

const ADMIN: address      = @0xA11CE;
const CREATOR: address    = @0xC0FFEE;

const TTL_180D: u64      = 180 * 24 * 60 * 60 * 1000;
const T0: u64            = 1_000_000_000; // ms

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    {
        survey_sui_reward::test_init(sc.ctx());
        stacked_survey_reward::test_init(sc.ctx());
        survey_pass::test_init(sc.ctx());
        survey_registry::test_init(sc.ctx());
    };
    sc.next_tx(ADMIN);
    {
        amm_pool::init_pool(ADMIN, sc.ctx());
    };
    sc.next_tx(ADMIN);
    sc
}

#[test]
fun test_ptb_seven_steps_happy_path_no_offset() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    sc.next_tx(CREATOR);
    {
        let sui_in = coin::mint_for_testing<sui::sui::SUI>(100_000_000, sc.ctx());
        let zero_sssr = coin::zero<STACKED_SURVEY_REWARD>(sc.ctx());

        let mut vault = survey_vault::create_empty(
            90_000_000_000,
            1,
            T0 + TTL_180D,
            ADMIN,
            sc.ctx()
        );

        survey_vault::deposit_existing_sssr(&mut vault, zero_sssr);

        let mut pool = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        
        let new_sssr = amm_pool::invest_and_mint(
            &mut pool,
            &mut ssr_treasury,
            &mut sssr_treasury,
            sui_in,
            sc.ctx()
        );
        assert!(coin::value(&new_sssr) == 100_000_000_000);

        survey_vault::merge_balances(&mut vault, new_sssr);

        let fee_config = amm_pool::fee_config(&pool);
        survey_vault::split_fee_to_treasury(&mut vault, fee_config, sc.ctx());

        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(b"q1", b"text", b"Prompt", vector[], true)
        ];
        survey_registry::register(
            &mut registry,
            survey_vault::id_of(&vault),
            b"content_hash",
            b"encrypted_blob",
            b"schema_hash",
            questions,
            &clk,
            sc.ctx()
        );

        assert!(survey_vault::balance_value(&vault) == 90_000_000_000);
        
        survey_vault::share_vault(vault);
        ts::return_shared(registry);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    sc.next_tx(ADMIN);
    {
        let fee_coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        assert!(coin::value(&fee_coin) == 10_000_000_000);
        ts::return_to_sender(&sc, fee_coin);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_ptb_seven_steps_happy_path_with_offset() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    {
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        let sssr_coin = stacked_survey_reward::mint(&mut sssr_treasury, 50_000_000_000, sc.ctx());
        transfer::public_transfer(sssr_coin, CREATOR);
        ts::return_shared(sssr_treasury);
    };

    sc.next_tx(CREATOR);
    {
        let creator_sssr = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let sui_in = coin::mint_for_testing<sui::sui::SUI>(50_000_000, sc.ctx());

        let mut vault = survey_vault::create_empty(
            90_000_000_000,
            1,
            T0 + TTL_180D,
            ADMIN,
            sc.ctx()
        );

        survey_vault::deposit_existing_sssr(&mut vault, creator_sssr);

        let mut pool = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        
        let new_sssr = amm_pool::invest_and_mint(
            &mut pool,
            &mut ssr_treasury,
            &mut sssr_treasury,
            sui_in,
            sc.ctx()
        );
        assert!(coin::value(&new_sssr) == 50_000_000_000);

        survey_vault::merge_balances(&mut vault, new_sssr);

        let fee_config = amm_pool::fee_config(&pool);
        survey_vault::split_fee_to_treasury(&mut vault, fee_config, sc.ctx());

        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(b"q1", b"text", b"Prompt", vector[], true)
        ];
        survey_registry::register(
            &mut registry,
            survey_vault::id_of(&vault),
            b"content_hash",
            b"encrypted_blob",
            b"schema_hash",
            questions,
            &clk,
            sc.ctx()
        );

        assert!(survey_vault::balance_value(&vault) == 90_000_000_000);
        
        survey_vault::share_vault(vault);
        ts::return_shared(registry);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    sc.next_tx(CREATOR);
    {
        assert!(!ts::has_most_recent_for_sender<Coin<STACKED_SURVEY_REWARD>>(&sc));
    };

    sc.next_tx(ADMIN);
    {
        let fee_coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        assert!(coin::value(&fee_coin) == 10_000_000_000);
        ts::return_to_sender(&sc, fee_coin);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_ptb_seven_steps_happy_path_overfund_offset() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    {
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        let sssr_coin = stacked_survey_reward::mint(&mut sssr_treasury, 150_000_000_000, sc.ctx());
        transfer::public_transfer(sssr_coin, CREATOR);
        ts::return_shared(sssr_treasury);
    };

    sc.next_tx(CREATOR);
    {
        let mut creator_sssr = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let deposit_coin = coin::split(&mut creator_sssr, 100_000_000_000, sc.ctx());

        let mut vault = survey_vault::create_empty(
            90_000_000_000,
            1,
            T0 + TTL_180D,
            ADMIN,
            sc.ctx()
        );

        survey_vault::deposit_existing_sssr(&mut vault, deposit_coin);

        let zero_sssr = coin::zero<STACKED_SURVEY_REWARD>(sc.ctx());

        survey_vault::merge_balances(&mut vault, zero_sssr);

        let pool = ts::take_shared<Pool>(&sc);
        let fee_config = amm_pool::fee_config(&pool);
        survey_vault::split_fee_to_treasury(&mut vault, fee_config, sc.ctx());

        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(b"q1", b"text", b"Prompt", vector[], true)
        ];
        survey_registry::register(
            &mut registry,
            survey_vault::id_of(&vault),
            b"content_hash",
            b"encrypted_blob",
            b"schema_hash",
            questions,
            &clk,
            sc.ctx()
        );

        assert!(survey_vault::balance_value(&vault) == 90_000_000_000);
        
        survey_vault::share_vault(vault);
        ts::return_shared(registry);
        ts::return_shared(pool);
        ts::return_to_sender(&sc, creator_sssr);
    };

    sc.next_tx(CREATOR);
    {
        let remaining_sssr = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        assert!(coin::value(&remaining_sssr) == 50_000_000_000);
        ts::return_to_sender(&sc, remaining_sssr);
    };

    sc.next_tx(ADMIN);
    {
        let fee_coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        assert!(coin::value(&fee_coin) == 10_000_000_000);
        ts::return_to_sender(&sc, fee_coin);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInsufficientVaultBalance)]
fun test_ptb_step5_invariant_underfund_abort() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    sc.next_tx(CREATOR);
    {
        let sui_in = coin::mint_for_testing<sui::sui::SUI>(80_000_000, sc.ctx());
        let zero_sssr = coin::zero<STACKED_SURVEY_REWARD>(sc.ctx());

        let mut vault = survey_vault::create_empty(
            90_000_000_000,
            1,
            T0 + TTL_180D,
            ADMIN,
            sc.ctx()
        );

        survey_vault::deposit_existing_sssr(&mut vault, zero_sssr);

        let mut pool = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        
        let new_sssr = amm_pool::invest_and_mint(
            &mut pool,
            &mut ssr_treasury,
            &mut sssr_treasury,
            sui_in,
            sc.ctx()
        );

        survey_vault::merge_balances(&mut vault, new_sssr);

        let fee_config = amm_pool::fee_config(&pool);
        survey_vault::split_fee_to_treasury(&mut vault, fee_config, sc.ctx());
        survey_vault::share_vault(vault);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
#[expected_failure(abort_code = surveysui::survey_registry::EDuplicateSurvey)]
fun test_ptb_step7_duplicate_content_abort() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    sc.next_tx(CREATOR);
    {
        let sui_in = coin::mint_for_testing<sui::sui::SUI>(100_000_000, sc.ctx());
        let zero_sssr = coin::zero<STACKED_SURVEY_REWARD>(sc.ctx());

        let mut vault = survey_vault::create_empty(90_000_000_000, 1, T0 + TTL_180D, ADMIN, sc.ctx());
        survey_vault::deposit_existing_sssr(&mut vault, zero_sssr);

        let mut pool = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        let new_sssr = amm_pool::invest_and_mint(&mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx());
        survey_vault::merge_balances(&mut vault, new_sssr);

        let fee_config = amm_pool::fee_config(&pool);
        survey_vault::split_fee_to_treasury(&mut vault, fee_config, sc.ctx());

        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(b"q1", b"text", b"Prompt", vector[], true)
        ];
        survey_registry::register(
            &mut registry,
            survey_vault::id_of(&vault),
            b"content_hash",
            b"encrypted_blob",
            b"schema_hash",
            questions,
            &clk,
            sc.ctx()
        );

        survey_vault::share_vault(vault);
        ts::return_shared(registry);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    sc.next_tx(CREATOR);
    {
        let sui_in = coin::mint_for_testing<sui::sui::SUI>(100_000_000, sc.ctx());
        let zero_sssr = coin::zero<STACKED_SURVEY_REWARD>(sc.ctx());

        let mut vault = survey_vault::create_empty(90_000_000_000, 1, T0 + TTL_180D, ADMIN, sc.ctx());
        survey_vault::deposit_existing_sssr(&mut vault, zero_sssr);

        let mut pool = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        let new_sssr = amm_pool::invest_and_mint(&mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx());
        survey_vault::merge_balances(&mut vault, new_sssr);

        let fee_config = amm_pool::fee_config(&pool);
        survey_vault::split_fee_to_treasury(&mut vault, fee_config, sc.ctx());

        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(b"q1", b"text", b"Prompt", vector[], true)
        ];
        survey_registry::register(
            &mut registry,
            survey_vault::id_of(&vault),
            b"content_hash",
            b"encrypted_blob",
            b"schema_hash",
            questions,
            &clk,
            sc.ctx()
        );

        survey_vault::share_vault(vault);
        ts::return_shared(registry);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
#[expected_failure(abort_code = 2)]
fun test_ptb_step7_invalid_schema_abort() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    sc.next_tx(CREATOR);
    {
        let sui_in = coin::mint_for_testing<sui::sui::SUI>(100_000_000, sc.ctx());
        let zero_sssr = coin::zero<STACKED_SURVEY_REWARD>(sc.ctx());

        let mut vault = survey_vault::create_empty(90_000_000_000, 1, T0 + TTL_180D, ADMIN, sc.ctx());
        survey_vault::deposit_existing_sssr(&mut vault, zero_sssr);

        let mut pool = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        let new_sssr = amm_pool::invest_and_mint(&mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx());
        survey_vault::merge_balances(&mut vault, new_sssr);

        let fee_config = amm_pool::fee_config(&pool);
        survey_vault::split_fee_to_treasury(&mut vault, fee_config, sc.ctx());

        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(b"q1", b"invalid_type", b"Prompt", vector[], true)
        ];
        survey_registry::register(
            &mut registry,
            survey_vault::id_of(&vault),
            b"content_hash",
            b"encrypted_blob",
            b"schema_hash",
            questions,
            &clk,
            sc.ctx()
        );

        survey_vault::share_vault(vault);
        ts::return_shared(registry);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
#[expected_failure]
fun test_ptb_atomic_rollback_step3_failure() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    {
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        let sssr_coin = stacked_survey_reward::mint(&mut sssr_treasury, 50_000_000_000, sc.ctx());
        transfer::public_transfer(sssr_coin, CREATOR);
        ts::return_shared(sssr_treasury);
    };

    sc.next_tx(CREATOR);
    {
        let mut creator_sssr = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let deposit_coin = coin::split(&mut creator_sssr, 100_000_000_000, sc.ctx());

        let mut vault = survey_vault::create_empty(90_000_000_000, 1, T0 + TTL_180D, ADMIN, sc.ctx());
        survey_vault::deposit_existing_sssr(&mut vault, deposit_coin);

        survey_vault::share_vault(vault);
        ts::return_to_sender(&sc, creator_sssr);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
#[expected_failure(abort_code = surveysui::amm_pool::EZeroAmount)]
fun test_ptb_atomic_rollback_step4_failure() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    sc.next_tx(CREATOR);
    {
        let sui_in = coin::zero<sui::sui::SUI>(sc.ctx());
        let zero_sssr = coin::zero<STACKED_SURVEY_REWARD>(sc.ctx());

        let mut vault = survey_vault::create_empty(90_000_000_000, 1, T0 + TTL_180D, ADMIN, sc.ctx());
        survey_vault::deposit_existing_sssr(&mut vault, zero_sssr);

        let mut pool = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        
        let new_sssr = amm_pool::invest_and_mint(
            &mut pool,
            &mut ssr_treasury,
            &mut sssr_treasury,
            sui_in,
            sc.ctx()
        );

        survey_vault::merge_balances(&mut vault, new_sssr);
        survey_vault::share_vault(vault);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
#[expected_failure]
fun test_ptb_atomic_rollback_step6_failure() {
    let mut sc = ts::begin(ADMIN);
    {
        survey_sui_reward::test_init(sc.ctx());
        stacked_survey_reward::test_init(sc.ctx());
        survey_pass::test_init(sc.ctx());
        survey_registry::test_init(sc.ctx());
    };

    sc.next_tx(CREATOR);
    {
        let pool = ts::take_shared<Pool>(&sc);
        ts::return_shared(pool);
    };
    sc.end();
}

#[test]
fun test_ptb_creator_balance_invariant() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    {
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        let sssr_coin = stacked_survey_reward::mint(&mut sssr_treasury, 100_000_000_000, sc.ctx());
        transfer::public_transfer(sssr_coin, CREATOR);
        ts::return_shared(sssr_treasury);
    };

    sc.next_tx(CREATOR);
    {
        let mut creator_sssr = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let deposit_coin = coin::split(&mut creator_sssr, 40_000_000_000, sc.ctx());

        let mut vault = survey_vault::create_empty(90_000_000_000, 1, T0 + TTL_180D, ADMIN, sc.ctx());
        survey_vault::deposit_existing_sssr(&mut vault, deposit_coin);

        let sui_in = coin::mint_for_testing<sui::sui::SUI>(60_000_000, sc.ctx());
        let mut pool = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        
        let new_sssr = amm_pool::invest_and_mint(&mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx());
        survey_vault::merge_balances(&mut vault, new_sssr);

        let fee_config = amm_pool::fee_config(&pool);
        survey_vault::split_fee_to_treasury(&mut vault, fee_config, sc.ctx());

        assert!(coin::value(&creator_sssr) == 60_000_000_000);

        survey_vault::share_vault(vault);
        ts::return_to_sender(&sc, creator_sssr);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_ptb_fee_split_accounting() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    let offset_in: u64 = 35_000_000_000;
    {
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        let sssr_coin = stacked_survey_reward::mint(&mut sssr_treasury, offset_in, sc.ctx());
        transfer::public_transfer(sssr_coin, CREATOR);
        ts::return_shared(sssr_treasury);
    };

    sc.next_tx(CREATOR);
    {
        let creator_sssr = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let sui_in = coin::mint_for_testing<sui::sui::SUI>(65_000_000, sc.ctx());

        let mut vault = survey_vault::create_empty(90_000_000_000, 1, T0 + TTL_180D, ADMIN, sc.ctx());
        survey_vault::deposit_existing_sssr(&mut vault, creator_sssr);

        let mut pool = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);
        
        let new_sssr = amm_pool::invest_and_mint(&mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx());
        let minted = coin::value(&new_sssr);
        assert!(minted == 65_000_000_000);

        survey_vault::merge_balances(&mut vault, new_sssr);

        let total_before_split = survey_vault::balance_value(&vault);
        assert!(total_before_split == offset_in + minted);

        let fee_config = amm_pool::fee_config(&pool);
        survey_vault::split_fee_to_treasury(&mut vault, fee_config, sc.ctx());

        survey_vault::share_vault(vault);
        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    sc.next_tx(ADMIN);
    {
        let fee_coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let treasury_delta = coin::value(&fee_coin);

        let vault = ts::take_shared<SurveyVault>(&sc);
        let vault_after_fee = survey_vault::balance_value(&vault);

        assert!(vault_after_fee + treasury_delta == offset_in + 65_000_000_000);

        ts::return_shared(vault);
        ts::return_to_sender(&sc, fee_coin);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
