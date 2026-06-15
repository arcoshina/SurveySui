#[test_only]
module surveysui::survey_vault_tests;

use std::option;
use std::vector;
use sui::balance;
use sui::tx_context::TxContext;
use sui::test_scenario;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::clock;
use surveysui::claim_sentinel::{Self, VoidNft};
use surveysui::survey_vault::{Self, SurveyVault};
use surveysui::survey_pass::{Self, NullifierRegistry, SurveyPass, IssuerConfig};
use surveysui::stacked_survey_reward::STACKED_SURVEY_REWARD;
use surveysui::survey_registry::{Self, Survey};
use surveysui::amm_pool::{Self, Pool, ProtocolConfig};

// create_empty 的 purge grace 參數：用合約預設上限 92 天，保留先前行為。
const TEST_PURGE_GRACE_MS: u64 = 92 * 24 * 60 * 60 * 1000;

// 輔助：生成長度 32 的 nullifier bytes
fun claim_with_pass(
    vault: &mut SurveyVault,
    survey: &Survey,
    pass: &SurveyPass,
    attribute_nullifiers: vector<vector<u8>>,
    encrypted_answers: Option<vector<u8>>,
    _answer_blob_id: Option<vector<u8>>,
    clock: &clock::Clock,
    ctx: &mut TxContext,
) {
    let issuer_config = survey_pass::issuer_config_for_testing(ctx);
    let void_nft = claim_sentinel::void_nft_for_testing(ctx);
    survey_vault::claim(
        vault,
        survey,
        0,
        true,
        pass,
        false,
        &void_nft,
        attribute_nullifiers,
        &issuer_config,
        vector[],
        vector[],
        0,
        encrypted_answers,
        clock,
        ctx,
    );
    claim_sentinel::delete_void_nft_for_testing(void_nft);
    survey_pass::destroy_issuer_config_for_testing(issuer_config);
}

fun claim_with_nft(
    vault: &mut SurveyVault,
    survey: &Survey,
    nft: &DummyNFT,
    attribute_nullifiers: vector<vector<u8>>,
    encrypted_answers: Option<vector<u8>>,
    _answer_blob_id: Option<vector<u8>>,
    clock: &clock::Clock,
    ctx: &mut TxContext,
) {
    let issuer_config = survey_pass::issuer_config_for_testing(ctx);
    let padding_pass = survey_pass::padding_pass_for_testing(ctx);
    survey_vault::claim(
        vault,
        survey,
        0,
        false,
        &padding_pass,
        true,
        nft,
        attribute_nullifiers,
        &issuer_config,
        vector[],
        vector[],
        0,
        encrypted_answers,
        clock,
        ctx,
    );
    survey_pass::delete_pass_for_testing(padding_pass);
    survey_pass::destroy_issuer_config_for_testing(issuer_config);
}

fun make_nullifier(seed: u8): vector<u8> {
    let mut v = vector<u8>[];
    let mut i = 0u8;
    while (i < 32) {
        vector::push_back(&mut v, seed + i);
        i = i + 1;
    };
    v
}

#[test]
fun test_create_vault_with_sufficient_gas() {
    let creator = @0x1111;
    let sponsor = @0x2222;
    
    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    
    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10, 
        0,  
        1,  
        100, 
        100000, 
        @0xEEEE, 
        gas_coin, 
        sponsor,  
        5_000_000, 
        0,
        0,
        option::none(),
        ctx
    );
    
    assert!(survey_vault::gas_balance_value(&vault) == 500_000_000, 0);
    
    survey_vault::share_vault(vault);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInsufficientGasBalance)]
fun test_create_vault_insufficient_gas_aborts() {
    let creator = @0x1111;
    let sponsor = @0x2222;
    
    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(100_000_000, ctx);
    
    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        sponsor,
        5_000_000,
        0,
        0,
        option::none(),
        ctx
    );
    
    survey_vault::share_vault(vault);
    test_scenario::end(scenario);
}

#[test]
fun test_deposit_gas_success() {
    let deployer = @0xAD;
    let creator = @0x1111;
    let sponsor = @0x2222;

    let mut scenario = test_scenario::begin(deployer);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::create_protocol_config(ctx);
    };
    test_scenario::next_tx(&mut scenario, deployer);
    {
        let mut config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::bootstrap_canonical_pool(&mut config, deployer, ctx);
        test_scenario::return_shared(config);
    };

    test_scenario::next_tx(&mut scenario, creator);
    {
        let config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
        let clock = clock::create_for_testing(ctx);
        let mut vault = survey_vault::create_empty(
            10,
            0,
            1,
            100,
            100000,
            @0xEEEE,
            gas_coin,
            sponsor,
            5_000_000,
            0,
            0,
            TEST_PURGE_GRACE_MS,
            option::none(),
            &config,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        let deposit_coin = coin::mint_for_testing<SUI>(100_000_000, ctx);
        survey_vault::deposit_gas(&mut vault, deposit_coin);
        assert!(survey_vault::gas_balance_value(&vault) == 600_000_000, 0);
        assert!(!survey_vault::fee_paid(&vault), 1);
        test_scenario::return_shared(config);
        survey_vault::share_vault_for_testing(vault);
    };

    test_scenario::end(scenario);
}

#[test]
fun test_claim_with_authorized_sponsor_receives_compensation() {
    let creator = @0x1111;
    let sponsor = @0x2222;
    let respondent = @0x3333;
    
    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    
    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        sponsor,
        5_000_000,
        0,
        0,
        option::none(),
        ctx
    );
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);
    
    // 創建測試用的 SurveyPass
    let pass = survey_pass::create_for_testing(respondent, 200000, ctx);
    
    // 模擬 respondent 填答交易，Sponsor 是授權的 @0x2222
    let mut builder = test_scenario::ctx_builder_from_sender(respondent);
    let current_rgp = test_scenario::ctx(&mut scenario).reference_gas_price();
    builder = test_scenario::set_reference_gas_price(builder, current_rgp);
    builder = test_scenario::set_sponsor(builder, sponsor);
    test_scenario::next_with_context(&mut scenario, builder);
    
    let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
    let ctx = test_scenario::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    
    let survey = survey_registry::create_survey_for_testing(
        vault_id,
        creator,
        vector[1, 2, 3],
        option::some(vector[1, 2, 3]),
        option::none(),
        vector[1, 2, 3],
        vector[],
        vector[2],
        ctx
    );

    // 調用 claim，此時已實作自動補償，預期補償會正確發生 (Green)
    claim_with_pass(
        &mut vault,
        &survey,
        &pass,
        vector[],
        option::some(vector[1, 2, 3]),
        option::none(),
        &clock,
        ctx,
    );
    
    // 驗證金庫的 Gas 基金是否減少了 5,000,000 MIST
    assert!(survey_vault::gas_balance_value(&vault) == 495_000_000, 0);
    
    clock::destroy_for_testing(clock);
    survey_pass::delete_pass_for_testing(pass);
    survey_registry::destroy_survey_for_testing(survey);
    test_scenario::return_shared(vault);
    
    // 下一交易，驗證 sponsor 是否收到了 SUI Coin
    test_scenario::next_tx(&mut scenario, sponsor);
    let reward_coin = test_scenario::take_from_address<Coin<SUI>>(&scenario, sponsor);
    assert!(coin::value(&reward_coin) == 5_000_000, 1);
    
    coin::burn_for_testing(reward_coin);
    test_scenario::end(scenario);
}

#[test]
fun test_claim_with_unauthorized_sponsor_no_compensation() {
    let creator = @0x1111;
    let sponsor = @0x2222;
    let unauthorized_sponsor = @0x9999;
    let respondent = @0x3333;
    
    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    
    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        sponsor,
        5_000_000,
        0,
        0,
        option::none(),
        ctx
    );
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);
    
    let pass = survey_pass::create_for_testing(respondent, 200000, ctx);
    
    // 使用非授權的 Sponsor 進行交易
    let mut builder = test_scenario::ctx_builder_from_sender(respondent);
    let current_rgp = test_scenario::ctx(&mut scenario).reference_gas_price();
    builder = test_scenario::set_reference_gas_price(builder, current_rgp);
    builder = test_scenario::set_sponsor(builder, unauthorized_sponsor);
    test_scenario::next_with_context(&mut scenario, builder);
    
    let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
    let ctx = test_scenario::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    
    let survey = survey_registry::create_survey_for_testing(
        vault_id,
        creator,
        vector[1, 2, 3],
        option::some(vector[1, 2, 3]),
        option::none(),
        vector[1, 2, 3],
        vector[],
        vector[2],
        ctx
    );

    claim_with_pass(
        &mut vault,
        &survey,
        &pass,
        vector[],
        option::some(vector[1, 2, 3]),
        option::none(),
        &clock,
        ctx,
    );
    
    // 餘額不應改變
    assert!(survey_vault::gas_balance_value(&vault) == 500_000_000, 0);
    
    clock::destroy_for_testing(clock);
    survey_pass::delete_pass_for_testing(pass);
    survey_registry::destroy_survey_for_testing(survey);
    test_scenario::return_shared(vault);
    test_scenario::end(scenario);
}

#[test]
fun test_set_sponsor_and_compensation_amount() {
    let creator = @0x1111;
    let sponsor = @0x2222;

    let mut scenario = test_scenario::begin(creator);
    test_scenario::next_tx(&mut scenario, creator);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::create_protocol_config(ctx);
    };
    test_scenario::next_tx(&mut scenario, creator);
    {
        let mut config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        amm_pool::configure_protocol_limits_for_test(&mut config, 0, 100);
        let ctx = test_scenario::ctx(&mut scenario);

        let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
        let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
        let mut vault = survey_vault::create_for_testing(
            ssr_coin,
            10,
            0,
            1,
            100,
            100000,
            @0xEEEE,
            gas_coin,
            sponsor,
            5_000_000,
            0,
            0,
            option::none(),
            ctx,
        );

        survey_vault::set_sponsor_address(&mut vault, @0x8888, test_scenario::ctx(&mut scenario));
        survey_vault::set_gas_compensation_amount(
            &mut vault,
            &config,
            8_000_000,
            test_scenario::ctx(&mut scenario),
        );
        test_scenario::return_shared(config);

        assert!(survey_vault::sponsor_address(&vault) == @0x8888, 0);
        assert!(survey_vault::gas_compensation_amount(&vault) == 8_000_000, 1);

        survey_vault::share_vault_for_testing(vault);
    };
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EGasCompTooLow)]
fun test_set_gas_compensation_below_min_aborts() {
    let creator = @0x1111;
    let mut scenario = test_scenario::begin(creator);
    test_scenario::next_tx(&mut scenario, creator);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::create_protocol_config(ctx);
    };
    test_scenario::next_tx(&mut scenario, creator);
    let mut config = test_scenario::take_shared<ProtocolConfig>(&scenario);
    amm_pool::configure_protocol_limits_for_test(&mut config, 5_000_000, 100);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, test_scenario::ctx(&mut scenario));
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, test_scenario::ctx(&mut scenario));
    let mut vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        @0x2222,
        5_000_000,
        0,
        0,
        option::none(),
        test_scenario::ctx(&mut scenario),
    );

    survey_vault::set_gas_compensation_amount(
        &mut vault,
        &config,
        1_000_000,
        test_scenario::ctx(&mut scenario),
    );
    test_scenario::return_shared(config);
    survey_vault::share_vault(vault);
    test_scenario::end(scenario);
}

#[test]
fun test_close_vault_refunds_all_gas() {
    let creator = @0x1111;
    let sponsor = @0x2222;
    
    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    
    let mut vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        sponsor,
        5_000_000,
        0,
        0,
        option::none(),
        ctx
    );
    let vault_id = sui::object::id(&vault);
    
    let survey = survey_registry::create_survey_for_testing(
        vault_id,
        creator,
        vector[1, 2, 3],
        option::some(vector[1, 2, 3]),
        option::none(),
        vector[1, 2, 3],
        vector[],
        vector[2],
        ctx
    );

    let clock = clock::create_for_testing(ctx);
    survey_vault::close(&mut vault, &clock, ctx);
    
    assert!(survey_vault::gas_balance_value(&vault) == 0, 0);
    
    clock::destroy_for_testing(clock);
    survey_registry::destroy_survey_for_testing(survey);
    survey_vault::share_vault(vault);
    
    // Creator 應收到退回 the 500M SUI
    test_scenario::next_tx(&mut scenario, creator);
    let refund_coin = test_scenario::take_from_address<Coin<SUI>>(&scenario, creator);
    assert!(coin::value(&refund_coin) == 500_000_000, 1);
    
    coin::burn_for_testing(refund_coin);
    test_scenario::end(scenario);
}

// ── nullifier 填答層去重測試 ────────────────────────────────────────────────────

// 身分遷移後仍擋下對同一問卷重複填答：
// A 用 nullifier X 填答 → 刪除 Pass（X 釋放）→ B 用相同 X 重新綁定 → B 填同問卷應被擋。
#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EDuplicateNullifier)]
fun test_claim_blocks_migrated_identity_refill() {
    let creator = @0x1111;
    let resp_a = @0x3333;
    let resp_b = @0x4444;

    let mut scenario = test_scenario::begin(creator);
    survey_pass::test_init(test_scenario::ctx(&mut scenario));

    let vault_id: sui::object::ID;

    // 建立單發（repeat_reward=0）vault 並 share
    test_scenario::next_tx(&mut scenario, creator);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let ssr = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
        let gas = coin::mint_for_testing<SUI>(500_000_000, ctx);
        let vault = survey_vault::create_for_testing(
            ssr, 10, 0, 1, 100, 100000, @0xEEEE, gas, @0x2222, 5_000_000, 0, 0, option::none(), ctx,
        );
        vault_id = sui::object::id(&vault);
        survey_vault::share_vault(vault);
    };

    // A mint pass（nullifier X）
    test_scenario::next_tx(&mut scenario, resp_a);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::mint_pass_for_testing(
            &mut registry, resp_a, 2, vector[make_nullifier(88)], vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };

    test_scenario::next_tx(&mut scenario, resp_a);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let survey = survey_registry::create_survey_for_testing(
            vault_id, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        claim_with_pass(&mut vault, &survey, &pass, vector[], option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(pass);
        test_scenario::return_shared(vault);
    };

    // A 刪除 Pass → 釋放 nullifier X
    test_scenario::next_tx(&mut scenario, resp_a);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        survey_pass::delete_pass(&mut registry, pass, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(registry);
    };

    // B 用相同 X 重新 mint（X 已釋放，應成功）
    test_scenario::next_tx(&mut scenario, resp_b);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::mint_pass_for_testing(
            &mut registry, resp_b, 2, vector[make_nullifier(88)], vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };

    // B 填同一問卷 → scoped(X) 已綁 A ≠ B → EDuplicateNullifier
    test_scenario::next_tx(&mut scenario, resp_b);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let survey = survey_registry::create_survey_for_testing(
            vault_id, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        claim_with_pass(&mut vault, &survey, &pass, vector[], option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(pass);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}

// 同一身分（同 owner）重複填答不被 nullifier 擋下（owner 相符放行）。
#[test]
fun test_claim_same_identity_repeat_allowed() {
    let creator = @0x1111;
    let resp_a = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    survey_pass::test_init(test_scenario::ctx(&mut scenario));

    let vault_id: sui::object::ID;

    // 允許重複填答（repeat_reward=5, repeat_max_times=2）
    test_scenario::next_tx(&mut scenario, creator);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let ssr = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
        let gas = coin::mint_for_testing<SUI>(500_000_000, ctx);
        let vault = survey_vault::create_for_testing(
            ssr, 10, 5, 2, 10, 100000, @0xEEEE, gas, @0x2222, 5_000_000, 0, 0, option::none(), ctx,
        );
        vault_id = sui::object::id(&vault);
        survey_vault::share_vault(vault);
    };

    test_scenario::next_tx(&mut scenario, resp_a);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::mint_pass_for_testing(
            &mut registry, resp_a, 2, vector[make_nullifier(7)], vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };

    // 第一次填答
    test_scenario::next_tx(&mut scenario, resp_a);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let survey = survey_registry::create_survey_for_testing(
            vault_id, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        claim_with_pass(&mut vault, &survey, &pass, vector[], option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(pass);
        test_scenario::return_shared(vault);
    };

    // 第二次填答（同 owner，scoped(X) 已綁自己）→ 應放行
    test_scenario::next_tx(&mut scenario, resp_a);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let survey = survey_registry::create_survey_for_testing(
            vault_id, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        claim_with_pass(&mut vault, &survey, &pass, vector[], option::some(vector[4, 5, 6]), option::none(), &clock, test_scenario::ctx(&mut scenario));
        assert!(survey_vault::claim_count_of(&vault, resp_a) == 2, 0);
        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(pass);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}

// scope 隔離：相同 nullifier 對不同 vault 各填一次皆成功（H(nullifier‖vault_id) 不同）。
#[test]
fun test_claim_nullifier_scoped_per_vault() {
    let creator = @0x1111;
    let resp_a = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    survey_pass::test_init(test_scenario::ctx(&mut scenario));

    // 建立兩個 vault 並記錄各自 ID
    test_scenario::next_tx(&mut scenario, creator);
    let ctx = test_scenario::ctx(&mut scenario);
    let ssr1 = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas1 = coin::mint_for_testing<SUI>(500_000_000, ctx);
    let v1 = survey_vault::create_for_testing(ssr1, 10, 0, 1, 100, 100000, @0xEEEE, gas1, @0x2222, 5_000_000, 0, 0, option::none(), ctx);
    let id1 = survey_vault::id_of(&v1);
    survey_vault::share_vault(v1);
    let ssr2 = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas2 = coin::mint_for_testing<SUI>(500_000_000, ctx);
    let v2 = survey_vault::create_for_testing(ssr2, 10, 0, 1, 100, 100000, @0xEEEE, gas2, @0x2222, 5_000_000, 0, 0, option::none(), ctx);
    let id2 = survey_vault::id_of(&v2);
    survey_vault::share_vault(v2);

    // A mint pass（nullifier X）
    test_scenario::next_tx(&mut scenario, resp_a);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx2 = test_scenario::ctx(&mut scenario);
        survey_pass::mint_pass_for_testing(
            &mut registry, resp_a, 2, vector[make_nullifier(33)], vector<u8>[], 9_999_999_999_999u64, &clock, ctx2,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };

    // A 填 vault1 → 成功
    test_scenario::next_tx(&mut scenario, resp_a);
    {
        let mut vault = test_scenario::take_shared_by_id<SurveyVault>(&scenario, id1);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let survey = survey_registry::create_survey_for_testing(
            id1, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        claim_with_pass(&mut vault, &survey, &pass, vector[], option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(pass);
        test_scenario::return_shared(vault);
    };

    // A 用相同 nullifier 填 vault2 → 因 scope 不同而成功
    test_scenario::next_tx(&mut scenario, resp_a);
    {
        let mut vault = test_scenario::take_shared_by_id<SurveyVault>(&scenario, id2);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let survey = survey_registry::create_survey_for_testing(
            id2, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        claim_with_pass(&mut vault, &survey, &pass, vector[], option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
        assert!(survey_vault::claim_count_of(&vault, resp_a) == 1, 0);
        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(pass);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}

#[test]
fun test_claim_sponsored_gas_compensation_success() {
    let creator = @0x1111;
    let sponsor = @0x2222;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    // 代付只回 gas 補償 5,000,000 MIST(已無 storage 補償)。給予 500,000,000 MIST。
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        10, // max_responses = 10
        100000,
        @0xEEEE,
        gas_coin,
        sponsor,
        5_000_000,
        0, // storage 補償已廢除(vestigial 參數)
        0,
        option::none(),
        ctx
    );
    survey_vault::share_vault(vault);

    let pass = survey_pass::create_for_testing(respondent, 200000, ctx);

    // 模擬 respondent 填答交易(inline 答卷),sponsor 代付
    let mut builder = test_scenario::ctx_builder_from_sender(respondent);
    let current_rgp = test_scenario::ctx(&mut scenario).reference_gas_price();
    builder = test_scenario::set_reference_gas_price(builder, current_rgp);
    builder = test_scenario::set_sponsor(builder, sponsor);
    test_scenario::next_with_context(&mut scenario, builder);

    let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
    let vault_id = sui::object::id(&vault);
    let ctx = test_scenario::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);

    let survey = survey_registry::create_survey_for_testing(
        vault_id,
        creator,
        vector[1, 2, 3],
        option::some(vector[1, 2, 3]),
        option::none(),
        vector[1, 2, 3],
        vector[],
        vector[2],
        ctx
    );

    claim_with_pass(
        &mut vault,
        &survey,
        &pass,
        vector[],
        option::some(vector[100, 101, 102]),
        option::none(),
        &clock,
        ctx,
    );

    // 金庫的 Gas 基金只減少 5,000,000 MIST(gas 補償),不再含 storage 補償
    assert!(survey_vault::gas_balance_value(&vault) == 495_000_000, 0);

    clock::destroy_for_testing(clock);
    survey_pass::delete_pass_for_testing(pass);
    survey_registry::destroy_survey_for_testing(survey);
    test_scenario::return_shared(vault);

    // sponsor 只收到 5,000,000 MIST 的 gas 補償
    test_scenario::next_tx(&mut scenario, sponsor);
    let reward_coin = test_scenario::take_from_address<Coin<SUI>>(&scenario, sponsor);
    assert!(coin::value(&reward_coin) == 5_000_000, 1);

    coin::burn_for_testing(reward_coin);
    test_scenario::end(scenario);
}

// 測試用的 Dummy NFT 結構
public struct DummyNFT has key, store {
    id: UID,
}

public struct AnotherDummyNFT has key, store {
    id: UID,
}

#[test]
fun test_claim_nft_only_succeeds() {
    let creator = @0x1111;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    let allowed_nft = option::some(std::ascii::into_bytes(std::type_name::into_string(std::type_name::with_defining_ids<DummyNFT>())));

    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        @0x2222,
        5_000_000,
        0,
        0,
        allowed_nft,
        ctx
    );
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);

    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let nft = DummyNFT { id: sui::object::new(ctx) };
        let survey = survey_registry::create_survey_for_testing(
            vault_id,
            creator,
            vector[1, 2, 3],
            option::some(vector[1, 2, 3]),
            option::none(),
            vector[1, 2, 3],
            vector[],
            vector[],
            ctx,
        );

        claim_with_nft(
            &mut vault,
            &survey,
            &nft,
            vector[],
            option::some(vector[1, 2, 3]),
            option::none(),
            &clock,
            ctx,
        );

        assert!(survey_vault::claimed_count(&vault) == 1, 0);
        clock::destroy_for_testing(clock);
        let DummyNFT { id } = nft;
        sui::object::delete(id);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(vault);
    };
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInvalidNftType)]
fun test_claim_nft_invalid_type_aborts() {
    let creator = @0x1111;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    // 限制只能用 DummyNFT
    let allowed_nft = option::some(std::ascii::into_bytes(std::type_name::into_string(std::type_name::with_defining_ids<DummyNFT>())));

    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        @0x2222,
        5_000_000,
        0,
        0,
        allowed_nft,
        ctx
    );
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);

    // 傳入 AnotherDummyNFT 應報錯 EInvalidNftType
    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let nft = AnotherDummyNFT { id: sui::object::new(ctx) };

        let survey = survey_registry::create_survey_for_testing(
            vault_id,
            creator,
            vector[1, 2, 3],
            option::some(vector[1, 2, 3]),
            option::none(),
            vector[1, 2, 3],
            vector[],
            vector[],
            ctx,
        );
        let issuer_config = survey_pass::issuer_config_for_testing(ctx);
        let padding_pass = survey_pass::padding_pass_for_testing(ctx);
        survey_vault::claim(
            &mut vault,
            &survey,
            0,
            false,
            &padding_pass,
            true,
            &nft,
            vector[],
            &issuer_config,
            vector[],
            vector[],
            0,
            option::some(vector[1, 2, 3]),
            &clock,
            ctx,
        );
        survey_pass::delete_pass_for_testing(padding_pass);
        survey_pass::destroy_issuer_config_for_testing(issuer_config);

        clock::destroy_for_testing(clock);
        let AnotherDummyNFT { id } = nft;
        sui::object::delete(id);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(vault);
    };
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInvalidNftType)]
fun test_claim_nft_when_vault_disallows_nft_aborts() {
    let creator = @0x1111;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        @0x2222,
        5_000_000,
        0,
        0,
        option::none(),
        ctx
    );
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);

    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let nft = DummyNFT { id: sui::object::new(ctx) };
        let survey = survey_registry::create_survey_for_testing(
            vault_id,
            creator,
            vector[1, 2, 3],
            option::some(vector[1, 2, 3]),
            option::none(),
            vector[1, 2, 3],
            vector[],
            vector[2],
            ctx,
        );

        claim_with_nft(
            &mut vault,
            &survey,
            &nft,
            vector[],
            option::some(vector[1, 2, 3]),
            option::none(),
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        let DummyNFT { id } = nft;
        sui::object::delete(id);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(vault);
    };
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EDuplicateNullifier)]
fun test_claim_nft_duplicate_aborts() {
    let creator = @0x1111;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    // 取得 DummyNFT 的完整類型名稱作為 allowed_nft_type
    let allowed_nft = option::some(std::ascii::into_bytes(std::type_name::into_string(std::type_name::with_defining_ids<DummyNFT>())));

    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        @0x2222,
        5_000_000,
        0,
        0,
        allowed_nft,
        ctx
    );
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);

    // 第一次填答，成功
    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let nft = DummyNFT { id: sui::object::new(ctx) };

        let survey = survey_registry::create_survey_for_testing(
            vault_id,
            creator,
            vector[1, 2, 3],
            option::some(vector[1, 2, 3]),
            option::none(),
            vector[1, 2, 3],
            vector[],
            vector[],
            ctx,
        );

        claim_with_nft(
            &mut vault,
            &survey,
            &nft,
            vector[],
            option::some(vector[1, 2, 3]),
            option::none(),
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        sui::transfer::public_transfer(nft, respondent);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(vault);
    };

    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let nft = test_scenario::take_from_sender<DummyNFT>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let survey = survey_registry::create_survey_for_testing(
            vault_id,
            creator,
            vector[1, 2, 3],
            option::some(vector[1, 2, 3]),
            option::none(),
            vector[1, 2, 3],
            vector[],
            vector[],
            ctx,
        );

        claim_with_nft(
            &mut vault,
            &survey,
            &nft,
            vector[],
            option::some(vector[4, 5, 6]),
            option::none(),
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        let DummyNFT { id } = nft;
        sui::object::delete(id);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}

fun make_payload(len: u64): vector<u8> {
    let mut v = vector<u8>[];
    let mut i = 0u64;
    while (i < len) {
        vector::push_back(&mut v, (i % 256) as u8);
        i = i + 1;
    };
    v
}

#[test]
fun test_inline_answer_at_max_bytes_succeeds() {
    let creator = @0x1111;
    let sponsor = @0x2222;
    let respondent = @0x3333;
    let max_bytes = 1024u64;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    let mut vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        sponsor,
        5_000_000,
        0,
        0,
        option::none(),
        ctx
    );
    survey_vault::set_max_inline_answer_bytes(&mut vault, max_bytes, ctx);
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);

    let pass = survey_pass::create_for_testing(respondent, 200000, ctx);

    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let survey = survey_registry::create_survey_for_testing(
            vault_id,
            creator,
            vector[1, 2, 3],
            option::some(vector[1, 2, 3]),
            option::none(),
            vector[1, 2, 3],
            vector[],
            vector[2],
            ctx
        );

        claim_with_pass(
            &mut vault,
            &survey,
            &pass,
            vector[],
            option::some(make_payload(max_bytes)),
            option::none(),
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(vault);
    };

    survey_pass::delete_pass_for_testing(pass);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInlineAnswerTooLarge)]
fun test_inline_answer_exceeds_max_bytes_fails() {
    let creator = @0x1111;
    let sponsor = @0x2222;
    let respondent = @0x3333;
    let max_bytes = 1024u64;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    let mut vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        sponsor,
        5_000_000,
        0,
        0,
        option::none(),
        ctx
    );
    survey_vault::set_max_inline_answer_bytes(&mut vault, max_bytes, ctx);
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);

    let pass = survey_pass::create_for_testing(respondent, 200000, ctx);

    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let survey = survey_registry::create_survey_for_testing(
            vault_id,
            creator,
            vector[1, 2, 3],
            option::some(vector[1, 2, 3]),
            option::none(),
            vector[1, 2, 3],
            vector[],
            vector[2],
            ctx
        );

        claim_with_pass(
            &mut vault,
            &survey,
            &pass,
            vector[],
            option::some(make_payload(max_bytes + 1)),
            option::none(),
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        survey_pass::delete_pass_for_testing(pass);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}

#[test]
fun test_split_fee_on_reward_budget() {
    let deployer = @0xAD;
    let treasury = @0xEE;
    let creator = @0x11;

    let mut scenario = test_scenario::begin(deployer);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::create_protocol_config(ctx);
    };
    test_scenario::next_tx(&mut scenario, deployer);
    {
        let mut config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::bootstrap_canonical_pool(&mut config, deployer, ctx);
        test_scenario::return_shared(config);
    };

    test_scenario::next_tx(&mut scenario, creator);
    {
        let pool = test_scenario::take_shared<Pool>(&scenario);
        let config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        let per_response = 1_000_000u64;
        let max_responses = 1000u64;
        let budget = per_response * max_responses;
        let effective_bps = amm_pool::effective(amm_pool::fee_config(&pool));
        let fee = budget * effective_bps / 10_000;
        let gross = budget + fee;

        let gas = coin::zero<SUI>(ctx);
        let clock = clock::create_for_testing(ctx);
        let mut vault = survey_vault::create_empty(
            per_response,
            0,
            1,
            max_responses,
            100000,
            treasury,
            gas,
            @0x0,
            0,
            0,
            0,
            TEST_PURGE_GRACE_MS,
            option::none(),
            &config,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);

        let ssr = coin::mint_for_testing<STACKED_SURVEY_REWARD>(gross, ctx);
        survey_vault::deposit_existing_ssr(&mut vault, ssr);

        let zero_ssr = coin::zero<STACKED_SURVEY_REWARD>(ctx);
        survey_vault::merge_balances(&mut vault, zero_ssr, &pool, &config);

        assert!(survey_vault::balance_value(&vault) == gross, 900);
        assert!(effective_bps == 1000, 901);

        survey_vault::split_fee_to_treasury(&mut vault, &pool, &config, ctx);

        assert!(survey_vault::balance_value(&vault) == budget, 902);
        assert!(survey_vault::fee_paid(&vault), 903);

        test_scenario::return_shared(config);
        test_scenario::return_shared(pool);
        survey_vault::share_vault(vault);
    };

    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInsufficientVaultBalance)]
fun test_merge_balances_rejects_underfunded_gross() {
    let deployer = @0xAD;
    let creator = @0x11;

    let mut scenario = test_scenario::begin(deployer);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::create_protocol_config(ctx);
    };
    test_scenario::next_tx(&mut scenario, deployer);
    {
        let mut config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::bootstrap_canonical_pool(&mut config, deployer, ctx);
        test_scenario::return_shared(config);
    };

    test_scenario::next_tx(&mut scenario, creator);
    {
        let pool = test_scenario::take_shared<Pool>(&scenario);
        let config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        let per_response = 1_000_000u64;
        let max_responses = 100u64;
        let budget = per_response * max_responses;

        let gas = coin::zero<SUI>(ctx);
        let clock = clock::create_for_testing(ctx);
        let mut vault = survey_vault::create_empty(
            per_response,
            0,
            1,
            max_responses,
            100000,
            @0xEE,
            gas,
            @0x0,
            0,
            0,
            0,
            TEST_PURGE_GRACE_MS,
            option::none(),
            &config,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);

        let ssr = coin::mint_for_testing<STACKED_SURVEY_REWARD>(budget, ctx);
        survey_vault::deposit_existing_ssr(&mut vault, ssr);

        let zero_ssr = coin::zero<STACKED_SURVEY_REWARD>(ctx);
        survey_vault::merge_balances(&mut vault, zero_ssr, &pool, &config);

        test_scenario::return_shared(config);
        test_scenario::return_shared(pool);
        survey_vault::share_vault(vault);
    };

    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::amm_pool::ENotCanonicalPool)]
fun test_merge_balances_rejects_non_canonical_pool() {
    let admin = @0xAD;
    let creator = @0x11;

    let mut scenario = test_scenario::begin(admin);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::create_protocol_config(ctx);
        amm_pool::init_pool_for_test(admin, ctx);
        amm_pool::init_pool_for_test(creator, ctx);
    };

    test_scenario::next_tx(&mut scenario, admin);
    {
        let mut config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let canonical_pool = test_scenario::take_shared<Pool>(&scenario);
        let rogue_pool = test_scenario::take_shared<Pool>(&scenario);
        amm_pool::register_canonical_pool_for_test(&mut config, &canonical_pool);
        let ctx = test_scenario::ctx(&mut scenario);

        let gas = coin::zero<SUI>(ctx);
        let clock = clock::create_for_testing(ctx);
        let mut vault = survey_vault::create_empty(
            1_000_000,
            0,
            1,
            10,
            100000,
            @0xEE,
            gas,
            @0x0,
            0,
            0,
            0,
            TEST_PURGE_GRACE_MS,
            option::none(),
            &config,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        let ssr = coin::mint_for_testing<STACKED_SURVEY_REWARD>(20_000_000_000, ctx);
        survey_vault::deposit_existing_ssr(&mut vault, ssr);
        let zero_ssr = coin::zero<STACKED_SURVEY_REWARD>(ctx);
        survey_vault::merge_balances(&mut vault, zero_ssr, &rogue_pool, &config);

        test_scenario::return_shared(config);
        test_scenario::return_shared(rogue_pool);
        test_scenario::return_shared(canonical_pool);
        survey_vault::share_vault_for_testing(vault);
    };

    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EFeeNotPaid)]
fun test_share_vault_requires_fee_paid() {
    let creator = @0x11;
    let mut scenario = test_scenario::begin(creator);
    test_scenario::next_tx(&mut scenario, creator);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::create_protocol_config(ctx);
    };
    test_scenario::next_tx(&mut scenario, creator);
    let config = test_scenario::take_shared<ProtocolConfig>(&scenario);
    let ctx = test_scenario::ctx(&mut scenario);
    let gas = coin::zero<SUI>(ctx);
    let clock = clock::create_for_testing(ctx);
    let vault = survey_vault::create_empty(
        1_000_000,
        0,
        1,
        10,
        100000,
        @0xEE,
        gas,
        @0x0,
        0,
        0,
        0,
        TEST_PURGE_GRACE_MS,
        option::none(),
        &config,
        &clock,
        ctx,
    );
    clock::destroy_for_testing(clock);
    test_scenario::return_shared(config);
    survey_vault::share_vault(vault);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInlineAnswerTooLarge)]
fun test_inline_answer_exceeds_max_bytes_aborts() {
    let creator = @0x1111;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    let mut vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        @0x2222,
        5_000_000,
        0,
        0,
        option::none(),
        ctx,
    );
    // 收緊 inline 上限至 1024,使 1025 bytes 的答卷超限被拒(禁止大型答卷)。
    survey_vault::set_max_inline_answer_bytes(&mut vault, 1024, ctx);
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);
    let pass = survey_pass::create_for_testing(respondent, 200000, ctx);

    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let survey = survey_registry::create_survey_for_testing(
            vault_id,
            creator,
            vector[1, 2, 3],
            option::some(vector[1, 2, 3]),
            option::none(),
            vector[1, 2, 3],
            vector[],
            vector[2],
            ctx,
        );
        let mut oversized_answer = vector<u8>[];
        let mut i = 0u64;
        while (i < 1025) {
            vector::push_back(&mut oversized_answer, 97);
            i = i + 1;
        };
        claim_with_pass(
            &mut vault,
            &survey,
            &pass,
            vector[],
            option::some(oversized_answer),
            option::none(),
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(vault);
    };

    survey_pass::delete_pass_for_testing(pass);
    test_scenario::end(scenario);
}

const ADMIN: address = @0xADD;

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EFeeAlreadyPaid)]
fun test_post_share_merge_balances_aborts() {
    let deployer = @0xAD;
    let treasury = @0xEE;
    let creator = @0x11;

    let mut scenario = test_scenario::begin(deployer);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::create_protocol_config(ctx);
    };
    test_scenario::next_tx(&mut scenario, deployer);
    {
        let mut config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        amm_pool::bootstrap_canonical_pool(&mut config, deployer, ctx);
        test_scenario::return_shared(config);
    };

    test_scenario::next_tx(&mut scenario, creator);
    {
        let pool = test_scenario::take_shared<Pool>(&scenario);
        let config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        let per_response = 1_000_000u64;
        let max_responses = 10u64;
        let budget = per_response * max_responses;
        let effective_bps = amm_pool::effective(amm_pool::fee_config(&pool));
        let fee = budget * effective_bps / 10_000;
        let gross = budget + fee;

        let gas = coin::zero<SUI>(ctx);
        let clock = clock::create_for_testing(ctx);
        let mut vault = survey_vault::create_empty(
            per_response,
            0,
            1,
            max_responses,
            100000,
            treasury,
            gas,
            @0x0,
            0,
            0,
            0,
            TEST_PURGE_GRACE_MS,
            option::none(),
            &config,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        let ssr = coin::mint_for_testing<STACKED_SURVEY_REWARD>(gross, ctx);
        survey_vault::deposit_existing_ssr(&mut vault, ssr);
        let zero_ssr = coin::zero<STACKED_SURVEY_REWARD>(ctx);
        survey_vault::merge_balances(&mut vault, zero_ssr, &pool, &config);
        survey_vault::split_fee_to_treasury(&mut vault, &pool, &config, ctx);
        test_scenario::return_shared(config);
        test_scenario::return_shared(pool);
        survey_vault::share_vault(vault);
    };

    test_scenario::next_tx(&mut scenario, creator);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let pool = test_scenario::take_shared<Pool>(&scenario);
        let config = test_scenario::take_shared<ProtocolConfig>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let extra = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1, ctx);
        survey_vault::merge_balances(&mut vault, extra, &pool, &config);
        test_scenario::return_shared(config);
        test_scenario::return_shared(pool);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EFeeAlreadyPaid)]
fun test_post_share_deposit_existing_ssr_aborts() {
    let creator = @0x1111;
    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        @0x2222,
        5_000_000,
        0,
        0,
        option::none(),
        ctx,
    );
    survey_vault::share_vault(vault);

    test_scenario::next_tx(&mut scenario, creator);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let extra = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1, ctx);
        survey_vault::deposit_existing_ssr(&mut vault, extra);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EFeeAlreadyPaid)]
fun test_post_share_deposit_gas_aborts() {
    let creator = @0x1111;
    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    let vault = survey_vault::create_for_testing(
        ssr_coin,
        10,
        0,
        1,
        100,
        100000,
        @0xEEEE,
        gas_coin,
        @0x2222,
        5_000_000,
        0,
        0,
        option::none(),
        ctx,
    );
    survey_vault::share_vault(vault);

    test_scenario::next_tx(&mut scenario, creator);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let extra = coin::mint_for_testing<SUI>(1, ctx);
        survey_vault::deposit_gas(&mut vault, extra);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}

#[test]
fun test_claim_records_revoked_credential_nullifiers() {
    let creator = @0x1111;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(ADMIN);
    survey_pass::test_init(test_scenario::ctx(&mut scenario));

    let vault_id: sui::object::ID;

    test_scenario::next_tx(&mut scenario, creator);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        let ssr = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
        let gas = coin::mint_for_testing<SUI>(500_000_000, ctx);
        let vault = survey_vault::create_for_testing(
            ssr,
            10,
            0,
            1,
            100,
            100000,
            @0xEEEE,
            gas,
            @0x2222,
            5_000_000,
            0,
            0,
            option::none(),
            ctx,
        );
        vault_id = sui::object::id(&vault);
        survey_vault::share_vault(vault);
    };

    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        let google_nf = make_nullifier(6);
        let github_nf = make_nullifier(7);
        survey_pass::mint_pass_with_extra_for_testing(
            &mut registry,
            respondent,
            respondent,
            6,
            vector[google_nf],
            vector[],
            9_999_999_999_999u64,
            vector[7],
            vector[vector[github_nf]],
            vector[vector[]],
            vector[9_999_999_999_999u64],
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };

    test_scenario::next_tx(&mut scenario, ADMIN);
    {
        let config = test_scenario::take_shared<IssuerConfig>(&scenario);
        let mut pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::admin_revoke_credential(&mut pass, &config, vector[make_nullifier(6)], ctx);
        test_scenario::return_shared(config);
        test_scenario::return_shared(pass);
    };

    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        assert!(survey_pass::is_source_valid(&pass, 7, &clock), 0);
        assert!(!survey_pass::is_source_valid(&pass, 6, &clock), 1);
        let all = survey_pass::all_nullifiers(&pass);
        assert!(vector::length(&all) == 2, 2);

        let survey = survey_registry::create_survey_for_testing(
            vault_id,
            creator,
            vector[1, 2, 3],
            option::some(vector[1, 2, 3]),
            option::none(),
            vector[1, 2, 3],
            vector[],
            vector[7],
            ctx,
        );
        claim_with_pass(
            &mut vault,
            &survey,
            &pass,
            vector[],
            option::some(vector[1, 2, 3]),
            option::none(),
            &clock,
            ctx,
        );
        assert!(
            survey_vault::is_scoped_nullifier_used(&vault, make_nullifier(6), respondent),
            3,
        );
        assert!(
            survey_vault::is_scoped_nullifier_used(&vault, make_nullifier(7), respondent),
            4,
        );
        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(pass);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}
