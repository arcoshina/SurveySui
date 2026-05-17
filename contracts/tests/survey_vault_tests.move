#[test_only]
module surveysui::survey_vault_tests;

use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use surveysui::stacked_survey_reward::{Self, SssrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_pass::{Self, PassRegistry, SurveyPass};
use surveysui::survey_vault::{Self, SurveyVault};

const ADMIN: address      = @0xA11CE;
const CREATOR: address    = @0xC0FFEE;
const RESPONDENT: address = @0xA71CE;
const BOB: address        = @0xB0B;

const TTL_180D: u64      = 180 * 24 * 60 * 60 * 1000;
const T0: u64            = 1_000_000_000;
const PER_RESPONSE: u64  = 100;
const MAX_RESPONSES: u64 = 99;   // 99 × 100 = 9 900 ≤ 9 970
const VAULT_FUND: u64    = 10_000;

// fee = 10_000 × 30 / 10_000 = 30
const EXPECTED_FEE: u64        = 30;
const VAULT_BALANCE_AFTER: u64 = VAULT_FUND - EXPECTED_FEE; // 9 970

// ── helpers ───────────────────────────────────────────────────────────────────

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    stacked_survey_reward::test_init(sc.ctx());
    survey_pass::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    {
        let mut treasury = ts::take_shared<SssrTreasury>(&sc);
        let coin = stacked_survey_reward::mint(&mut treasury, VAULT_FUND, sc.ctx());
        transfer::public_transfer(coin, CREATOR);
        ts::return_shared(treasury);
    };
    sc.next_tx(ADMIN);
    sc
}

// ── tests ─────────────────────────────────────────────────────────────────────

/// ★ 核心：vault::create / fund 時收手續費送 admin_treasury
#[test]
fun test_create_deducts_fee_to_treasury() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        assert!(coin::value(&coin) == VAULT_FUND);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        assert!(survey_vault::balance_value(&vault) == VAULT_BALANCE_AFTER);
        survey_vault::share_vault(vault);
    };

    // ADMIN (admin_treasury) received the fee
    sc.next_tx(ADMIN);
    {
        let fee_coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        assert!(coin::value(&fee_coin) == EXPECTED_FEE);
        ts::return_to_sender(&sc, fee_coin);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_create_vault_params() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());
    let deadline = T0 + TTL_180D;

    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, deadline, ADMIN, sc.ctx(),
        );
        assert!(survey_vault::per_response(&vault)   == PER_RESPONSE);
        assert!(survey_vault::max_responses(&vault)  == MAX_RESPONSES);
        assert!(survey_vault::deadline_ms(&vault)    == deadline);
        assert!(survey_vault::balance_value(&vault)  == VAULT_BALANCE_AFTER);
        assert!(survey_vault::claimed_count(&vault)  == 0);
        assert!(survey_vault::status(&vault)         == 0); // STATUS_OPEN
        assert!(survey_vault::creator(&vault)        == CREATOR);
        assert!(survey_vault::admin_treasury(&vault) == ADMIN);
        survey_vault::share_vault(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_claim_with_valid_pass() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ADMIN: issue pass
    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // CREATOR: create vault
    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        survey_vault::share_vault(vault);
    };

    // RESPONDENT: claim
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"alice_sub", b"enc_answers", &clk, sc.ctx());
        assert!(survey_vault::claimed_count(&vault) == 1);
        assert!(survey_vault::balance_value(&vault) == VAULT_BALANCE_AFTER - PER_RESPONSE);
        assert!(survey_vault::has_claimed(&vault, b"alice_sub"));
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    // RESPONDENT received sSSR reward
    sc.next_tx(RESPONDENT);
    {
        let reward = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        assert!(coin::value(&reward) == PER_RESPONSE);
        ts::return_to_sender(&sc, reward);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::EInvalidPass)]
fun test_claim_invalid_pass_fails() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ADMIN: issue pass
    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // CREATOR: create vault
    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        survey_vault::share_vault(vault);
    };

    // ADMIN: revoke the pass
    sc.next_tx(ADMIN);
    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        let mut pass     = ts::take_shared<SurveyPass>(&sc);
        survey_pass::revoke(&mut registry, &mut pass, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(registry);
    };

    // Claim with revoked pass → EInvalidPass
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"alice_sub", b"enc", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::EAlreadyClaimed)]
fun test_claim_duplicate_sub_fails() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        survey_vault::share_vault(vault);
    };

    // First claim: success
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"alice_sub", b"enc", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    // Second claim with same sub_hash → EAlreadyClaimed
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"alice_sub", b"enc", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

/// ENoQuota is checked before EAlreadyClaimed, so any valid pass + new sub_hash suffices.
#[test, expected_failure(abort_code = surveysui::survey_vault::ENoQuota)]
fun test_claim_quota_exceeded_fails() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // Create vault with max_responses = 1
    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let vault = survey_vault::create(coin, PER_RESPONSE, 1, T0 + TTL_180D, ADMIN, sc.ctx());
        survey_vault::share_vault(vault);
    };

    // Fill the only slot
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"alice_sub", b"enc", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    // Next claim hits quota limit → ENoQuota (checked before EAlreadyClaimed)
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"bob_sub", b"enc", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_close_refunds_remaining_to_creator() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        survey_vault::share_vault(vault);
    };

    sc.next_tx(CREATOR);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::close(&mut vault, sc.ctx());
        assert!(survey_vault::status(&vault)        == 1); // STATUS_CLOSED
        assert!(survey_vault::balance_value(&vault) == 0);
        ts::return_shared(vault);
    };

    sc.next_tx(CREATOR);
    {
        let refund = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        assert!(coin::value(&refund) == VAULT_BALANCE_AFTER);
        ts::return_to_sender(&sc, refund);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::ENotCreator)]
fun test_close_aborts_when_caller_not_creator() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<STACKED_SURVEY_REWARD>>(&sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        survey_vault::share_vault(vault);
    };

    sc.next_tx(BOB);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::close(&mut vault, sc.ctx()); // ENotCreator
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
