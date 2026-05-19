#[test_only]
module surveysui::stacked_survey_reward_tests;

use sui::test_scenario as ts;
use surveysui::stacked_survey_reward::{Self, SssrTreasury, STACKED_SURVEY_REWARD};

const ADMIN: address = @0xA11CE;
const ALICE: address = @0xB0B;

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ADMIN);
    stacked_survey_reward::test_init(sc.ctx());
    sc.next_tx(ADMIN);
    sc
}

/// Verifies that package-level mint works (amm_pool uses this path).
/// public(package) blocks external packages from calling mint — compile-time enforced.
#[test]
fun test_only_pool_can_mint_sssr() {
    let mut sc = setup();
    {
        let mut treasury = ts::take_shared<SssrTreasury>(&sc);
        let c = stacked_survey_reward::mint(&mut treasury, 1_000, sc.ctx());
        assert!(stacked_survey_reward::total_supply(&treasury) == 1_000);
        // Clean up
        stacked_survey_reward::burn(&mut treasury, c);
        assert!(stacked_survey_reward::total_supply(&treasury) == 0);
        ts::return_shared(treasury);
    };
    sc.end();
}

#[test]
fun test_burn_reduces_sssr_supply() {
    let mut sc = setup();
    {
        let mut treasury = ts::take_shared<SssrTreasury>(&sc);
        let c = stacked_survey_reward::mint(&mut treasury, 2_500, sc.ctx());
        assert!(stacked_survey_reward::total_supply(&treasury) == 2_500);
        transfer::public_transfer(c, ALICE);
        ts::return_shared(treasury);
    };

    // Only package-level code can burn (amm_pool::redeem is the production path)
    sc.next_tx(ADMIN);
    {
        let coin = ts::take_from_address<sui::coin::Coin<STACKED_SURVEY_REWARD>>(&sc, ALICE);
        let mut treasury = ts::take_shared<SssrTreasury>(&sc);
        stacked_survey_reward::burn(&mut treasury, coin);
        assert!(stacked_survey_reward::total_supply(&treasury) == 0);
        ts::return_shared(treasury);
    };

    sc.end();
}

#[test]
fun test_display_sssr_rounding() {
    assert!(stacked_survey_reward::display_sssr(1_000_000_001) == 1_000_000_000);
    assert!(stacked_survey_reward::display_sssr(999_999_999) == 1_000_000_000);
    assert!(stacked_survey_reward::display_sssr(123_456_789_012) == 123_456_800_000);
    assert!(stacked_survey_reward::display_sssr(50_000) == 100_000);
    assert!(stacked_survey_reward::display_sssr(49_999) == 0);
    assert!(stacked_survey_reward::display_sssr(0) == 0);
}

