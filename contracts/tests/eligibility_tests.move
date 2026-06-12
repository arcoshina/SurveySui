#[test_only]
module surveysui::eligibility_tests;

use std::option;
use std::vector;
use sui::clock;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;
use sui::tx_context::TxContext;
use surveysui::stacked_survey_reward::STACKED_SURVEY_REWARD;
use surveysui::claim_sentinel;
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

fun claim_pass(
    vault: &mut SurveyVault,
    survey: &Survey,
    pass: &SurveyPass,
    attribute_nullifiers: vector<vector<u8>>,
    encrypted_answers: Option<vector<u8>>,
    answer_blob_id: Option<vector<u8>>,
    clock: &clock::Clock,
    ctx: &mut TxContext,
) {
    let issuer_config = survey_pass::issuer_config_for_testing(ctx);
    let void_nft = claim_sentinel::void_nft_for_testing(ctx);
    survey_vault::claim(
        vault,
        survey,
        0,
        true,
        pass,
        false,
        &void_nft,
        attribute_nullifiers,
        &issuer_config,
        vector[],
        vector[],
        0,
        encrypted_answers,
        answer_blob_id,
        clock,
        ctx,
    );
    claim_sentinel::delete_void_nft_for_testing(void_nft);
    survey_pass::destroy_issuer_config_for_testing(issuer_config);
}

fun setup_vault(sc: &mut ts::Scenario): ID {
    let ctx = ts::ctx(sc);
    let ssr = coin::mint_for_testing<STACKED_SURVEY_REWARD>(10_000, ctx);
    let gas = coin::mint_for_testing<SUI>(500_000_000, ctx);
    let vault = survey_vault::create_for_testing(
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
fun claim_unified_empty_allowlist_succeeds() {
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

    claim_pass(
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
fun claim_unified_audience_hit_succeeds() {
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

    claim_pass(
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
#[expected_failure(abort_code = surveysui::survey_vault::EInvalidPass)]
fun claim_attribute_with_revoked_pass_aborts() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let mut pass = survey_pass::create_for_testing(RESPONDENT, 2_000_000, ts::ctx(&mut sc));

    // issuer_config_for_testing 的 admin 是 @0x0，須以 @0x0 身分撤銷
    ts::next_tx(&mut sc, @0x0);
    let issuer_config = survey_pass::issuer_config_for_testing(ts::ctx(&mut sc));
    survey_pass::admin_revoke_pass(&mut pass, &issuer_config, ts::ctx(&mut sc));
    survey_pass::destroy_issuer_config_for_testing(issuer_config);

    ts::next_tx(&mut sc, RESPONDENT);
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));

    let n1 = make_nullifier(12);
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

    claim_pass(
        &mut vault,
        &survey,
        &pass,
        vector[n1],
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

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInvalidPass)]
fun claim_attribute_allowlist_without_pass_aborts() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));

    let n1 = make_nullifier(15);
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

    let issuer_config = survey_pass::issuer_config_for_testing(ts::ctx(&mut sc));
    let padding_pass = survey_pass::padding_pass_for_testing(ts::ctx(&mut sc));
    let void_nft = claim_sentinel::void_nft_for_testing(ts::ctx(&mut sc));
    survey_vault::claim(
        &mut vault,
        &survey,
        0,
        false,
        &padding_pass,
        false,
        &void_nft,
        vector[n1],
        &issuer_config,
        vector[],
        vector[],
        0,
        option::some(b"answers"),
        option::none(),
        &clock,
        ts::ctx(&mut sc),
    );

    clock::destroy_for_testing(clock);
    claim_sentinel::delete_void_nft_for_testing(void_nft);
    survey_pass::delete_pass_for_testing(padding_pass);
    survey_pass::destroy_issuer_config_for_testing(issuer_config);
    survey_registry::destroy_survey_for_testing(survey);
    ts::return_shared(vault);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInvalidPass)]
fun claim_unified_audience_miss_aborts() {
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

    claim_pass(
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

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EClaimModeMismatch)]
fun claim_unified_pass_on_ticket_mode_aborts() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let pass = survey_pass::create_for_testing(RESPONDENT, 2_000_000, ts::ctx(&mut sc));
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    let survey = survey_registry::create_survey_with_eligibility_for_testing(
        vault_id,
        CREATOR,
        b"hash",
        option::some(b"content"),
        option::none(),
        b"schema",
        vector[],
        vector[2],
        vector[],
        0,
        1,
        ts::ctx(&mut sc),
    );

    claim_pass(
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

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInvalidPass)]
fun claim_ticket_without_step1_identity_aborts() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    let survey = survey_registry::create_survey_with_eligibility_for_testing(
        vault_id,
        CREATOR,
        b"hash",
        option::some(b"content"),
        option::none(),
        b"schema",
        vector[],
        vector[2],
        vector[],
        0,
        1,
        ts::ctx(&mut sc),
    );
    let issuer_config = survey_pass::issuer_config_for_testing(ts::ctx(&mut sc));
    let padding_pass = survey_pass::padding_pass_for_testing(ts::ctx(&mut sc));
    let void_nft = claim_sentinel::void_nft_for_testing(ts::ctx(&mut sc));
    survey_vault::claim(
        &mut vault,
        &survey,
        1,
        false,
        &padding_pass,
        false,
        &void_nft,
        vector[],
        &issuer_config,
        vector[1, 2, 3],
        vector[4, 5, 6],
        9_999_999_999,
        option::some(b"answers"),
        option::none(),
        &clock,
        ts::ctx(&mut sc),
    );

    clock::destroy_for_testing(clock);
    claim_sentinel::delete_void_nft_for_testing(void_nft);
    survey_pass::delete_pass_for_testing(padding_pass);
    survey_pass::destroy_issuer_config_for_testing(issuer_config);
    survey_registry::destroy_survey_for_testing(survey);
    ts::return_shared(vault);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::ESurveyArchived)]
fun claim_archived_survey_aborts() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, CREATOR);
    let mut survey = survey_registry::create_survey_for_testing(
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
    survey_registry::archive(&mut survey, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, RESPONDENT);
    let pass = survey_pass::create_for_testing(RESPONDENT, 2_000_000, ts::ctx(&mut sc));
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    claim_pass(
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

#[test]
fun claim_attribute_nullifier_replay_allowed() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let pass1 = survey_pass::create_for_testing(RESPONDENT, 2_000_000, ts::ctx(&mut sc));
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));

    let n1 = make_nullifier(30);
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

    claim_pass(
        &mut vault,
        &survey,
        &pass1,
        vector[n1],
        option::some(b"answers1"),
        option::none(),
        &clock,
        ts::ctx(&mut sc),
    );

    ts::next_tx(&mut sc, @0xDEAD);
    let pass2 = survey_pass::create_for_testing(@0xDEAD, 2_000_000, ts::ctx(&mut sc));
    claim_pass(
        &mut vault,
        &survey,
        &pass2,
        vector[n1],
        option::some(b"answers2"),
        option::none(),
        &clock,
        ts::ctx(&mut sc),
    );
    assert!(survey_vault::claimed_count(&vault) == 2, 3);

    clock::destroy_for_testing(clock);
    survey_pass::delete_pass_for_testing(pass1);
    survey_pass::delete_pass_for_testing(pass2);
    survey_registry::destroy_survey_for_testing(survey);
    ts::return_shared(vault);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInvalidPass)]
fun claim_duplicate_submitted_does_not_inflate_audience_hits() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let pass = survey_pass::create_for_testing(RESPONDENT, 2_000_000, ts::ctx(&mut sc));
    let mut vault = ts::take_shared<SurveyVault>(&sc);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));

    let n1 = make_nullifier(40);
    let n_dup = make_nullifier(40);
    let survey = survey_registry::create_survey_with_eligibility_for_testing(
        vault_id,
        CREATOR,
        b"hash",
        option::some(b"content"),
        option::none(),
        b"schema",
        vector[],
        vector[survey_pass::src_attributes()],
        vector[n1, make_nullifier(41)],
        2,
        0,
        ts::ctx(&mut sc),
    );

    claim_pass(
        &mut vault,
        &survey,
        &pass,
        vector[n_dup, n_dup],
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

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EClaimModeMismatch)]
fun claim_ticket_auth_on_pass_mode_aborts() {
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
    let issuer_config = survey_pass::issuer_config_for_testing(ts::ctx(&mut sc));
    let padding_pass = survey_pass::padding_pass_for_testing(ts::ctx(&mut sc));
    let void_nft = claim_sentinel::void_nft_for_testing(ts::ctx(&mut sc));
    survey_vault::claim(
        &mut vault,
        &survey,
        1,
        false,
        &padding_pass,
        false,
        &void_nft,
        vector[],
        &issuer_config,
        vector[1, 2, 3],
        vector[4, 5, 6],
        9_999_999_999,
        option::some(b"answers"),
        option::none(),
        &clock,
        ts::ctx(&mut sc),
    );

    clock::destroy_for_testing(clock);
    claim_sentinel::delete_void_nft_for_testing(void_nft);
    survey_pass::delete_pass_for_testing(padding_pass);
    survey_pass::destroy_issuer_config_for_testing(issuer_config);
    survey_pass::delete_pass_for_testing(pass);
    survey_registry::destroy_survey_for_testing(survey);
    ts::return_shared(vault);
    ts::end(sc);
}

// 各 source 資格閘門：持對應有效槽的 Pass 通過 allowed_sources=[該 source] 的問卷。
// EMAIL(2) 已由 claim_unified_empty_allowlist_succeeds 等覆蓋（create_for_testing 即 email 槽）。
fun claim_source_gate_succeeds(source: u8) {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let pass = survey_pass::create_with_source_for_testing(RESPONDENT, source, 2_000_000, ts::ctx(&mut sc));
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
        vector[source],
        ts::ctx(&mut sc),
    );

    claim_pass(
        &mut vault,
        &survey,
        &pass,
        vector[],
        option::some(b"answers"),
        option::none(),
        &clock,
        ts::ctx(&mut sc),
    );
    assert!(survey_vault::claimed_count(&vault) == 1, 0);

    clock::destroy_for_testing(clock);
    survey_pass::delete_pass_for_testing(pass);
    survey_registry::destroy_survey_for_testing(survey);
    ts::return_shared(vault);
    ts::end(sc);
}

#[test]
fun claim_gate_world_id_source() { claim_source_gate_succeeds(survey_pass::src_world_id()); }

#[test]
fun claim_gate_google_source() { claim_source_gate_succeeds(survey_pass::src_social_google()); }

#[test]
fun claim_gate_github_source() { claim_source_gate_succeeds(survey_pass::src_social_github()); }

// 負向：只持 Google(6) 槽的 Pass 不通過 allowed_sources=[World ID(5)] 的問卷。
#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInvalidPass)]
fun claim_gate_wrong_source_aborts() {
    let mut sc = ts::begin(CREATOR);
    let vault_id = setup_vault(&mut sc);

    ts::next_tx(&mut sc, RESPONDENT);
    let pass = survey_pass::create_with_source_for_testing(
        RESPONDENT, survey_pass::src_social_google(), 2_000_000, ts::ctx(&mut sc),
    );
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
        vector[survey_pass::src_world_id()],
        ts::ctx(&mut sc),
    );

    claim_pass(
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

