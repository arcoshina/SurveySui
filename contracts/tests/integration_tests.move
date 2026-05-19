#[test_only]
module surveysui::integration_tests;

use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use surveysui::amm_pool::{Self, Pool};
use surveysui::stacked_survey_reward::{Self, SssrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_pass::{Self, PassRegistry, SurveyPass};
use surveysui::survey_registry::{Self, SurveyRegistry};
use surveysui::survey_sui_reward::{Self, SsrTreasury, SURVEY_SUI_REWARD};
use surveysui::survey_vault::{Self, SurveyVault};

const ADMIN: address      = @0xA11CE;
const CREATOR: address    = @0xC0FFEE;
const RESPONDENT: address = @0xA71CE;

const TTL_180D: u64      = 180 * 24 * 60 * 60 * 1000;
const T0: u64            = 1_000_000_000; // ms
const SUI_INVEST: u64    = 100_000;       // MIST
// At total=0: sSSR_received = 100_000 (1:1 with MIST)
const PER_RESPONSE: u64  = 1_000;
const MAX_RESPONSES: u64 = 50;
// vault_fee = 100_000 × 30 / 10_000 = 300
// vault_balance_after = 99_700 ≥ 50 × 1_000 = 50_000 ✓

/// Full A→C lifecycle:
///   A. ADMIN deploys modules, issues SurveyPass, creates AMM pool
///   B. CREATOR invests SUI → sSSR, deposits sSSR into vault (fee deducted), registers survey
///   C. RESPONDENT claims sSSR from vault, redeems sSSR → SSR via AMM
///   Epilogue: CREATOR closes vault, ADMIN withdraws SUI
#[test]
fun test_full_lifecycle_a_to_c() {
    // ── A. Deploy ─────────────────────────────────────────────────────────────
    let mut sc = ts::begin(ADMIN);
    {
        survey_sui_reward::test_init(sc.ctx());
        stacked_survey_reward::test_init(sc.ctx());
        survey_pass::test_init(sc.ctx());
        survey_registry::test_init(sc.ctx());
    };

    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    sc.next_tx(ADMIN);
    amm_pool::init_pool(ADMIN, sc.ctx());

    // ADMIN issues SurveyPass for RESPONDENT
    sc.next_tx(ADMIN);
    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // ── B. Creator flow ───────────────────────────────────────────────────────
    sc.next_tx(CREATOR);
    {
        let mut pool          = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury  = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);

        // invest SUI → sSSR (no fee here)
        let sui_in  = coin::mint_for_testing<sui::sui::SUI>(SUI_INVEST, sc.ctx());
        let sssr    = amm_pool::invest_and_mint(
            &mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx(),
        );
        let sssr_received = coin::value(&sssr);
        assert!(sssr_received == SUI_INVEST * 1000); // 1 MIST → 1000 sSSR base at total=0

        // pool absorbed the SUI and minted sssr_received SSR backing
        assert!(amm_pool::sui_reserve(&pool) == SUI_INVEST);
        assert!(amm_pool::ssr_reserve(&pool) == sssr_received);

        // deposit sSSR into vault (no fee deducted here in V2)
        let vault_balance_expected = sssr_received;
        let vault = survey_vault::create(
            sssr, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        assert!(survey_vault::balance_value(&vault) == vault_balance_expected);
        let vault_id = object::id(&vault);
        survey_vault::share_vault(vault);

        // register survey
        let mut survey_reg = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(
                b"q1",
                b"text",
                b"What is your name?",
                vector[],
                true
            )
        ];
        survey_registry::register(
            &mut survey_reg,
            vault_id,
            b"survey_hash",
            b"encrypted_content",
            b"schema_hash",
            questions,
            &clk,
            sc.ctx(),
        );
        assert!(survey_registry::total_count(&survey_reg) == 1);
        ts::return_shared(survey_reg);

        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    // ── C. Respondent flow ───────────────────────────────────────────────────
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);

        // claim sSSR reward from vault
        survey_vault::claim(&mut vault, &pass, b"alice_sub", b"encrypted_response", &clk, sc.ctx());
        assert!(survey_vault::claimed_count(&vault) == 1);
        assert!(survey_vault::has_claimed(&vault, b"alice_sub"));

        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    // RESPONDENT redeems sSSR → SSR via AMM
    sc.next_tx(RESPONDENT);
    {
        let sssr_reward   = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        assert!(coin::value(&sssr_reward) == PER_RESPONSE);

        let mut pool          = ts::take_shared<Pool>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);

        let ssr_out = amm_pool::redeem(&mut pool, &mut sssr_treasury, sssr_reward, sc.ctx());
        let fee     = PER_RESPONSE * 30 / 10_000;
        assert!(coin::value(&ssr_out) == PER_RESPONSE - fee);

        // Return SSR to sender (or burn in test)
        let mut ssr_treasury = ts::take_shared<SsrTreasury>(&sc);
        survey_sui_reward::burn(&mut ssr_treasury, ssr_out);
        ts::return_shared(ssr_treasury);
        ts::return_shared(sssr_treasury);
        ts::return_shared(pool);
    };

    // ── Epilogue: creator closes vault ────────────────────────────────────────
    sc.next_tx(CREATOR);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::close(&mut vault, sc.ctx());
        assert!(survey_vault::status(&vault)        == 1); // STATUS_CLOSED
        assert!(survey_vault::balance_value(&vault) == 0);
        ts::return_shared(vault);
    };

    // Admin withdraws SUI from pool
    sc.next_tx(ADMIN);
    {
        let mut pool    = ts::take_shared<Pool>(&sc);
        let pool_sui    = amm_pool::sui_reserve(&pool);
        assert!(pool_sui > 0);
        let withdrawn = amm_pool::admin_withdraw_sui(&mut pool, pool_sui, sc.ctx());
        assert!(coin::value(&withdrawn) == pool_sui);
        coin::burn_for_testing(withdrawn);
        ts::return_shared(pool);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
