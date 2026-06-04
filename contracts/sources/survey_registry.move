module surveysui::survey_registry;

use std::option::{Self, Option};
use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, ID};
use sui::sui::SUI;
use sui::table::{Self, Table};

// ── status constants ──────────────────────────────────────────────────────────

const STATUS_ACTIVE: u8   = 0;
const STATUS_ARCHIVED: u8 = 1;

// ── error codes ───────────────────────────────────────────────────────────────

const ENotCreator: u64 = 0;
const EDuplicateSurvey: u64 = 1;
const EInvalidQuestionType: u64 = 2;
const EOptionLimitExceeded: u64 = 3;
const EEmptyQuestion: u64 = 4;
const EDuplicateQuestionId: u64 = 5;
const EInvalidMinTier: u64 = 6;
const EEmptyContent: u64 = 7;

const MAX_OPTIONS_LIMIT: u64 = 50;
const MAX_MIN_TIER: u8 = 3;

// ── structs ───────────────────────────────────────────────────────────────────

public struct Question has copy, drop, store {
    id: vector<u8>,
    question_type: vector<u8>, // single_choice, multi_choice, text, scale
    prompt: vector<u8>,
    options: vector<vector<u8>>,
    required: bool,
}

/// On-chain survey record. Shared so anyone can read it.
public struct Survey has key {
    id: UID,
    vault_id: ID,
    creator: address,
    content_hash: vector<u8>,
    encrypted_content: Option<vector<u8>>,
    survey_blob_id: Option<vector<u8>>,
    schema_hash: vector<u8>,
    creator_pub_key: vector<u8>,
    status: u8,
    registered_at_ms: u64,
    min_tier: u8,
}

/// Shared registry: indexes survey IDs by creator for on-chain queries.
public struct SurveyRegistry has key {
    id: UID,
    surveys_by_creator: Table<address, vector<ID>>,
    registered_hashes: Table<vector<u8>, address>,
    total_count: u64,
}

// ── events ────────────────────────────────────────────────────────────────────

public struct SurveyRegistered has copy, drop {
    survey_id: ID,
    vault_id: ID,
    creator: address,
    content_hash: vector<u8>,
    schema_hash: vector<u8>,
    question_count: u64,
    registered_at_ms: u64,
    min_tier: u8,
}

// ── init ──────────────────────────────────────────────────────────────────────

fun init(ctx: &mut TxContext) {
    transfer::share_object(SurveyRegistry {
        id: object::new(ctx),
        surveys_by_creator: table::new(ctx),
        registered_hashes: table::new(ctx),
        total_count: 0,
    });
}

// ── public functions ──────────────────────────────────────────────────────────

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

/// Register a new survey. Emits `SurveyRegistered` for frontend event subscription.
/// The survey is shared immediately so anyone can read it.
public fun register(
    registry: &mut SurveyRegistry,
    vault_id: ID,
    content_hash: vector<u8>,
    encrypted_content: Option<vector<u8>>,
    survey_blob_id: Option<vector<u8>>,
    schema_hash: vector<u8>,
    pub_key: vector<u8>,
    questions: vector<Question>,
    min_tier: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // 1. Duplicate check (INV-5)
    assert!(!table::contains(&registry.registered_hashes, content_hash), EDuplicateSurvey);
    table::add(&mut registry.registered_hashes, content_hash, ctx.sender());

    // 2. min_tier validation
    assert!(min_tier <= MAX_MIN_TIER, EInvalidMinTier);

    // 3. Option empty validation
    if (option::is_some(&encrypted_content)) {
        assert!(!vector::is_empty(option::borrow(&encrypted_content)), EEmptyContent);
    };
    if (option::is_some(&survey_blob_id)) {
        assert!(!vector::is_empty(option::borrow(&survey_blob_id)), EEmptyContent);
    };
    assert!(option::is_some(&encrypted_content) || option::is_some(&survey_blob_id), EEmptyContent);

    // 4. Validate questions structure
    let num_questions = vector::length(&questions);
    let mut i = 0;
    while (i < num_questions) {
        let q = &questions[i];
        
        // Type whitelist
        let q_type = &q.question_type;
        let is_valid_type = (q_type == b"single_choice" || 
                             q_type == b"multi_choice" || 
                             q_type == b"text" || 
                             q_type == b"scale");
        assert!(is_valid_type, EInvalidQuestionType);

        // Option limit
        assert!(vector::length(&q.options) <= MAX_OPTIONS_LIMIT, EOptionLimitExceeded);

        // Empty question prompt
        assert!(vector::length(&q.prompt) > 0, EEmptyQuestion);

        // Duplicate ID check within the survey
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

    let survey = Survey {
        id: object::new(ctx),
        vault_id,
        creator,
        content_hash,
        encrypted_content,
        survey_blob_id,
        schema_hash,
        creator_pub_key: pub_key,
        status: STATUS_ACTIVE,
        registered_at_ms: now_ms,
        min_tier,
    };

    let survey_id = object::id(&survey);

    event::emit(SurveyRegistered {
        survey_id,
        vault_id,
        creator,
        content_hash,
        schema_hash,
        question_count: num_questions,
        registered_at_ms: now_ms,
        min_tier,
    });

    if (table::contains(&registry.surveys_by_creator, creator)) {
        table::borrow_mut(&mut registry.surveys_by_creator, creator).push_back(survey_id);
    } else {
        table::add(&mut registry.surveys_by_creator, creator, vector[survey_id]);
    };
    registry.total_count = registry.total_count + 1;

    transfer::share_object(survey);
}

/// Archive a survey. Only the original creator may call this.
public fun archive(survey: &mut Survey, ctx: &TxContext) {
    assert!(ctx.sender() == survey.creator, ENotCreator);
    survey.status = STATUS_ARCHIVED;
}

/// Remove a survey from the registry index and permanently delete the object.
/// Called by `survey_vault::purge` when a survey reaches end-of-life, so the
/// title content (`encrypted_content` / `survey_blob_id`) is destroyed too.
public(package) fun remove_and_destroy(registry: &mut SurveyRegistry, survey: Survey) {
    let Survey {
        id,
        vault_id: _,
        creator,
        content_hash,
        encrypted_content: _,
        survey_blob_id: _,
        schema_hash: _,
        creator_pub_key: _,
        status: _,
        registered_at_ms: _,
        min_tier: _,
    } = survey;

    let survey_id = object::uid_to_inner(&id);

    // Drop this survey_id from surveys_by_creator[creator]; tidy the bucket if empty.
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

    // Free the duplicate-content guard so the same content_hash could be reused.
    if (table::contains(&registry.registered_hashes, content_hash)) {
        table::remove(&mut registry.registered_hashes, content_hash);
    };

    if (registry.total_count > 0) {
        registry.total_count = registry.total_count - 1;
    };

    object::delete(id);
}

// ── view functions ────────────────────────────────────────────────────────────

public fun vault_id(survey: &Survey): ID            { survey.vault_id }
public fun creator(survey: &Survey): address         { survey.creator }
public fun content_hash(survey: &Survey): vector<u8> { survey.content_hash }
public fun encrypted_content(survey: &Survey): Option<vector<u8>> { survey.encrypted_content }
public fun survey_blob_id(survey: &Survey): Option<vector<u8>> { survey.survey_blob_id }
public fun schema_hash(survey: &Survey): vector<u8> { survey.schema_hash }
public fun creator_pub_key(survey: &Survey): vector<u8> { survey.creator_pub_key }
public fun status(survey: &Survey): u8              { survey.status }
public fun registered_at_ms(survey: &Survey): u64   { survey.registered_at_ms }
public fun min_tier(survey: &Survey): u8            { survey.min_tier }
public fun total_count(registry: &SurveyRegistry): u64 { registry.total_count }

/// Returns the list of survey IDs registered by `creator`, or an empty vector.
public fun surveys_by_creator(registry: &SurveyRegistry, creator: address): vector<ID> {
    if (table::contains(&registry.surveys_by_creator, creator)) {
        *table::borrow(&registry.surveys_by_creator, creator)
    } else {
        vector[]
    }
}

// ── package internal functions ────────────────────────────────────────────────

// ── event getters ─────────────────────────────────────────────────────────────

public fun vault_id_from_event(event: &SurveyRegistered): ID            { event.vault_id }
public fun content_hash_from_event(event: &SurveyRegistered): vector<u8> { event.content_hash }
public fun schema_hash_from_event(event: &SurveyRegistered): vector<u8> { event.schema_hash }
public fun question_count_from_event(event: &SurveyRegistered): u64   { event.question_count }
public fun registered_at_ms_from_event(event: &SurveyRegistered): u64   { event.registered_at_ms }
public fun min_tier_from_event(event: &SurveyRegistered): u8           { event.min_tier }

// ── test helpers ──────────────────────────────────────────────────────────────

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
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
    min_tier: u8,
    ctx: &mut TxContext,
): Survey {
    Survey {
        id: object::new(ctx),
        vault_id,
        creator,
        content_hash,
        encrypted_content,
        survey_blob_id,
        schema_hash,
        creator_pub_key,
        status: 0,
        registered_at_ms: 0,
        min_tier,
    }
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
        schema_hash: _,
        creator_pub_key: _,
        status: _,
        registered_at_ms: _,
        min_tier: _,
    } = survey;
    object::delete(id);
}

