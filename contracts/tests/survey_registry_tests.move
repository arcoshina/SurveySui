#[test_only]
module surveysui::survey_registry_tests;

use sui::clock;
use sui::test_scenario as ts;
use surveysui::survey_registry::{Self, SurveyRegistry, Question};

const CREATOR: address = @0xC0FFEE;
const BOB: address     = @0xB0B;
const T0: u64          = 1_000_000_000; // ms

// Helper to create a valid question
fun valid_question(): Question {
    survey_registry::new_question(
        b"q1",
        b"text",
        b"What is your name?",
        vector[],
        true
    )
}

// Helper to setup scenario and registry
fun setup(): (ts::Scenario, clock::Clock) {
    let mut sc = ts::begin(CREATOR);
    survey_registry::test_init(sc.ctx());
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);
    sc.next_tx(CREATOR);
    (sc, clk)
}

#[test]
fun test_register_emits_event() {
    let (mut sc, clk) = setup();
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[valid_question()];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0xDEAD),
            b"content_hash_abc",
            b"encrypted_blob_abc",
            b"schema_hash_abc",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };
    let effects = sc.next_tx(CREATOR);
    assert!(ts::num_user_events(&effects) == 1);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_query_by_creator() {
    let (mut sc, clk) = setup();

    // CREATOR registers survey 1
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[valid_question()];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x1),
            b"hash_one",
            b"encrypted_1",
            b"schema_1",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    // CREATOR registers survey 2
    sc.next_tx(CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[valid_question()];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x2),
            b"hash_two",
            b"encrypted_2",
            b"schema_2",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    // BOB registers survey 3
    sc.next_tx(BOB);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[valid_question()];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x3),
            b"hash_three",
            b"encrypted_3",
            b"schema_3",
            b"test_pubkey",
            questions,
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

#[test, expected_failure(abort_code = surveysui::survey_registry::EDuplicateSurvey)]
fun test_register_duplicate_content_hash_abort() {
    let (mut sc, clk) = setup();
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[valid_question()];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x1),
            b"hash_one",
            b"encrypted_1",
            b"schema_1",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    sc.next_tx(CREATOR);
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[valid_question()];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x2),
            b"hash_one", // Duplicate content hash
            b"encrypted_2",
            b"schema_2",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_registry::EInvalidQuestionType)]
fun test_register_invalid_question_type_abort() {
    let (mut sc, clk) = setup();
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(
                b"q1",
                b"invalid_type", // Not in whitelist
                b"What is your name?",
                vector[],
                true
            )
        ];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x1),
            b"hash_one",
            b"encrypted_1",
            b"schema_1",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_registry::EOptionLimitExceeded)]
fun test_register_too_many_options_abort() {
    let (mut sc, clk) = setup();
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        
        let mut options = vector[];
        let mut i = 0u64;
        while (i < 51) { // 51 options, limit is 50
            options.push_back(b"opt");
            i = i + 1;
        };

        let questions = vector[
            survey_registry::new_question(
                b"q1",
                b"single_choice",
                b"Choose one?",
                options,
                true
            )
        ];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x1),
            b"hash_one",
            b"encrypted_1",
            b"schema_1",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_registry::EEmptyQuestion)]
fun test_register_empty_question_abort() {
    let (mut sc, clk) = setup();
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(
                b"q1",
                b"text",
                b"", // Empty prompt
                vector[],
                true
            )
        ];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x1),
            b"hash_one",
            b"encrypted_1",
            b"schema_1",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test, expected_failure(abort_code = surveysui::survey_registry::EDuplicateQuestionId)]
fun test_register_duplicate_question_id_abort() {
    let (mut sc, clk) = setup();
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(
                b"q1",
                b"text",
                b"question 1",
                vector[],
                true
            ),
            survey_registry::new_question(
                b"q1", // Duplicate ID
                b"text",
                b"question 2",
                vector[],
                true
            )
        ];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0x1),
            b"hash_one",
            b"encrypted_1",
            b"schema_1",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun test_register_event_payload_complete() {
    let (mut sc, clk) = setup();
    {
        let mut registry = ts::take_shared<SurveyRegistry>(&sc);
        let questions = vector[
            survey_registry::new_question(
                b"q1",
                b"text",
                b"question 1",
                vector[],
                true
            ),
            survey_registry::new_question(
                b"q2",
                b"single_choice",
                b"question 2",
                vector[b"opt1", b"opt2"],
                false
            )
        ];
        survey_registry::register(
            &mut registry,
            object::id_from_address(@0xDEAD),
            b"content_hash_123",
            b"encrypted_blob_123",
            b"schema_hash_123",
            b"test_pubkey",
            questions,
            &clk,
            sc.ctx(),
        );
        ts::return_shared(registry);
    };
    let effects = sc.next_tx(CREATOR);
    assert!(ts::num_user_events(&effects) == 1);
    
    // Take the shared Survey object and verify its fields
    {
        let survey = ts::take_shared<surveysui::survey_registry::Survey>(&sc);
        assert!(survey_registry::vault_id(&survey) == object::id_from_address(@0xDEAD));
        assert!(survey_registry::content_hash(&survey) == b"content_hash_123");
        assert!(survey_registry::schema_hash(&survey) == b"schema_hash_123");
        assert!(survey_registry::encrypted_content(&survey) == b"encrypted_blob_123");
        ts::return_shared(survey);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
