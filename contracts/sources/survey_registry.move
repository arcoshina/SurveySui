module surveysui::survey_registry;
use std::option::{Self, Option};
use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, ID};
use sui::sui::SUI;
use sui::table::{Self, Table};
const STATUS_ACTIVE: u8   = 0;
const STATUS_ARCHIVED: u8 = 1;
const ENotCreator: u64 = 0;
const EDuplicateSurvey: u64 = 1;
const EInvalidQuestionType: u64 = 2;
const EOptionLimitExceeded: u64 = 3;
const EEmptyQuestion: u64 = 4;
const EDuplicateQuestionId: u64 = 5;
const EEmptyAllowedSources: u64 = 6;
const EEmptyContent: u64 = 7;
const EAllowlistTooLarge: u64 = 8;
const EInvalidClaimMode: u64 = 9;
const EMissingBlobObjectId: u64 = 10;
const EVaultAlreadyRegistered: u64 = 12;
const MAX_OPTIONS_LIMIT: u64 = 50;
const MAX_ALLOWED_NULLIFIERS: u64 = 100;
const CLAIM_MODE_PASS_AUDIENCE: u8 = 0;
const CLAIM_MODE_ONE_TIME_TICKET: u8 = 1;
public struct Question has copy, drop, store {
    id: vector<u8>,
    question_type: vector<u8>,
    prompt: vector<u8>,
    options: vector<vector<u8>>,
    required: bool,
}
public struct Survey has key {
    id: UID,
    vault_id: ID,
    creator: address,
    content_hash: vector<u8>,
    encrypted_content: Option<vector<u8>>,
    survey_blob_id: Option<vector<u8>>,
    survey_blob_object_id: Option<ID>,
    schema_hash: vector<u8>,
    creator_pub_key: vector<u8>,
    status: u8,
    registered_at_ms: u64,
    allowed_sources: vector<u8>,
    allowed_nullifiers: vector<vector<u8>>,
    match_threshold: u64,
    disclosure_rule_blob: Option<vector<u8>>,
    stage1_survey_id: Option<ID>,
    claim_mode: u8,
}
public struct SurveyRegistry has key {
    id: UID,
    surveys_by_creator: Table<address, vector<ID>>,
    registered_hashes: Table<vector<u8>, address>,
    registered_vaults: Table<ID, ID>,
    total_count: u64,
}
public struct SurveyRegistered has copy, drop {
    survey_id: ID,
    vault_id: ID,
    creator: address,
    content_hash: vector<u8>,
    schema_hash: vector<u8>,
    question_count: u64,
    registered_at_ms: u64,
    allowed_sources: vector<u8>,
}
fun init(ctx: &mut TxContext) {
    transfer::share_object(SurveyRegistry {
        id: object::new(ctx),
        surveys_by_creator: table::new(ctx),
        registered_hashes: table::new(ctx),
        registered_vaults: table::new(ctx),
        total_count: 0,
    });
}
public fun new_question(
    id: vector<u8>,
    question_type: vector<u8>,
    prompt: vector<u8>,
    options: vector<vector<u8>>,
    required: bool,
): Question {
    Question {
        id,
        question_type,
        prompt,
        options,
        required,
    }
}
/// Validate fields and build a Survey; does not mutate registry tables (F63).
public(package) fun prepare_survey(
    vault_id: ID,
    content_hash: vector<u8>,
    encrypted_content: Option<vector<u8>>,
    survey_blob_id: Option<vector<u8>>,
    survey_blob_object_id: Option<ID>,
    schema_hash: vector<u8>,
    pub_key: vector<u8>,
    questions: vector<Question>,
    allowed_sources: vector<u8>,
    allowed_nullifiers: vector<vector<u8>>,
    match_threshold: u64,
    disclosure_rule_blob: Option<vector<u8>>,
    stage1_survey_id: Option<ID>,
    claim_mode: u8,
    clock: &Clock,
    ctx: &mut TxContext,
): Survey {
    assert!(!vector::is_empty(&allowed_sources), EEmptyAllowedSources);
    assert!(vector::length(&allowed_nullifiers) <= MAX_ALLOWED_NULLIFIERS, EAllowlistTooLarge);
    assert!(
        claim_mode == CLAIM_MODE_PASS_AUDIENCE || claim_mode == CLAIM_MODE_ONE_TIME_TICKET,
        EInvalidClaimMode,
    );
    if (option::is_some(&encrypted_content)) {
        assert!(!vector::is_empty(option::borrow(&encrypted_content)), EEmptyContent);
    };
    if (option::is_some(&survey_blob_id)) {
        assert!(!vector::is_empty(option::borrow(&survey_blob_id)), EEmptyContent);
        assert!(option::is_some(&survey_blob_object_id), EMissingBlobObjectId);
    };
    if (option::is_some(&survey_blob_object_id)) {
        assert!(option::is_some(&survey_blob_id), EMissingBlobObjectId);
    };
    assert!(option::is_some(&encrypted_content) || option::is_some(&survey_blob_id), EEmptyContent);
    let num_questions = vector::length(&questions);
    let mut i = 0;
    while (i < num_questions) {
        let q = &questions[i];
        let q_type = &q.question_type;
        let is_valid_type = (q_type == b"single_choice" ||
                             q_type == b"multi_choice" ||
                             q_type == b"text" ||
                             q_type == b"scale");
        assert!(is_valid_type, EInvalidQuestionType);
        assert!(vector::length(&q.options) <= MAX_OPTIONS_LIMIT, EOptionLimitExceeded);
        assert!(vector::length(&q.prompt) > 0, EEmptyQuestion);
        let mut j = i + 1;
        while (j < num_questions) {
            if (&questions[j].id == &q.id) {
                abort EDuplicateQuestionId
            };
            j = j + 1;
        };
        i = i + 1;
    };
    let creator = ctx.sender();
    let now_ms = clock::timestamp_ms(clock);
    Survey {
        id: object::new(ctx),
        vault_id,
        creator,
        content_hash,
        encrypted_content,
        survey_blob_id,
        survey_blob_object_id,
        schema_hash,
        creator_pub_key: pub_key,
        status: STATUS_ACTIVE,
        registered_at_ms: now_ms,
        allowed_sources,
        allowed_nullifiers,
        match_threshold,
        disclosure_rule_blob,
        stage1_survey_id,
        claim_mode,
    }
}

/// Atomically commit survey to registry after all validation passed (F63/F65).
public(package) fun commit_survey(
    registry: &mut SurveyRegistry,
    survey: Survey,
    num_questions: u64,
) {
    let vault_id = survey.vault_id;
    let content_hash = survey.content_hash;
    let creator = survey.creator;
    let schema_hash = survey.schema_hash;
    let registered_at_ms = survey.registered_at_ms;
    let allowed_sources = survey.allowed_sources;
    assert!(!table::contains(&registry.registered_hashes, content_hash), EDuplicateSurvey);
    assert!(!table::contains(&registry.registered_vaults, vault_id), EVaultAlreadyRegistered);
    let survey_id = object::id(&survey);
    table::add(&mut registry.registered_hashes, content_hash, creator);
    table::add(&mut registry.registered_vaults, vault_id, survey_id);
    event::emit(SurveyRegistered {
        survey_id,
        vault_id,
        creator,
        content_hash,
        schema_hash,
        question_count: num_questions,
        registered_at_ms,
        allowed_sources,
    });
    if (table::contains(&registry.surveys_by_creator, creator)) {
        table::borrow_mut(&mut registry.surveys_by_creator, creator).push_back(survey_id);
    } else {
        table::add(&mut registry.surveys_by_creator, creator, vector[survey_id]);
    };
    registry.total_count = registry.total_count + 1;
    transfer::share_object(survey);
}
/// Re-share survey after partial purge (transfer must occur in this module).
public fun share_survey(survey: Survey) {
    transfer::share_object(survey);
}
public fun archive(survey: &mut Survey, ctx: &TxContext) {
    assert!(ctx.sender() == survey.creator, ENotCreator);
    survey.status = STATUS_ARCHIVED;
}
public(package) fun remove_and_destroy(registry: &mut SurveyRegistry, survey: Survey) {
    let Survey {
        id,
        vault_id,
        creator,
        content_hash,
        encrypted_content: _,
        survey_blob_id: _,
        survey_blob_object_id: _,
        schema_hash: _,
        creator_pub_key: _,
        status: _,
        registered_at_ms: _,
        allowed_sources: _,
        allowed_nullifiers: _,
        match_threshold: _,
        disclosure_rule_blob: _,
        stage1_survey_id: _,
        claim_mode: _,
    } = survey;
    let survey_id = object::uid_to_inner(&id);
    if (table::contains(&registry.surveys_by_creator, creator)) {
        let ids = table::borrow_mut(&mut registry.surveys_by_creator, creator);
        let (found, idx) = vector::index_of(ids, &survey_id);
        if (found) {
            vector::remove(ids, idx);
        };
        if (vector::is_empty(ids)) {
            table::remove(&mut registry.surveys_by_creator, creator);
        };
    };
    if (table::contains(&registry.registered_hashes, content_hash)) {
        table::remove(&mut registry.registered_hashes, content_hash);
    };
    if (table::contains(&registry.registered_vaults, vault_id)) {
        table::remove(&mut registry.registered_vaults, vault_id);
    };
    if (registry.total_count > 0) {
        registry.total_count = registry.total_count - 1;
    };
    object::delete(id);
}
public fun vault_id(survey: &Survey): ID            { survey.vault_id }
public fun creator(survey: &Survey): address         { survey.creator }
public fun content_hash(survey: &Survey): vector<u8> { survey.content_hash }
public fun encrypted_content(survey: &Survey): Option<vector<u8>> { survey.encrypted_content }
public fun survey_blob_id(survey: &Survey): Option<vector<u8>> { survey.survey_blob_id }
public fun survey_blob_object_id(survey: &Survey): Option<ID> { survey.survey_blob_object_id }
public fun schema_hash(survey: &Survey): vector<u8> { survey.schema_hash }
public fun creator_pub_key(survey: &Survey): vector<u8> { survey.creator_pub_key }
public fun status(survey: &Survey): u8              { survey.status }
public fun registered_at_ms(survey: &Survey): u64   { survey.registered_at_ms }
public fun allowed_sources(survey: &Survey): vector<u8> { survey.allowed_sources }
public fun allowed_nullifiers(survey: &Survey): vector<vector<u8>> { survey.allowed_nullifiers }
public fun match_threshold(survey: &Survey): u64 { survey.match_threshold }
public fun disclosure_rule_blob(survey: &Survey): Option<vector<u8>> { survey.disclosure_rule_blob }
public fun stage1_survey_id(survey: &Survey): Option<ID> { survey.stage1_survey_id }
public fun claim_mode(survey: &Survey): u8 { survey.claim_mode }
public fun total_count(registry: &SurveyRegistry): u64 { registry.total_count }
public fun surveys_by_creator(registry: &SurveyRegistry, creator: address): vector<ID> {
    if (table::contains(&registry.surveys_by_creator, creator)) {
        *table::borrow(&registry.surveys_by_creator, creator)
    } else {
        vector[]
    }
}
public fun survey_id_for_vault(registry: &SurveyRegistry, vault_id: ID): Option<ID> {
    if (table::contains(&registry.registered_vaults, vault_id)) {
        option::some(*table::borrow(&registry.registered_vaults, vault_id))
    } else {
        option::none()
    }
}
#[test_only]
public fun is_content_hash_registered(registry: &SurveyRegistry, content_hash: vector<u8>): bool {
    table::contains(&registry.registered_hashes, content_hash)
}
public fun vault_id_from_event(event: &SurveyRegistered): ID            { event.vault_id }
public fun content_hash_from_event(event: &SurveyRegistered): vector<u8> { event.content_hash }
public fun schema_hash_from_event(event: &SurveyRegistered): vector<u8> { event.schema_hash }
public fun question_count_from_event(event: &SurveyRegistered): u64   { event.question_count }
public fun registered_at_ms_from_event(event: &SurveyRegistered): u64   { event.registered_at_ms }
public fun allowed_sources_from_event(event: &SurveyRegistered): vector<u8> { event.allowed_sources }
#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}
#[test_only]
public fun create_survey_with_eligibility_for_testing(
    vault_id: ID,
    creator: address,
    content_hash: vector<u8>,
    encrypted_content: Option<vector<u8>>,
    survey_blob_id: Option<vector<u8>>,
    schema_hash: vector<u8>,
    creator_pub_key: vector<u8>,
    allowed_sources: vector<u8>,
    allowed_nullifiers: vector<vector<u8>>,
    match_threshold: u64,
    claim_mode: u8,
    ctx: &mut TxContext,
): Survey {
    Survey {
        id: object::new(ctx),
        vault_id,
        creator,
        content_hash,
        encrypted_content,
        survey_blob_id,
        survey_blob_object_id: option::none(),
        schema_hash,
        creator_pub_key,
        status: 0,
        registered_at_ms: 0,
        allowed_sources,
        allowed_nullifiers,
        match_threshold,
        disclosure_rule_blob: option::none(),
        stage1_survey_id: option::none(),
        claim_mode,
    }
}
#[test_only]
public fun create_survey_for_testing(
    vault_id: ID,
    creator: address,
    content_hash: vector<u8>,
    encrypted_content: Option<vector<u8>>,
    survey_blob_id: Option<vector<u8>>,
    schema_hash: vector<u8>,
    creator_pub_key: vector<u8>,
    allowed_sources: vector<u8>,
    ctx: &mut TxContext,
): Survey {
    Survey {
        id: object::new(ctx),
        vault_id,
        creator,
        content_hash,
        encrypted_content,
        survey_blob_id,
        survey_blob_object_id: option::none(),
        schema_hash,
        creator_pub_key,
        status: 0,
        registered_at_ms: 0,
        allowed_sources,
        allowed_nullifiers: vector[],
        match_threshold: 0,
        disclosure_rule_blob: option::none(),
        stage1_survey_id: option::none(),
        claim_mode: CLAIM_MODE_PASS_AUDIENCE,
    }
}
#[test_only]
public fun prepare_survey_for_testing(
    vault_id: ID,
    content_hash: vector<u8>,
    encrypted_content: Option<vector<u8>>,
    survey_blob_id: Option<vector<u8>>,
    survey_blob_object_id: Option<ID>,
    schema_hash: vector<u8>,
    pub_key: vector<u8>,
    questions: vector<Question>,
    allowed_sources: vector<u8>,
    allowed_nullifiers: vector<vector<u8>>,
    match_threshold: u64,
    disclosure_rule_blob: Option<vector<u8>>,
    stage1_survey_id: Option<ID>,
    claim_mode: u8,
    clock: &Clock,
    ctx: &mut TxContext,
): Survey {
    prepare_survey(
        vault_id,
        content_hash,
        encrypted_content,
        survey_blob_id,
        survey_blob_object_id,
        schema_hash,
        pub_key,
        questions,
        allowed_sources,
        allowed_nullifiers,
        match_threshold,
        disclosure_rule_blob,
        stage1_survey_id,
        claim_mode,
        clock,
        ctx,
    )
}

#[test_only]
public fun destroy_survey_for_testing(survey: Survey) {
    let Survey {
        id,
        vault_id: _,
        creator: _,
        content_hash: _,
        encrypted_content: _,
        survey_blob_id: _,
        survey_blob_object_id: _,
        schema_hash: _,
        creator_pub_key: _,
        status: _,
        registered_at_ms: _,
        allowed_sources: _,
        allowed_nullifiers: _,
        match_threshold: _,
        disclosure_rule_blob: _,
        stage1_survey_id: _,
        claim_mode: _,
    } = survey;
    object::delete(id);
}
