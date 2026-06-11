module surveysui::amm_pool;
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, ID};
use sui::sui::SUI;
use surveysui::stacked_survey_reward::{Self, SsrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_reward::{Self, SrTreasury, SURVEY_REWARD};
const ENotAdmin: u64             = 0;
const EZeroAmount: u64           = 1;
const EInsufficientOutput: u64   = 2;
const EInsufficientLiquidity: u64 = 3;
const EInvalidFeeConfig: u64     = 4;
const ENotCanonicalPool: u64     = 6;
const EPoolAlreadyRegistered: u64 = 7;
const EInvalidPurgeBatch: u64    = 9;
const DEFAULT_PURGE_ANSWERS_BATCH: u64 = 100;
/// Human units: 1 SUI → 1000 SR/SSR at bootstrap (DECIMALS=6).
const INITIAL_SSR_PER_SUI: u128 = 1000;
/// 10^(9 - DECIMALS) for bootstrap divisor (DECIMALS=6 → 1000).
const BOOTSTRAP_DIVISOR: u128 = 1000;
const DEFAULT_TOTAL_FEE_BPS: u64 = 2000;
const DEFAULT_DISCOUNT_BPS: u64  = 5000;
public struct FeeConfig has store, copy, drop {
    total_fee_bps: u64,
    discount_bps: u64,
}
public struct Pool has key {
    id: UID,
    sui_reserve: Balance<SUI>,
    sr_reserve: Balance<SURVEY_REWARD>,
    admin: address,
    fee_config: FeeConfig,
}
/// Shared protocol config: only the registered canonical pool may mint SSR or set vault fees.
public struct ProtocolConfig has key {
    id: UID,
    admin: address,
    canonical_pool_id: Option<ID>,
    min_gas_compensation_mist: u64,
    purge_answers_batch: u64,
}
public fun create_protocol_config(ctx: &mut TxContext) {
    transfer::share_object(ProtocolConfig {
        id: object::new(ctx),
        admin: ctx.sender(),
        canonical_pool_id: option::none(),
        min_gas_compensation_mist: 0,
        purge_answers_batch: DEFAULT_PURGE_ANSWERS_BATCH,
    });
}
public fun configure_protocol_limits(
    config: &mut ProtocolConfig,
    min_gas_compensation_mist: u64,
    purge_answers_batch: u64,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    assert!(purge_answers_batch >= 1, EInvalidPurgeBatch);
    config.min_gas_compensation_mist = min_gas_compensation_mist;
    config.purge_answers_batch = purge_answers_batch;
}
public fun set_min_gas_compensation_mist(
    config: &mut ProtocolConfig,
    amount: u64,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    config.min_gas_compensation_mist = amount;
}
public fun set_purge_answers_batch(
    config: &mut ProtocolConfig,
    batch: u64,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    assert!(batch >= 1, EInvalidPurgeBatch);
    config.purge_answers_batch = batch;
}
public fun min_gas_compensation_mist(config: &ProtocolConfig): u64 {
    config.min_gas_compensation_mist
}
public fun purge_answers_batch(config: &ProtocolConfig): u64 {
    config.purge_answers_batch
}
#[test_only]
public fun configure_protocol_limits_for_test(
    config: &mut ProtocolConfig,
    min_gas_compensation_mist: u64,
    purge_answers_batch: u64,
) {
    assert!(purge_answers_batch >= 1, EInvalidPurgeBatch);
    config.min_gas_compensation_mist = min_gas_compensation_mist;
    config.purge_answers_batch = purge_answers_batch;
}
public fun bootstrap_canonical_pool(
    config: &mut ProtocolConfig,
    admin: address,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    assert!(option::is_none(&config.canonical_pool_id), EPoolAlreadyRegistered);
    let pool = Pool {
        id: object::new(ctx),
        sui_reserve: balance::zero(),
        sr_reserve: balance::zero(),
        admin,
        fee_config: FeeConfig {
            total_fee_bps: DEFAULT_TOTAL_FEE_BPS,
            discount_bps: DEFAULT_DISCOUNT_BPS,
        },
    };
    let pool_id = object::id(&pool);
    transfer::share_object(pool);
    config.canonical_pool_id = option::some(pool_id);
}
public fun register_canonical_pool(
    config: &mut ProtocolConfig,
    pool: &Pool,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    assert!(option::is_none(&config.canonical_pool_id), EPoolAlreadyRegistered);
    config.canonical_pool_id = option::some(object::id(pool));
}
public fun assert_canonical_pool(config: &ProtocolConfig, pool: &Pool) {
    let expected = *option::borrow(&config.canonical_pool_id);
    assert!(object::id(pool) == expected, ENotCanonicalPool);
}
#[test_only]
public fun init_pool_for_test(admin: address, ctx: &mut TxContext) {
    transfer::share_object(Pool {
        id: object::new(ctx),
        sui_reserve: balance::zero(),
        sr_reserve: balance::zero(),
        admin,
        fee_config: FeeConfig {
            total_fee_bps: DEFAULT_TOTAL_FEE_BPS,
            discount_bps: DEFAULT_DISCOUNT_BPS,
        },
    });
}
#[test_only]
public fun register_canonical_pool_for_test(
    config: &mut ProtocolConfig,
    pool: &Pool,
) {
    config.canonical_pool_id = option::some(object::id(pool));
}
public fun effective(fee: &FeeConfig): u64 {
    fee.total_fee_bps * fee.discount_bps / 10_000
}
public fun set_fee_config(
    pool: &mut Pool,
    total_fee_bps: u64,
    discount_bps: u64,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == pool.admin, ENotAdmin);
    assert!(total_fee_bps <= 10_000, EInvalidFeeConfig);
    assert!(discount_bps <= 10_000, EInvalidFeeConfig);
    pool.fee_config = FeeConfig { total_fee_bps, discount_bps };
}
public fun invest_and_mint(
    pool: &mut Pool,
    config: &ProtocolConfig,
    sr_treasury: &mut SrTreasury,
    ssr_treasury: &mut SsrTreasury,
    sui_in: Coin<SUI>,
    min_ssr_out: u64,
    ctx: &mut TxContext,
): Coin<STACKED_SURVEY_REWARD> {
    assert_canonical_pool(config, pool);
    let sui_amount = coin::value(&sui_in);
    assert!(sui_amount > 0, EZeroAmount);
    let sui_res = balance::value(&pool.sui_reserve);
    let sr_res = balance::value(&pool.sr_reserve);
    let ssr_amount = compute_ssr_amount(sui_amount, sui_res, sr_res);
    assert!(ssr_amount > 0, EInsufficientOutput);
    assert!(ssr_amount >= min_ssr_out, EInsufficientOutput);
    balance::join(&mut pool.sui_reserve, coin::into_balance(sui_in));
    let sr_coin = survey_reward::mint(sr_treasury, ssr_amount, ctx);
    balance::join(&mut pool.sr_reserve, coin::into_balance(sr_coin));
    stacked_survey_reward::mint(ssr_treasury, ssr_amount, ctx)
}
public fun admin_withdraw_sui(
    pool: &mut Pool,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(ctx.sender() == pool.admin, ENotAdmin);
    assert!(balance::value(&pool.sui_reserve) >= amount, EInsufficientLiquidity);
    coin::from_balance(balance::split(&mut pool.sui_reserve, amount), ctx)
}
/// Burns admin-held SSR and splits matching SR from pool `sr_reserve`.
public fun admin_burn_pair(
    pool: &mut Pool,
    sr_treasury: &mut SrTreasury,
    ssr_treasury: &mut SsrTreasury,
    ssr_in: Coin<STACKED_SURVEY_REWARD>,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == pool.admin, ENotAdmin);
    let amount = coin::value(&ssr_in);
    assert!(amount > 0, EZeroAmount);
    assert!(balance::value(&pool.sr_reserve) >= amount, EInsufficientLiquidity);
    let sr_balance = balance::split(&mut pool.sr_reserve, amount);
    let sr_coin = coin::from_balance(sr_balance, ctx);
    survey_reward::burn(sr_treasury, sr_coin);
    stacked_survey_reward::burn(ssr_treasury, ssr_in);
    event::emit(SrSsrBurned {
        admin: pool.admin,
        amount,
        sr_supply_after: survey_reward::total_supply(sr_treasury),
        ssr_supply_after: stacked_survey_reward::total_supply(ssr_treasury),
    });
}
public struct SrSsrBurned has copy, drop {
    admin: address,
    amount: u64,
    sr_supply_after: u64,
    ssr_supply_after: u64,
}
public fun sui_reserve(pool: &Pool): u64           { balance::value(&pool.sui_reserve) }
public fun sr_reserve(pool: &Pool): u64            { balance::value(&pool.sr_reserve) }
public fun admin(pool: &Pool): address             { pool.admin }
public fun fee_config(pool: &Pool): &FeeConfig     { &pool.fee_config }
public fun fee_total_bps(fee: &FeeConfig): u64     { fee.total_fee_bps }
public fun fee_discount_bps(fee: &FeeConfig): u64  { fee.discount_bps }
public fun canonical_pool_id(config: &ProtocolConfig): Option<ID> { config.canonical_pool_id }
fun compute_ssr_amount(sui_mist: u64, sui_reserve: u64, sr_reserve: u64): u64 {
    let si = sui_mist as u256;
    if (sui_reserve == 0 || sr_reserve == 0) {
        let mult = INITIAL_SSR_PER_SUI as u256;
        let div = BOOTSTRAP_DIVISOR as u256;
        (si * mult / div) as u64
    } else {
        let sr = sr_reserve as u256;
        let sui = sui_reserve as u256;
        (si * sr / sui) as u64
    }
}
#[test_only]
public fun compute_ssr_amount_for_test(sui_mist: u64, sui_reserve: u64, sr_reserve: u64): u64 {
    compute_ssr_amount(sui_mist, sui_reserve, sr_reserve)
}
