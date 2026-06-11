#[test_only]
module surveysui::survey_pass_tests;

use sui::test_scenario;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use surveysui::survey_pass::{Self, NullifierRegistry, SurveyPass};

const ADMIN: address = @0xADD; // 部署者 / 項目方（init 時成為 config.admin）
const OWNER: address = @0xAAAA;
const OTHER: address = @0xBBBB;
const SPONSOR: address = @0x5005; // 代付鑄造時的 deposit_payer（= BFF sponsor 位址，非 owner）

// 須與 survey_pass.move 的 REBATE_FEE_FLOOR 一致
const REBATE_FEE_FLOOR: u64 = 10_000_000;

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

// T1.6-a: 2-nullifier mint 成功（Social 帳號 + email 各一個 nullifier）
#[test]
fun test_mint_with_two_nullifiers() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let primary = make_nullifier(1);
        let secondary = make_nullifier(2);
        let nullifiers = vector[primary, secondary];
        let commitment = vector<u8>[];
        let expires_at = 9_999_999_999_999u64;

        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            3, // SRC_SOCIAL
            nullifiers,
            commitment,
            expires_at,
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// T1.6-b: 第二個地址嘗試用相同 secondary nullifier mint → EDuplicateNullifier
#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EDuplicateNullifier)]
fun test_duplicate_secondary_nullifier_rejected() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    // OWNER mint（有 primary + secondary）
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let primary_owner = make_nullifier(10);
        let shared_secondary = make_nullifier(99);
        let nullifiers = vector[primary_owner, shared_secondary];

        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            3,
            nullifiers,
            vector<u8>[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    // OTHER 嘗試用相同 secondary nullifier mint → 應被拒
    test_scenario::next_tx(&mut scenario, OTHER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let primary_other = make_nullifier(20);
        let shared_secondary = make_nullifier(99); // 同上 OWNER 的 secondary
        let nullifiers = vector[primary_other, shared_secondary];

        survey_pass::mint_pass_for_testing(
            &mut registry,
            OTHER,
            3,
            nullifiers,
            vector<u8>[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// 自付鑄造（deposit_payer = owner）的擁有者可直接刪除 Active Pass（不需先 Revoke）
#[test]
fun test_owner_delete_active_pass() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    // OWNER mint 一個 Active Pass（自付：deposit_payer = OWNER）
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(1)];
        survey_pass::mint_pass_for_testing(
            &mut registry, OWNER, 2, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    // OWNER 直接刪除（Active 狀態）→ 應成功
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        survey_pass::delete_pass(&mut registry, pass, ctx);

        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// 刪除後 nullifier 應被釋放：同一身分可將該 nullifier 重新綁定至另一個地址（遷移）。
// 每問卷的防重複改由 survey_vault 在填答層以 H(nullifier‖vault_id) 維護。
#[test]
fun test_delete_frees_nullifier_for_rebind() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    // OWNER mint（帶已知 nullifier，自付）
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(42)];
        survey_pass::mint_pass_for_testing(
            &mut registry, OWNER, 2, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    // OWNER 刪除自己的 Pass（nullifier 應從 registry.used 釋放）
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        survey_pass::delete_pass(&mut registry, pass, ctx);

        test_scenario::return_shared(registry);
    };
    // OTHER 用相同 nullifier mint → 應成功（證明刪除已釋放 nullifier，可重新綁定）
    test_scenario::next_tx(&mut scenario, OTHER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(42)]; // 同上 OWNER 的 nullifier
        survey_pass::mint_pass_for_testing(
            &mut registry, OTHER, 2, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// 自付鑄造的 Pass：非擁有者（非付款人）不可刪除 → EOwnerMismatch
#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EOwnerMismatch)]
fun test_non_owner_cannot_delete() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    // OWNER mint（自付：deposit_payer = OWNER）
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(7)];
        survey_pass::mint_pass_for_testing(
            &mut registry, OWNER, 2, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    // OTHER 嘗試刪除 OWNER 的自付 Pass → sender != deposit_payer → abort EOwnerMismatch
    test_scenario::next_tx(&mut scenario, OTHER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        survey_pass::delete_pass(&mut registry, pass, ctx);

        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// 代付鑄造（deposit_payer = SPONSOR）：擁有者不可自己 delete_pass → EOwnerMismatch
// （杜絕繞過後端自刪拿返還）
#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EOwnerMismatch)]
fun test_sponsored_owner_cannot_delete() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(60)];
        survey_pass::mint_pass_for_testing_with_payer(
            &mut registry, OWNER, SPONSOR, 5, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    // OWNER 嘗試 delete_pass → sender(OWNER) != deposit_payer(SPONSOR) → abort EOwnerMismatch
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        survey_pass::delete_pass(&mut registry, pass, ctx);

        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// 代付鑄造：付款人（sponsor）可代為刪除 → 成功（返還回 sponsor）
#[test]
fun test_sponsored_payer_can_delete() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(61)];
        survey_pass::mint_pass_for_testing_with_payer(
            &mut registry, OWNER, SPONSOR, 5, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    // SPONSOR（付款人）代刪 → 成功
    test_scenario::next_tx(&mut scenario, SPONSOR);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        survey_pass::delete_pass(&mut registry, pass, ctx);

        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// 逃生門：擁有者附足額費用自刪代付 Pass → 成功，且費用轉入付款人(SPONSOR)
#[test]
fun test_self_delete_sponsored_with_fee_ok() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(62)];
        survey_pass::mint_pass_for_testing_with_payer(
            &mut registry, OWNER, SPONSOR, 5, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    // OWNER 自付逃生門：附 >= REBATE_FEE_FLOOR * 2 的費用
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        let fee = coin::mint_for_testing<SUI>(REBATE_FEE_FLOOR * 2, ctx);
        survey_pass::self_delete_sponsored_pass(&mut registry, pass, fee, ctx);

        test_scenario::return_shared(registry);
    };
    // 驗證費用已轉入 SPONSOR（付款人）
    test_scenario::next_tx(&mut scenario, SPONSOR);
    {
        let received = test_scenario::take_from_address<coin::Coin<SUI>>(&scenario, SPONSOR);
        assert!(coin::value(&received) == REBATE_FEE_FLOOR * 2, 0);
        test_scenario::return_to_address(SPONSOR, received);
    };
    test_scenario::end(scenario);
}

// 逃生門：費用不足 → EFeeTooLow
#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EFeeTooLow)]
fun test_self_delete_fee_too_low() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(63)];
        survey_pass::mint_pass_for_testing_with_payer(
            &mut registry, OWNER, SPONSOR, 5, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        let fee = coin::mint_for_testing<SUI>(REBATE_FEE_FLOOR * 2 - 1, ctx);
        survey_pass::self_delete_sponsored_pass(&mut registry, pass, fee, ctx);

        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// 逃生門：非擁有者呼叫 → EOwnerMismatch
#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EOwnerMismatch)]
fun test_self_delete_non_owner() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(64)];
        survey_pass::mint_pass_for_testing_with_payer(
            &mut registry, OWNER, SPONSOR, 5, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OTHER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        let fee = coin::mint_for_testing<SUI>(REBATE_FEE_FLOOR * 2, ctx);
        survey_pass::self_delete_sponsored_pass(&mut registry, pass, fee, ctx);

        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// 逃生門：對自付鑄造（deposit_payer = owner）的 Pass 呼叫 → EOwnerMismatch（此路徑僅適用代付 Pass）
#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EOwnerMismatch)]
fun test_self_delete_on_self_funded_aborts() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifiers = vector[make_nullifier(65)];
        survey_pass::mint_pass_for_testing( // 自付：deposit_payer = OWNER
            &mut registry, OWNER, 2, nullifiers, vector<u8>[], 9_999_999_999_999u64, &clock, ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        let fee = coin::mint_for_testing<SUI>(REBATE_FEE_FLOOR * 2, ctx);
        survey_pass::self_delete_sponsored_pass(&mut registry, pass, fee, ctx);

        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// T1.6-c: Email OTP 1-element nullifier 向後相容（source=2）
#[test]
fun test_email_otp_single_nullifier_compat() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let email_nullifier = make_nullifier(50);
        let nullifiers = vector[email_nullifier]; // 只有 1 個（Email OTP 舊路徑）

        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            2, // SRC_EMAIL
            nullifiers,
            vector<u8>[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// T1.6-d: 相同地址重複 mint（primary + secondary 完全相同）→ 允許（owner 相同不衝突）
#[test]
fun test_same_owner_same_nullifier_allowed() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifier = make_nullifier(77);
        let nullifiers = vector[nullifier];

        // 第一次 mint
        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            2,
            nullifiers,
            vector<u8>[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    // 第二次 mint（相同 nullifier，相同 owner）→ 不報錯（register_nullifier 允許同 owner）
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let nullifier = make_nullifier(77);
        let nullifiers = vector[nullifier];

        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            3,
            nullifiers,
            vector<u8>[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

#[test]
fun test_admin_revoke_credential_success() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };

    // 1. OWNER 鑄造 Pass 綁定 Google (6)
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        // Google 憑證 (source = 6)
        let google_nullifier = make_nullifier(6);
        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            6,
            vector[google_nullifier],
            vector[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };

    // 2. 管理員註銷 Google (6) 憑證
    test_scenario::next_tx(&mut scenario, ADMIN);
    {
        let config = test_scenario::take_shared<surveysui::survey_pass::IssuerConfig>(&scenario);
        let mut pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        survey_pass::admin_revoke_credential(
            &mut pass,
            &config,
            6, // 註銷 Google
            ctx,
        );

        test_scenario::return_shared(config);
        test_scenario::return_shared(pass);
    };

    // 3. 驗證該憑證是否失效
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        // Google 應該無效了
        assert!(!survey_pass::is_source_valid(&pass, 6, &clock), 0);
        // 整體 Pass 也無效了（因為唯一的憑證被註銷了）
        assert!(!survey_pass::is_valid(&pass, &clock), 0);

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(pass);
    };

    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EDuplicateNullifier)]
fun test_admin_revoke_credential_nullifier_stays_pinned() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        let google_nullifier = make_nullifier(6);
        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            6,
            vector[google_nullifier],
            vector[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, ADMIN);
    {
        let config = test_scenario::take_shared<surveysui::survey_pass::IssuerConfig>(&scenario);
        let mut pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::admin_revoke_credential(&mut pass, &config, 6, ctx);
        test_scenario::return_shared(config);
        test_scenario::return_shared(pass);
    };
    test_scenario::next_tx(&mut scenario, OTHER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        let google_nullifier = make_nullifier(6);
        survey_pass::mint_pass_for_testing(
            &mut registry,
            OTHER,
            6,
            vector[google_nullifier],
            vector[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}

// OAuth 雙憑證：單筆 mint 寫入 Google(6) + Email(2) 兩個 credential source
#[test]
fun test_mint_with_extra_credentials_dual_source() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let google_nullifier = make_nullifier(6);
        let email_nullifier = make_nullifier(2);

        survey_pass::mint_pass_with_extra_for_testing(
            &mut registry,
            OWNER,
            OWNER,
            6, // SRC_SOCIAL_GOOGLE
            vector[google_nullifier],
            vector<u8>[],
            9_999_999_999_999u64,
            vector[2], // SRC_EMAIL
            vector[vector[email_nullifier]],
            vector[vector<u8>[]],
            vector[9_999_999_999_999u64],
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        assert!(survey_pass::is_source_valid(&pass, 6, &clock), 0);
        assert!(survey_pass::is_source_valid(&pass, 2, &clock), 0);

        let sources = survey_pass::credential_sources(&pass);
        assert!(vector::length(&sources) == 2, 0);

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(pass);
    };
    test_scenario::end(scenario);
}

// F55: extra 與 primary 同 source 時拒絕 mint
#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EDuplicateSource)]
fun test_mint_with_extra_same_source_aborts() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        let n1 = make_nullifier(80);
        let n2 = make_nullifier(81);

        survey_pass::mint_pass_with_extra_for_testing(
            &mut registry,
            OWNER,
            OWNER,
            2,
            vector[n1],
            vector<u8>[],
            1_000u64,
            vector[2],
            vector[vector[n2]],
            vector[vector<u8>[]],
            vector[9_999_999_999_999u64],
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));

        // 同 source 只應有一槽，且以較晚的 expires_at 為準
        assert!(survey_pass::is_source_valid(&pass, 2, &clock), 0);
        assert!(vector::length(&survey_pass::credential_sources(&pass)) == 1, 0);

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(pass);
    };
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EPassAlreadyExists)]
fun test_mint_pass_duplicate_pass_aborts() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };

    // 1. OWNER 成功鑄造 Pass
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            2,
            vector[make_nullifier(1)],
            vector[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };

    // 2. OWNER 嘗試用 mint_pass 生產路徑重複鑄造，應 abort EPassAlreadyExists
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let config = test_scenario::take_shared<surveysui::survey_pass::IssuerConfig>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);

        // 呼叫 mint_pass 會 abort EPassAlreadyExists
        survey_pass::mint_pass(
            &mut registry,
            &config,
            OWNER,
            OWNER,
            2,
            vector[make_nullifier(2)],
            vector[],
            9_999_999_999_999u64,
            0,
            vector[],
            &clock,
            ctx,
        );

        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
        test_scenario::return_shared(config);
    };
    test_scenario::end(scenario);
}

// F60/F61: 竄改 commitment 後填答資格失效
#[test]
fun test_tampered_commitment_fails_is_source_valid() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            2,
            vector[make_nullifier(90)],
            vector[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        assert!(survey_pass::is_source_valid(&pass, 2, &clock), 0);
        survey_pass::set_slot_commitment_for_testing(&mut pass, 2, vector[0, 1, 2]);
        assert!(!survey_pass::is_source_valid(&pass, 2, &clock), 1);
        assert!(!survey_pass::is_valid(&pass, &clock), 2);
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(pass);
    };
    test_scenario::end(scenario);
}

// F59/F61: 救援註銷後不可再以 ticket 覆寫 slot
#[test]
#[expected_failure(abort_code = surveysui::survey_pass::ECredentialRevoked)]
fun test_apply_credential_on_revoked_slot_aborts() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            6,
            vector[make_nullifier(91)],
            vector[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, ADMIN);
    {
        let config = test_scenario::take_shared<surveysui::survey_pass::IssuerConfig>(&scenario);
        let mut pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::admin_revoke_credential(&mut pass, &config, 6, ctx);
        test_scenario::return_shared(config);
        test_scenario::return_shared(pass);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let _ctx = test_scenario::ctx(&mut scenario);
        survey_pass::apply_credential_slot_for_testing(
            &mut pass,
            6,
            vector[make_nullifier(91)],
            9_999_999_999_999u64,
            &clock,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(pass);
    };
    test_scenario::end(scenario);
}

// F54: mint 後 credential_sources 長度與實際 slot 一致
#[test]
fun test_mint_single_credential_sources_length() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::mint_pass_for_testing(
            &mut registry,
            OWNER,
            2,
            vector[make_nullifier(92)],
            vector[],
            9_999_999_999_999u64,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        assert!(vector::length(&survey_pass::credential_sources(&pass)) == 1, 0);
        test_scenario::return_shared(pass);
    };
    test_scenario::end(scenario);
}

// 代付 mint：clawback 寫入 Pass
#[test]
fun test_sponsored_mint_sets_escape_clawback() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        let clawback = 50_000_000u64;
        survey_pass::mint_pass_for_testing_with_payer_and_clawback(
            &mut registry,
            OWNER,
            SPONSOR,
            5,
            vector[make_nullifier(70)],
            vector<u8>[],
            9_999_999_999_999u64,
            clawback,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        assert!(survey_pass::escape_clawback_mist(&pass) == 50_000_000u64, 0);
        test_scenario::return_shared(pass);
    };
    test_scenario::end(scenario);
}

// 逃生門：clawback 高於 floor 時以 clawback 為 required_fee
#[test]
fun test_self_delete_uses_clawback_when_higher_than_floor() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        let clawback = REBATE_FEE_FLOOR * 5;
        survey_pass::mint_pass_for_testing_with_payer_and_clawback(
            &mut registry,
            OWNER,
            SPONSOR,
            5,
            vector[make_nullifier(71)],
            vector<u8>[],
            9_999_999_999_999u64,
            clawback,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let required = REBATE_FEE_FLOOR * 5;
        let fee = coin::mint_for_testing<SUI>(required, ctx);
        survey_pass::self_delete_sponsored_pass(&mut registry, pass, fee, ctx);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, SPONSOR);
    {
        let received = test_scenario::take_from_address<coin::Coin<SUI>>(&scenario, SPONSOR);
        assert!(coin::value(&received) == REBATE_FEE_FLOOR * 5, 0);
        test_scenario::return_to_address(SPONSOR, received);
    };
    test_scenario::end(scenario);
}

// 逃生門：clawback 高於 floor 時費用不足 → EFeeTooLow
#[test]
#[expected_failure(abort_code = surveysui::survey_pass::EFeeTooLow)]
fun test_self_delete_clawback_fee_too_low() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        let ctx = test_scenario::ctx(&mut scenario);
        survey_pass::test_init(ctx);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let clock = clock::create_for_testing(test_scenario::ctx(&mut scenario));
        let ctx = test_scenario::ctx(&mut scenario);
        let clawback = REBATE_FEE_FLOOR * 5;
        survey_pass::mint_pass_for_testing_with_payer_and_clawback(
            &mut registry,
            OWNER,
            SPONSOR,
            5,
            vector[make_nullifier(72)],
            vector<u8>[],
            9_999_999_999_999u64,
            clawback,
            &clock,
            ctx,
        );
        clock::destroy_for_testing(clock);
        test_scenario::return_shared(registry);
    };
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut registry = test_scenario::take_shared<NullifierRegistry>(&scenario);
        let pass = test_scenario::take_shared<SurveyPass>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let required = REBATE_FEE_FLOOR * 5;
        let fee = coin::mint_for_testing<SUI>(required - 1, ctx);
        survey_pass::self_delete_sponsored_pass(&mut registry, pass, fee, ctx);
        test_scenario::return_shared(registry);
    };
    test_scenario::end(scenario);
}
