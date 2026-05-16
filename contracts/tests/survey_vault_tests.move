#[test_only]
module surveysui::survey_vault_tests;

use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use surveysui::participant_sbt::{Self, SbtRegistry, ParticipantSBT};
use surveysui::reward_coin::{Self, Treasury, REWARD_COIN};
use surveysui::survey_vault::{Self, SurveyVault};

const ADMIN: address   = @0xA11CE;
const CREATOR: address = @0xC0FFEE;
const ALICE: address   = @0xA71CE;
const BOB: address     = @0xB0B;

const TTL_180D: u64 = 180 * 24 * 60 * 60 * 1000;
const T0: u64       = 1_000_000_000; // ms

const PER_RESPONSE: u64  = 100;
const MAX_RESPONSES: u64 = 5;
const VAULT_FUND: u64    = 1_000;

// ── helpers ───────────────────────────────────────────────────────────────────

/// Init coin + SBT modules, mint VAULT_FUND to CREATOR, end at ADMIN tx.
fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    reward_coin::test_init(sc.ctx());
    participant_sbt::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    {
        let mut treasury = ts::take_shared<Treasury>(&sc);
        reward_coin::mint(&mut treasury, VAULT_FUND, CREATOR, sc.ctx());
        ts::return_shared(treasury);
    };
    sc.next_tx(ADMIN); // end here so issue_sbt works immediately
    sc
}

/// Switch to CREATOR tx, create+share vault, return at ADMIN tx.
fun create_and_share_vault(sc: &mut ts::Scenario, deadline_ms: u64) {
    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<REWARD_COIN>>(sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, deadline_ms, ADMIN, sc.ctx(),
        );
        survey_vault::share_vault(vault);
    };
    sc.next_tx(ADMIN);
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[test]
fun test_create_vault_with_correct_params() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());
    let deadline = T0 + TTL_180D;

    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, deadline, ADMIN, sc.ctx(),
        );
        assert!(survey_vault::per_response(&vault)  == PER_RESPONSE);
        assert!(survey_vault::max_responses(&vault) == MAX_RESPONSES);
        assert!(survey_vault::deadline_ms(&vault)   == deadline);
        assert!(survey_vault::balance_value(&vault) == VAULT_FUND);
        assert!(survey_vault::claimed_count(&vault) == 0);
        assert!(survey_vault::status(&vault)        == 0); // STATUS_OPEN
        assert!(survey_vault::admin(&vault)         == ADMIN);
        assert!(survey_vault::creator(&vault)       == CREATOR);
        survey_vault::share_vault(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_create_returns_vault_unshared() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    // Within a CREATOR tx block, vault is a local value — not yet shared.
    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        assert!(survey_vault::balance_value(&vault) == VAULT_FUND);
        // share at end so tx can close cleanly
        survey_vault::share_vault(vault);
    };

    // After next_tx the vault is accessible as a shared object
    sc.next_tx(ADMIN);
    {
        let vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        assert!(survey_vault::balance_value(&vault) == VAULT_FUND);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_fund_increases_balance() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    create_and_share_vault(&mut sc, T0 + TTL_180D);
    // now at ADMIN tx

    // Mint 500 more coins to CREATOR for top-up
    {
        let mut treasury = ts::take_shared<Treasury>(&sc);
        reward_coin::mint(&mut treasury, 500, CREATOR, sc.ctx());
        ts::return_shared(treasury);
    };
    sc.next_tx(CREATOR);
    {
        let mut vault  = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let top_up     = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        survey_vault::fund(&mut vault, top_up);
        assert!(survey_vault::balance_value(&vault) == VAULT_FUND + 500);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_claim_happy_path() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ADMIN tx: issue SBT for alice
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };
    // create_and_share_vault flushes ADMIN tx (SBT enters pool) then creates vault,
    // then flushes CREATOR tx (vault enters pool), returns at ADMIN tx.
    create_and_share_vault(&mut sc, T0 + TTL_180D);

    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt       = ts::take_shared<ParticipantSBT>(&sc);
        survey_vault::claim(&mut vault, &sbt, ALICE, &clk, sc.ctx());
        assert!(survey_vault::claimed_count(&vault) == 1);
        assert!(survey_vault::balance_value(&vault) == VAULT_FUND - PER_RESPONSE);
        assert!(survey_vault::has_claimed(&vault, b"alice_sub"));
        ts::return_shared(sbt);
        ts::return_shared(vault);
    };

    sc.next_tx(ALICE);
    {
        let reward = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        assert!(coin::value(&reward) == PER_RESPONSE);
        ts::return_to_sender(&sc, reward);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::ENoQuota)]
fun test_claim_aborts_when_no_quota() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ADMIN tx: issue 2 SBTs (s1=serial0, s2=serial1)
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"s1", TTL_180D, &clk, sc.ctx());
        participant_sbt::issue(&mut registry, b"s2", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // CREATOR: create vault with max_responses=1 so quota is exhausted after one claim
    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        let vault = survey_vault::create(coin, PER_RESPONSE, 1, T0 + TTL_180D, ADMIN, sc.ctx());
        survey_vault::share_vault(vault);
    };
    sc.next_tx(ADMIN);

    // Claim s1 (serial=0, FIFO first) → succeeds, fills the only slot
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt       = ts::take_shared<ParticipantSBT>(&sc);
        survey_vault::claim(&mut vault, &sbt, ALICE, &clk, sc.ctx());
        ts::return_shared(sbt);
        ts::return_shared(vault);
    };
    sc.next_tx(ADMIN);

    // Claim s2 (serial=1) → ENoQuota (s2 sub_hash not claimed, so not EAlreadyClaimed)
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt_a     = ts::take_shared<ParticipantSBT>(&sc); // s1 (serial=0)
        let sbt_b     = ts::take_shared<ParticipantSBT>(&sc); // s2 (serial=1)
        if (participant_sbt::serial(&sbt_a) == 1) {
            survey_vault::claim(&mut vault, &sbt_a, ALICE, &clk, sc.ctx()); // ENoQuota
        } else {
            survey_vault::claim(&mut vault, &sbt_b, ALICE, &clk, sc.ctx()); // ENoQuota
        };
        ts::return_shared(sbt_a);
        ts::return_shared(sbt_b);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::EExpired)]
fun test_claim_aborts_when_expired() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ADMIN tx: issue SBT
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // CREATOR: create vault with deadline = T0 + 1 s
    sc.next_tx(CREATOR);
    {
        let coin = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        let vault = survey_vault::create(
            coin, PER_RESPONSE, MAX_RESPONSES, T0 + 1_000, ADMIN, sc.ctx(),
        );
        survey_vault::share_vault(vault);
    };
    sc.next_tx(ADMIN);

    clock::set_for_testing(&mut clk, T0 + 2_000); // past vault deadline
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt       = ts::take_shared<ParticipantSBT>(&sc);
        survey_vault::claim(&mut vault, &sbt, ALICE, &clk, sc.ctx()); // EExpired
        ts::return_shared(sbt);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::EAlreadyClaimed)]
fun test_claim_aborts_when_already_claimed() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ADMIN tx: issue SBT
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };
    create_and_share_vault(&mut sc, T0 + TTL_180D);

    // First claim: success
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt       = ts::take_shared<ParticipantSBT>(&sc);
        survey_vault::claim(&mut vault, &sbt, ALICE, &clk, sc.ctx());
        ts::return_shared(sbt);
        ts::return_shared(vault);
    };
    sc.next_tx(ADMIN);

    // Second claim: EAlreadyClaimed
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt       = ts::take_shared<ParticipantSBT>(&sc);
        survey_vault::claim(&mut vault, &sbt, ALICE, &clk, sc.ctx()); // abort
        ts::return_shared(sbt);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::EInvalidSBT)]
fun test_claim_aborts_when_sbt_revoked_or_expired() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ADMIN tx: issue SBT
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };
    create_and_share_vault(&mut sc, T0 + TTL_180D);

    // Revoke Alice's SBT in ADMIN tx
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        let mut sbt      = ts::take_shared<ParticipantSBT>(&sc);
        participant_sbt::revoke(&mut registry, &mut sbt, sc.ctx());
        ts::return_shared(sbt);
        ts::return_shared(registry);
    };
    sc.next_tx(ADMIN);

    // Claim with revoked SBT → EInvalidSBT
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt       = ts::take_shared<ParticipantSBT>(&sc);
        survey_vault::claim(&mut vault, &sbt, ALICE, &clk, sc.ctx()); // abort
        ts::return_shared(sbt);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::EAlreadyClaimed)]
fun test_claim_aborts_when_sub_already_claimed_via_old_sbt() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ADMIN tx: issue SBT (serial=0)
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };
    create_and_share_vault(&mut sc, T0 + TTL_180D);

    // Claim with serial=0 SBT → success (sub_hash "alice_sub" recorded)
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt       = ts::take_shared<ParticipantSBT>(&sc);
        survey_vault::claim(&mut vault, &sbt, ALICE, &clk, sc.ctx());
        ts::return_shared(sbt);
        ts::return_shared(vault);
    };
    sc.next_tx(ADMIN);

    // Reissue: marks serial=0 SUPERSEDED, creates serial=1 with same sub_hash
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        let mut old_sbt  = ts::take_shared<ParticipantSBT>(&sc);
        participant_sbt::reissue(&mut registry, &mut old_sbt, TTL_180D, &clk, sc.ctx());
        ts::return_shared(old_sbt);
        ts::return_shared(registry);
    };
    sc.next_tx(ADMIN);

    // Two SBTs: serial=0 (SUPERSEDED), serial=1 (ACTIVE, same sub_hash).
    // Claiming with the new active SBT must abort with EAlreadyClaimed.
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt_a     = ts::take_shared<ParticipantSBT>(&sc);
        let sbt_b     = ts::take_shared<ParticipantSBT>(&sc);
        if (participant_sbt::serial(&sbt_a) == 1) {
            survey_vault::claim(&mut vault, &sbt_a, ALICE, &clk, sc.ctx()); // EAlreadyClaimed
        } else {
            survey_vault::claim(&mut vault, &sbt_b, ALICE, &clk, sc.ctx()); // EAlreadyClaimed
        };
        ts::return_shared(sbt_a);
        ts::return_shared(sbt_b);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::ENotAdmin)]
fun test_claim_aborts_when_caller_not_admin() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ADMIN tx: issue SBT
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };
    create_and_share_vault(&mut sc, T0 + TTL_180D);

    // BOB (not admin) tries to claim → ENotAdmin
    sc.next_tx(BOB);
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt       = ts::take_shared<ParticipantSBT>(&sc);
        survey_vault::claim(&mut vault, &sbt, ALICE, &clk, sc.ctx()); // abort
        ts::return_shared(sbt);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_close_returns_balance_to_creator() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    create_and_share_vault(&mut sc, T0 + TTL_180D);

    sc.next_tx(CREATOR);
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        survey_vault::close(&mut vault, sc.ctx());
        assert!(survey_vault::status(&vault)        == 1); // STATUS_CLOSED
        assert!(survey_vault::balance_value(&vault) == 0);
        ts::return_shared(vault);
    };

    sc.next_tx(CREATOR);
    {
        let refund = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        assert!(coin::value(&refund) == VAULT_FUND);
        ts::return_to_sender(&sc, refund);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_vault::ENotCreator)]
fun test_close_aborts_when_caller_not_creator() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    create_and_share_vault(&mut sc, T0 + TTL_180D);

    // BOB (not creator) tries to close → ENotCreator
    sc.next_tx(BOB);
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        survey_vault::close(&mut vault, sc.ctx()); // abort
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
