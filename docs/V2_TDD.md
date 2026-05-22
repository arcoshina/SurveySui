# SurveySui V2 — TDD 測試規格

## 本檔角色

**約束 V2 實作內容的測試契約**。每條任務開工前先在 PR 提失敗的測試（從本檔挑名稱），再提實作把測試打綠。

- 「**改了什麼、為什麼改**」見 [V2_改版目標.md](V2_改版目標.md)。
- 「**勾到哪了**」見 [V2_Tasks.md](V2_Tasks.md)。
- 本檔**不**重述設計理由；只列：測試名稱、given/when/then、預期 abort code（Move）、預期斷言（FE / BFF）、執行指令。
- 章節編號與 [V2_Tasks.md](V2_Tasks.md) 的 sprint milestone（`S0.1 / S1.1 / …`）一一對應。

### TDD 紀律

1. 任務認領 → 從本檔挑對應 `test_*` 名稱 → PR #1 提失敗測試（CI 紅）→ PR #2 提實作（CI 綠）。
2. 測試失敗時：**先確認 expect 是否正確**。要改 expect 必須回 V2_改版目標.md 確認設計意圖、同步改本檔、PR 描述寫理由。**禁止**為了打綠而靜默放寬 expect。
3. 標 `pending` 的群組（如 S5.1 未拍板前的 S6.*）：在對應設計定案前不寫測試，也不開工。

---

## 測試矩陣

> 工具鏈沿用 [V1_TDD §TDD 策略](History/V1_TDD.md)，本表只列 V2 層級分配與檔案落點。

| 層級 | 工具 | 檔案落點（新增 / 修改） | 跑在哪 |
| --- | --- | --- | --- |
| Move 單元 | `sui move test` | `contracts/tests/amm_pool_tests.move`、`survey_registry_tests.move`、`survey_vault_tests.move` | CI + 本機 |
| Move 整合（test_scenario） | `sui move test` | `contracts/tests/ptb_seven_steps_tests.move`、`surveypass_tests.move`（新增） | CI + 本機 |
| Frontend unit | Vitest + RTL | `frontend/src/lib/__tests__/ptb.v2.test.ts`、`markdown.test.ts`、`frontend/src/__tests__/*.test.tsx` | CI |
| Frontend e2e | Vitest（happy-dom + 真 BFF + 真合約 fixture） | `frontend/src/__tests__/e2e.v2.test.ts` | 手動 / pre-demo |
| Sponsored TX 整合 | Vitest + Devnet sandbox | `frontend/src/lib/__tests__/sponsoredTx.fallback.test.ts` | nightly |
| BFF unit | Vitest | `bff/src/__tests__/stats.v2.test.ts`、`security.test.ts`、`surveypass.test.ts` | CI |
| E2E（真合約 + 真錢包） | Playwright + Devnet | `scripts/e2e/*.spec.ts` | 手動 / pre-demo |
| 開發腳本驗證 | Vitest（純邏輯） | `scripts/__tests__/devAccounts.test.ts` | CI |

---

## 全域不變式（每組整合測試都要驗）

| ID | 不變式 | 驗證方式 |
| --- | --- | --- |
| INV-1 | **新鑄 SSR 不入發起者錢包**：PTB 跑完後 `balance(creator, SSR) == balance_before − offset_used`（不可 > before） | Move test_scenario 對拍餘額；FE e2e 對拍 dApp Kit 餘額 |
| INV-2 | **Vault 餘額下限**：step ⑤ 合併後 `vault.ssr ≥ per_response × max`；不滿足必 abort | Move test_scenario abort 路徑 |
| INV-3 | **費率分拆對帳**：`vault.ssr_after_fee + treasury_delta == offset_in + minted` ± 1 base unit（rounding tolerance） | Move test_scenario |
| INV-4 | **費率公式一致**：FE `estimateFundCostV2` 算的 `effective_fee_bps == Move FeeConfig.effective()`，公式 `total × discount / 10000` | Vitest 對拍（5 組固定輸入） |
| INV-5 | **問卷雜湊唯一**：同一 `content_hash` 第二次 register 必 abort `EDuplicateSurvey` | Move 單元 |
| INV-6 | **SurveyPass 不消耗**：同一 pass 完成多份問卷後仍 `exists(pass.id) && is_valid` | Move test_scenario（保留 V1 測試） |
| INV-7 | **BFF 無 admin TX key**：BFF 啟動時 `process.env.SUI_ADMIN_PRIVATE_KEY` 未設或為空；若有 ticket 簽發金鑰，啟動 log 標明「ticket-only, cannot sign TX」 | BFF unit |
| INV-8 | **NullifierRegistry 唯一性**：同一 `nullifier_hash` 只能對應一個 pass owner；第二次 mint 必 abort `EDuplicateNullifier`，NullifierRegistry 不變 | Move test_scenario |
| INV-9 | **SurveyPass Soulbound**：SurveyPass 型別宣告 `has key`（無 `store`）；任何 transfer 路徑在 Move type system 層拒絕，不需 entry 層防護 | Move 型別宣告審查 |

---

## S0：地基

### S0.1 同助記詞測試帳號（`scripts/`）

- **`test_devAccounts_outputs_five_addresses`** — given 寫死的 mnemonic + HD path 0–4，when 跑 `pnpm tsx scripts/devAccounts.ts`，then stdout 列 5 個 address + 對應 path。
- **`test_devAccounts_deterministic_across_runs`** — 連跑兩次，stdout 完全一致。
- **`test_devAccounts_addresses_match_known_fixture`** — 對拍 fixture 檔（避免哪天悄悄改 mnemonic）。

### S0.2 V1 contract drift 修對齊

> 對應問題：V1 e2e 全 mock 後端，frontend/backend schema 對不上（[project_contract_drift](file:///C:/Users/Arco_asus/.claude/projects/d--Users-Arco-asus-Documents-GitHub-SurveySui/memory/project_contract_drift.md)）。本 milestone 是讓後續所有 e2e 能跑真 BFF + 真合約的前置工。

- **`test_e2e_harness_boots_against_devnet`** — given 啟動 e2e harness，when target = Devnet 真合約，then BFF + frontend 都連得上，無 schema 錯誤。
- **`test_e2e_happy_path_no_mock`** — 至少一條 e2e case 跑通「發起者 → 受訪者 → redeem」全鏈路，**沒有 mock BFF 或合約**。
- **`test_ci_e2e_runs_nightly`** — CI 設定上 e2e job 排在 nightly schedule（不在 PR gate，避免 Devnet 抖動阻塞 PR）。

### S0.3 BFF 啟動權限檢查（INV-7）

- **`test_bff_refuses_admin_tx_key`** — given env 設了 `SUI_ADMIN_PRIVATE_KEY=xxx`，when BFF 啟動，then process exit 非 0 並 log「BFF must not hold admin TX key」。
- **`test_bff_logs_ticket_only_when_issuer_key_present`** — given env 設了 `SURVEY_PASS_ISSUER_PRIV`（若 S5.1 決議走 ticket 模式），啟動 log 含 `ticket-only, cannot sign TX`。
- **`test_bff_starts_clean_without_keys`** — given 完全無 key env，BFF 正常啟動，只服務 stats / og 等唯讀 endpoint。

---

## S1：合約地基

### S1.1 AMM / FeeConfig（總費率 20% × 折扣 50%）

- **`test_initial_ssr_per_sui_one_thousand`** — given `total_sui_invested == 0`，when invest 1 SUI（1e9 MIST），then mint `1000 * 1e9` SSR base = 1000 SSR units。（**保留 V1 既有測試**，列在這裡是為了 V2_Tasks「確認」項目能勾掉）
- **`test_fee_config_default_values`** — given `init_pool`，when 讀 FeeConfig，then `total_fee_bps == 2000 && discount_bps == 5000`。
- **`test_fee_config_effective_formula`** — given `(total=2000, discount=5000)`，when call `effective()`，then `== 1000`；另測 `(2000, 0) -> 0`、`(2000, 10000) -> 2000`、`(1500, 3000) -> 450`、`(0, 5000) -> 0`。
- **`test_fee_config_setter_admin_only`** — given 非 admin sender，when `set_fee_config`，then abort `ENotAdmin`。
- **`test_fee_config_setter_bounds`** — `total_fee_bps > 10000` 或 `discount_bps > 10000` 必 abort `EInvalidFeeConfig`。

### S1.2 survey_registry 內容驗證 + 雜湊去重

- **`test_register_duplicate_content_hash_abort`** — INV-5（與 PTB happy path 共享）。
- **`test_register_invalid_question_type_abort`** — given 題型不在白名單，then abort `EInvalidQuestionType`。
- **`test_register_too_many_options_abort`** — given 選項數 > 上限，then abort `EOptionLimitExceeded`。
- **`test_register_empty_question_abort`** — given 題目字串為空，then abort `EEmptyQuestion`。
- **`test_register_duplicate_question_id_abort`** — given 同一份問卷內有重複 question_id，then abort `EDuplicateQuestionId`。
- **`test_register_event_payload_complete`** — 成功 register 後 event 含 `vault_id, content_hash, schema_hash, question_count, registered_at`。

### S1.3 發起問卷 PTB 七步驟整合

> 對應 [V2_改版目標.md §發起問卷 PTB 七步驟](V2_改版目標.md)。所有測試都是「七步打成一筆 PTB」的整合測試，跑在 `test_scenario`。前置：S1.1 + S1.2。

#### Happy path

- **`test_ptb_seven_steps_happy_path_no_offset`** — given 發起者 SSR 餘額 = 0、池 `total_sui_invested == 0`、要求 `per_response × max = 100 SSR`，when 七步 PTB，then：
  - vault.ssr = `100 - fee`（fee 用 `effective_fee_bps` 算）
  - admin treasury ssr += `fee`
  - creator SSR 餘額仍為 0（INV-1）
  - 池 `total_sui_invested` 增量 = 對應的 SUI in
  - `SurveyRegistered` event payload 含 `content_hash`、`vault_id`、`schema_hash`
- **`test_ptb_seven_steps_happy_path_with_offset`** — given 發起者 SSR = 50（既有），要求 100 SSR，when 七步 PTB，then：
  - step ③ 注入 50 SSR
  - step ④ AMM 補 mint 約 50 SSR（INV-3 對帳）
  - creator SSR 餘額 = 0（折抵全用掉）
  - 折抵組 SUI in < no-offset 組（迴歸對拍）
- **`test_ptb_seven_steps_happy_path_overfund_offset`** — given 發起者既有 SSR > 100（超過所需），when 七步 PTB，then 只折抵剛好 100 SSR / `(1 - fee_rate)`；剩餘 SSR 退回 creator（合約 helper 自動處理）。

#### Abort 路徑

- **`test_ptb_step5_invariant_underfund_abort`** — given 故意傳偏低 SUI（前端估算錯）→ step ⑤ 合併後 vault < net_ssr，then abort `EInsufficientVaultBalance`，整筆 PTB rollback（INV-2）。
- **`test_ptb_step7_duplicate_content_abort`** — given 同一 `content_hash` 已 registered，when 第二次跑七步 PTB，then abort `EDuplicateSurvey`，rollback（INV-5）。
- **`test_ptb_step7_invalid_schema_abort`** — given 結構違規的 encrypted_blob + schema_hash，then abort `EInvalidSchema`。
- **`test_ptb_atomic_rollback_step3_failure`** — 模擬 step ③ deposit 失敗（SSR coin 不足），整筆 PTB rollback，pool / vault / treasury 餘額不變。
- **`test_ptb_atomic_rollback_step4_failure`** — 模擬 step ④ AMM mint 失敗（SUI in 為 0），全部 rollback。
- **`test_ptb_atomic_rollback_step6_failure`** — 模擬 step ⑥ split_fee 失敗（FeeConfig 不存在），全部 rollback。

#### Invariant

- **`test_ptb_creator_balance_invariant`** — 跑完 happy path no_offset / with_offset / overfund 三組後，`balance(creator, SSR) == before − offset_used`，不大於 before（INV-1）。
- **`test_ptb_fee_split_accounting`** — `vault.ssr + treasury_delta == offset_in + minted ± 1`（INV-3）。

---

## S2：前端對齊合約

### S2.1 estimateFundCostV2 對拍 Move（INV-4）

- **`test_estimateFundCostV2_matches_move`** — Vitest 對拍 5 組 `(perResponse, max, totalSuiInvested, fee_config)` 與 Move 端計算，期望 `(sui_to_invest, gross_ssr, effective_fee_bps)` 三欄全相等。
- **`test_estimateFundCostV2_handles_zero_offset`** — given 發起者 SSR = 0，輸出 `offset_in = 0`、`minted = gross_ssr`。
- **`test_estimateFundCostV2_handles_overfund_offset`** — given 發起者 SSR > 需求，輸出 `sui_to_invest = 0`、`minted = 0`、`offset_in = net_target / (1 - fee_rate)`。

### S2.2 七步驟 PTB 前端整合 + 預覽合併步驟

- **`test_create_page_shows_cost_breakdown_realtime`** — 改 perResponse / max → breakdown（SSR / SUI / fee）即時更新（debounce ≤ 200ms）。
- **`test_create_page_preview_plus_fund_combined_step`** — 「預覽問卷 + 注資」是單一 step（單一按鈕，無中間 wizard 頁）。
- **`test_create_page_breakdown_matches_move_after_submit`** — submit 前 UI 顯示的數值 == 實際打到鏈上的 PTB 參數（對拍 spy）。
- **`test_fund_page_renders_three_sections`** — `FundPage` 顯示「既有 SSR 折抵 / AMM 注資 / 費率分拆」三段。

### S2.3 答案只記錄結果不記錄題目

- **`test_answer_encode_strips_questions`** — given 完整作答物件，encode 後 payload 只含 `answers[]` + `schema_hash`，**不含**題目文字。
- **`test_answer_decode_by_index`** — given encoded answers + 原問卷 schema → decode 後按 index 正確配對。
- **`test_answer_schema_hash_mismatch_warning`** — given encoded.schema_hash ≠ vault.schema_hash → decode 報 warning（避免題目改版後錯位）。
- **`test_bff_stats_aggregates_by_index`** — BFF `/stats/:vault` 對結果-only 格式聚合正確。

---

## S3：UI Bug 修復

### S3.1 SSR 計算畸零數修復（Frontend）

> Fixture 抓自 commit `23a68b5` 之後實際出現過的畸零回報。

- **`test_format_ssr_no_floating_artifact`** — given 已知會畸零的 5 組 base units（例：`1000000001`、`999999999`、`123456789012` 等）→ when `formatSsr(x)`，then 顯示字串符合 fixture 期望（無 `0.99999...`、無尾巴零過長）。
- **`test_format_ssr_rounding_consistent_with_move`** — Vitest 對拍 Move 端的 `display_ssr` helper。

### S3.2 Markdown 渲染成問卷預覽（Frontend）

- **`test_markdown_preview_renders_headings`** — given `# H1\n## H2`，render 後 DOM 含 `<h1>` `<h2>`。
- **`test_markdown_preview_renders_lists`** — 有序 / 無序 list。
- **`test_markdown_preview_renders_tables`** — `| a | b |` 表格 → `<table>`。
- **`test_markdown_preview_renders_code_blocks`** — 三反引號 + lang。
- **`test_markdown_preview_handles_yaml_frontmatter`** — frontmatter 被剝離，不渲染為內文。
- **`test_markdown_preview_does_not_execute_html`** — `<script>` payload 不執行（XSS 防護）。

### S3.3 隱藏非發起人「提早結束」按鈕（Frontend）

- **`test_close_button_visible_for_creator`** — given 當前錢包地址 == survey.creator，render `<DashboardPage>` → 按鈕可見。
- **`test_close_button_hidden_for_non_creator`** — 地址不符 → 按鈕**完全不在 DOM**（不是 disabled）。
- **`test_close_button_hidden_when_wallet_disconnected`** — 無連錢包 → 按鈕不在 DOM。

### S3.4 儀錶板補完（Frontend）

- **`test_dashboard_shows_share_link`** — render `<DashboardPage survey={...}>` → 含 `/s/<survey_id>` 連結 + copy 按鈕。
- **`test_dashboard_copy_share_link`** — 按 copy → clipboard mock 收到正確 URL。
- **`test_dashboard_lists_all_creator_surveys`** — given mock RPC 回 3 份某 address 名下的 vault → render 顯示 3 列。
- **`test_dashboard_filters_by_wallet_address`** — 切換連錢包地址 → 列表跟著變。
- **`test_dashboard_received_over_max_display`** — vault 狀態 (received=3, max=10) → render 字串為「3 / 10」（單一欄位、非分離）。

---

## S4：UX 改善

### S4.1 兩步驟簽名發起流程（Frontend — FundPage）

- **`test_key_setup_button_derives_keypair`** — FundPage render → 點擊「設定加密金鑰」按鈕 → `signPersonalMessage` mock 被呼叫一次 → keypair 存入 component state → 「發布問卷」按鈕從 disabled 變 enabled。
- **`test_publish_button_disabled_before_key_setup`** — 初始 render 時「發布問卷」按鈕為 disabled；步驟一完成前不可點擊。
- **`test_keypair_cleared_on_wallet_change`** — 步驟一完成後模擬切換錢包（`account.address` 改變）→ component state keypair 清除 → 「發布問卷」按鈕回到 disabled。

### ~~ S4.2 發起人加密公鑰存放策略（Frontend + Move）~~ 修改方向更動，這項跳過不執行

> 「公鑰寫入 SurveyPass」屬 S6.3，本 milestone 只做「存為發起者擁有的物件」這條路徑。

- **`test_creator_pubkey_stored_as_object`** — 發起問卷時，公鑰寫入發起者擁有的物件（owner == creator）。
- **`test_creator_pubkey_queryable_by_vault`** — 從 vault_id 可查到對應的公鑰物件 id。

### S4.3 Gas Station fallback（Frontend）

- **`test_sponsored_tx_uses_bff_when_available`** — BFF 可連 → 走 sponsored 路徑，不請求 wallet 付 gas。
- **`test_sponsored_tx_falls_back_to_self_paid_on_bff_unreachable`** — BFF 503 / timeout → 前端自動 client dry-run（通過）→ 改要求 wallet 簽自付 gas TX，UX 顯示「自付模式」提示。
- **`test_sponsored_tx_does_not_fallback_on_dryrun_reject`** — dry-run 因合約 abort 失敗（無效 pass / 重複填答）→ **不**自動切自付，顯示錯誤原因（避免讓用戶白付 gas 後仍失敗）。
- **`test_sponsored_tx_fallback_emits_telemetry`** — fallback 觸發時送 console.warn / 內部 event（方便日後判斷 BFF 健康度）。

### S4.4 首頁文案 / 視覺（Frontend）

無自動測試。手動驗收：pre-demo checklist 加一項「首頁引導文案可讓首次訪客 60 秒內理解產品」。

---

## S5：設計交付（無測試，只列 Done Criteria）

### S5.1 SurveyPass 認證簽發設計拍板（done by doc）

> 對應 [V2_改版目標.md §SurveyPass 認證簽發](V2_改版目標.md)。  
> 完整架構見 [docs/專案 KYC方案.md](專案%20KYC方案.md)。

**MVP 設計決策（已拍板）**

| 問題 | MVP 決策 |
|------|---------|
| Q1：zkLogin / Google OAuth 定位 | MVP 不使用 zkLogin。驗證源為 **Email OTP**（`SRC_EMAIL`）；Social OAuth / zkLogin 留 V3 評估。 |
| Q2：驗證階段是否要求連錢包 | **是**。IssuanceTicket 綁定 `owner: address`，用戶需先連錢包才能啟動驗證流程。 |
| Q3：真人驗證訊號組合 | **Email OTP only**；nullifier = `hash("email" \|\| email_address)`；一個 email 只能對應一張有效 Pass（INV-8）。 |
| Q4：BFF 角色 | **ticket-only**（INV-7）。BFF 負責：① 發 OTP 信、② 驗 OTP、③ 算 nullifier_hash、④ 簽 Ed25519 IssuanceTicket、⑤ 回傳 ticket JSON。不送 TX，不持 admin key。 |

Done Criteria（全部完成才算綠燈）：

- [x] 問題 1 拍板：Email OTP only，zkLogin / OAuth 留 V3
- [x] 問題 2 拍板：驗證前必須連錢包
- [x] 問題 3 拍板：Email OTP，nullifier = hash("email"||email_address)
- [x] 問題 4 拍板：BFF ticket-only，符合 INV-7
- [x] V2_改版目標.md §SurveyPass 認證簽發章節從「待規劃」改為「定稿版」（另行更新）
- [x] V2_TDD.md S6.1 / S6.2 / S6.3 具體 `test_*` 名稱已回填

### S5.2 匿名投票初步方案設計交付（done by doc）

> 對應 [V2_改版目標.md §匿名投票](V2_改版目標.md)。  
> 完整設計見 [docs/V2_AnonymousVoting_Sketch.md](V2_AnonymousVoting_Sketch.md)。

Done Criteria：

- [x] `docs/V2_AnonymousVoting_Sketch.md` 成形，涵蓋：威脅模型（CoE/愛沙尼亞標準對照）、Semaphore-style ZKP nullifier 結構、與 SurveyPass 雙 nullifier 衝突解法、三期工作量預估、V3 啟動條件清單
- [x] V2_改版目標.md §匿名投票章節從「初步方案」改為「設計交付完成」

---

## S6：SurveyPass 實作（MVP：Email OTP，前置：S5.1）

> 完整資料結構設計見 [docs/專案 KYC方案.md](專案%20KYC方案.md)。  
> MVP 驗證源僅 Email OTP（`SRC_EMAIL = 2`）；tier 值依 KYC方案.md 信任層級表。  
> INV-8（nullifier 唯一）/ INV-9（Soulbound）貫穿本節所有整合測試。

### S6.1 SurveyPass 簽發合約 / BFF / FE

#### Move 合約（`contracts/tests/surveypass_tests.move`）

- **`test_surveypass_mint_happy_path`** — given 合法 BFF 簽名 IssuanceTicket（`source=SRC_EMAIL, owner=alice, expires_at=now+365days`），when alice 呼叫 `mint_pass`，then：SurveyPass 物件存在且 `owner==alice, status==STATUS_ACTIVE`；`NullifierRegistry` 已收錄該 nullifier_hash；INV-6（Pass 不消耗）守住。
- **`test_surveypass_mint_rejects_duplicate_nullifier`** — given NullifierRegistry 已有相同 nullifier_hash，when 第二次 mint，then abort `EDuplicateNullifier`（INV-8）。
- **`test_surveypass_mint_rejects_invalid_bff_sig`** — given ticket `bff_sig` 被竄改，then abort `EInvalidTicketSig`。
- **`test_surveypass_mint_rejects_wrong_owner`** — given `ticket.owner=alice`，when bob 呼叫 mint_pass，then abort `EOwnerMismatch`。
- **`test_surveypass_mint_rejects_expired_ticket`** — given `ticket.expires_at < current_epoch`，then abort `ETicketExpired`。
- **`test_surveypass_not_consumed_after_multi_survey`** — （INV-6）Pass 完成 3 份問卷後 `exists(pass.id) && status==STATUS_ACTIVE`，物件未被消耗。
- **`test_surveypass_soulbound_no_store`** — （INV-9）SurveyPass 型別宣告 `has key`（無 `store`）；test_scenario 中嘗試呼叫 `transfer::public_transfer` 在 Move type system 層拒絕（編譯期或 test abort）。
- **`test_surveypass_revoke_sets_revoked_status`** — admin 呼叫 `revoke_pass(pass)` → `pass.status == STATUS_REVOKED`；已撤銷 Pass 用於問卷時 abort `EPassRevoked`。
- **`test_surveypass_delete_after_revoke`** — given Revoked pass（無 dynamic fields），呼叫 `delete_pass` → `object::delete()` 執行，pass_id 從 Sui global storage 移除。

#### BFF（`bff/src/__tests__/surveypass.test.ts`）

- **`test_bff_email_otp_send_creates_pending_otp`** — POST `/auth/email-otp/send` `{ email }` → 200；BFF 暫存 OTP（TTL 10 min；同 email 重送覆蓋舊 OTP）。
- **`test_bff_email_otp_verify_issues_ticket`** — POST `/auth/email-otp/verify` `{ email, otp, wallet_address }` → 200，回傳 `{ ticket }` 含 `owner, source, nullifier_hash, commitment, expires_at, bff_sig` 欄位。
- **`test_bff_email_otp_rejects_wrong_code`** — 錯誤 OTP → 400 `{ error: "INVALID_OTP" }`；ticket 不發出。
- **`test_bff_email_otp_rejects_expired_code`** — OTP 超過 10 min → 400 `{ error: "OTP_EXPIRED" }`。
- **`test_bff_ticket_sig_verifiable_with_issuer_pubkey`** — `ticket.bff_sig` 以 `SURVEY_PASS_ISSUER_PRIV` 對應 Ed25519 pubkey 驗章為 true。
- **`test_bff_nullifier_hash_deterministic`** — 同一 email 兩次呼叫 verify → `nullifier_hash` 相同 = `hash("email" || email_address)`（INV-8 前置）。

#### Frontend（`frontend/src/__tests__/AuthPage.test.tsx`）

- **`test_auth_page_wallet_prompt_when_disconnected`** — 未連錢包 → 顯示「請先連接錢包」提示；email form 不在 DOM。
- **`test_auth_page_email_form_when_no_pass`** — 錢包已連 + 鏈上無有效 Pass → email 輸入欄可見。
- **`test_auth_page_shows_pass_info_when_valid`** — 有效 Pass 存在 → 顯示 tier badge + 到期日；email form 不在 DOM。
- **`test_auth_page_send_otp_calls_bff_send`** — 輸入 email + 點「發送驗證碼」→ BFF `/auth/email-otp/send` 被呼叫一次。
- **`test_auth_page_verify_otp_mints_pass`** — 輸入正確 OTP + 確認 → BFF `/auth/email-otp/verify` 被呼叫 → 拿到 ticket → `signAndExecuteTransaction` mock 被呼叫（`mint_pass` entry）。
- **`test_auth_page_shows_error_on_invalid_otp`** — BFF 回 400 `INVALID_OTP` → 顯示錯誤訊息；不呼叫 mint。

---

### S6.2 SurveyPass 首次連錢包檢查

> 行為：**提示不強制**。瀏覽問卷不擋；提交時若問卷設定 `min_tier > 0` 且 Pass 不足，則 disable submit。

Frontend（`frontend/src/__tests__/SurveyPage.test.tsx` 新增群組）：

- **`test_survey_page_queries_pass_on_wallet_connect`** — 錢包連線後觸發一次 RPC query（查用戶 SurveyPass by owner）；結果儲存元件狀態。
- **`test_survey_page_does_not_block_content_without_pass`** — 無 Pass → 問卷題目可見；submit 按鈕 CTA 文字為「需要身分驗證才能填答」（不是靜默 disabled 無說明）。
- **`test_survey_page_shows_pass_tier_badge`** — valid Pass → render tier badge（例：「✓ Email 驗證」）。
- **`test_survey_page_submit_disabled_for_gated_survey_no_pass`** — 問卷 `min_tier > 0` + 無 Pass → submit button `disabled`。
- **`test_survey_page_submit_enabled_with_sufficient_tier`** — valid Pass tier ≥ survey `min_tier` → submit enabled。

---

### S6.3 公鑰寫入 SurveyPass（條件性）

> S5.1 決議寫入。發起者完成 S4.1 金鑰設定後，可（選擇性）將 pubkey 同步至 Pass；無 Pass 時略過（不報錯）。

Move（`contracts/tests/surveypass_tests.move` 追加）：

- **`test_surveypass_update_encryption_pubkey`** — Pass owner 呼叫 `update_encryption_pubkey(pass, new_key)` → `pass.encryption_pubkey == option::some(new_key)`。
- **`test_surveypass_clear_encryption_pubkey`** — 呼叫 `clear_encryption_pubkey(pass)` → `pass.encryption_pubkey == option::none()`。

Frontend（`frontend/src/__tests__/FundPage.test.tsx` 追加）：

- **`test_fund_page_syncs_pubkey_to_pass_when_exists`** — FundPage 完成 S4.1 金鑰設定 + 用戶有有效 Pass → PTB 中附加 `update_encryption_pubkey` call；spy 被呼叫一次。
- **`test_fund_page_skips_pubkey_sync_without_pass`** — 無 Pass → PTB 不含 `update_encryption_pubkey` call（不報錯）。

---

## 執行指令速查

```bash
# 全部 Move 測試（含 S1.1 / S1.2 / S1.3）
pnpm move test

# 單檔 Move 整合
sui move test --filter ptb_seven_steps_tests

# Frontend 全部單元 + e2e
pnpm -F frontend test

# 單檔 Frontend
pnpm -F frontend test ptb.v2

# BFF 單元
pnpm -F bff test

# Sponsored TX fallback（nightly）
pnpm -F frontend test sponsoredTx.fallback

# 同助記詞帳號驗證
pnpm tsx scripts/devAccounts.ts

# E2E（真合約 + 真錢包，pre-demo）
pnpm e2e

# 全打一輪
pnpm -r test && pnpm move test
```

---

## 完成定義（Done Criteria）

每組測試清單視為一個 milestone，必須**全綠 + INV 不變式守住**才視為該組完成。

| Milestone | 完成條件 |
| --- | --- |
| S0.1 同助記詞測試帳號 | `test_devAccounts_*` 三條綠 |
| S0.2 contract drift 修對齊 | `test_e2e_harness_*` / `test_e2e_happy_path_no_mock` / `test_ci_e2e_runs_nightly` 綠 |
| S0.3 BFF 啟動權限檢查 | `test_bff_*` 三條綠；INV-7 守住 |
| S1.1 AMM / FeeConfig | `test_fee_config_*` + `test_initial_ssr_per_sui_one_thousand` 5 條綠 |
| S1.2 registry 驗證 + 去重 | `test_register_*` 6 條綠；INV-5 守住 |
| S1.3 PTB 七步驟 | happy 3 + abort 6 + invariant 2 共 11 條綠；INV-1 / INV-2 / INV-3 守住 |
| S2.1 estimateFundCostV2 對拍 | `test_estimateFundCostV2_*` 3 條綠；INV-4 守住 |
| S2.2 PTB FE 整合 | 4 條 Vitest 綠 + e2e happy path 綠（依賴 S0.2 harness） |
| S2.3 答案結果-only | 4 條綠 |
| S3.1 / S3.2 / S3.3 / S3.4 | 各群組所有 test 綠 |
| S4.1 / S4.2 / S4.3 | 各群組所有 test 綠 |
| S4.4 首頁 | 手動驗收勾選 |
| S5.1 SurveyPass 設計拍板 | 4 項決策全勾 + S6 test_* 已回填（V2_改版目標.md 更新待補） |
| S5.2 匿名投票設計 | AnonymousVoting_Sketch.md 成形 + 改版目標章節更新；V3 啟動條件 T1–T4 / D1–D4 / P1–P3 全部評估完成 |
| S6.1 SurveyPass 簽發 | Move 9 條 + BFF 6 條 + FE 6 條全綠；INV-6 / INV-8 / INV-9 守住 |
| S6.2 首次連錢包檢查 | FE 5 條全綠 |
| S6.3 公鑰寫入 Pass | Move 2 條 + FE 2 條全綠 |

> **S7 總驗收**：上述所有非 pending milestone 全綠 + INV-1～INV-9 全守住 + [V2_改版目標.md §驗收方向](V2_改版目標.md) 的 demo 動作 5 分鐘內手動跑完無 regression。
