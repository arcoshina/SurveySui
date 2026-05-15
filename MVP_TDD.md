# SurveySui MVP — 子任務清單 & TDD 測試規劃

## Context

`SurveySui` 是 Sui Overflow 2026 黑客松專案，瞄準 [DeFi & Payments 賽道](Overflow%20Tracks/DeFi%20%26%20Payments.md)。
目前 repo 只有規劃文件 — [MVP 規劃(手動).md](MVP%20規劃(手動).md)、[商業模式](Business_Modle/mvp-small-founder-saas.md)，**尚無任何程式碼**。

本計畫的目的：把 MVP 規劃拆成**可執行的子任務清單**，每個任務搭配 **TDD 測試案例**（先寫測試，再實作）。
過程中已透過互動釐清了 4 個技術上不可行 / 規格未定的部分，決策記錄在「已對齊的設計決策」一節。

最終 MVP 要證明的兩件事不變：
1. **金流層**：發起者注資 → vault 鎖定 → 受訪者完成問卷 → 自動領到獎勵 → 可自由 swap 換 SUI
2. **產品層**：發起者能在 UI 上一氣呵成「設計問卷 + 設定獎勵 → 分享 → 看結果」

---

## 已對齊的設計決策

| 議題 | 決策 | 理由 |
|---|---|---|
| 網路 | **Testnet only**（demo 在 Testnet；合約參數化以便未來上 mainnet） | 跨網路橋接成本太高、會吃掉黑客松整段時程 |
| 獎勵代幣 | **平台統一 utility token `RWD`**（Coin\<RWD\>） | 簡單、demo 上有完整代幣概念 |
| Swap 機制 | **自建 CPMM**（RWD / SUI），參考 [MystenLabs/sui-defi/blob/main/amm](https://github.com/MystenLabs/sui-axelar)（或 [Suia AMM](https://github.com/interest-protocol/sui-defi)） | 使用者明確指定要自建，CPMM 模型最簡 |
| 受訪者 UX | **zkLogin 登入 + 後端代簽（受訪者完全免 gas、免簽名）** | 使用者要求 gasless；後端用 admin key 持 vault 提領權 |
| 女巫防護 | **ParticipantSBT（護照機制）**：不可轉移、有效期、可補發 / 重發 / 換發 / 註銷；同一 sub 在任一時刻只能持有 1 張**有效**的 SBT | 使用者表示「真人名單是核心資產」；護照機制兼顧防女巫與帳戶恢復 |
| 問卷結果上鏈 | **MVP 只上鏈 hash**（存在性證明），原始資料存後端 | 最便宜、足以說服評審 |
| 問卷格式 | Markdown + YAML frontmatter metadata（題型、選項、必填）→ 後端 parse 成題目 JSON | 對齊規劃文件 |

---

## 系統架構

### 三層

```
┌─ Frontend (Vite + React + @mysten/dapp-kit, SPA) ───────┐
│  /create     發起者建立問卷 + 連 Sui Wallet 注資         │
│  /dashboard  發起者儀表板 + 結束活動                     │
│  /s/:id      受訪者 zkLogin → 填答 → 顯示獎勵            │
│  /swap       RWD ↔ SUI swap UI                          │
└─────────────────────────────────────────────────────────┘
                       ↕ REST / tRPC
┌─ Backend (Node.js + Fastify + Prisma + PostgreSQL) ─────┐
│  zkLogin verifier   (Google OAuth + sub → SBT 對映)     │
│  Survey CRUD        (Markdown + metadata)                │
│  Response store     (答案、hash 計算)                    │
│  Reward dispatcher  (admin key 簽 PTB → 發 RWD)         │
│  Stats aggregator   (儀表板 API)                         │
└─────────────────────────────────────────────────────────┘
                       ↕ @mysten/sui SDK
┌─ Sui Move Contracts (Testnet) ──────────────────────────┐
│  reward_coin       Coin<RWD> + TreasuryCap              │
│  participant_sbt   一人一張、不可轉、由後端 admin mint   │
│  survey_vault      Vault object: 鎖定 RWD + 發獎邏輯     │
│  amm_pool          CPMM: RWD/SUI swap、add liquidity     │
└─────────────────────────────────────────────────────────┘
```

### 資金流（核心）

```
發起者 SUI 錢包
   │ (1) 自己簽 PTB：swap SUI→RWD on amm_pool, 建 SurveyVault
   ▼
SurveyVault<RWD>  (shared object, admin = backend address)
   │ (2) 受訪者送出問卷後，後端代簽 PTB：vault.claim(recipient, sub_proof)
   ▼
受訪者 zkLogin 地址  (Coin<RWD>)
   │ (3) 受訪者選擇換 SUI：自己簽 PTB swap RWD→SUI on amm_pool
   ▼
受訪者 SUI
```

---

## 開發里程碑與子任務（共 30 個 task）

### 📦 M0：基礎設施（3 task）

#### T0.1 — Monorepo 初始化
- 結構：`/contracts`（Move）`/backend`（Node）`/frontend`（Next.js）`/scripts`（共用 deploy / faucet 工具）
- pnpm workspaces、共用 ESLint、tsconfig、prettier
- **TDD**：`pnpm install && pnpm -r build && pnpm -r typecheck` 全綠

#### T0.2 — 環境變數 / Secrets / Faucet 工具
- `scripts/faucet.ts`：呼叫 testnet faucet 幫 admin / test address 領 SUI
- `.env.example` 列出所有必要 secrets：
  - `SUI_NETWORK`（testnet）、`SUI_PACKAGE_ID`、`SUI_ADMIN_PRIVATE_KEY`、`SUI_ADMIN_ADDRESS`
  - `DATABASE_URL`、`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`ZKLOGIN_PROVER_URL`
  - `RWD_TREASURY_CAP_ID`、`AMM_POOL_ID`、`SBT_REGISTRY_ID`（T1.7 deploy 後填入）
- `scripts/env-sync.ts`：T1.7 deploy 完成後自動把 object id 寫回 `.env.shared`
- **TDD**
  - `test_faucet_returns_sui_to_address`（assert balance > 0）
  - `test_env_loader_aborts_on_missing_required_var`

#### T0.3 — CI Pipeline（GitHub Actions）
- 三個 job：`move-test`（Sui CLI + `sui move test`）、`backend-test`（pnpm + Vitest + Postgres service）、`frontend-test`（pnpm + Vitest + Playwright headless）
- 共用 cache（pnpm store、Sui CLI binary）
- **TDD**：CI 綠燈 = 三個 job 都通過；故意推一個 typo PR 驗證會擋下

---

### ⛓ M1：Move Contracts（7 task）

> 每個 module 都要有 Move test。Sui Move 用 `#[test_only]` + `sui::test_scenario`。

#### T1.1 — `reward_coin` module
- 一次性 `init` 發行 TreasuryCap，總量上限可選（MVP 用 capped 1B）
- 對 admin 開放 `mint`、對任何人開放 `burn`
- **TDD**
  - `test_mint_by_admin_succeeds`
  - `test_mint_by_non_admin_aborts`
  - `test_total_supply_capped`
  - `test_burn_reduces_supply`

#### T1.2 — `participant_sbt` module（護照機制）
- struct `ParticipantSBT { id, sub_hash, serial: u64, issued_at_ms, expires_at_ms, status: u8 }`
  - `status`: `0=ACTIVE`, `1=REVOKED`, `2=SUPERSEDED`（被換發後的舊版）
  - 只有 `key`，**不含 `store`** → 自然阻擋 `public_transfer`
- 全域共享 `SbtRegistry { active_serial_by_sub: Table<vector<u8>, u64>, next_serial: u64 }`，由 admin 管理：用來確保「同一 sub 在任一時刻只有 1 張有效 SBT」
- 函式（皆 admin only）：
  - `issue(admin_cap, registry, recipient, sub_hash, ttl_ms, ctx)` — 第一次發行；要求 `sub_hash` 在 registry 沒有 active serial
  - `reissue(admin_cap, registry, old_sbt, recipient, ttl_ms, ctx)` — 補發 / 換發：把 `old_sbt.status = SUPERSEDED`，發新的 SBT，registry 指向新 serial（用於遺失或 expires_at 接近時換發）
  - `revoke(admin_cap, registry, sbt)` — 註銷：`status = REVOKED`，registry 移除該 sub 的 active serial
- 對外 view：`is_valid(sbt, clock): bool` — `status == ACTIVE && clock.now < expires_at`
- **TDD**
  - `test_issue_first_time_succeeds`
  - `test_issue_aborts_when_sub_already_has_active`
  - `test_sbt_cannot_be_transferred`（無 `store` → `public_transfer` 不可呼叫；compile-fail test）
  - `test_non_admin_cannot_issue_or_revoke_or_reissue`
  - `test_revoke_marks_status_and_clears_registry`
  - `test_after_revoke_can_issue_new_to_same_sub`
  - `test_reissue_marks_old_superseded_and_registry_points_to_new`
  - `test_is_valid_returns_false_after_expiration`
  - `test_is_valid_returns_false_when_revoked_or_superseded`

#### T1.3 — `survey_vault` module（核心）
- struct `SurveyVault<phantom T> { id, creator, balance: Balance<RWD>, per_response: u64, max_responses: u64, deadline_ms: u64, claimed: VecSet<vector<u8>> /* sub_hash */, admin: address, status: u8 }`
- `create(creator, admin, per_response, max, deadline, ctx) -> SurveyVault<RWD>` — **回傳 vault**，不在函式內部 share；讓同一 PTB 後續呼叫 `fund` 後再呼叫 `share_vault`（避免 share 後失去 mut ref）
- `share_vault(vault)` — PTB 末端呼叫，把 vault 變成 shared object
- `fund(vault, coin)` — 任何人可加碼，但通常是 creator；可在同一 PTB 中於 share 之前呼叫
- `claim(vault, sbt: &ParticipantSBT, recipient, clock, ctx)` — admin 限定（檢查 `tx_context::sender == vault.admin`）
  - 檢查：vault 未過期、有名額、recipient 未領過
  - 檢查：`participant_sbt::is_valid(sbt, clock) == true`（status=ACTIVE 且未過期）
  - 防換發雙領：以 `sub_hash` 而非 SBT object id 寫入 `claimed`（同一個人換發新 SBT 後仍視為已領過）
  - 從 balance 扣 per_response，mint Coin<RWD> 給 recipient
- `close(vault, ctx)` — creator 限定，把剩餘 balance 退還
- **TDD**
  - `test_create_vault_with_correct_params`
  - `test_create_returns_vault_unshared`（驗證可在同 PTB 內 fund + share）
  - `test_fund_increases_balance`
  - `test_claim_happy_path`
  - `test_claim_aborts_when_no_quota`
  - `test_claim_aborts_when_expired`
  - `test_claim_aborts_when_already_claimed`（同一 sub_hash 領兩次）
  - `test_claim_aborts_when_sbt_revoked_or_expired`
  - `test_claim_aborts_when_sub_already_claimed_via_old_sbt`（換發後同一人不可重領）
  - `test_claim_aborts_when_caller_not_admin`
  - `test_close_returns_balance_to_creator`
  - `test_close_aborts_when_caller_not_creator`

#### T1.4 — `amm_pool` module（CPMM）
- struct `Pool<phantom A, phantom B> { id, reserve_a: Balance<A>, reserve_b: Balance<B>, lp_supply: Supply<LP> }`
- `init_pool`、`add_liquidity`、`remove_liquidity`、`swap_a_to_b`、`swap_b_to_a`
- 0.3% fee（標準 Uniswap v2）
- **TDD**
  - `test_initial_liquidity_mints_correct_lp`
  - `test_add_liquidity_proportional`
  - `test_swap_preserves_k_within_fee`（k_after >= k_before）
  - `test_swap_amount_out_matches_formula`
  - `test_remove_liquidity_returns_correct_assets`
  - `test_swap_aborts_on_zero_reserves`

#### T1.5 — `survey_registry` module（輕量 metadata index）
- struct `Survey { id, vault_id, creator, content_hash, created_at, status }`
- 純 on-chain 索引，事件用於前端訂閱
- **TDD**
  - `test_register_emits_event`
  - `test_query_by_creator`

#### T1.6 — Module integration test（多 module 串接）
- 用 `test_scenario` 模擬完整流程：admin mint SBT → creator 注資 vault → admin claim → recipient swap RWD→SUI
- **TDD**
  - `test_full_lifecycle_e2e_in_move`

#### T1.7 — Deploy package + 初始化 AMM 流動性
- 寫 `scripts/init.ts`：deploy 後自動 mint 種子 RWD、開 RWD/SUI pool 並注入初始流動性
- **TDD**：執行後 query pool reserves，assertion: 兩邊 > 0

---

### 🔧 M2：Backend（9 task）

#### T2.1 — Fastify server + 完整 Prisma schema
- 一次定義完所有表，後續 task 只新增欄位不重設 schema：
  - `users`（id, zk_sub_hash UNIQUE, sui_address, created_at）
  - `participant_sbts`（sub_hash FK, serial UNIQUE, sui_address, sbt_object_id, issued_at, expires_at, status enum, supersede_of nullable）
  - `surveys`（id, creator_address, vault_object_id, content_md, content_hash, per_response, max_responses, deadline, status enum, created_at）
  - `questions`（id, survey_id FK, order, type enum, prompt, options_json, required）
  - `responses`（id, survey_id FK, sub_hash, sui_address, answers_json, content_hash, claimed_tx nullable, created_at, UNIQUE(survey_id, sub_hash)）
- **TDD**：migration apply 後 schema 與 ER 一致；UNIQUE 約束擋下重複（test_unique_constraints_block_duplicates）

#### T2.2 — zkLogin 登入流程
- `/auth/google/start` → Google OAuth → 拿 JWT
- `/auth/zklogin/finalize` → 驗證 ZK proof（用 `@mysten/zklogin`）→ 取得 sui_address、sub
- 用 `sub` 的 SHA256 做 `sub_hash` 存 DB
- **TDD**
  - `test_oauth_redirect_correct_url`
  - `test_invalid_jwt_rejected`
  - `test_same_sub_returns_existing_user`
  - mock zk proof verifier 的 happy / fail path

#### T2.3 — SBT issuance service（護照機制）
- DB 表 `participant_sbts(sub_hash, serial, sui_address, sbt_object_id, issued_at, expires_at, status)`
- 新使用者第一次登入 → 呼叫 `participant_sbt::issue(sub_hash, recipient, ttl_ms=180d)`
- 既有使用者再次登入：
  - 若 active SBT 仍有效 → 直接登入
  - 若 expires_at < now + 14d → 自動 reissue（換發），舊 SBT 標 SUPERSEDED
  - 若被 revoke 過 → 視管理政策決定是否重新 issue（MVP：直接 issue 新的）
- 管理介面（最小版）：
  - `POST /admin/sbt/revoke` — 撤銷某 sub 的 active SBT（admin only）
  - `POST /admin/sbt/reissue` — 強制換發（例如使用者報失）
- 後端啟動時定期掃 DB，距 expires_at < 14d 的非活躍記錄發提醒事件（log，不主動發信）
- **TDD**
  - `test_first_login_issues_sbt_with_correct_ttl`
  - `test_second_login_within_validity_skips_issue`
  - `test_login_near_expiration_triggers_reissue_and_marks_old_superseded`
  - `test_admin_revoke_endpoint_calls_contract_and_updates_db`
  - `test_after_revoke_next_login_issues_new_sbt`
  - `test_admin_reissue_endpoint_supersedes_old_and_issues_new`
  - `test_db_and_chain_atomicity`（chain 失敗則 rollback DB；chain 成功 DB 失敗則重試補齊）
  - `test_only_admin_can_call_admin_endpoints`

#### T2.4 — Survey CRUD API
- POST /surveys — 接 Markdown + metadata，parse 出題目 JSON
- GET /surveys/:id — 給填答頁用
- 上鏈：呼叫 `survey_registry::register`，上 hash
- **TDD**
  - `test_markdown_parser_handles_all_question_types`（單選 / 多選 / 簡答 / 量表）
  - `test_invalid_metadata_rejected`（缺必填欄位）
  - `test_duplicate_question_ids_rejected`
  - `test_survey_create_writes_hash_onchain`（mock SuiClient）

#### T2.5 — Response 儲存 + 資格檢查
- POST /surveys/:id/responses
- 檢查：使用者有**有效** SBT（status=ACTIVE 且未過期）、該 sub_hash 未領過此 survey、survey 未截止、有名額
- 計算答案的 SHA256 hash 存 DB
- **TDD**
  - `test_response_accepted_when_eligible`
  - `test_rejected_when_no_sbt`
  - `test_rejected_when_sbt_expired_or_revoked`
  - `test_rejected_when_already_claimed`
  - `test_rejected_when_quota_exhausted`
  - `test_rejected_when_expired`
  - `test_response_hash_deterministic`

#### T2.6 — Reward dispatcher（後端代簽 PTB）
- 在 T2.5 通過後，admin key 發 PTB：`survey_vault::claim(vault, sbt, recipient)`
- 用 transaction queue（避免 admin nonce 衝突）
- 寫回 `responses.claimed_tx`
- **TDD**
  - `test_dispatcher_signs_and_submits`（用 testnet 真跑或 mock SuiClient）
  - `test_concurrent_claims_serialized`（同時 100 個 request 不會 nonce 衝突）
  - `test_chain_failure_rolls_back_db`
  - `test_retry_on_transient_error`

#### T2.7 — Stats aggregator API
- GET /surveys/:id/stats → 回覆數、完成率、各題分佈、vault 餘額
- **TDD**
  - `test_stats_match_db_truth`
  - `test_scale_question_average`
  - `test_choice_question_distribution`

#### T2.8 — 結束活動 API
- POST /surveys/:id/close — creator 自己用錢包簽 `survey_vault::close`
- 後端只 mark 狀態，不代簽（剩餘款項退到 creator 自己錢包）
- **TDD**
  - `test_close_marks_status`
  - `test_close_only_by_creator`
  - `test_after_close_responses_rejected`

#### T2.9 — Admin key 安全
- admin key 用 env var + KMS（demo 階段：dotenv，生產 roadmap：AWS KMS）
- 啟動時檢查 admin address 與合約 admin 一致
- **TDD**
  - `test_missing_admin_key_aborts_startup`
  - `test_admin_address_mismatch_aborts_startup`

---

### 🎨 M3：Frontend（9 task）

#### T3.1 — Vite + React + @mysten/dapp-kit + Tailwind 初始化
- Vite SPA、React Router v6 設定四個路由（`/create`、`/dashboard`、`/s/:id`、`/swap`）
- `<SuiClientProvider>` + `<WalletProvider>` 包在 App root
- 設定 Testnet 連線
- `index.html` 設置全站通用 OG meta tags（baseline；T3.9 再做動態化）
- **TDD**：頁面載入 smoke test（Playwright），驗證四個路由皆可載入

#### T3.2 — 發起者：建立問卷頁
- Markdown editor（用 `@uiw/react-md-editor` 或 textarea）
- 預覽欄
- 設定獎勵金額、名額、截止日
- **TDD**
  - `test_form_validation_blocks_invalid_input`
  - `test_preview_renders_markdown`
  - `test_submit_calls_create_api`

#### T3.3 — 發起者：注資頁（連錢包簽 PTB）
- 顯示「預估 SUI 消耗 = per_response × max + 0.3% AMM fee + gas buffer」
- 一鍵 PTB（依賴 T1.3 的 `create` 回傳 vault 設計）：
  1. `amm_pool::swap_b_to_a(SUI in)` → Coin\<RWD\>
  2. `survey_vault::create(creator, admin, per, max, deadline)` → vault
  3. `survey_vault::fund(vault, coin)`
  4. `survey_vault::share_vault(vault)`
- 失敗任一步 atomic rollback
- **TDD**
  - `test_estimated_cost_calculation`
  - `test_ptb_constructed_correctly`（snapshot test of PTB JSON）
  - `test_wallet_rejection_handled`

#### T3.4 — 發起者：儀表板
- 統計圖（用 Recharts）
- 顯示 vault 餘額（從鏈上即時查詢）
- 結束活動按鈕
- **TDD**
  - `test_dashboard_renders_stats`
  - `test_close_button_disabled_until_eligible`

#### T3.5 — 受訪者：zkLogin 登入頁
- Google OAuth 按鈕 → 走 T2.2 → 取得 sui_address
- **SBT 為非同步流程**：登入完成後若 user 沒有有效 SBT，後端排入 mint queue，前端顯示「資格驗證中…」並 poll `GET /me/sbt-status`（或 SSE），拿到 ACTIVE 後解鎖填答按鈕
- **TDD**
  - `test_login_redirects_to_google`
  - `test_callback_creates_session`
  - `test_ui_shows_pending_state_until_sbt_active`
  - `test_ui_unlocks_after_sbt_status_active`

#### T3.6 — 受訪者：問卷填答頁
- 從 backend 拉 questions JSON 渲染表單
- 提交前預覽
- 送出後顯示「獎勵已發放，TX: 0xabc...」
- **TDD**
  - `test_required_questions_block_submit`
  - `test_review_screen_shows_all_answers`
  - `test_success_state_shows_tx_hash`

#### T3.7 — Swap UI（RWD ↔ SUI）
- 兩個 input、自動算 amount_out
- **計算來源**：前端用 `SuiClient.getObject(POOL_ID)` 讀出 `reserve_a` / `reserve_b`，套 CPMM 公式 `out = (in * 997 * reserve_out) / (reserve_in * 1000 + in * 997)`（與合約 0.3% fee 一致）；不依賴鏈上 view function（Sui Move 沒有 view function 概念）
- 提交 swap 由使用者錢包簽 PTB 呼叫 `amm_pool::swap_a_to_b` / `swap_b_to_a`
- **TDD**
  - `test_amount_out_matches_contract_simulation`（前端公式 == dry-run 結果）
  - `test_pool_object_fetch_handles_stale_data`
  - `test_slippage_warning_above_5pct`

#### T3.8 — RWD + i18n（中文為主）
- 桌機 / 手機驗證
- 中文字型
- **TDD**：Playwright responsive test on 3 sizes（375 / 768 / 1440）

#### T3.9 — Social Sharing Preview（動態 OG meta tags）⚠️ 優先級：低 / 可延後
- **問題**：Vite SPA 的 `index.html` 是靜態的，T3.1 只能設置全站通用 OG tags。發起者把 `/s/:id` 連結分享到 Discord / Twitter / Slack / LINE 時，所有問卷的預覽卡都長一樣，無法顯示問卷專屬標題與描述
- **方案**：用 Cloudflare Worker（或 Vercel Edge Function）攔截 `/s/:id` 路徑：
  - User-Agent 屬於爬蟲（`Discordbot` / `Twitterbot` / `Slackbot` / `facebookexternalhit` / `LinkedInBot` 等）→ 從 backend 取 survey metadata → 回傳含動態 `<meta property="og:title">`、`og:description`、`og:image` 等標籤的 HTML
  - 一般使用者 User-Agent → 直接 passthrough SPA 原本的 index.html，不影響正常瀏覽
- **時程提醒**：此 task 不影響 demo 主流程；若 M1–M3 主線吃緊，可直接延後到 v2 roadmap，保留 T3.1 的通用 OG tags 即可
- **TDD**
  - `test_edge_function_returns_dynamic_og_for_bot_user_agent`
  - `test_edge_function_passthrough_for_human_user_agent`（serve 原 SPA HTML）
  - `test_og_tags_contain_correct_survey_title_and_description`
  - `test_fallback_to_default_og_when_survey_id_not_found`

---

### 🚀 M4：整合 & Demo（2 task）


#### T4.1 — E2E 整合測試（Playwright）
- 完整流程：creator 建立 → 注資 → 受訪者 zkLogin → 填答 → 拿到 RWD → swap 成 SUI
- **執行環境**：本機跑用 `sui start` localnet（快 + 不會被 testnet 阻塞），pre-demo 跑一次 testnet 確認
- **TDD**：1 個完整 happy-path scenario + 3 個 sad-path（已領過、已截止、名額用盡）

#### T4.2 — Demo 腳本 + README + 投影片連結
- README：Quickstart、合約地址、demo URL
- 5 分鐘 demo 腳本：場景設定 → 各角色 walkthrough → 鏈上交易展示
- **TDD**：跟著腳本跑一遍能在 5 分鐘內完成

---

## 全域 TDD 策略

| 層級 | 工具 | 跑在哪 |
|---|---|---|
| Move 單元測試 | `sui move test` | CI + 本機 |
| Move 整合測試 | `sui move test` (test_scenario) | CI + 本機 |
| Backend unit | Vitest | CI |
| Backend integration | Vitest + 跑真 testnet（用獨立 admin key） | 手動 / nightly |
| Frontend unit | Vitest + React Testing Library | CI |
| E2E | Playwright，連真 testnet 合約 | 手動 / pre-demo |

**TDD 原則**：每個 task 先在 PR 中提交「失敗的測試」，再提交「實作 + 測試通過」。Move 模組可以一次 commit（Move test 必須跟 module 在同一 PR），但 Backend / Frontend 分兩 commit。

---

## 已知 Limitations（v2 roadmap，明確排除於 MVP）

- ❌ Testnet ↔ Mainnet 跨網路橋（規劃文件原本提的「testnet 填答 / mainnet 發獎」）
- ❌ 多階段獎勵（前 100 名 10 token，101-1000 名 1 token...）
- ❌ AI 輔助 Markdown 編輯 / RAG 建議
- ❌ 進階參與條件（國籍、年齡、UID、邀請碼）
- ❌ 匿名化投票（與 SBT 防女巫衝突，需要更深的 zk 設計）
- ❌ 結果加密上鏈（MVP 只上 hash）
- ❌ Sponsored transaction 給受訪者（MVP 用後端代簽，受訪者不直接發任何鏈上交易）

---

## 驗證方式（Definition of Done）

執行下列序列，能在 5 分鐘內完成完整 demo：

1. `pnpm -r build && pnpm -r test`（所有單元測試綠）
2. `pnpm move test`（合約測試綠）
3. `pnpm deploy:testnet`（合約 deploy + AMM 種子流動性）
4. `pnpm dev`（backend + frontend 起服）
5. 開瀏覽器：
   - **發起者帳號**：建立「Sui Overflow 滿意度調查」、設 1 RWD/份 × 10 份、注資（看到鏈上交易）
   - **受訪者帳號**（無痕視窗）：Google 登入（背景 mint SBT）→ 填問卷 → 看到「+1 RWD 已入帳」+ TX hash → 切到 swap 頁換成 SUI
   - **發起者**：dashboard 看到 1 份回覆、vault 餘額 9 RWD
6. `pnpm e2e`（Playwright 全綠）

---

## 推薦的開源參考

- AMM CPMM 範本：[interest-protocol/sui-defi](https://github.com/interest-protocol/sui-defi) 的 `amm` module
- zkLogin 整合：[Mysten Labs zkLogin demo](https://github.com/MystenLabs/sui/tree/main/sdk/zklogin)
- @mysten/dapp-kit 範例：[Sui dApp Kit docs](https://sdk.mystenlabs.com/dapp-kit)
- Sponsored transaction（v2 roadmap 用）：[Enoki by Mysten Labs](https://docs.enoki.mystenlabs.com/)
