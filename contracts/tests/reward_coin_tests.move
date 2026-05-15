#[test_only]
module surveysui::reward_coin_tests;

use sui::coin::Coin;
use sui::test_scenario as ts;
use surveysui::reward_coin::{Self, Treasury, REWARD_COIN};

const ADMIN: address = @0xA11CE;
const ALICE: address = @0xB0B;
const BOB: address = @0xCAFE;

// ── helpers ──────────────────────────────────────────────────────────────────

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    reward_coin::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    sc
}

// ── required TDD tests ────────────────────────────────────────────────────────

#[test]
fun test_mint_by_admin_succeeds() {
    let mut sc = setup();

    // Admin mints 100 RWD to ALICE
    {
        let mut treasury = ts::take_shared<Treasury>(&sc);
        reward_coin::mint(&mut treasury, 100, ALICE, sc.ctx());
        assert!(reward_coin::total_supply(&treasury) == 100);
        ts::return_shared(treasury);
    };

    // ALICE receives the coin
    sc.next_tx(ALICE);
    {
        let c = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        assert!(c.value() == 100);
        ts::return_to_sender(&sc, c);
    };

    sc.end();
}

#[test, expected_failure(abort_code = surveysui::reward_coin::ENotAdmin)]
fun test_mint_by_non_admin_aborts() {
    let mut sc = setup();
    sc.next_tx(BOB); // BOB is not admin

    let mut treasury = ts::take_shared<Treasury>(&sc);
    reward_coin::mint(&mut treasury, 100, BOB, sc.ctx()); // must abort
    ts::return_shared(treasury);

    sc.end();
}

#[test, expected_failure(abort_code = surveysui::reward_coin::EExceedsCap)]
fun test_total_supply_capped() {
    let mut sc = setup();

    let mut treasury = ts::take_shared<Treasury>(&sc);
    // Attempt to mint one unit over the cap
    reward_coin::mint(&mut treasury, reward_coin::supply_cap() + 1, ALICE, sc.ctx());
    ts::return_shared(treasury);

    sc.end();
}

#[test]
fun test_burn_reduces_supply() {
    let mut sc = setup();

    // Tx 1: Admin mints 100 to ALICE
    {
        let mut treasury = ts::take_shared<Treasury>(&sc);
        reward_coin::mint(&mut treasury, 100, ALICE, sc.ctx());
        ts::return_shared(treasury);
    };

    // Tx 2: ALICE burns her coins; supply goes to 0
    sc.next_tx(ALICE);
    {
        let c = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        let mut treasury = ts::take_shared<Treasury>(&sc);
        assert!(reward_coin::total_supply(&treasury) == 100);
        reward_coin::burn(&mut treasury, c);
        assert!(reward_coin::total_supply(&treasury) == 0);
        ts::return_shared(treasury);
    };

    sc.end();
}

// ── transfer_admin tests ──────────────────────────────────────────────────────

#[test]
fun test_transfer_admin_by_admin_succeeds() {
    let mut sc = setup();

    // Tx 1: ADMIN hands admin role to ALICE
    {
        let mut treasury = ts::take_shared<Treasury>(&sc);
        reward_coin::transfer_admin(&mut treasury, ALICE, sc.ctx());
        assert!(reward_coin::admin(&treasury) == ALICE);
        ts::return_shared(treasury);
    };

    // Tx 2: ALICE (new admin) can mint
    sc.next_tx(ALICE);
    {
        let mut treasury = ts::take_shared<Treasury>(&sc);
        reward_coin::mint(&mut treasury, 50, BOB, sc.ctx());
        assert!(reward_coin::total_supply(&treasury) == 50);
        ts::return_shared(treasury);
    };

    sc.end();
}

#[test, expected_failure(abort_code = surveysui::reward_coin::ENotAdmin)]
fun test_transfer_admin_by_non_admin_aborts() {
    let mut sc = setup();
    sc.next_tx(BOB); // BOB is not admin

    let mut treasury = ts::take_shared<Treasury>(&sc);
    reward_coin::transfer_admin(&mut treasury, BOB, sc.ctx()); // must abort
    ts::return_shared(treasury);

    sc.end();
}
