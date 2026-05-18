#[test_only]
module surveysui::survey_registry_tests;

use sui::clock;
use sui::test_scenario as ts;
use surveysui::survey_registry::{Self, SurveyRegistry};

const CREATOR: address = @0xC0FFEE;
const BOB: address     = @0xB0B;
const T0: u64          = 1_000_000_000; // ms

// ── tests ─────────────────────────────────────────────────────────────────────

#[test]
fun test_register_emits_event() {
    let mut sc = ts::begin(CREATOR);
    survey_registry::test_init(sc.ctx());

    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    sc.next_tx(CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0xDEAD),
            b"encrypted_blob_abc",
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };
    // Committing the tx makes events visible; exactly one SurveyRegistered event.
    let effects = sc.next_tx(CREATOR);
    assert!(ts::num_user_events(&effects) == 1);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_query_by_creator() {
    let mut sc = ts::begin(CREATOR);
    survey_registry::test_init(sc.ctx());

    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // CREATOR registers survey 1
    sc.next_tx(CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x1),
            b"hash_one",
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    // CREATOR registers survey 2
    sc.next_tx(CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x2),
            b"hash_two",
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    // BOB registers survey 3
    sc.next_tx(BOB);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x3),
            b"hash_three",
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    // Query: CREATOR has 2, BOB has 1, total = 3
    sc.next_tx(CREATOR);
    {
        let registry = ts::take_shared<SurveyRegistry>(&sc);
        assert!(survey_registry::surveys_by_creator(&registry, CREATOR).length() == 2);
        assert!(survey_registry::surveys_by_creator(&registry, BOB).length() == 1);
        assert!(survey_registry::total_count(&registry) == 3);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
