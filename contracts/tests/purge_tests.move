#[test_only]
module surveysui::purge_tests;

use sui::test_scenario as ts;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use std::option;
use surveysui::amm_pool::{Self, ProtocolConfig};
use surveysui::survey_vault::{Self, SurveyVault};
use surveysui::survey_registry::{Self, SurveyRegistry, Survey, Question};

const CREATOR: address = @0xCAFE;
const NON_CREATOR: address = @0xBEEF;
const GRACE_MS: u64 = 7 * 24 * 60 * 60 * 1000; // == MIN_PURGE_GRACE_MS

fun init_protocol(sc: &mut ts::Scenario) {
    ts::next_tx(sc, CREATOR);
    {
        let ctx = ts::ctx(sc);
        amm_pool::create_protocol_config(ctx);
    };
}

/// Build a vault + registered survey, populate two answers, then close it.
fun setup(sc: &mut ts::Scenario, clk: &clock::Clock, config: &ProtocolConfig): ID {
    let mut registry = ts::take_shared<SurveyRegistry>(sc);

    let gas = coin::zero<SUI>(ts::ctx(sc));
    let mut vault = survey_vault::create_empty(
        1,
        0,
        1,
        10,
        1_000,
        CREATOR,
        gas,
        @0x0,
        0,
        0,
        0,
        option::none(),
        config,
        ts::ctx(sc),
    );
    survey_vault::set_purge_grace_ms(&mut vault, GRACE_MS, ts::ctx(sc));

    survey_vault::add_answer_for_testing(&mut vault, b"ciphertext-1");
    survey_vault::add_answer_for_testing(&mut vault, b"ciphertext-2");
    assert!(survey_vault::answers_count(&vault) == 2, 100);
    assert!(survey_vault::has_answer(&vault, 0), 101);

    let vault_id = survey_vault::id_of(&vault);
    survey_vault::register_survey(
        &mut registry,
        &mut vault,
        b"content-hash",
        option::some(b"encrypted-content"),
        option::none(),
        option::none(),
        b"schema-hash",
        b"creator-pub-key",
        vector<Question>[],
        vector[2],
        vector[],
        0,
        option::none(),
        option::none(),
        0,
        clk,
        ts::ctx(sc),
    );
    assert!(survey_registry::total_count(&registry) == 1, 102);

    survey_vault::mark_fee_paid_for_testing(&mut vault);
    survey_vault::close(&mut vault, clk, ts::ctx(sc));

    survey_vault::share_vault_for_testing(vault);
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
    init_protocol(&mut sc);

    ts::next_tx(&mut sc, CREATOR);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let config = ts::take_shared<ProtocolConfig>(&sc);
    let vault_id = setup(&mut sc, &clk, &config);
    ts::return_shared(config);

    ts::next_tx(&mut sc, CREATOR);
    {
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let survey = ts::take_shared<Survey>(&sc);
        let vault = ts::take_shared<SurveyVault>(&sc);

        survey_vault::purge(&mut registry, survey, vault, &config, &clk, ts::ctx(&mut sc));

        assert!(survey_registry::total_count(&registry) == 0, 200);
        assert!(vector::is_empty(&survey_registry::surveys_by_creator(&registry, CREATOR)), 201);
        assert!(option::is_none(&survey_registry::survey_id_for_vault(&registry, vault_id)), 202);
        assert!(!survey_registry::is_content_hash_registered(&registry, b"content-hash"), 203);
        ts::return_shared(config);
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
    init_protocol(&mut sc);

    ts::next_tx(&mut sc, CREATOR);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let config = ts::take_shared<ProtocolConfig>(&sc);
    let _vault_id = setup(&mut sc, &clk, &config);
    ts::return_shared(config);

    ts::next_tx(&mut sc, NON_CREATOR);
    {
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let survey = ts::take_shared<Survey>(&sc);
        let vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::purge(&mut registry, survey, vault, &config, &clk, ts::ctx(&mut sc));
        ts::return_shared(config);
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
    init_protocol(&mut sc);

    ts::next_tx(&mut sc, CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    let config = ts::take_shared<ProtocolConfig>(&sc);
    let _vault_id = setup(&mut sc, &clk, &config);
    ts::return_shared(config);

    clock::increment_for_testing(&mut clk, GRACE_MS + 1);

    ts::next_tx(&mut sc, NON_CREATOR);
    {
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let survey = ts::take_shared<Survey>(&sc);
        let vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::purge(&mut registry, survey, vault, &config, &clk, ts::ctx(&mut sc));
        assert!(survey_registry::total_count(&registry) == 0, 300);
        ts::return_shared(config);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
fun purge_batched_requires_multiple_txs() {
    let mut sc = ts::begin(CREATOR);
    {
        let ctx = ts::ctx(&mut sc);
        survey_registry::test_init(ctx);
    };
    init_protocol(&mut sc);

    ts::next_tx(&mut sc, CREATOR);
    {
        let mut config = ts::take_shared<ProtocolConfig>(&sc);
        amm_pool::configure_protocol_limits_for_test(&mut config, 0, 2);
        ts::return_shared(config);
    };

    ts::next_tx(&mut sc, CREATOR);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    {
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);

        let gas = coin::zero<SUI>(ts::ctx(&mut sc));
        let mut vault = survey_vault::create_empty(
            1,
            0,
            1,
            10,
            1_000,
            CREATOR,
            gas,
            @0x0,
            0,
            0,
            0,
            option::none(),
            &config,
            ts::ctx(&mut sc),
        );
        survey_vault::set_purge_grace_ms(&mut vault, GRACE_MS, ts::ctx(&mut sc));
        let mut i = 0u64;
        while (i < 5) {
            survey_vault::add_answer_for_testing(&mut vault, b"x");
            i = i + 1;
        };
        assert!(survey_vault::answers_count(&vault) == 5, 400);

        survey_vault::register_survey(
            &mut registry,
            &mut vault,
            b"batch-hash",
            option::some(b"encrypted-content"),
            option::none(),
            option::none(),
            b"schema-hash",
            b"creator-pub-key",
            vector<Question>[],
            vector[2],
            vector[],
            0,
            option::none(),
            option::none(),
            0,
            &clk,
            ts::ctx(&mut sc),
        );
        survey_vault::mark_fee_paid_for_testing(&mut vault);
        survey_vault::close(&mut vault, &clk, ts::ctx(&mut sc));
        survey_vault::share_vault_for_testing(vault);
        ts::return_shared(registry);
        ts::return_shared(config);
    };

    // First batch: 2 of 5
    ts::next_tx(&mut sc, CREATOR);
    {
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let survey = ts::take_shared<Survey>(&sc);
        let vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::purge(&mut registry, survey, vault, &config, &clk, ts::ctx(&mut sc));
        assert!(survey_registry::total_count(&registry) == 1, 401);
        ts::return_shared(config);
        ts::return_shared(registry);
    };

    // Second batch: 4 of 5
    ts::next_tx(&mut sc, CREATOR);
    {
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let survey = ts::take_shared<Survey>(&sc);
        let vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::purge(&mut registry, survey, vault, &config, &clk, ts::ctx(&mut sc));
        assert!(survey_registry::total_count(&registry) == 1, 402);
        ts::return_shared(config);
        ts::return_shared(registry);
    };

    // Final batch: destroys vault + survey
    ts::next_tx(&mut sc, CREATOR);
    {
        let config = ts::take_shared<ProtocolConfig>(&sc);
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let survey = ts::take_shared<Survey>(&sc);
        let vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::purge(&mut registry, survey, vault, &config, &clk, ts::ctx(&mut sc));
        assert!(survey_registry::total_count(&registry) == 0, 403);
        ts::return_shared(config);
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::ENotCreator)]
fun register_survey_non_creator_aborts() {
    let mut sc = ts::begin(CREATOR);
    {
        let ctx = ts::ctx(&mut sc);
        survey_registry::test_init(ctx);
    };
    init_protocol(&mut sc);

    ts::next_tx(&mut sc, CREATOR);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let mut registry = ts::take_shared<SurveyRegistry>(&sc);
    let config = ts::take_shared<ProtocolConfig>(&sc);
    let gas = coin::zero<SUI>(ts::ctx(&mut sc));
    let vault = survey_vault::create_empty(
        1,
        0,
        1,
        10,
        1_000,
        CREATOR,
        gas,
        @0x0,
        0,
        0,
        0,
        option::none(),
        &config,
        ts::ctx(&mut sc),
    );
    survey_vault::share_vault_for_testing(vault);
    ts::return_shared(config);
    ts::return_shared(registry);

    ts::next_tx(&mut sc, NON_CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::register_survey(
            &mut registry,
            &mut vault,
            b"content-hash",
            option::some(b"encrypted-content"),
            option::none(),
            option::none(),
            b"schema-hash",
            b"creator-pub-key",
            vector<Question>[],
            vector[2],
            vector[],
            0,
            option::none(),
            option::none(),
            0,
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(registry);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_registry::EEmptyQuestion)]
fun register_empty_prompt_does_not_squat_content_hash() {
    let mut sc = ts::begin(CREATOR);
    {
        let ctx = ts::ctx(&mut sc);
        survey_registry::test_init(ctx);
    };
    init_protocol(&mut sc);

    ts::next_tx(&mut sc, CREATOR);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let registry = ts::take_shared<SurveyRegistry>(&sc);
    let config = ts::take_shared<ProtocolConfig>(&sc);
    let gas = coin::zero<SUI>(ts::ctx(&mut sc));
    let vault = survey_vault::create_empty(
        1,
        0,
        1,
        10,
        1_000,
        CREATOR,
        gas,
        @0x0,
        0,
        0,
        0,
        option::none(),
        &config,
        ts::ctx(&mut sc),
    );
    let content_hash = b"f63-hash-squat";
    assert!(!survey_registry::is_content_hash_registered(&registry, content_hash), 500);
    survey_vault::share_vault_for_testing(vault);
    ts::return_shared(config);
    ts::return_shared(registry);

    ts::next_tx(&mut sc, CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        let bad_q = survey_registry::new_question(
            b"q1",
            b"text",
            vector[],
            vector[],
            true,
        );
        survey_vault::register_survey(
            &mut registry,
            &mut vault,
            content_hash,
            option::some(b"encrypted-content"),
            option::none(),
            option::none(),
            b"schema-hash",
            b"creator-pub-key",
            vector[bad_q],
            vector[2],
            vector[],
            0,
            option::none(),
            option::none(),
            0,
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(registry);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
fun register_same_content_hash_after_prepare_abort_succeeds() {
    let mut sc = ts::begin(CREATOR);
    {
        let ctx = ts::ctx(&mut sc);
        survey_registry::test_init(ctx);
    };
    init_protocol(&mut sc);

    ts::next_tx(&mut sc, CREATOR);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let mut registry = ts::take_shared<SurveyRegistry>(&sc);
    let config = ts::take_shared<ProtocolConfig>(&sc);
    let gas = coin::zero<SUI>(ts::ctx(&mut sc));
    let mut vault = survey_vault::create_empty(
        1,
        0,
        1,
        10,
        1_000,
        CREATOR,
        gas,
        @0x0,
        0,
        0,
        0,
        option::none(),
        &config,
        ts::ctx(&mut sc),
    );
    let content_hash = b"f63-hash-retry";
    let vault_id = survey_vault::id_of(&vault);
    assert!(!survey_registry::is_content_hash_registered(&registry, content_hash), 500);
    let survey = survey_registry::prepare_survey_for_testing(
        vault_id,
        content_hash,
        option::some(b"encrypted-content"),
        option::none(),
        option::none(),
        b"schema-hash",
        b"creator-pub-key",
        vector<Question>[],
        vector[2],
        vector[],
        0,
        option::none(),
        option::none(),
        0,
        &clk,
        ts::ctx(&mut sc),
    );
    survey_registry::destroy_survey_for_testing(survey);
    assert!(!survey_registry::is_content_hash_registered(&registry, content_hash), 501);
    survey_vault::register_survey(
        &mut registry,
        &mut vault,
        content_hash,
        option::some(b"encrypted-content"),
        option::none(),
        option::none(),
        b"schema-hash",
        b"creator-pub-key",
        vector<Question>[],
        vector[2],
        vector[],
        0,
        option::none(),
        option::none(),
        0,
        &clk,
        ts::ctx(&mut sc),
    );
    assert!(survey_registry::is_content_hash_registered(&registry, content_hash), 502);
    assert!(survey_vault::survey_registered(&vault), 503);
    survey_vault::share_vault_for_testing(vault);
    ts::return_shared(config);
    ts::return_shared(registry);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EVaultAlreadyHasSurvey)]
fun register_survey_twice_same_vault_aborts() {
    let mut sc = ts::begin(CREATOR);
    {
        let ctx = ts::ctx(&mut sc);
        survey_registry::test_init(ctx);
    };
    init_protocol(&mut sc);

    ts::next_tx(&mut sc, CREATOR);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let mut registry = ts::take_shared<SurveyRegistry>(&sc);
    let config = ts::take_shared<ProtocolConfig>(&sc);
    let gas = coin::zero<SUI>(ts::ctx(&mut sc));
    let mut vault = survey_vault::create_empty(
        1,
        0,
        1,
        10,
        1_000,
        CREATOR,
        gas,
        @0x0,
        0,
        0,
        0,
        option::none(),
        &config,
        ts::ctx(&mut sc),
    );
    survey_vault::register_survey(
        &mut registry,
        &mut vault,
        b"first-hash",
        option::some(b"encrypted-content"),
        option::none(),
        option::none(),
        b"schema-hash",
        b"creator-pub-key",
        vector<Question>[],
        vector[2],
        vector[],
        0,
        option::none(),
        option::none(),
        0,
        &clk,
        ts::ctx(&mut sc),
    );
    survey_vault::share_vault_for_testing(vault);
    ts::return_shared(config);
    ts::return_shared(registry);

    ts::next_tx(&mut sc, CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let mut vault = ts::take_shared<SurveyVault>(&sc);
        survey_vault::register_survey(
            &mut registry,
            &mut vault,
            b"second-hash",
            option::some(b"encrypted-other"),
            option::none(),
            option::none(),
            b"schema-hash-2",
            b"creator-pub-key",
            vector<Question>[],
            vector[2],
            vector[],
            0,
            option::none(),
            option::none(),
            0,
            &clk,
            ts::ctx(&mut sc),
        );
        ts::return_shared(registry);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}
