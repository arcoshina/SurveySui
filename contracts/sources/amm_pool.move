module surveysui::amm_pool;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use surveysui::stacked_survey_reward::{Self, SsrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_reward::{Self, SrTreasury, SURVEY_REWARD};

// ── error codes ───────────────────────────────────────────────────────────────

const ENotAdmin: u64             = 0;
const EZeroAmount: u64           = 1;
const EInsufficientOutput: u64   = 2;
const EInsufficientLiquidity: u64 = 3;
const EInvalidFeeConfig: u64     = 4;

// ── bonding curve constants ───────────────────────────────────────────────────

/// Redemption fee: 0.3% in basis points.
const REDEEM_FEE_BPS: u64 = 30;

/// Bonding curve: ssr_base = sui_mist * INITIAL_SSR_PER_SUI * DECAY / (DECAY + total_sui_mist)
/// Initial ratio: 1 SUI → 1000 SSR (price halves after DECAY MIST = 1000 SUI invested).
const BONDING_DECAY: u128 = 1_000_000_000_000;

/// Initial SSR base units minted per MIST of SUI at total_invested = 0.
/// 1 MIST → 1000 SSR base; 1 SUI (1e9 MIST) → 1e12 SSR base = 1000 SSR units.
const INITIAL_SSR_PER_SUI: u128 = 1000;

// ── FeeConfig defaults ────────────────────────────────────────────────────────

/// 20% total fee, 50% discount → effective 10%
const DEFAULT_TOTAL_FEE_BPS: u64 = 2000;
const DEFAULT_DISCOUNT_BPS: u64  = 5000;

// ── structs ───────────────────────────────────────────────────────────────────

/// Fee configuration: effective_bps = total_fee_bps * discount_bps / 10_000.
public struct FeeConfig has store, copy, drop {
    total_fee_bps: u64,
    discount_bps: u64,
}

/// Shared bonding-curve pool.
/// Holds SUI (from creators) and SR (backing for SSR in circulation).
public struct Pool has key {
    id: UID,
    sui_reserve: Balance<SUI>,
    sr_reserve: Balance<SURVEY_REWARD>,
    total_sui_invested: u128,
    admin: address,
    fee_config: FeeConfig,
}

// ── public functions ──────────────────────────────────────────────────────────

/// Admin creates and shares the pool. No initial liquidity required.
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

/// Effective fee in basis points: total_fee_bps × discount_bps / 10_000.
public fun effective(fee: &FeeConfig): u64 {
    fee.total_fee_bps * fee.discount_bps / 10_000
}

/// Admin-only: update FeeConfig. Both fields must be ≤ 10_000.
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

/// Creator calls this to convert SUI → SSR (bonding curve, no fee here).
/// SSR is returned in full; fee is taken later when depositing into vault.
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

    // Mint SR (stays in pool as backing for SSR)
    let sr_coin = survey_reward::mint(sr_treasury, ssr_amount, ctx);
    balance::join(&mut pool.sr_reserve, coin::into_balance(sr_coin));

    // Mint SSR for creator (1:1 with SR backing)
    stacked_survey_reward::mint(ssr_treasury, ssr_amount, ctx)
}

/// Respondent redeems SSR → SR. Deducts REDEEM_FEE_BPS; fee goes to admin.
public fun redeem(
    pool: &mut Pool,
    ssr_treasury: &mut SsrTreasury,
    ssr_in: Coin<STACKED_SURVEY_REWARD>,
    ctx: &mut TxContext,
): Coin<SURVEY_REWARD> {
    let amount = coin::value(&ssr_in);
    assert!(amount > 0, EZeroAmount);
    assert!(balance::value(&pool.sr_reserve) >= amount, EInsufficientLiquidity);

    let fee = amount * REDEEM_FEE_BPS / 10_000;
    let sr_out_amount = amount - fee;

    stacked_survey_reward::burn(ssr_treasury, ssr_in);

    if (fee > 0) {
        let fee_coin = coin::from_balance(
            balance::split(&mut pool.sr_reserve, fee),
            ctx,
        );
        transfer::public_transfer(fee_coin, pool.admin);
    };

    coin::from_balance(balance::split(&mut pool.sr_reserve, sr_out_amount), ctx)
}

/// Admin-only: withdraw SUI from pool.
public fun admin_withdraw_sui(
    pool: &mut Pool,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    assert!(ctx.sender() == pool.admin, ENotAdmin);
    assert!(balance::value(&pool.sui_reserve) >= amount, EInsufficientLiquidity);
    coin::from_balance(balance::split(&mut pool.sui_reserve, amount), ctx)
}

/// Any SR holder may burn via pool (pool holds no SR burn cap; just passes through).
/// Note: SR holders can also call survey_reward::burn directly.
public fun burn_sr(
    sr_treasury: &mut SrTreasury,
    coin: Coin<SURVEY_REWARD>,
) {
    survey_reward::burn(sr_treasury, coin);
}

// ── view functions ────────────────────────────────────────────────────────────

public fun sui_reserve(pool: &Pool): u64           { balance::value(&pool.sui_reserve) }
public fun sr_reserve(pool: &Pool): u64            { balance::value(&pool.sr_reserve) }
public fun total_sui_invested(pool: &Pool): u128   { pool.total_sui_invested }
public fun admin(pool: &Pool): address             { pool.admin }
public fun fee_config(pool: &Pool): &FeeConfig     { &pool.fee_config }
public fun fee_total_bps(fee: &FeeConfig): u64     { fee.total_fee_bps }
public fun fee_discount_bps(fee: &FeeConfig): u64  { fee.discount_bps }

// ── internal helpers ──────────────────────────────────────────────────────────

/// Bonding curve: ssr_base = sui_mist * INITIAL_SSR_PER_SUI * DECAY / (DECAY + total_sui_mist)
/// Uses u256 intermediates to prevent overflow with large reserves.
fun compute_ssr_amount(sui_mist: u64, total_invested_mist: u128): u64 {
    let si   = sui_mist as u256;
    let decay = BONDING_DECAY as u256;
    let total = total_invested_mist as u256;
    let mult = INITIAL_SSR_PER_SUI as u256;
    let num = si * mult * decay;
    let den = decay + total;
    (num / den) as u64
}

// ── test-only helpers ─────────────────────────────────────────────────────────

#[test_only]
public fun compute_ssr_amount_for_test(sui_mist: u64, total_invested_mist: u128): u64 {
    compute_ssr_amount(sui_mist, total_invested_mist)
}
