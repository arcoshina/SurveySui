#[test_only]
module surveysui::integration_tests;

use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use surveysui::amm_pool::{Self, Pool};
use surveysui::stacked_survey_reward::{Self, SssrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_pass::{Self, NullifierRegistry, IssuerConfig, SurveyPass};
use surveysui::survey_registry::{Self, SurveyRegistry};
use surveysui::survey_sui_reward::{Self, SsrTreasury, SURVEY_SUI_REWARD};
use surveysui::survey_vault::{Self, SurveyVault};

const ADMIN: address      = @0xA11CE;
const CREATOR: address    = @0xC0FFEE;
const RESPONDENT: address = @0xa11ce00000000000000000000000000000000000000000000000000000000000;

const TTL_180D: u64      = 180 * 24 * 60 * 60 * 1000;
const T0: u64            = 1_000_000_000; // ms
const SUI_INVEST: u64    = 100_000;       // MIST
const PER_RESPONSE: u64  = 1_000;
const MAX_RESPONSES: u64 = 50;
const EXPIRES_AT: u64 = 99999999999999;

// Test vectors
fun bff_pubkey(): vector<u8> {
    vector[138, 136, 227, 221, 116, 9, 241, 149, 253, 82, 219, 45, 60, 186, 93, 114, 202, 103, 9, 191, 29, 148, 18, 27, 243, 116, 136, 1, 180, 15, 111, 92]
}

fun alice_nullifier(): vector<u8> {
    vector[2, 163, 245, 73, 111, 74, 136, 247, 122, 23, 182, 137, 34, 98, 157, 105, 176, 61, 226, 8, 176, 54, 246, 25, 252, 11, 246, 36, 69, 242, 212, 102]
}

fun alice_valid_sig(): vector<u8> {
    vector[217, 202, 151, 37, 251, 106, 24, 105, 129, 152, 219, 202, 66, 91, 132, 32, 23, 93, 16, 126, 194, 142, 232, 29, 19, 53, 115, 116, 25, 230, 43, 159, 217, 249, 13, 132, 53, 136, 248, 227, 73, 255, 171, 228, 255, 118, 116, 175, 244, 107, 131, 219, 91, 195, 171, 127, 225, 94, 27, 212, 36, 48, 155, 2]
}

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

    // ADMIN sets BFF public key
    sc.next_tx(ADMIN);
    {
        let mut config = ts::take_shared<IssuerConfig>(&sc);
        survey_pass::set_issuer_pubkey(&mut config, bff_pubkey(), sc.ctx());
        ts::return_shared(config);
    };

    // RESPONDENT mints SurveyPass
    sc.next_tx(RESPONDENT);
    {
        let mut registry = ts::take_shared<NullifierRegistry>(&sc);
        let config = ts::take_shared<IssuerConfig>(&sc);
        survey_pass::mint_pass(
            &mut registry,
            &config,
            RESPONDENT,
            2,
            alice_nullifier(),
            vector[],
            EXPIRES_AT,
            alice_valid_sig(),
            &clk,
            sc.ctx()
        );
        ts::return_shared(config);
        ts::return_shared(registry);
    };

    // ── B. Creator flow ───────────────────────────────────────────────────────
    sc.next_tx(CREATOR);
    {
        let mut pool          = ts::take_shared<Pool>(&sc);
        let mut ssr_treasury  = ts::take_shared<SsrTreasury>(&sc);
        let mut sssr_treasury = ts::take_shared<SssrTreasury>(&sc);

        let sui_in  = coin::mint_for_testing<sui::sui::SUI>(SUI_INVEST, sc.ctx());
        let sssr    = amm_pool::invest_and_mint(
            &mut pool, &mut ssr_treasury, &mut sssr_treasury, sui_in, sc.ctx(),
        );
        let sssr_received = coin::value(&sssr);
        assert!(sssr_received == SUI_INVEST * 1000);

        assert!(amm_pool::sui_reserve(&pool) == SUI_INVEST);
        assert!(amm_pool::ssr_reserve(&pool) == sssr_received);

        let vault_balance_expected = sssr_received;
        let vault = survey_vault::create(
            sssr, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        assert!(survey_vault::balance_value(&vault) == vault_balance_expected);

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
            &vault,
            b"survey_hash",
            b"encrypted_content",
            b"schema_hash",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        assert!(survey_registry::total_count(&survey_reg) == 1);
        ts::return_shared(survey_reg);

        survey_vault::share_vault(vault);

        ts::return_shared(sssr_treasury);
        ts::return_shared(ssr_treasury);
        ts::return_shared(pool);
    };

    // ── C. Respondent flow ───────────────────────────────────────────────────
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);

        survey_vault::claim(&mut vault, &pass, b"encrypted_response", &clk, sc.ctx());
        assert!(survey_vault::claimed_count(&vault) == 1);
        assert!(survey_vault::has_claimed(&vault, RESPONDENT));

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
        assert!(survey_vault::status(&vault)        == 1);
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
