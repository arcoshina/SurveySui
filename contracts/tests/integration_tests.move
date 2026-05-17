#[test_only]
module surveysui::integration_tests;

use sui::clock;
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use sui::transfer;
use surveysui::amm_pool::{Self, Pool};
use surveysui::participant_sbt::{Self, SbtRegistry, ParticipantSBT};
use surveysui::reward_coin::{Self, Treasury, REWARD_COIN};
use surveysui::survey_registry::{Self, SurveyRegistry};
use surveysui::survey_vault::{Self, SurveyVault};

const ADMIN: address   = @0xA11CE;
const CREATOR: address = @0xC0FFEE;
const ALICE: address   = @0xA71CE;

const TTL_180D: u64      = 180 * 24 * 60 * 60 * 1000;
const T0: u64            = 1_000_000_000; // ms
const PER_RESPONSE: u64  = 100;
const MAX_RESPONSES: u64 = 10;
const POOL_SEED: u64     = 100_000;

/// Test-only phantom coin that represents the SUI side of the RWD/SUI AMM pair.
public struct TEST_SUI has drop {}

// ── test ──────────────────────────────────────────────────────────────────────

/// Full lifecycle e2e:
///   1. Deploy reward_coin, participant_sbt, survey_registry
///   2. Admin mints RWD to creator (vault funding + pool seed)
///   3. Admin issues SBT for Alice
///   4. Creator creates + shares vault, registers survey, seeds RWD/TEST_SUI pool
///   5. Admin claims vault reward on Alice's behalf
///   6. Alice swaps received RWD → TEST_SUI via AMM pool
///   7. Assert survey registry and vault final state
#[test]
fun test_full_lifecycle_e2e_in_move() {
    // ── 1. Deploy all modules ─────────────────────────────────────────────────
    let mut sc = ts::begin(ADMIN);
    {
        reward_coin::test_init(sc.ctx());
        participant_sbt::test_init(sc.ctx());
        survey_registry::test_init(sc.ctx());
    };

    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, T0);

    // ── 2. Mint RWD to CREATOR: vault fund (1 000) + pool seed (100 000) ──────
    sc.next_tx(ADMIN);
    {
        let mut treasury = ts::take_shared<Treasury>(&sc);
        reward_coin::mint(
            &mut treasury,
            PER_RESPONSE * MAX_RESPONSES + POOL_SEED,
            CREATOR,
            sc.ctx(),
        );
        ts::return_shared(treasury);
    };

    // ── 3. Issue SBT for Alice ────────────────────────────────────────────────
    sc.next_tx(ADMIN);
    {
        let mut sbt_reg = ts::take_shared<SbtRegistry>(&sc);
        participant_sbt::issue(&mut sbt_reg, b"alice_sub", TTL_180D, &clk, sc.ctx());
        ts::return_shared(sbt_reg);
    };

    // ── 4. Creator: vault + survey registration + AMM pool seeding ───────────
    sc.next_tx(CREATOR);
    {
        let mut rwd = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        // Split vault portion; remaining rwd (100 000) seeds the pool below.
        let vault_coin = coin::split(&mut rwd, PER_RESPONSE * MAX_RESPONSES, sc.ctx());

        let vault    = survey_vault::create(
            vault_coin, PER_RESPONSE, MAX_RESPONSES, T0 + TTL_180D, ADMIN, sc.ctx(),
        );
        let vault_id = object::id(&vault);
        survey_vault::share_vault(vault);

        let mut survey_reg = ts::take_shared<SurveyRegistry>(&sc);
        survey_registry::register(
            &mut survey_reg,
            vault_id,
            b"survey_content_hash",
            &clk,
            sc.ctx(),
        );
        ts::return_shared(survey_reg);

        // Seed RWD / TEST_SUI pool (equal reserves ⟹ LP = POOL_SEED)
        let sui_seed = coin::mint_for_testing<TEST_SUI>(POOL_SEED, sc.ctx());
        let lp = amm_pool::init_pool(rwd, sui_seed, sc.ctx());
        transfer::public_transfer(lp, CREATOR);
    };

    // ── 5. Admin claims reward on Alice's behalf ──────────────────────────────
    sc.next_tx(ADMIN);
    {
        let mut vault = ts::take_shared<SurveyVault<REWARD_COIN>>(&sc);
        let sbt       = ts::take_shared<ParticipantSBT>(&sc);

        survey_vault::claim(&mut vault, &sbt, ALICE, &clk, sc.ctx());

        assert!(survey_vault::claimed_count(&vault) == 1);
        assert!(survey_vault::balance_value(&vault) == PER_RESPONSE * (MAX_RESPONSES - 1));
        assert!(survey_vault::has_claimed(&vault, b"alice_sub"));

        ts::return_shared(sbt);
        ts::return_shared(vault);
    };

    // ── 6. Alice swaps received RWD → TEST_SUI via AMM ───────────────────────
    sc.next_tx(ALICE);
    {
        let rwd_coin = ts::take_from_sender<Coin<REWARD_COIN>>(&sc);
        assert!(coin::value(&rwd_coin) == PER_RESPONSE);

        let mut pool      = ts::take_shared<Pool<REWARD_COIN, TEST_SUI>>(&sc);
        let reserve_a_pre = amm_pool::reserve_a(&pool);
        let reserve_b_pre = amm_pool::reserve_b(&pool);

        let sui_out  = amm_pool::swap_a_to_b(&mut pool, rwd_coin, 0, sc.ctx());
        let received = coin::value(&sui_out);

        // Verify output matches CPMM formula (0.3% fee)
        let expected = amm_pool::compute_amount_out_for_test(PER_RESPONSE, POOL_SEED, POOL_SEED);
        assert!(received == expected);

        // Pool reserves update correctly
        assert!(amm_pool::reserve_a(&pool) == reserve_a_pre + PER_RESPONSE);
        assert!(amm_pool::reserve_b(&pool) == reserve_b_pre - received);

        // k must not decrease (CPMM invariant)
        let k_before = (reserve_a_pre as u128) * (reserve_b_pre as u128);
        let k_after  = (amm_pool::reserve_a(&pool) as u128) *
                       (amm_pool::reserve_b(&pool) as u128);
        assert!(k_after >= k_before);

        transfer::public_transfer(sui_out, ALICE);
        ts::return_shared(pool);
    };

    // ── 7. Final state: survey registry ──────────────────────────────────────
    sc.next_tx(CREATOR);
    {
        let survey_reg = ts::take_shared<SurveyRegistry>(&sc);
        assert!(survey_registry::surveys_by_creator(&survey_reg, CREATOR).length() == 1);
        assert!(survey_registry::total_count(&survey_reg) == 1);
        ts::return_shared(survey_reg);
    };

    clock::destroy_for_testing(clk);
    sc.end();
}
