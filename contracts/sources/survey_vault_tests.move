#[test_only]
module surveysui::survey_vault_tests;

use std::option;
use sui::balance;
use sui::test_scenario;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::clock;
use surveysui::survey_vault::{Self, SurveyVault};
use surveysui::survey_pass::{Self, NullifierRegistry, SurveyPass, IssuerConfig};
use surveysui::stacked_survey_reward::STACKED_SURVEY_REWARD;
use surveysui::survey_registry::{Self, Survey};

// 輔助：生成長度 32 的 nullifier bytes
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
    
    let vault = survey_vault::create(
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
    
    let vault = survey_vault::create(
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
    let creator = @0x1111;
    let sponsor = @0x2222;
    
    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    
    let mut vault = survey_vault::create(
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
    
    let deposit_coin = coin::mint_for_testing<SUI>(100_000_000, ctx);
    survey_vault::deposit_gas(&mut vault, deposit_coin);
    
    assert!(survey_vault::gas_balance_value(&vault) == 600_000_000, 0);
    
    survey_vault::share_vault(vault);
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
    
    let vault = survey_vault::create(
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
    
    let mut survey = survey_registry::create_survey_for_testing(
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
    survey_vault::claim(
        &mut vault,
        &survey,
        &pass,
        option::some(vector[1, 2, 3]), // encrypted_answers
        option::none(),
        &clock,
        ctx
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
    
    let vault = survey_vault::create(
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
    
    let mut survey = survey_registry::create_survey_for_testing(
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

    survey_vault::claim(
        &mut vault,
        &survey,
        &pass,
        option::some(vector[1, 2, 3]),
        option::none(),
        &clock,
        ctx
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
    let ctx = test_scenario::ctx(&mut scenario);
    
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    
    let mut vault = survey_vault::create(
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
    
    survey_vault::set_sponsor_address(&mut vault, @0x8888, test_scenario::ctx(&mut scenario));
    survey_vault::set_gas_compensation_amount(&mut vault, 8_000_000, test_scenario::ctx(&mut scenario));
    
    assert!(survey_vault::sponsor_address(&vault) == @0x8888, 0);
    assert!(survey_vault::gas_compensation_amount(&vault) == 8_000_000, 1);
    
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
    
    let mut vault = survey_vault::create(
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
    
    let mut survey = survey_registry::create_survey_for_testing(
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
        let vault = survey_vault::create(
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
        let mut survey = survey_registry::create_survey_for_testing(
            vault_id, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        survey_vault::claim(&mut vault, &survey, &pass, option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
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
        let mut survey = survey_registry::create_survey_for_testing(
            vault_id, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        survey_vault::claim(&mut vault, &survey, &pass, option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
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
        let vault = survey_vault::create(
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
        let mut survey = survey_registry::create_survey_for_testing(
            vault_id, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        survey_vault::claim(&mut vault, &survey, &pass, option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
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
        let mut survey = survey_registry::create_survey_for_testing(
            vault_id, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        survey_vault::claim(&mut vault, &survey, &pass, option::some(vector[4, 5, 6]), option::none(), &clock, test_scenario::ctx(&mut scenario));
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
    let v1 = survey_vault::create(ssr1, 10, 0, 1, 100, 100000, @0xEEEE, gas1, @0x2222, 5_000_000, 0, 0, option::none(), ctx);
    let id1 = survey_vault::id_of(&v1);
    survey_vault::share_vault(v1);
    let ssr2 = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas2 = coin::mint_for_testing<SUI>(500_000_000, ctx);
    let v2 = survey_vault::create(ssr2, 10, 0, 1, 100, 100000, @0xEEEE, gas2, @0x2222, 5_000_000, 0, 0, option::none(), ctx);
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
        let mut survey = survey_registry::create_survey_for_testing(
            id1, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        survey_vault::claim(&mut vault, &survey, &pass, option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
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
        let mut survey = survey_registry::create_survey_for_testing(
            id2, creator, vector[1, 2, 3], option::some(vector[1, 2, 3]), option::none(),
            vector[1, 2, 3], vector[], vector[2], test_scenario::ctx(&mut scenario)
        );
        survey_vault::claim(&mut vault, &survey, &pass, option::some(vector[1, 2, 3]), option::none(), &clock, test_scenario::ctx(&mut scenario));
        assert!(survey_vault::claim_count_of(&vault, resp_a) == 1, 0);
        clock::destroy_for_testing(clock);
        survey_registry::destroy_survey_for_testing(survey);
        test_scenario::return_shared(pass);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}

#[test]
fun test_claim_with_storage_compensation_success() {
    let creator = @0x1111;
    let sponsor = @0x2222;
    let respondent = @0x3333;
    
    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);
    
    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    // 預提 = 5,000,000 Gas + 10,000,000 Storage = 15,000,000 MIST。給予 500,000,000 MIST。
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
    
    let vault = survey_vault::create(
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
        10_000_000, // 儲存補貼 10,000,000 MIST
        0,
        option::none(),
        ctx
    );
    survey_vault::share_vault(vault);
    
    let pass = survey_pass::create_for_testing(respondent, 200000, ctx);
    
    // 模擬 respondent 填答交易，使用去中心化儲存 answer_blob_id
    let mut builder = test_scenario::ctx_builder_from_sender(respondent);
    let current_rgp = test_scenario::ctx(&mut scenario).reference_gas_price();
    builder = test_scenario::set_reference_gas_price(builder, current_rgp);
    builder = test_scenario::set_sponsor(builder, sponsor);
    test_scenario::next_with_context(&mut scenario, builder);
    
    let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
    let vault_id = sui::object::id(&vault);
    let ctx = test_scenario::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    
    let mut survey = survey_registry::create_survey_for_testing(
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

    survey_vault::claim(
        &mut vault,
        &survey,
        &pass,
        option::none(),
        option::some(vector[100, 101, 102]), // answer_blob_id
        &clock,
        ctx
    );
    
    // 驗證金庫的 Gas 基金是否減少了 15,000,000 MIST (5M gas + 10M storage)
    assert!(survey_vault::gas_balance_value(&vault) == 485_000_000, 0);
    
    clock::destroy_for_testing(clock);
    survey_pass::delete_pass_for_testing(pass);
    survey_registry::destroy_survey_for_testing(survey);
    test_scenario::return_shared(vault);
    
    // 驗證 sponsor 是否收到了 15,000,000 MIST 的 SUI Coin
    test_scenario::next_tx(&mut scenario, sponsor);
    let reward_coin = test_scenario::take_from_address<Coin<SUI>>(&scenario, sponsor);
    assert!(coin::value(&reward_coin) == 15_000_000, 1);
    
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
fun test_claim_with_nft_marking_success() {
    let creator = @0x1111;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    // 取得 DummyNFT 的完整類型名稱作為 allowed_nft_type
    let allowed_nft = option::some(std::ascii::into_bytes(std::type_name::into_string(std::type_name::get<DummyNFT>())));

    let vault = survey_vault::create(
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
        0, // premium_fee = 0
        allowed_nft,
        ctx
    );
    let vault_id = sui::object::id(&vault);
    survey_vault::share_vault(vault);

    // 模擬填答者持有正確的 DummyNFT 進行填答
    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let nft = DummyNFT { id: sui::object::new(ctx) };

        survey_vault::claim_with_nft_marking(
            &mut vault,
            &nft,
            option::some(vector[1, 2, 3]),
            option::none(),
            &clock,
            ctx
        );

        // 驗證已被領取一次，claimed_count = 1
        assert!(survey_vault::claimed_count(&vault) == 1, 0);

        clock::destroy_for_testing(clock);
        let DummyNFT { id } = nft;
        sui::object::delete(id);
        test_scenario::return_shared(vault);
    };
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EInvalidNftType)]
fun test_claim_with_nft_marking_invalid_type_fails() {
    let creator = @0x1111;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    // 限制只能用 DummyNFT
    let allowed_nft = option::some(std::ascii::into_bytes(std::type_name::into_string(std::type_name::get<DummyNFT>())));

    let vault = survey_vault::create(
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

        survey_vault::claim_with_nft_marking(
            &mut vault,
            &nft,
            option::some(vector[1, 2, 3]),
            option::none(),
            &clock,
            ctx
        );

        clock::destroy_for_testing(clock);
        let AnotherDummyNFT { id } = nft;
        sui::object::delete(id);
        test_scenario::return_shared(vault);
    };
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_vault::EDuplicateNullifier)]
fun test_claim_with_nft_marking_duplicate_fails() {
    let creator = @0x1111;
    let respondent = @0x3333;

    let mut scenario = test_scenario::begin(creator);
    let ctx = test_scenario::ctx(&mut scenario);

    let ssr_coin = coin::mint_for_testing<STACKED_SURVEY_REWARD>(1000, ctx);
    let gas_coin = coin::mint_for_testing<SUI>(500_000_000, ctx);

    // 取得 DummyNFT 的完整類型名稱作為 allowed_nft_type
    let allowed_nft = option::some(std::ascii::into_bytes(std::type_name::into_string(std::type_name::get<DummyNFT>())));

    let vault = survey_vault::create(
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
    survey_vault::share_vault(vault);

    // 第一次填答，成功
    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        let nft = DummyNFT { id: sui::object::new(ctx) };

        survey_vault::claim_with_nft_marking(
            &mut vault,
            &nft,
            option::some(vector[1, 2, 3]),
            option::none(),
            &clock,
            ctx
        );

        clock::destroy_for_testing(clock);
        sui::transfer::public_transfer(nft, respondent);
        test_scenario::return_shared(vault);
    };

    // 第二次用同一個 NFT ID 填答，應報錯 EDuplicateNullifier
    test_scenario::next_tx(&mut scenario, respondent);
    {
        let mut vault = test_scenario::take_shared<SurveyVault>(&scenario);
        let nft = test_scenario::take_from_sender<DummyNFT>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        survey_vault::claim_with_nft_marking(
            &mut vault,
            &nft,
            option::some(vector[1, 2, 3]),
            option::none(),
            &clock,
            ctx
        );

        clock::destroy_for_testing(clock);
        let DummyNFT { id } = nft;
        sui::object::delete(id);
        test_scenario::return_shared(vault);
    };

    test_scenario::end(scenario);
}
