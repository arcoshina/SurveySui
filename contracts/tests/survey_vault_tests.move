#[test_only]
module surveysui::survey_vault_tests;

use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use surveysui::stacked_survey_reward::{Self, SsrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_pass::{Self, NullifierRegistry, IssuerConfig, SurveyPass};
use surveysui::survey_vault::{Self, SurveyVault};

const ADMIN: address      = @0xA11CE;
const CREATOR: address    = @0xC0FFEE;
const RESPONDENT: address = @0xa11ce00000000000000000000000000000000000000000000000000000000000;
const BOB: address        = @0xB0B;

const TTL_180D: u64      = 180 * 24 * 60 * 60 * 1000;
const T0: u64            = 1_000_000_000;
const PER_RESPONSE: u64  = 100;
const MAX_RESPONSES: u64 = 99;   // 99 × 100 = 9 900 ≤ 9 970
const VAULT_FUND: u64    = 10_000;

const VAULT_BALANCE_AFTER: u64 = VAULT_FUND;
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

#[test]
fun test_create_does_not_deduct_fee() {
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

    sc.next_tx(ADMIN);
    {
        assert!(!ts::has_most_recent_for_sender<Coin<STACKED_SURVEY_REWARD>>(&sc));
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
        assert!(survey_vault::status(&vault)         == 0);
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

    // RESPONDENT: mint pass
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
        survey_vault::claim(&mut vault, &pass, b"enc_answers", &clk, sc.ctx());
        assert!(survey_vault::claimed_count(&vault) == 1);
        assert!(survey_vault::balance_value(&vault) == VAULT_BALANCE_AFTER - PER_RESPONSE);
        assert!(survey_vault::has_claimed(&vault, RESPONDENT));
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    // RESPONDENT received reward
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

    // RESPONDENT: mint pass
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
        let config = ts::take_shared<IssuerConfig>(&sc);
        let mut pass = ts::take_shared<SurveyPass>(&sc);
        survey_pass::revoke_pass(&mut pass, &config, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(config);
    };

    // Claim with revoked pass
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"enc", &clk, sc.ctx());
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

    // RESPONDENT: mint pass
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
        survey_vault::claim(&mut vault, &pass, b"enc", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    // Second claim: should abort because the address has already claimed
    sc.next_tx(RESPONDENT);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"enc", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::ENoQuota)]
fun test_claim_quota_exceeded_fails() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // RESPONDENT: mint pass
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
        survey_vault::claim(&mut vault, &pass, b"enc", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    // Next claim hits quota limit
    sc.next_tx(BOB);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let pass      = ts::take_shared<SurveyPass>(&sc);
        survey_vault::claim(&mut vault, &pass, b"enc", &clk, sc.ctx());
        ts::return_shared(pass);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_close_refunds_remaining_to_creator() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

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
        survey_vault::close(&mut vault, &clk, sc.ctx());
        assert!(survey_vault::status(&vault)        == 1);
        assert!(survey_vault::balance_value(&vault) == 0);
        assert!(survey_vault::closed_at_ms(&vault)  == T0);
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
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

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
        survey_vault::close(&mut vault, &clk, sc.ctx());
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::EVaultClosed)]
fun test_close_aborts_when_already_closed() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

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
        survey_vault::close(&mut vault, &clk, sc.ctx());
        ts::return_shared(vault);
    };

    sc.next_tx(CREATOR);
    {
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::close(&mut vault, &clk, sc.ctx());
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
