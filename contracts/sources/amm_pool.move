module surveysui::amm_pool;
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;
use surveysui::stacked_survey_reward::{Self, SsrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_reward::{Self, SrTreasury, SURVEY_REWARD};
const ENotAdmin: u64             = 0;
const EZeroAmount: u64           = 1;
const EInsufficientOutput: u64   = 2;
const EInsufficientLiquidity: u64 = 3;
const EInvalidFeeConfig: u64     = 4;
const EUnequalBurnAmount: u64    = 5;
const BONDING_DECAY: u128 = 1_000_000_000_000;
const INITIAL_SSR_PER_SUI: u128 = 1000;
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
    total_sui_invested: u128,
    admin: address,
    fee_config: FeeConfig,
}
public fun init_pool(admin: address, ctx: &mut TxContext) {
    transfer::share_object(Pool {
        id: object::new(ctx),
        sui_reserve: balance::zero(),
        sr_reserve: balance::zero(),
        total_sui_invested: 0,
        admin,
        fee_config: FeeConfig {
            total_fee_bps: DEFAULT_TOTAL_FEE_BPS,
            discount_bps: DEFAULT_DISCOUNT_BPS,
        },
    });
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
    sr_treasury: &mut SrTreasury,
    ssr_treasury: &mut SsrTreasury,
    sui_in: Coin<SUI>,
    ctx: &mut TxContext,
): Coin<STACKED_SURVEY_REWARD> {
    let sui_amount = coin::value(&sui_in);
    assert!(sui_amount > 0, EZeroAmount);
    let ssr_amount = compute_ssr_amount(sui_amount, pool.total_sui_invested);
    assert!(ssr_amount > 0, EInsufficientOutput);
    pool.total_sui_invested = pool.total_sui_invested + (sui_amount as u128);
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
public fun admin_burn_pair(
    pool: &Pool,
    sr_treasury: &mut SrTreasury,
    ssr_treasury: &mut SsrTreasury,
    sr_in: Coin<SURVEY_REWARD>,
    ssr_in: Coin<STACKED_SURVEY_REWARD>,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == pool.admin, ENotAdmin);
    let sr_amount = coin::value(&sr_in);
    let ssr_amount = coin::value(&ssr_in);
    assert!(sr_amount > 0, EZeroAmount);
    assert!(sr_amount == ssr_amount, EUnequalBurnAmount);
    survey_reward::burn(sr_treasury, sr_in);
    stacked_survey_reward::burn(ssr_treasury, ssr_in);
    event::emit(SrSsrBurned {
        admin: pool.admin,
        amount: sr_amount,
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
public fun total_sui_invested(pool: &Pool): u128   { pool.total_sui_invested }
public fun admin(pool: &Pool): address             { pool.admin }
public fun fee_config(pool: &Pool): &FeeConfig     { &pool.fee_config }
public fun fee_total_bps(fee: &FeeConfig): u64     { fee.total_fee_bps }
public fun fee_discount_bps(fee: &FeeConfig): u64  { fee.discount_bps }
fun compute_ssr_amount(sui_mist: u64, total_invested_mist: u128): u64 {
    let si   = sui_mist as u256;
    let decay = BONDING_DECAY as u256;
    let total = total_invested_mist as u256;
    let mult = INITIAL_SSR_PER_SUI as u256;
    let num = si * mult * decay;
    let den = decay + total;
    (num / den) as u64
}
#[test_only]
public fun compute_ssr_amount_for_test(sui_mist: u64, total_invested_mist: u128): u64 {
    compute_ssr_amount(sui_mist, total_invested_mist)
}
