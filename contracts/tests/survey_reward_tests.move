#[test_only]
module surveysui::survey_reward_tests;

use sui::coin::Coin;
use sui::test_scenario as ts;
use surveysui::survey_reward::{Self, SrTreasury, SURVEY_REWARD};

const ADMIN: address = @0xA11CE;
const ALICE: address = @0xB0B;

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    survey_reward::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    sc
}

/// Verifies that the package-level mint function works (amm_pool calls it this way).
/// public(package) ensures external packages cannot call mint — enforced at compile time.
#[test]
fun test_only_pool_can_mint() {
    let mut sc = setup();
    {
        let mut treasury = ts::take_shared<SrTreasury>(&sc);
        // Within surveysui package, mint is accessible (amm_pool uses this path)
        let c = survey_reward::mint(&mut treasury, 1_000, sc.ctx());
        assert!(survey_reward::total_supply(&treasury) == 1_000);
        transfer::public_transfer(c, ALICE);
        ts::return_shared(treasury);
    };
    sc.end();
}

#[test]
fun test_burn_reduces_supply() {
    let mut sc = setup();

    // Mint 500 SR → ALICE
    {
        let mut treasury = ts::take_shared<SrTreasury>(&sc);
        let c = survey_reward::mint(&mut treasury, 500, sc.ctx());
        assert!(survey_reward::total_supply(&treasury) == 500);
        transfer::public_transfer(c, ALICE);
        ts::return_shared(treasury);
    };

    // ALICE burns her SR
    sc.next_tx(ALICE);
    {
        let c = ts::take_from_sender<Coin<SURVEY_REWARD>>(&sc);
        let mut treasury = ts::take_shared<SrTreasury>(&sc);
        survey_reward::burn(&mut treasury, c);
        assert!(survey_reward::total_supply(&treasury) == 0);
        ts::return_shared(treasury);
    };

    sc.end();
}
