module surveysui::survey_registry;

use sui::clock::{Self, Clock};
use sui::event;
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

const MAX_OPTIONS_LIMIT: u64 = 50;

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
    encrypted_content: vector<u8>,
    schema_hash: vector<u8>,
    creator_pub_key: vector<u8>,
    status: u8,
    registered_at_ms: u64,
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
    encrypted_content: vector<u8>,
    schema_hash: vector<u8>,
    pub_key: vector<u8>,
    questions: vector<Question>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // 1. Duplicate check (INV-5)
    assert!(!table::contains(&registry.registered_hashes, content_hash), EDuplicateSurvey);
    table::add(&mut registry.registered_hashes, content_hash, ctx.sender());

    // 2. Validate questions structure
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
        schema_hash,
        creator_pub_key: pub_key,
        status: STATUS_ACTIVE,
        registered_at_ms: now_ms,
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

// ── view functions ────────────────────────────────────────────────────────────

public fun vault_id(survey: &Survey): ID            { survey.vault_id }
public fun creator(survey: &Survey): address         { survey.creator }
public fun content_hash(survey: &Survey): vector<u8> { survey.content_hash }
public fun encrypted_content(survey: &Survey): vector<u8> { survey.encrypted_content }
public fun schema_hash(survey: &Survey): vector<u8> { survey.schema_hash }
public fun creator_pub_key(survey: &Survey): vector<u8> { survey.creator_pub_key }
public fun status(survey: &Survey): u8              { survey.status }
public fun registered_at_ms(survey: &Survey): u64   { survey.registered_at_ms }
public fun total_count(registry: &SurveyRegistry): u64 { registry.total_count }

/// Returns the list of survey IDs registered by `creator`, or an empty vector.
public fun surveys_by_creator(registry: &SurveyRegistry, creator: address): vector<ID> {
    if (table::contains(&registry.surveys_by_creator, creator)) {
        *table::borrow(&registry.surveys_by_creator, creator)
    } else {
        vector[]
    }
}

// ── event getters ─────────────────────────────────────────────────────────────

public fun vault_id_from_event(event: &SurveyRegistered): ID            { event.vault_id }
public fun content_hash_from_event(event: &SurveyRegistered): vector<u8> { event.content_hash }
public fun schema_hash_from_event(event: &SurveyRegistered): vector<u8> { event.schema_hash }
public fun question_count_from_event(event: &SurveyRegistered): u64   { event.question_count }
public fun registered_at_ms_from_event(event: &SurveyRegistered): u64   { event.registered_at_ms }

// ── test helpers ──────────────────────────────────────────────────────────────

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}
