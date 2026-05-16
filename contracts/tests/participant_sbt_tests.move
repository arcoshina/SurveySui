#[test_only]
module surveysui::participant_sbt_tests;

use sui::clock;
use sui::test_scenario as ts;
use surveysui::participant_sbt::{Self, SbtRegistry, ParticipantSBT};

const ADMIN: address = @0xA11CE;
const BOB: address   = @0xCAFE;

const TTL_180D: u64 = 180 * 24 * 60 * 60 * 1000; // 180 days in ms
const T0: u64       = 1_000_000_000;              // arbitrary epoch start (ms)

// ── helpers ───────────────────────────────────────────────────────────────────

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    participant_sbt::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    sc
}

// ── required TDD tests ────────────────────────────────────────────────────────

#[test]
fun test_issue_first_time_succeeds() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        assert!(participant_sbt::has_active_sbt(&registry, b"alice_sub"));
        assert!(participant_sbt::active_serial(&registry, b"alice_sub") == 0);
        ts::return_shared(registry);
    };

    sc.next_tx(ADMIN);
    {
        let sbt = ts::take_shared<ParticipantSBT>(&sc);
        assert!(participant_sbt::is_valid(&sbt, &clk));
        assert!(participant_sbt::status(&sbt) == 0); // STATUS_ACTIVE
        assert!(participant_sbt::sub_hash(&sbt) == b"alice_sub");
        assert!(participant_sbt::serial(&sbt) == 0);
        assert!(participant_sbt::issued_at_ms(&sbt) == T0);
        assert!(participant_sbt::expires_at_ms(&sbt) == T0 + TTL_180D);
        ts::return_shared(sbt);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::participant_sbt::EAlreadyActive)]
fun test_issue_aborts_when_sub_already_has_active() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    let mut registry = ts::take_shared<SbtRegistry>(&sc);
    participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
    // Second issue for same sub_hash must abort with EAlreadyActive
    participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
    ts::return_shared(registry);

    clock::destroy_for_testing(clk);
    sc.end();
}

// ParticipantSBT has `key` but NOT `store`.
// `transfer::public_transfer(sbt, addr)` does NOT compile because public_transfer
// requires `key + store`. The type system enforces this at compile time.
// This test verifies the soulbound invariant at the API level: the SBT is a shared
// object, not held in any individual wallet's inventory.
#[test]
fun test_sbt_cannot_be_transferred() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // SBT is a shared object — ts::take_from_sender for ALICE would find nothing.
    // We can only access it via take_shared (shared object inventory).
    sc.next_tx(ADMIN);
    {
        let sbt = ts::take_shared<ParticipantSBT>(&sc);
        assert!(participant_sbt::sub_hash(&sbt) == b"alice_sub");
        ts::return_shared(sbt);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::participant_sbt::ENotAdmin)]
fun test_non_admin_cannot_issue() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());
    sc.next_tx(BOB);

    let mut registry = ts::take_shared<SbtRegistry>(&sc);
    participant_sbt::issue(&mut registry, b"bob_sub", TTL_180D, &clk, sc.ctx()); // must abort
    ts::return_shared(registry);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::participant_sbt::ENotAdmin)]
fun test_non_admin_cannot_revoke() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    sc.next_tx(BOB);
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        let mut sbt    = ts::take_shared<ParticipantSBT>(&sc);
        participant_sbt::revoke(&mut registry, &mut sbt, sc.ctx()); // must abort
        ts::return_shared(sbt);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::participant_sbt::ENotAdmin)]
fun test_non_admin_cannot_reissue() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    sc.next_tx(BOB);
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        let mut sbt    = ts::take_shared<ParticipantSBT>(&sc);
        participant_sbt::reissue(&mut registry, &mut sbt, TTL_180D, &clk, sc.ctx()); // must abort
        ts::return_shared(sbt);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_revoke_marks_status_and_clears_registry() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    sc.next_tx(ADMIN);
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        let mut sbt    = ts::take_shared<ParticipantSBT>(&sc);
        participant_sbt::revoke(&mut registry, &mut sbt, sc.ctx());
        assert!(participant_sbt::status(&sbt) == 1); // STATUS_REVOKED
        assert!(!participant_sbt::is_valid(&sbt, &clk));
        assert!(!participant_sbt::has_active_sbt(&registry, b"alice_sub")); // cleared
        ts::return_shared(sbt);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_after_revoke_can_issue_new_to_same_sub() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    // Issue (serial=0)
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // Revoke
    sc.next_tx(ADMIN);
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        let mut sbt    = ts::take_shared<ParticipantSBT>(&sc);
        participant_sbt::revoke(&mut registry, &mut sbt, sc.ctx());
        ts::return_shared(sbt);
        ts::return_shared(registry);
    };

    // Issue again for same sub_hash (serial=1) — must not abort
    sc.next_tx(ADMIN);
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        // Registry now points to the new serial
        assert!(participant_sbt::has_active_sbt(&registry, b"alice_sub"));
        assert!(participant_sbt::active_serial(&registry, b"alice_sub") == 1);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_reissue_marks_old_superseded_and_registry_points_to_new() {
    let mut sc = setup();
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // Issue SBT serial=0
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };

    // Reissue: marks old SUPERSEDED, creates serial=1
    sc.next_tx(ADMIN);
    {
        let mut registry  = ts::take_shared<SbtRegistry>(&sc);
        let mut old_sbt = ts::take_shared<ParticipantSBT>(&sc);
        participant_sbt::reissue(&mut registry, &mut old_sbt, TTL_180D, &clk, sc.ctx());
        assert!(participant_sbt::status(&old_sbt) == 2); // STATUS_SUPERSEDED
        assert!(!participant_sbt::is_valid(&old_sbt, &clk));
        // Registry points to new serial
        assert!(participant_sbt::has_active_sbt(&registry, b"alice_sub"));
        assert!(participant_sbt::active_serial(&registry, b"alice_sub") == 1);
        ts::return_shared(old_sbt);
        ts::return_shared(registry);
    };

    // Verify new SBT is active
    sc.next_tx(ADMIN);
    {
        // Two shared SBTs exist now: serial=0 (SUPERSEDED) and serial=1 (ACTIVE).
        // Take both; the one with serial=1 must be valid.
        let sbt_x = ts::take_shared<ParticipantSBT>(&sc);
        let sbt_y = ts::take_shared<ParticipantSBT>(&sc);
        assert!(participant_sbt::serial(&sbt_x) != participant_sbt::serial(&sbt_y));
        // Exactly one is valid
        let valid_count =
            (if (participant_sbt::is_valid(&sbt_x, &clk)) { 1u8 } else { 0u8 }) +
            (if (participant_sbt::is_valid(&sbt_y, &clk)) { 1u8 } else { 0u8 });
        assert!(valid_count == 1);
        ts::return_shared(sbt_x);
        ts::return_shared(sbt_y);
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
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", 1000, &clk, sc.ctx()); // ttl = 1 s
        ts::return_shared(registry);
    };

    sc.next_tx(ADMIN);
    {
        let sbt = ts::take_shared<ParticipantSBT>(&sc);
        assert!(participant_sbt::is_valid(&sbt, &clk)); // valid at T0

        clock::set_for_testing(&mut clk, T0 + 1001); // advance past expiry
        assert!(!participant_sbt::is_valid(&sbt, &clk));

        ts::return_shared(sbt);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_is_valid_returns_false_when_revoked_or_superseded() {
    let mut sc = setup();
    let clk = clock::create_for_testing(sc.ctx());

    // --- REVOKED case ---
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };
    sc.next_tx(ADMIN);
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        let mut sbt    = ts::take_shared<ParticipantSBT>(&sc);
        participant_sbt::revoke(&mut registry, &mut sbt, sc.ctx());
        assert!(!participant_sbt::is_valid(&sbt, &clk)); // REVOKED → false
        ts::return_shared(sbt);
        ts::return_shared(registry);
    };

    // --- SUPERSEDED case ---
    sc.next_tx(ADMIN);
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut registry, b"bob_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(registry);
    };
    sc.next_tx(ADMIN);
    {
        let mut registry = ts::take_shared<SbtRegistry>(&sc);
        // There are now 2 ParticipantSBTs: alice (revoked, serial=0) and bob (active, serial=1).
        // We need bob's. Take both and pick the active one.
        let mut sbt_first  = ts::take_shared<ParticipantSBT>(&sc);
        let mut sbt_second = ts::take_shared<ParticipantSBT>(&sc);
        // Whichever has status ACTIVE is bob's; revoke alice's is already done.
        // Use serial to distinguish: serial=1 is bob.
        if (participant_sbt::serial(&sbt_first) == 1) {
            participant_sbt::reissue(&mut registry, &mut sbt_first, TTL_180D, &clk, sc.ctx());
            assert!(!participant_sbt::is_valid(&sbt_first, &clk)); // SUPERSEDED → false
        } else {
            participant_sbt::reissue(&mut registry, &mut sbt_second, TTL_180D, &clk, sc.ctx());
            assert!(!participant_sbt::is_valid(&sbt_second, &clk)); // SUPERSEDED → false
        };
        ts::return_shared(sbt_first);
        ts::return_shared(sbt_second);
        ts::return_shared(registry);
    };

    // Verify registry points to the new bob SBT (serial=2)
    sc.next_tx(ADMIN);
    {
        let registry = ts::take_shared<SbtRegistry>(&sc);
        assert!(participant_sbt::has_active_sbt(&registry, b"bob_sub"));
        assert!(participant_sbt::active_serial(&registry, b"bob_sub") == 2);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
