module surveysui::amm_pool;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use surveysui::stacked_survey_reward::{Self, SssrTreasury, STACKED_SURVEY_REWARD};
use surveysui::survey_sui_reward::{Self, SsrTreasury, SURVEY_SUI_REWARD};

// ── error codes ───────────────────────────────────────────────────────────────

const ENotAdmin: u64          = 0;
const EZeroAmount: u64        = 1;
const EInsufficientOutput: u64 = 2;
const EInsufficientLiquidity: u64 = 3;

// ── bonding curve constants ───────────────────────────────────────────────────

/// Redemption fee: 0.3% in basis points.
const REDEEM_FEE_BPS: u64 = 30;

/// Bonding curve: sssr_base = sui_mist * DECAY / (DECAY + total_sui_mist)
/// Initial ratio: 1 MIST → 1 sSSR base (1 SUI → 1 sSSR with matching 9 decimals).
/// Price halves after DECAY MIST (1_000_000_000_000 = 1000 SUI) has been invested.
const BONDING_DECAY: u128 = 1_000_000_000_000;

// ── structs ───────────────────────────────────────────────────────────────────

/// Shared bonding-curve pool.
/// Holds SUI (from creators) and SSR (backing for sSSR in circulation).
public struct Pool has key {
    id: UID,
    sui_reserve: Balance<SUI>,
    ssr_reserve: Balance<SURVEY_SUI_REWARD>,
    total_sui_invested: u128,
    admin: address,
}

// ── public functions ──────────────────────────────────────────────────────────

/// Admin creates and shares the pool. No initial liquidity required.
public fun init_pool(admin: address, ctx: &mut TxContext) {
    transfer::share_object(Pool {
        id: object::new(ctx),
        sui_reserve: balance::zero(),
        ssr_reserve: balance::zero(),
        total_sui_invested: 0,
        admin,
    });
}

/// Creator calls this to convert SUI → sSSR (bonding curve, no fee here).
/// sSSR is returned in full; fee is taken later when depositing into vault.
public fun invest_and_mint(
    pool: &mut Pool,
    ssr_treasury: &mut SsrTreasury,
    sssr_treasury: &mut SssrTreasury,
    sui_in: Coin<SUI>,
    ctx: &mut TxContext,
): Coin<STACKED_SURVEY_REWARD> {
    let sui_amount = coin::value(&sui_in);
    assert!(sui_amount > 0, EZeroAmount);

    let sssr_amount = compute_sssr_amount(sui_amount, pool.total_sui_invested);
    assert!(sssr_amount > 0, EInsufficientOutput);

    pool.total_sui_invested = pool.total_sui_invested + (sui_amount as u128);
    balance::join(&mut pool.sui_reserve, coin::into_balance(sui_in));

    // Mint SSR (stays in pool as backing for sSSR)
    let ssr_coin = survey_sui_reward::mint(ssr_treasury, sssr_amount, ctx);
    balance::join(&mut pool.ssr_reserve, coin::into_balance(ssr_coin));

    // Mint sSSR for creator (1:1 with SSR backing)
    stacked_survey_reward::mint(sssr_treasury, sssr_amount, ctx)
}

/// Respondent redeems sSSR → SSR. Deducts REDEEM_FEE_BPS; fee goes to admin.
public fun redeem(
    pool: &mut Pool,
    sssr_treasury: &mut SssrTreasury,
    sssr_in: Coin<STACKED_SURVEY_REWARD>,
    ctx: &mut TxContext,
): Coin<SURVEY_SUI_REWARD> {
    let amount = coin::value(&sssr_in);
    assert!(amount > 0, EZeroAmount);
    assert!(balance::value(&pool.ssr_reserve) >= amount, EInsufficientLiquidity);

    let fee = amount * REDEEM_FEE_BPS / 10_000;
    let ssr_out_amount = amount - fee;

    stacked_survey_reward::burn(sssr_treasury, sssr_in);

    if (fee > 0) {
        let fee_coin = coin::from_balance(
            balance::split(&mut pool.ssr_reserve, fee),
            ctx,
        );
        transfer::public_transfer(fee_coin, pool.admin);
    };

    coin::from_balance(balance::split(&mut pool.ssr_reserve, ssr_out_amount), ctx)
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

/// Any SSR holder may burn via pool (pool holds no SSR burn cap; just passes through).
/// Note: SSR holders can also call survey_sui_reward::burn directly.
public fun burn_ssr(
    ssr_treasury: &mut SsrTreasury,
    coin: Coin<SURVEY_SUI_REWARD>,
) {
    survey_sui_reward::burn(ssr_treasury, coin);
}

// ── view functions ────────────────────────────────────────────────────────────

public fun sui_reserve(pool: &Pool): u64           { balance::value(&pool.sui_reserve) }
public fun ssr_reserve(pool: &Pool): u64           { balance::value(&pool.ssr_reserve) }
public fun total_sui_invested(pool: &Pool): u128   { pool.total_sui_invested }
public fun admin(pool: &Pool): address             { pool.admin }

// ── internal helpers ──────────────────────────────────────────────────────────

/// Bonding curve: sssr_base = sui_mist * DECAY / (DECAY + total_sui_mist)
/// Uses u256 intermediates to prevent overflow with large reserves.
fun compute_sssr_amount(sui_mist: u64, total_invested_mist: u128): u64 {
    let si   = sui_mist as u256;
    let decay = BONDING_DECAY as u256;
    let total = total_invested_mist as u256;
    let num = si * decay;
    let den = decay + total;
    (num / den) as u64
}

// ── test-only helpers ─────────────────────────────────────────────────────────

#[test_only]
public fun compute_sssr_amount_for_test(sui_mist: u64, total_invested_mist: u128): u64 {
    compute_sssr_amount(sui_mist, total_invested_mist)
}
