/// Audience screening entry (`claim_v2`). See docs/V4_Eligibility.md.
module surveysui::survey_eligibility;

use std::option::{Self, Option};
use std::vector;
use sui::clock::Clock;
use sui::tx_context::TxContext;
use surveysui::survey_pass::{Self, SurveyPass};
use surveysui::survey_registry::{Self, Survey};
use surveysui::survey_vault::{Self, SurveyVault};

const CLAIM_MODE_ONE_TIME_TICKET: u8 = 1;

const EClaimModeNotImplemented: u64 = 0;
const EAudienceMismatch: u64 = 1;
const EInvalidPass: u64 = 2;

/// Byte-wise equality count: how many entries in `submitted` appear in `allowlist`.
public fun count_hits(submitted: &vector<vector<u8>>, allowlist: &vector<vector<u8>>): u64 {
    let mut hits = 0u64;
    let mut i = 0;
    let slen = vector::length(submitted);
    while (i < slen) {
        let candidate = vector::borrow(submitted, i);
        let mut j = 0;
        let alen = vector::length(allowlist);
        while (j < alen) {
            if (vector::borrow(allowlist, j) == candidate) {
                hits = hits + 1;
                break
            };
            j = j + 1;
        };
        i = i + 1;
    };
    hits
}

/// Skip when allowlist empty; else require hits >= match_threshold.
public fun audience_ok(survey: &Survey, submitted: &vector<vector<u8>>): bool {
    let allowlist = survey_registry::allowed_nullifiers(survey);
    if (vector::is_empty(&allowlist)) {
        true
    } else {
        let hits = count_hits(submitted, &allowlist);
        hits >= survey_registry::match_threshold(survey)
    }
}

/// OR semantics: valid credential source OR (SRC_ATTRIBUTES in list && audience_ok).
public fun credential_or_audience_ok(
    pass: &SurveyPass,
    survey: &Survey,
    submitted: &vector<vector<u8>>,
    clock: &Clock,
): bool {
    let sources = survey_registry::allowed_sources(survey);
    let mut credential_ok = false;
    let mut has_attributes_src = false;
    let mut i = 0;
    let len = vector::length(&sources);
    while (i < len) {
        let src = *vector::borrow(&sources, i);
        if (src == survey_pass::src_attributes()) {
            has_attributes_src = true;
        } else if (survey_pass::is_source_valid(pass, src, clock)) {
            credential_ok = true;
            break
        };
        i = i + 1;
    };
    let aud_ok = audience_ok(survey, submitted);
    credential_ok || (has_attributes_src && aud_ok)
}

/// Claim with optional audience nullifiers (tx input; not stored on Pass).
public fun claim_v2(
    vault: &mut SurveyVault,
    survey: &Survey,
    pass: &SurveyPass,
    attribute_nullifiers: vector<vector<u8>>,
    encrypted_answers: Option<vector<u8>>,
    answer_blob_id: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(
        survey_registry::claim_mode(survey) != CLAIM_MODE_ONE_TIME_TICKET,
        EClaimModeNotImplemented,
    );

    survey_vault::assert_claim_common(vault, survey, pass, clock, ctx);

    assert!(
        credential_or_audience_ok(pass, survey, &attribute_nullifiers, clock),
        EInvalidPass,
    );
    let allowlist = survey_registry::allowed_nullifiers(survey);
    if (!vector::is_empty(&allowlist)) {
        assert!(audience_ok(survey, &attribute_nullifiers), EAudienceMismatch);
    };

    survey_vault::apply_nullifiers_and_payout(
        vault,
        pass,
        encrypted_answers,
        answer_blob_id,
        clock,
        ctx,
    );
}
