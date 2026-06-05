#[test_only]
module surveysui::purge_tests;

use sui::test_scenario as ts;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use std::option;
use surveysui::survey_vault::{Self, SurveyVault};
use surveysui::survey_registry::{Self, SurveyRegistry, Survey, Question};

const CREATOR: address = @0xCAFE;
const NON_CREATOR: address = @0xBEEF;
const GRACE_MS: u64 = 7 * 24 * 60 * 60 * 1000; // == MIN_PURGE_GRACE_MS

/// Build a vault + registered survey, populate two answers, then close it.
/// Returns by sharing the survey (via register) so the caller can take it later.
fun setup(sc: &mut ts::Scenario, clk: &clock::Clock): ID {
    let mut registry = ts::take_shared<SurveyRegistry>(sc);

    let gas = coin::zero<SUI>(ts::ctx(sc));
    let mut vault = survey_vault::create_empty(
        1,          // per_response
        0,          // repeat_reward
        1,          // repeat_max_times
        10,         // max_responses
        1_000,      // deadline_ms
        CREATOR,    // admin_treasury
        gas,
        @0x0,       // sponsor_address
        0,          // gas_compensation_amount
        0,          // storage_compensation_amount
        0,          // premium_fee
        option::none(),
        ts::ctx(sc),
    );
    survey_vault::set_purge_grace_ms(&mut vault, GRACE_MS, ts::ctx(sc));

    survey_vault::add_answer_for_testing(&mut vault, b"ciphertext-1");
    survey_vault::add_answer_for_testing(&mut vault, b"ciphertext-2");
    assert!(survey_vault::answers_count(&vault) == 2, 100);
    assert!(survey_vault::has_answer(&vault, 0), 101);

    let vault_id = survey_vault::id_of(&vault);
    survey_registry::register(
        &mut registry,
        vault_id,
        b"content-hash",
        option::some(b"encrypted-content"),
        option::none(),
        b"schema-hash",
        b"creator-pub-key",
        vector<Question>[],
        vector[2],
        clk,
        ts::ctx(sc),
    );
    assert!(survey_registry::total_count(&registry) == 1, 102);

    // Close so the purge anchor is set to closed_at_ms.
    survey_vault::close(&mut vault, clk, ts::ctx(sc));

    survey_vault::share_vault(vault);
    ts::return_shared(registry);
    vault_id
}

#[test]
fun purge_destroys_vault_survey_and_index() {
    let mut sc = ts::begin(CREATOR);
    {
        let ctx = ts::ctx(&mut sc);
        survey_registry::test_init(ctx);
    };

    ts::next_tx(&mut sc, CREATOR);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let _vault_id = setup(&mut sc, &clk);

    // Creator may purge immediately after close — no grace wait required.
    ts::next_tx(&mut sc, CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let survey = ts::take_shared<Survey>(&sc);
        let vault = ts::take_shared<SurveyVault>(&sc);

        survey_vault::purge(&mut registry, survey, vault, &clk, ts::ctx(&mut sc));

        // Index fully cleaned.
        assert!(survey_registry::total_count(&registry) == 0, 200);
        assert!(vector::is_empty(&survey_registry::surveys_by_creator(&registry, CREATOR)), 201);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EPurgeTooEarly)]
fun purge_before_grace_aborts() {
    let mut sc = ts::begin(CREATOR);
    {
        let ctx = ts::ctx(&mut sc);
        survey_registry::test_init(ctx);
    };

    ts::next_tx(&mut sc, CREATOR);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let _vault_id = setup(&mut sc, &clk);

    // Non-creator (cron / permissionless) before grace → abort.
    ts::next_tx(&mut sc, NON_CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let survey = ts::take_shared<Survey>(&sc);
        let vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::purge(&mut registry, survey, vault, &clk, ts::ctx(&mut sc));
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
fun purge_noncreator_after_grace_ok() {
    let mut sc = ts::begin(CREATOR);
    {
        let ctx = ts::ctx(&mut sc);
        survey_registry::test_init(ctx);
    };

    ts::next_tx(&mut sc, CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    let _vault_id = setup(&mut sc, &clk);

    // Past the grace window → a permissionless caller (e.g. BFF cron) may purge.
    clock::increment_for_testing(&mut clk, GRACE_MS + 1);

    ts::next_tx(&mut sc, NON_CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let survey = ts::take_shared<Survey>(&sc);
        let vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::purge(&mut registry, survey, vault, &clk, ts::ctx(&mut sc));
        assert!(survey_registry::total_count(&registry) == 0, 300);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}
