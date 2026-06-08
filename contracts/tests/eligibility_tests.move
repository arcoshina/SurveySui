#[test_only]
module surveysui::eligibility_tests;

use std::option;
use std::vector;
use sui::clock;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;
use surveysui::stacked_survey_reward::STACKED_SURVEY_REWARD;
use surveysui::survey_eligibility;
use surveysui::survey_pass::{Self, SurveyPass};
use surveysui::survey_registry::{Self, Survey};
use surveysui::survey_vault::{Self, SurveyVault};

const CREATOR: address = @0xCAFE;
const RESPONDENT: address = @0xBEEF;
const SPONSOR: address = @0xD00D;

fun make_nullifier(seed: u8): vector<u8> {
    let mut v = vector<u8>[];
    let mut i = 0u8;
    while (i < 32) {
        vector::push_back(&mut v, seed + i);
        i = i + 1;
    };
    v
}

fun setup_vault(sc: &mut ts::Scenario): ID {
    let ctx = ts::ctx(sc);
    let ssr = coin::mint_for_testing<STACKED_SURVEY_REWARD>(10_000, ctx);
    let gas = coin::mint_for_testing<SUI>(500_000_000, ctx);
    let vault = survey_vault::create(
        ssr,
        10,
        0,
        1,
        100,
        1_000_000,
        @0xEEEE,
        gas,
        SPONSOR,
        5_000_000,
        0,
        0,
        option::none(),
        ctx,
    );
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);
    vault_id
}

#[test]
fun count_hits_intersection() {
    let a = make_nullifier(1);
    let b = make_nullifier(2);
    let c = make_nullifier(3);
    let submitted = vector[a, c];
    let allowlist = vector[a, b];
    assert!(survey_eligibility::count_hits(&submitted, &allowlist) == 1, 0);
}

#[test]
fun claim_v2_empty_allowlist_matches_claim() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let pass = survey_pass::create_for_testing(RESPONDENT, 2_000_000, ts::ctx(&mut sc));
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    let survey = survey_registry::create_survey_for_testing(
        vault_id,
        CREATOR,
        b"hash",
        option::some(b"content"),
        option::none(),
        b"schema",
        vector[],
        vector[2],
        ts::ctx(&mut sc),
    );

    survey_eligibility::claim_v2(
        &mut vault,
        &survey,
        &pass,
        vector[],
        option::some(b"answers"),
        option::none(),
        &clock,
        ts::ctx(&mut sc),
    );
    assert!(survey_vault::claimed_count(&vault) == 1, 1);

    clock::destroy_for_testing(clock);
    survey_pass::delete_pass_for_testing(pass);
    survey_registry::destroy_survey_for_testing(survey);
    ts::return_shared(vault);
    ts::end(sc);
}

#[test]
fun claim_v2_audience_hit_succeeds() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let pass = survey_pass::create_for_testing(RESPONDENT, 2_000_000, ts::ctx(&mut sc));
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));

    let n1 = make_nullifier(10);
    let survey = survey_registry::create_survey_with_eligibility_for_testing(
        vault_id,
        CREATOR,
        b"hash",
        option::some(b"content"),
        option::none(),
        b"schema",
        vector[],
        vector[survey_pass::src_attributes()],
        vector[n1],
        1,
        0,
        ts::ctx(&mut sc),
    );

    survey_eligibility::claim_v2(
        &mut vault,
        &survey,
        &pass,
        vector[n1],
        option::some(b"answers"),
        option::none(),
        &clock,
        ts::ctx(&mut sc),
    );
    assert!(survey_vault::claimed_count(&vault) == 1, 2);

    clock::destroy_for_testing(clock);
    survey_pass::delete_pass_for_testing(pass);
    survey_registry::destroy_survey_for_testing(survey);
    ts::return_shared(vault);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_eligibility::EAudienceMismatch)]
fun claim_v2_audience_miss_aborts() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let pass = survey_pass::create_for_testing(RESPONDENT, 2_000_000, ts::ctx(&mut sc));
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));

    let n1 = make_nullifier(20);
    let survey = survey_registry::create_survey_with_eligibility_for_testing(
        vault_id,
        CREATOR,
        b"hash",
        option::some(b"content"),
        option::none(),
        b"schema",
        vector[],
        vector[2, survey_pass::src_attributes()],
        vector[n1],
        1,
        0,
        ts::ctx(&mut sc),
    );

    survey_eligibility::claim_v2(
        &mut vault,
        &survey,
        &pass,
        vector[],
        option::some(b"answers"),
        option::none(),
        &clock,
        ts::ctx(&mut sc),
    );

    clock::destroy_for_testing(clock);
    survey_pass::delete_pass_for_testing(pass);
    survey_registry::destroy_survey_for_testing(survey);
    ts::return_shared(vault);
    ts::end(sc);
}
