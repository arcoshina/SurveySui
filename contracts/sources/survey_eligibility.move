module surveysui::survey_eligibility;
use std::vector;
use sui::clock::Clock;
use surveysui::survey_pass::{Self, SurveyPass};
use surveysui::survey_registry::{Self, Survey};

public fun count_hits(submitted: &vector<vector<u8>>, allowlist: &vector<vector<u8>>): u64 {
    let mut hits = 0u64;
    let mut j = 0;
    let alen = vector::length(allowlist);
    while (j < alen) {
        let allowed = vector::borrow(allowlist, j);
        let mut i = 0;
        let slen = vector::length(submitted);
        let mut found = false;
        while (i < slen) {
            if (vector::borrow(submitted, i) == allowed) {
                found = true;
                break
            };
            i = i + 1;
        };
        if (found) hits = hits + 1;
        j = j + 1;
    };
    hits
}
public fun audience_ok(survey: &Survey, submitted: &vector<vector<u8>>): bool {
    let allowlist = survey_registry::allowed_nullifiers(survey);
    if (vector::is_empty(&allowlist)) {
        true
    } else {
        let hits = count_hits(submitted, &allowlist);
        hits >= survey_registry::match_threshold(survey)
    }
}
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
