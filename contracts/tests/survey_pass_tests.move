#[test_only]
module surveysui::survey_pass_tests;

use sui::clock;
use sui::test_scenario as ts;
use surveysui::survey_pass::{Self, PassRegistry, SurveyPass};

const ADMIN: address = @0xA11CE;
const BOB: address   = @0xCAFE;

const TTL_180D: u64 = 180 * 24 * 60 * 60 * 1000;
const T0: u64       = 1_000_000_000;

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    survey_pass::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    sc
}

#[test]
fun test_issue_first_time_succeeds() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        assert!(survey_pass::has_active_pass(&registry, b"alice_sub"));
        assert!(survey_pass::active_serial(&registry, b"alice_sub") == 0);
        ts::return_shared(registry);
    };

    sc.next_tx(ADMIN);
    {
        let pass = ts::take_shared<SurveyPass>(&sc);
        assert!(survey_pass::is_valid(&pass, &clk));
        assert!(survey_pass::status(&pass) == 0); // STATUS_ACTIVE
        assert!(survey_pass::sub_hash(&pass) == b"alice_sub");
        assert!(survey_pass::serial(&pass) == 0);
        assert!(survey_pass::issued_at_ms(&pass) == T0);
        assert!(survey_pass::expires_at_ms(&pass) == T0 + TTL_180D);
        ts::return_shared(pass);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_pass::EAlreadyActive)]
fun test_issue_aborts_when_sub_already_has_active() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    let mut registry = ts::take_shared<PassRegistry>(&sc);
    survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
    survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx()); // must abort
    ts::return_shared(registry);

    clock::destroy_for_testing(clk);
    sc.end();
}

/// SurveyPass has `key` but NOT `store`, so public_transfer is not available.
/// This test verifies the soulbound invariant at the API level:
/// pass is a shared object, not held in any individual wallet.
#[test]
fun test_pass_not_transferable() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // SurveyPass is accessible only via take_shared (it's a shared object)
    sc.next_tx(ADMIN);
    {
        let pass = ts::take_shared<SurveyPass>(&sc);
        assert!(survey_pass::sub_hash(&pass) == b"alice_sub");
        ts::return_shared(pass);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

/// Calling is_valid many times does not consume the pass or change its state.
#[test]
fun test_is_valid_does_not_consume() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    sc.next_tx(ADMIN);
    {
        let pass = ts::take_shared<SurveyPass>(&sc);
        assert!(survey_pass::is_valid(&pass, &clk));
        assert!(survey_pass::is_valid(&pass, &clk));
        assert!(survey_pass::is_valid(&pass, &clk));
        ts::return_shared(pass);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_revoked_pass_invalid() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    sc.next_tx(ADMIN);
    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        let mut pass     = ts::take_shared<SurveyPass>(&sc);
        survey_pass::revoke(&mut registry, &mut pass, sc.ctx());
        assert!(survey_pass::status(&pass) == 1); // STATUS_REVOKED
        assert!(!survey_pass::is_valid(&pass, &clk));
        assert!(!survey_pass::has_active_pass(&registry, b"alice_sub"));
        ts::return_shared(pass);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_pass::ENotAdmin)]
fun test_non_admin_cannot_issue() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());
    sc.next_tx(BOB);

    let mut registry = ts::take_shared<PassRegistry>(&sc);
    survey_pass::issue(&mut registry, b"bob_sub", TTL_180D, &clk, sc.ctx()); // must abort
    ts::return_shared(registry);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_pass::ENotAdmin)]
fun test_non_admin_cannot_revoke() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    sc.next_tx(BOB);
    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        let mut pass     = ts::take_shared<SurveyPass>(&sc);
        survey_pass::revoke(&mut registry, &mut pass, sc.ctx()); // must abort
        ts::return_shared(pass);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_is_valid_returns_false_after_expiration() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", 1000, &clk, sc.ctx()); // ttl = 1 s
        ts::return_shared(registry);
    };

    sc.next_tx(ADMIN);
    {
        let pass = ts::take_shared<SurveyPass>(&sc);
        assert!(survey_pass::is_valid(&pass, &clk)); // valid at T0

        clock::set_for_testing(&mut clk, T0 + 1001); // advance past expiry
        assert!(!survey_pass::is_valid(&pass, &clk));

        ts::return_shared(pass);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_reissue_marks_old_superseded() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    {
        let mut registry = ts::take_shared<PassRegistry>(&sc);
        survey_pass::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    sc.next_tx(ADMIN);
    {
        let mut registry  = ts::take_shared<PassRegistry>(&sc);
        let mut old_pass  = ts::take_shared<SurveyPass>(&sc);
        survey_pass::reissue(&mut registry, &mut old_pass, TTL_180D, &clk, sc.ctx());
        assert!(survey_pass::status(&old_pass) == 2); // STATUS_SUPERSEDED
        assert!(!survey_pass::is_valid(&old_pass, &clk));
        assert!(survey_pass::active_serial(&registry, b"alice_sub") == 1);
        ts::return_shared(old_pass);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
