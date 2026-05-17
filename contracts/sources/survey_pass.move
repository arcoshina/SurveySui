module surveysui::survey_pass;

use sui::clock::{Self, Clock};
use sui::table::{Self, Table};

const STATUS_ACTIVE: u8 = 0;
const STATUS_REVOKED: u8 = 1;
const STATUS_SUPERSEDED: u8 = 2;

const ENotAdmin: u64 = 0;
const EAlreadyActive: u64 = 1;
const ENotActive: u64 = 2;

/// Soulbound survey pass — `key` only (no `store`) prevents `public_transfer`.
/// Shared so admin can revoke without user co-signing.
public struct SurveyPass has key {
    id: UID,
    sub_hash: vector<u8>,
    serial: u64,
    issued_at_ms: u64,
    expires_at_ms: u64,
    status: u8,
}

/// Shared registry: maps sub_hash → active serial.
public struct PassRegistry has key {
    id: UID,
    active_serial_by_sub: Table<vector<u8>, u64>,
    next_serial: u64,
    admin: address,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(PassRegistry {
        id: object::new(ctx),
        active_serial_by_sub: table::new(ctx),
        next_serial: 0,
        admin: ctx.sender(),
    });
}

/// Issue a new SurveyPass for `sub_hash`. Aborts if sub already has an active pass.
public fun issue(
    registry: &mut PassRegistry,
    sub_hash: vector<u8>,
    ttl_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == registry.admin, ENotAdmin);
    assert!(!table::contains(&registry.active_serial_by_sub, sub_hash), EAlreadyActive);

    let serial = registry.next_serial;
    registry.next_serial = registry.next_serial + 1;

    let now_ms = clock::timestamp_ms(clock);
    table::add(&mut registry.active_serial_by_sub, sub_hash, serial);
    transfer::share_object(SurveyPass {
        id: object::new(ctx),
        sub_hash,
        serial,
        issued_at_ms: now_ms,
        expires_at_ms: now_ms + ttl_ms,
        status: STATUS_ACTIVE,
    });
}

/// Mark pass REVOKED and remove from registry.
public fun revoke(
    registry: &mut PassRegistry,
    pass: &mut SurveyPass,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == registry.admin, ENotAdmin);
    assert!(pass.status == STATUS_ACTIVE, ENotActive);
    table::remove(&mut registry.active_serial_by_sub, pass.sub_hash);
    pass.status = STATUS_REVOKED;
}

/// Mark old pass SUPERSEDED and issue a fresh one for the same sub_hash.
public fun reissue(
    registry: &mut PassRegistry,
    old_pass: &mut SurveyPass,
    ttl_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == registry.admin, ENotAdmin);
    assert!(old_pass.status == STATUS_ACTIVE, ENotActive);

    let sub_hash = old_pass.sub_hash;
    table::remove(&mut registry.active_serial_by_sub, sub_hash);
    old_pass.status = STATUS_SUPERSEDED;

    let serial = registry.next_serial;
    registry.next_serial = registry.next_serial + 1;

    let now_ms = clock::timestamp_ms(clock);
    table::add(&mut registry.active_serial_by_sub, sub_hash, serial);
    transfer::share_object(SurveyPass {
        id: object::new(ctx),
        sub_hash,
        serial,
        issued_at_ms: now_ms,
        expires_at_ms: now_ms + ttl_ms,
        status: STATUS_ACTIVE,
    });
}

public fun transfer_admin(registry: &mut PassRegistry, new_admin: address, ctx: &mut TxContext) {
    assert!(ctx.sender() == registry.admin, ENotAdmin);
    registry.admin = new_admin;
}

/// Returns true iff pass is ACTIVE and has not expired.
public fun is_valid(pass: &SurveyPass, clock: &Clock): bool {
    pass.status == STATUS_ACTIVE && clock::timestamp_ms(clock) < pass.expires_at_ms
}

public fun status(pass: &SurveyPass): u8           { pass.status }
public fun sub_hash(pass: &SurveyPass): vector<u8>  { pass.sub_hash }
public fun serial(pass: &SurveyPass): u64           { pass.serial }
public fun expires_at_ms(pass: &SurveyPass): u64    { pass.expires_at_ms }
public fun issued_at_ms(pass: &SurveyPass): u64     { pass.issued_at_ms }
public fun admin(registry: &PassRegistry): address  { registry.admin }
public fun has_active_pass(registry: &PassRegistry, sub_hash: vector<u8>): bool {
    table::contains(&registry.active_serial_by_sub, sub_hash)
}
public fun active_serial(registry: &PassRegistry, sub_hash: vector<u8>): u64 {
    *table::borrow(&registry.active_serial_by_sub, sub_hash)
}

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}
