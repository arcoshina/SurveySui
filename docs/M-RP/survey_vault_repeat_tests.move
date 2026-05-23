// M-RP Repeat-Answer Reward — Contract Test Scenarios
//
// To execute: copy this file to `contracts/tests/` then run `sui move test`.
// Kept in `docs/M-RP/` because the contracts/tests/ directory was deleted
// during V3 housekeeping; V3 does not maintain auto-discoverable tests.

#[test_only]
module surveysui::survey_vault_repeat_tests;

use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use surveysui::stacked_survey_reward::{Self, SsrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_pass::{Self, NullifierRegistry, IssuerConfig, SurveyPass};
use surveysui::survey_vault::{Self, SurveyVault};

const ADMIN: address      = @0xA11CE;
const CREATOR: address    = @0xC0FFEE;
const RESPONDENT: address = @0xa11ce00000000000000000000000000000000000000000000000000000000000;

const TTL_180D: u64      = 180 * 24 * 60 * 60 * 1000;
const T0: u64            = 1_000_000_000;
const PER_RESPONSE: u64  = 100;
const REPEAT_REWARD: u64 = 10;
const REPEAT_MAX: u64    = 3;
const MAX_RESPONSES: u64 = 2;
// Budget = 100*2 + 10*2*3 = 260; fund well above.
const VAULT_FUND: u64    = 10_000;
const EXPIRES_AT: u64    = 99_999_999_999_999;

// Issuer signing fixtures (matches the original deleted survey_vault_tests.move).
fun bff_pubkey(): vector<u8> {
    vector[138, 136, 227, 221, 116, 9, 241, 149, 253, 82, 219, 45, 60, 186, 93, 114, 202, 103, 9, 191, 29, 148, 18, 27, 243, 116, 136, 1, 180, 15, 111, 92]
}
fun alice_nullifier(): vector<u8> {
    vector[2, 163, 245, 73, 111, 74, 136, 247, 122, 23, 182, 137, 34, 98, 157, 105, 176, 61, 226, 8, 176, 54, 246, 25, 252, 11, 246, 36, 69, 242, 212, 102]
}
fun alice_valid_sig(): vector<u8> {
    vector[217, 202, 151, 37, 251, 106, 24, 105, 129, 152, 219, 202, 66, 91, 132, 32, 23, 93, 16, 126, 194, 142, 232, 29, 19, 53, 115, 116, 25, 230, 43, 159, 217, 249, 13, 132, 53, 136, 248, 227, 73, 255, 171, 228, 255, 118, 116, 175, 244, 107, 131, 219, 91, 195, 171, 127, 225, 94, 27, 212, 36, 48, 155, 2]
}

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    stacked_survey_reward::test_init(sc.ctx());
    survey_pass::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    {
        let mut config = ts::take_shared<IssuerConfig>(&sc);
        survey_pass::set_issuer_pubkey(&mut config, bff_pubkey(), sc.ctx());
        ts::return_shared(config);
    };
    sc.next_tx(ADMIN);
    {
        let mut treasury = ts::take_shared<SsrTreasury>(&sc);
        let coin = stacked_survey_reward::mint(&mut treasury, VAULT_FUND, sc.ctx());
        transfer::public_transfer(coin, CREATOR);
        ts::return_shared(treasury);
    };
    sc.next_tx(ADMIN);
    sc
}

fun mint_respondent_pass(sc: &mut ts::Scenario, clk: &clock::Clock) {
    sc.next_tx(RESPONDENT);
    {
        let mut registry = ts::take_shared<NullifierRegistry>(sc);
        let config = ts::take_shared<IssuerConfig>(sc);
        survey_pass::mint_pass(
            &mut registry, &config, RESPONDENT, 2, alice_nullifier(),
            vector[], EXPIRES_AT, alice_valid_sig(), clk, sc.ctx(),
        );
        ts::return_shared(config);
        ts::return_shared(registry);
    };
}

fun create_vault(sc: &mut ts::Scenario, per_response: u64, repeat_reward: u64, repeat_max: u64) {
    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(sc);
        let vault = survey_vault::create(
            coin, per_response, repeat_reward, repeat_max,
            MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        survey_vault::share_vault(vault);
    };
}

// ── 1. EInvalidRewardConfig on per_response = 0 ────────────────────────────
#[test, expected_failure(abort_code = surveysui::survey_vault::EInvalidRewardConfig)]
fun test_create_per_response_zero_fails() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());
    create_vault(&mut sc, 0, REPEAT_REWARD, REPEAT_MAX);
    clock::destroy_for_testing(clk);
    sc.end();
}

// ── 2. EInvalidRewardConfig on repeat_max_times = 0 ────────────────────────
#[test, expected_failure(abort_code = surveysui::survey_vault::EInvalidRewardConfig)]
fun test_create_repeat_max_zero_fails() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());
    create_vault(&mut sc, PER_RESPONSE, REPEAT_REWARD, 0);
    clock::destroy_for_testing(clk);
    sc.end();
}

// ── 3. repeat_reward = 0 → second claim must hit EAlreadyClaimed ──────────
#[test, expected_failure(abort_code = surveysui::survey_vault::EAlreadyClaimed)]
fun test_repeat_disabled_blocks_second_claim() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);
    mint_respondent_pass(&mut sc, &clk);
    create_vault(&mut sc, PER_RESPONSE, 0, 1);

    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"first", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"second", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

// ── 4. repeat_reward > 0 → first pays per_response, repeats pay repeat_reward ──
#[test]
fun test_repeat_within_limit_pays_repeat_reward() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);
    mint_respondent_pass(&mut sc, &clk);
    create_vault(&mut sc, PER_RESPONSE, REPEAT_REWARD, REPEAT_MAX);

    // Initial submission
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"v1", &clk, sc.ctx());
        assert!(survey_vault::claimed_count(&vault) == 1);
        assert!(survey_vault::claim_count_of(&vault, RESPONDENT) == 1);
        assert!(survey_vault::balance_value(&vault) == VAULT_FUND - PER_RESPONSE);
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    // 3 repeats — each pays REPEAT_REWARD, claimed_count must NOT increment
    let mut i = 0u64;
    while (i < REPEAT_MAX) {
        sc.next_tx(RESPONDENT);
        {
            let mut vault = ts::take_shared<SurveyVault>(&sc);
            let pass      = ts::take_shared<SurveyPass>(&sc);
            survey_vault::claim(&mut vault, &pass, b"rep", &clk, sc.ctx());
            assert!(survey_vault::claimed_count(&vault) == 1); // unique respondents still 1
            assert!(survey_vault::claim_count_of(&vault, RESPONDENT) == 2 + i);
            let expected_balance = VAULT_FUND - PER_RESPONSE - REPEAT_REWARD * (i + 1);
            assert!(survey_vault::balance_value(&vault) == expected_balance);
            ts::return_shared(pass);
            ts::return_shared(vault);
        };
        i = i + 1;
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

// ── 5. One more claim past the limit → ERepeatLimitReached ────────────────
#[test, expected_failure(abort_code = surveysui::survey_vault::ERepeatLimitReached)]
fun test_repeat_over_limit_fails() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);
    mint_respondent_pass(&mut sc, &clk);
    create_vault(&mut sc, PER_RESPONSE, REPEAT_REWARD, REPEAT_MAX);

    let mut i = 0u64;
    while (i < REPEAT_MAX + 1) { // initial + REPEAT_MAX repeats = REPEAT_MAX + 1 submissions
        sc.next_tx(RESPONDENT);
        {
            let mut vault = ts::take_shared<SurveyVault>(&sc);
            let pass      = ts::take_shared<SurveyPass>(&sc);
            survey_vault::claim(&mut vault, &pass, b"x", &clk, sc.ctx());
            ts::return_shared(pass);
            ts::return_shared(vault);
        };
        i = i + 1;
    };

    // The next one (5th total, exceeding limit) must abort.
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"x", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

// ── 6. After deadline → EExpired regardless of repeat config ─────────────
#[test, expected_failure(abort_code = surveysui::survey_vault::EExpired)]
fun test_claim_after_deadline_fails() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);
    mint_respondent_pass(&mut sc, &clk);
    create_vault(&mut sc, PER_RESPONSE, REPEAT_REWARD, REPEAT_MAX);

    // Advance clock past deadline
    clock::set_for_testing(&mut clk, T0 + TTL_180D + 1);

    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"late", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
