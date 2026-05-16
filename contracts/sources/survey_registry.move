module surveysui::survey_registry;

use sui::clock::{Self, Clock};
use sui::event;
use sui::table::{Self, Table};

// ── status constants ──────────────────────────────────────────────────────────

const STATUS_ACTIVE: u8   = 0;
const STATUS_ARCHIVED: u8 = 1;

// ── error codes ───────────────────────────────────────────────────────────────

const ENotCreator: u64 = 0;

// ── events ────────────────────────────────────────────────────────────────────

public struct SurveyRegistered has copy, drop {
    survey_id: ID,
    vault_id: ID,
    creator: address,
    content_hash: vector<u8>,
    registered_at_ms: u64,
}

// ── structs ───────────────────────────────────────────────────────────────────

/// On-chain survey record. Shared so anyone can read it.
public struct Survey has key {
    id: UID,
    vault_id: ID,
    creator: address,
    content_hash: vector<u8>,
    status: u8,
    registered_at_ms: u64,
}

/// Shared registry: indexes survey IDs by creator for on-chain queries.
public struct SurveyRegistry has key {
    id: UID,
    surveys_by_creator: Table<address, vector<ID>>,
    total_count: u64,
}

// ── init ──────────────────────────────────────────────────────────────────────

fun init(ctx: &mut TxContext) {
    transfer::share_object(SurveyRegistry {
        id: object::new(ctx),
        surveys_by_creator: table::new(ctx),
        total_count: 0,
    });
}

// ── public functions ──────────────────────────────────────────────────────────

/// Register a new survey. Emits `SurveyRegistered` for frontend event subscription.
/// The survey is shared immediately so anyone can read it.
public fun register(
    registry: &mut SurveyRegistry,
    vault_id: ID,
    content_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let creator = ctx.sender();
    let now_ms = clock::timestamp_ms(clock);

    let survey = Survey {
        id: object::new(ctx),
        vault_id,
        creator,
        content_hash,
        status: STATUS_ACTIVE,
        registered_at_ms: now_ms,
    };

    let survey_id = object::id(&survey);

    event::emit(SurveyRegistered {
        survey_id,
        vault_id,
        creator,
        content_hash,
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

// ── test helpers ──────────────────────────────────────────────────────────────

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}
