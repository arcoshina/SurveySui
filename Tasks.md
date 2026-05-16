# SurveySui 任務進度清單

> 來源：[MVP_TDD.md](MVP_TDD.md)
> 狀態圖例：`[ ]` 未開始 / `[~]` 進行中 / `[x]` 完成 / `[-]` 延後或排除
> TDD 原則：每個 task 先提交「失敗的測試」，再提交「實作 + 測試通過」

---

## 進度總覽

| 里程碑 | 完成 / 總數 | 備註 |
|---|---|---|
| M0 基礎設施 | 3 / 3 | 完成 |
| M1 Move Contracts | 6 / 7 | T1.7 延後（待實際對 testnet 部署驗證）|
| M2 Backend | 0 / 9 | |
| M3 Frontend | 0 / 9 | |
| M4 整合 & Demo | 0 / 2 | |
| **合計** | **9 / 30** | |

下一步：**T2.1 — Fastify server + 完整 Prisma schema**

---

## 📦 M0 基礎設施

### [x] T0.1 — Monorepo 初始化
- [x] 結構：`/contracts` `/backend` `/frontend` `/scripts`
- [x] pnpm workspaces、共用 ESLint、tsconfig、prettier
- [x] `pnpm install && pnpm -r build && pnpm -r typecheck` 全綠

### [x] T0.2 — 環境變數 / Secrets / Faucet 工具
- [x] `scripts/faucet.ts`：呼叫 testnet faucet 幫 admin / test address 領 SUI
- [x] `.env.example` 列出所有必要 secrets（網路、admin key、DATABASE_URL、Google OAuth、ZK prover、object IDs）
- [x] `scripts/env-sync.ts`：deploy 後自動把 object id 寫回 `.env.shared`
- TDD
  - [x] `test_faucet_returns_sui_to_address`
  - [x] `test_env_loader_aborts_on_missing_required_var`

### [x] T0.3 — CI Pipeline（GitHub Actions）
- [x] `move-test` job（Sui CLI + `sui move test`）
- [x] `backend-test` job（pnpm + Vitest + Postgres service）
- [x] `frontend-test` job（pnpm + Vitest + Playwright headless）
- [x] 共用 cache（pnpm store、Sui CLI binary）
- TDD
  - [x] CI 三個 job 全綠
  - [-] 故意推 typo PR 驗證會被擋下（push 後於 GitHub 驗證）

---

## ⛓ M1 Move Contracts

### [x] T1.1 — `reward_coin` module
- [x] `init` 發行 TreasuryCap（capped 1B，9 decimals）
- [x] admin 開放 `mint`、任何人開放 `burn`
- [x] `transfer_admin`（production key rotation）
- TDD
  - [x] `test_mint_by_admin_succeeds`
  - [x] `test_mint_by_non_admin_aborts`
  - [x] `test_total_supply_capped`
  - [x] `test_burn_reduces_supply`
  - [x] `test_transfer_admin_by_admin_succeeds`
  - [x] `test_transfer_admin_by_non_admin_aborts`

### [x] T1.2 — `participant_sbt` module（護照機制）
- [x] struct `ParticipantSBT`（含 status: ACTIVE / REVOKED / SUPERSEDED）
- [x] 僅 `key`，不含 `store`（阻擋 `public_transfer`）
- [x] 全域共享 `SbtRegistry`（active_serial_by_sub）
- [x] `issue` / `reissue` / `revoke`（皆 admin only）
- [x] view function `is_valid(sbt, clock)`
- TDD
  - [x] `test_issue_first_time_succeeds`
  - [x] `test_issue_aborts_when_sub_already_has_active`
  - [x] `test_sbt_cannot_be_transferred`（compile-fail test）
  - [x] `test_non_admin_cannot_issue_or_revoke_or_reissue`
  - [x] `test_revoke_marks_status_and_clears_registry`
  - [x] `test_after_revoke_can_issue_new_to_same_sub`
  - [x] `test_reissue_marks_old_superseded_and_registry_points_to_new`
  - [x] `test_is_valid_returns_false_after_expiration`
  - [x] `test_is_valid_returns_false_when_revoked_or_superseded`

### [x] T1.3 — `survey_vault` module（核心）
- [x] struct `SurveyVault<phantom T>`（balance, per_response, max_responses, deadline, claimed, admin, status）
- [x] `create` 回傳 vault（不在內部 share）
- [x] `share_vault` PTB 末端呼叫
- [x] `fund` 任何人可加碼
- [x] `claim` admin only：檢查 vault 狀態 + SBT 有效性 + sub_hash 未領過
- [x] `close` creator only：退還剩餘 balance
- TDD
  - [x] `test_create_vault_with_correct_params`
  - [x] `test_create_returns_vault_unshared`
  - [x] `test_fund_increases_balance`
  - [x] `test_claim_happy_path`
  - [x] `test_claim_aborts_when_no_quota`
  - [x] `test_claim_aborts_when_expired`
  - [x] `test_claim_aborts_when_already_claimed`
  - [x] `test_claim_aborts_when_sbt_revoked_or_expired`
  - [x] `test_claim_aborts_when_sub_already_claimed_via_old_sbt`
  - [x] `test_claim_aborts_when_caller_not_admin`
  - [x] `test_close_returns_balance_to_creator`
  - [x] `test_close_aborts_when_caller_not_creator`

### [x] T1.4 — `amm_pool` module（CPMM）
- [x] struct `Pool<phantom A, phantom B>`（reserve_a, reserve_b, lp_supply）
- [x] `init_pool` / `add_liquidity` / `remove_liquidity`
- [x] `swap_a_to_b` / `swap_b_to_a`（0.3% fee）
- TDD
  - [x] `test_initial_liquidity_mints_correct_lp`
  - [x] `test_add_liquidity_proportional`
  - [x] `test_swap_preserves_k_within_fee`
  - [x] `test_swap_amount_out_matches_formula`
  - [x] `test_remove_liquidity_returns_correct_assets`
  - [x] `test_swap_aborts_on_zero_reserves`

### [x] T1.5 — `survey_registry` module
- [x] struct `Survey`（vault_id, creator, content_hash, status）
- [x] 註冊事件供前端訂閱
- TDD
  - [x] `test_register_emits_event`
  - [x] `test_query_by_creator`

### [x] T1.6 — Module integration test
- [x] `test_scenario` 模擬：admin mint SBT → creator 注資 vault → admin claim → recipient swap RWD→SUI
- TDD
  - [x] `test_full_lifecycle_e2e_in_move`

### [-] T1.7 — Deploy package + 初始化 AMM 流動性（延後：尚未對 testnet 實際執行）
- [x] `scripts/src/init.ts`：deploy + mint 種子 RWD + 開 RWD/SUI pool + 注入初始流動性（程式碼已寫）
- TDD
  - [-] `test_pool_reserves_both_nonzero`（integration，需 `INTEGRATION=1 AMM_POOL_ID=<id>`；尚未對 testnet 驗證）

---

## 🔧 M2 Backend

### [ ] T2.1 — Fastify server + 完整 Prisma schema
- [ ] `users`（zk_sub_hash UNIQUE, sui_address）
- [ ] `participant_sbts`（serial UNIQUE, sbt_object_id, status, supersede_of）
- [ ] `surveys`（vault_object_id, content_md, content_hash, deadline, status）
- [ ] `questions`（type, prompt, options_json, required）
- [ ] `responses`（answers_json, content_hash, claimed_tx, UNIQUE(survey_id, sub_hash)）
- TDD
  - [ ] migration apply 後 schema 與 ER 一致
  - [ ] `test_unique_constraints_block_duplicates`

### [ ] T2.2 — zkLogin 登入流程
- [ ] `/auth/google/start` → Google OAuth
- [ ] `/auth/zklogin/finalize` → 驗證 ZK proof，取得 sui_address / sub
- [ ] `sub` SHA256 → `sub_hash` 存 DB
- TDD
  - [ ] `test_oauth_redirect_correct_url`
  - [ ] `test_invalid_jwt_rejected`
  - [ ] `test_same_sub_returns_existing_user`
  - [ ] zk proof verifier mock happy / fail path

### [ ] T2.3 — SBT issuance service（護照機制）
- [ ] 新使用者首次登入 → `issue` ttl_ms=180d
- [ ] 既有使用者：仍有效 → 跳過；< 14d 將過期 → 自動 reissue
- [ ] `POST /admin/sbt/revoke`
- [ ] `POST /admin/sbt/reissue`
- [ ] 定期掃描將過期記錄並 log
- TDD
  - [ ] `test_first_login_issues_sbt_with_correct_ttl`
  - [ ] `test_second_login_within_validity_skips_issue`
  - [ ] `test_login_near_expiration_triggers_reissue_and_marks_old_superseded`
  - [ ] `test_admin_revoke_endpoint_calls_contract_and_updates_db`
  - [ ] `test_after_revoke_next_login_issues_new_sbt`
  - [ ] `test_admin_reissue_endpoint_supersedes_old_and_issues_new`
  - [ ] `test_db_and_chain_atomicity`
  - [ ] `test_only_admin_can_call_admin_endpoints`

### [ ] T2.4 — Survey CRUD API
- [ ] `POST /surveys`：parse Markdown + metadata
- [ ] `GET /surveys/:id`
- [ ] 上鏈呼叫 `survey_registry::register`
- TDD
  - [ ] `test_markdown_parser_handles_all_question_types`（單選 / 多選 / 簡答 / 量表）
  - [ ] `test_invalid_metadata_rejected`
  - [ ] `test_duplicate_question_ids_rejected`
  - [ ] `test_survey_create_writes_hash_onchain`

### [ ] T2.5 — Response 儲存 + 資格檢查
- [ ] `POST /surveys/:id/responses`
- [ ] 檢查：有效 SBT、sub_hash 未領過、未截止、有名額
- [ ] SHA256 hash 存 DB
- TDD
  - [ ] `test_response_accepted_when_eligible`
  - [ ] `test_rejected_when_no_sbt`
  - [ ] `test_rejected_when_sbt_expired_or_revoked`
  - [ ] `test_rejected_when_already_claimed`
  - [ ] `test_rejected_when_quota_exhausted`
  - [ ] `test_rejected_when_expired`
  - [ ] `test_response_hash_deterministic`

### [ ] T2.6 — Reward dispatcher（後端代簽 PTB）
- [ ] admin key 簽 `survey_vault::claim`
- [ ] transaction queue 避免 nonce 衝突
- [ ] 寫回 `responses.claimed_tx`
- TDD
  - [ ] `test_dispatcher_signs_and_submits`
  - [ ] `test_concurrent_claims_serialized`（100 個併發不會 nonce 衝突）
  - [ ] `test_chain_failure_rolls_back_db`
  - [ ] `test_retry_on_transient_error`

### [ ] T2.7 — Stats aggregator API
- [ ] `GET /surveys/:id/stats`（回覆數、完成率、各題分佈、vault 餘額）
- TDD
  - [ ] `test_stats_match_db_truth`
  - [ ] `test_scale_question_average`
  - [ ] `test_choice_question_distribution`

### [ ] T2.8 — 結束活動 API
- [ ] `POST /surveys/:id/close`：creator 自己簽，後端只 mark 狀態
- TDD
  - [ ] `test_close_marks_status`
  - [ ] `test_close_only_by_creator`
  - [ ] `test_after_close_responses_rejected`

### [ ] T2.9 — Admin key 安全
- [ ] env var + dotenv（roadmap：AWS KMS）
- [ ] 啟動時檢查 admin address 與合約 admin 一致
- TDD
  - [ ] `test_missing_admin_key_aborts_startup`
  - [ ] `test_admin_address_mismatch_aborts_startup`

---

## 🎨 M3 Frontend

### [ ] T3.1 — Vite + React + @mysten/dapp-kit + Tailwind
- [ ] 四路由：`/create`、`/dashboard`、`/s/:id`、`/swap`
- [ ] `<SuiClientProvider>` + `<WalletProvider>` 包 App root
- [ ] Testnet 連線設定
- [ ] `index.html` 全站通用 OG meta tags（baseline）
- TDD
  - [ ] Playwright smoke test：四個路由皆可載入

### [ ] T3.2 — 發起者：建立問卷頁
- [ ] Markdown editor + 預覽欄
- [ ] 設定獎勵金額、名額、截止日
- TDD
  - [ ] `test_form_validation_blocks_invalid_input`
  - [ ] `test_preview_renders_markdown`
  - [ ] `test_submit_calls_create_api`

### [ ] T3.3 — 發起者：注資頁（連錢包簽 PTB）
- [ ] 預估 SUI 消耗顯示
- [ ] 一鍵 PTB：swap → create → fund → share_vault
- [ ] 失敗 atomic rollback
- TDD
  - [ ] `test_estimated_cost_calculation`
  - [ ] `test_ptb_constructed_correctly`（snapshot test）
  - [ ] `test_wallet_rejection_handled`

### [ ] T3.4 — 發起者：儀表板
- [ ] Recharts 統計圖
- [ ] 鏈上即時查詢 vault 餘額
- [ ] 結束活動按鈕
- TDD
  - [ ] `test_dashboard_renders_stats`
  - [ ] `test_close_button_disabled_until_eligible`

### [ ] T3.5 — 受訪者：zkLogin 登入頁
- [ ] Google OAuth 按鈕
- [ ] SBT 非同步流程：pending state + poll `GET /me/sbt-status`
- TDD
  - [ ] `test_login_redirects_to_google`
  - [ ] `test_callback_creates_session`
  - [ ] `test_ui_shows_pending_state_until_sbt_active`
  - [ ] `test_ui_unlocks_after_sbt_status_active`

### [ ] T3.6 — 受訪者：問卷填答頁
- [ ] 從 backend 拉 questions JSON 渲染
- [ ] 提交前預覽
- [ ] 成功後顯示 TX hash
- TDD
  - [ ] `test_required_questions_block_submit`
  - [ ] `test_review_screen_shows_all_answers`
  - [ ] `test_success_state_shows_tx_hash`

### [ ] T3.7 — Swap UI（RWD ↔ SUI）
- [ ] 兩個 input + 自動算 amount_out
- [ ] `SuiClient.getObject(POOL_ID)` 讀 reserves，CPMM 公式計算
- [ ] 使用者錢包簽 PTB 呼叫 `swap_a_to_b` / `swap_b_to_a`
- TDD
  - [ ] `test_amount_out_matches_contract_simulation`
  - [ ] `test_pool_object_fetch_handles_stale_data`
  - [ ] `test_slippage_warning_above_5pct`

### [ ] T3.8 — RWD + i18n（中文為主）
- [ ] 桌機 / 手機驗證
- [ ] 中文字型
- TDD
  - [ ] Playwright responsive test（375 / 768 / 1440）

### [ ] T3.9 — Social Sharing Preview（動態 OG meta tags）⏸ 優先級：低
- [ ] Cloudflare Worker / Vercel Edge Function 攔截 `/s/:id`
- [ ] 爬蟲 UA → 取 metadata 回傳動態 OG tags
- [ ] 一般 UA → passthrough SPA
- TDD
  - [ ] `test_edge_function_returns_dynamic_og_for_bot_user_agent`
  - [ ] `test_edge_function_passthrough_for_human_user_agent`
  - [ ] `test_og_tags_contain_correct_survey_title_and_description`
  - [ ] `test_fallback_to_default_og_when_survey_id_not_found`

---

## 🚀 M4 整合 & Demo

### [ ] T4.1 — E2E 整合測試（Playwright）
- [ ] 完整流程：建立 → 注資 → zkLogin → 填答 → 拿 RWD → swap 成 SUI
- [ ] 本機 `sui start` localnet 跑測試
- [ ] pre-demo 跑一次 testnet 確認
- TDD
  - [ ] 1 個完整 happy-path scenario
  - [ ] 3 個 sad-path（已領過 / 已截止 / 名額用盡）

### [ ] T4.2 — Demo 腳本 + README + 投影片連結
- [ ] README：Quickstart、合約地址、demo URL
- [ ] 5 分鐘 demo 腳本（場景 → walkthrough → 鏈上交易）
- TDD
  - [ ] 跟著腳本跑能在 5 分鐘內完成

---

## 排除於 MVP（v2 roadmap）

- [-] Testnet ↔ Mainnet 跨網路橋
- [-] 多階段獎勵
- [-] AI 輔助 Markdown 編輯 / RAG 建議
- [-] 進階參與條件（國籍、年齡、UID、邀請碼）
- [-] 匿名化投票
- [-] 結果加密上鏈
- [-] Sponsored transaction 給受訪者

---

## Definition of Done（最終驗收）

- [ ] `pnpm -r build && pnpm -r test` 全綠
- [ ] `pnpm move test` 合約測試綠
- [ ] `pnpm deploy:testnet` 合約 deploy + AMM 種子流動性
- [ ] `pnpm dev` 起 backend + frontend
- [ ] 發起者建立問卷 + 注資 + 看到鏈上交易
- [ ] 受訪者 Google 登入 → 填答 → 看到 +1 RWD + TX hash → swap 成 SUI
- [ ] 發起者 dashboard 看到回覆與正確 vault 餘額
- [ ] `pnpm e2e` Playwright 全綠
