module surveysui::participant_sbt;

use sui::clock::{Self, Clock};
use sui::table::{Self, Table};

// ── status constants ──────────────────────────────────────────────────────────

const STATUS_ACTIVE: u8 = 0;
const STATUS_REVOKED: u8 = 1;
const STATUS_SUPERSEDED: u8 = 2;

// ── error codes ───────────────────────────────────────────────────────────────

const ENotAdmin: u64 = 0;
const EAlreadyActive: u64 = 1;
const ENotActive: u64 = 2;

// ── structs ───────────────────────────────────────────────────────────────────

/// Soulbound passport — `key` only (no `store`) prevents `public_transfer`.
/// Issued as a shared object so the admin can revoke/reissue without user co-signing.
public struct ParticipantSBT has key {
    id: UID,
    sub_hash: vector<u8>,
    serial: u64,
    issued_at_ms: u64,
    expires_at_ms: u64,
    status: u8,
}

/// Shared registry: maps sub_hash → active serial.
public struct SbtRegistry has key {
    id: UID,
    active_serial_by_sub: Table<vector<u8>, u64>,
    next_serial: u64,
    admin: address,
}

// ── init ──────────────────────────────────────────────────────────────────────

fun init(ctx: &mut TxContext) {
    transfer::share_object(SbtRegistry {
        id: object::new(ctx),
        active_serial_by_sub: table::new(ctx),
        next_serial: 0,
        admin: ctx.sender(),
    });
}

// ── admin operations ──────────────────────────────────────────────────────────

/// Issue a new SBT for `sub_hash`. Aborts if sub already has an active SBT.
public fun issue(
    registry: &mut SbtRegistry,
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
    transfer::share_object(ParticipantSBT {
        id: object::new(ctx),
        sub_hash,
        serial,
        issued_at_ms: now_ms,
        expires_at_ms: now_ms + ttl_ms,
        status: STATUS_ACTIVE,
    });
}

/// Mark `sbt` REVOKED and remove it from the registry. Aborts if not currently ACTIVE.
public fun revoke(
    registry: &mut SbtRegistry,
    sbt: &mut ParticipantSBT,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == registry.admin, ENotAdmin);
    assert!(sbt.status == STATUS_ACTIVE, ENotActive);
    table::remove(&mut registry.active_serial_by_sub, sbt.sub_hash);
    sbt.status = STATUS_REVOKED;
}

/// Mark `old_sbt` SUPERSEDED and issue a fresh SBT for the same sub_hash.
public fun reissue(
    registry: &mut SbtRegistry,
    old_sbt: &mut ParticipantSBT,
    ttl_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == registry.admin, ENotAdmin);
    assert!(old_sbt.status == STATUS_ACTIVE, ENotActive);

    let sub_hash = old_sbt.sub_hash; // copy (vector<u8> has copy)
    table::remove(&mut registry.active_serial_by_sub, sub_hash);
    old_sbt.status = STATUS_SUPERSEDED;

    let serial = registry.next_serial;
    registry.next_serial = registry.next_serial + 1;

    let now_ms = clock::timestamp_ms(clock);
    table::add(&mut registry.active_serial_by_sub, sub_hash, serial);
    transfer::share_object(ParticipantSBT {
        id: object::new(ctx),
        sub_hash,
        serial,
        issued_at_ms: now_ms,
        expires_at_ms: now_ms + ttl_ms,
        status: STATUS_ACTIVE,
    });
}

/// Transfer admin rights to `new_admin`. Only the current admin may call this.
public fun transfer_admin(
    registry: &mut SbtRegistry,
    new_admin: address,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == registry.admin, ENotAdmin);
    registry.admin = new_admin;
}

// ── view functions ────────────────────────────────────────────────────────────

/// Returns true iff the SBT is ACTIVE and has not expired.
public fun is_valid(sbt: &ParticipantSBT, clock: &Clock): bool {
    sbt.status == STATUS_ACTIVE && clock::timestamp_ms(clock) < sbt.expires_at_ms
}

public fun status(sbt: &ParticipantSBT): u8          { sbt.status }
public fun sub_hash(sbt: &ParticipantSBT): vector<u8> { sbt.sub_hash }
public fun serial(sbt: &ParticipantSBT): u64          { sbt.serial }
public fun expires_at_ms(sbt: &ParticipantSBT): u64   { sbt.expires_at_ms }
public fun issued_at_ms(sbt: &ParticipantSBT): u64    { sbt.issued_at_ms }
public fun admin(registry: &SbtRegistry): address     { registry.admin }
public fun has_active_sbt(registry: &SbtRegistry, sub_hash: vector<u8>): bool {
    table::contains(&registry.active_serial_by_sub, sub_hash)
}
public fun active_serial(registry: &SbtRegistry, sub_hash: vector<u8>): u64 {
    *table::borrow(&registry.active_serial_by_sub, sub_hash)
}

// ── test helpers ──────────────────────────────────────────────────────────────

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}
