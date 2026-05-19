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
| Move 整合（test_scenario） | `sui move test` | `contracts/tests/ptb_seven_steps_tests.move`（新增） | CI + 本機 |
| Frontend unit | Vitest + RTL | `frontend/src/lib/__tests__/ptb.v2.test.ts`、`markdown.test.ts`、`pages/__tests__/*.test.tsx` | CI |
| Frontend e2e | Vitest（happy-dom + 真 BFF + 真合約 fixture） | `frontend/src/__tests__/e2e.v2.test.ts` | 手動 / pre-demo |
| Sponsored TX 整合 | Vitest + Devnet sandbox | `frontend/src/lib/__tests__/sponsoredTx.fallback.test.ts` | nightly |
| BFF unit | Vitest | `bff/src/__tests__/stats.v2.test.ts`、`security.test.ts` | CI |
| E2E（真合約 + 真錢包） | Playwright + Devnet | `scripts/e2e/*.spec.ts` | 手動 / pre-demo |
| 開發腳本驗證 | Vitest（純邏輯） | `scripts/__tests__/devAccounts.test.ts` | CI |

---

## 全域不變式（每組整合測試都要驗）

| ID | 不變式 | 驗證方式 |
| --- | --- | --- |
| INV-1 | **新鑄 sSSR 不入發起者錢包**：PTB 跑完後 `balance(creator, sSSR) == balance_before − offset_used`（不可 > before） | Move test_scenario 對拍餘額；FE e2e 對拍 dApp Kit 餘額 |
| INV-2 | **Vault 餘額下限**：step ⑤ 合併後 `vault.sssr ≥ per_response × max`；不滿足必 abort | Move test_scenario abort 路徑 |
| INV-3 | **費率分拆對帳**：`vault.sssr_after_fee + treasury_delta == offset_in + minted` ± 1 base unit（rounding tolerance） | Move test_scenario |
| INV-4 | **費率公式一致**：FE `estimateFundCostV2` 算的 `effective_fee_bps == Move FeeConfig.effective()`，公式 `total × discount / 10000` | Vitest 對拍（5 組固定輸入） |
| INV-5 | **問卷雜湊唯一**：同一 `content_hash` 第二次 register 必 abort `EDuplicateSurvey` | Move 單元 |
| INV-6 | **SurveyPass 不消耗**：同一 pass 完成多份問卷後仍 `exists(pass.id) && is_valid` | Move test_scenario（保留 V1 測試） |
| INV-7 | **BFF 無 admin TX key**：BFF 啟動時 `process.env.SUI_ADMIN_PRIVATE_KEY` 未設或為空；若有 ticket 簽發金鑰，啟動 log 標明「ticket-only, cannot sign TX」 | BFF unit |

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

- **`test_initial_ssr_per_sui_one_thousand`** — given `total_sui_invested == 0`，when invest 1 SUI（1e9 MIST），then mint `1000 * 1e9` sSSR base = 1000 sSSR units。（**保留 V1 既有測試**，列在這裡是為了 V2_Tasks「確認」項目能勾掉）
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

- **`test_ptb_seven_steps_happy_path_no_offset`** — given 發起者 sSSR 餘額 = 0、池 `total_sui_invested == 0`、要求 `per_response × max = 100 sSSR`，when 七步 PTB，then：
  - vault.sssr = `100 - fee`（fee 用 `effective_fee_bps` 算）
  - admin treasury sssr += `fee`
  - creator sSSR 餘額仍為 0（INV-1）
  - 池 `total_sui_invested` 增量 = 對應的 SUI in
  - `SurveyRegistered` event payload 含 `content_hash`、`vault_id`、`schema_hash`
- **`test_ptb_seven_steps_happy_path_with_offset`** — given 發起者 sSSR = 50（既有），要求 100 sSSR，when 七步 PTB，then：
  - step ③ 注入 50 sSSR
  - step ④ AMM 補 mint 約 50 sSSR（INV-3 對帳）
  - creator sSSR 餘額 = 0（折抵全用掉）
  - 折抵組 SUI in < no-offset 組（迴歸對拍）
- **`test_ptb_seven_steps_happy_path_overfund_offset`** — given 發起者既有 sSSR > 100（超過所需），when 七步 PTB，then 只折抵剛好 100 sSSR / `(1 - fee_rate)`；剩餘 sSSR 退回 creator（合約 helper 自動處理）。

#### Abort 路徑

- **`test_ptb_step5_invariant_underfund_abort`** — given 故意傳偏低 SUI（前端估算錯）→ step ⑤ 合併後 vault < net_sssr，then abort `EInsufficientVaultBalance`，整筆 PTB rollback（INV-2）。
- **`test_ptb_step7_duplicate_content_abort`** — given 同一 `content_hash` 已 registered，when 第二次跑七步 PTB，then abort `EDuplicateSurvey`，rollback（INV-5）。
- **`test_ptb_step7_invalid_schema_abort`** — given 結構違規的 encrypted_blob + schema_hash，then abort `EInvalidSchema`。
- **`test_ptb_atomic_rollback_step3_failure`** — 模擬 step ③ deposit 失敗（sSSR coin 不足），整筆 PTB rollback，pool / vault / treasury 餘額不變。
- **`test_ptb_atomic_rollback_step4_failure`** — 模擬 step ④ AMM mint 失敗（SUI in 為 0），全部 rollback。
- **`test_ptb_atomic_rollback_step6_failure`** — 模擬 step ⑥ split_fee 失敗（FeeConfig 不存在），全部 rollback。

#### Invariant

- **`test_ptb_creator_balance_invariant`** — 跑完 happy path no_offset / with_offset / overfund 三組後，`balance(creator, sSSR) == before − offset_used`，不大於 before（INV-1）。
- **`test_ptb_fee_split_accounting`** — `vault.sssr + treasury_delta == offset_in + minted ± 1`（INV-3）。

---

## S2：前端對齊合約

### S2.1 estimateFundCostV2 對拍 Move（INV-4）

- **`test_estimateFundCostV2_matches_move`** — Vitest 對拍 5 組 `(perResponse, max, totalSuiInvested, fee_config)` 與 Move 端計算，期望 `(sui_to_invest, gross_sssr, effective_fee_bps)` 三欄全相等。
- **`test_estimateFundCostV2_handles_zero_offset`** — given 發起者 sSSR = 0，輸出 `offset_in = 0`、`minted = gross_sssr`。
- **`test_estimateFundCostV2_handles_overfund_offset`** — given 發起者 sSSR > 需求，輸出 `sui_to_invest = 0`、`minted = 0`、`offset_in = net_target / (1 - fee_rate)`。

### S2.2 七步驟 PTB 前端整合 + 預覽合併步驟

- **`test_create_page_shows_cost_breakdown_realtime`** — 改 perResponse / max → breakdown（sSSR / SUI / fee）即時更新（debounce ≤ 200ms）。
- **`test_create_page_preview_plus_fund_combined_step`** — 「預覽問卷 + 注資」是單一 step（單一按鈕，無中間 wizard 頁）。
- **`test_create_page_breakdown_matches_move_after_submit`** — submit 前 UI 顯示的數值 == 實際打到鏈上的 PTB 參數（對拍 spy）。
- **`test_fund_page_renders_three_sections`** — `FundPage` 顯示「既有 sSSR 折抵 / AMM 注資 / 費率分拆」三段。

### S2.3 答案只記錄結果不記錄題目

- **`test_answer_encode_strips_questions`** — given 完整作答物件，encode 後 payload 只含 `answers[]` + `schema_hash`，**不含**題目文字。
- **`test_answer_decode_by_index`** — given encoded answers + 原問卷 schema → decode 後按 index 正確配對。
- **`test_answer_schema_hash_mismatch_warning`** — given encoded.schema_hash ≠ vault.schema_hash → decode 報 warning（避免題目改版後錯位）。
- **`test_bff_stats_aggregates_by_index`** — BFF `/stats/:vault` 對結果-only 格式聚合正確。

---

## S3：UI Bug 修復

### S3.1 sSSR 計算畸零數修復（Frontend）

> Fixture 抓自 commit `23a68b5` 之後實際出現過的畸零回報。

- **`test_format_sssr_no_floating_artifact`** — given 已知會畸零的 5 組 base units（例：`1000000001`、`999999999`、`123456789012` 等）→ when `formatSssr(x)`，then 顯示字串符合 fixture 期望（無 `0.99999...`、無尾巴零過長）。
- **`test_format_sssr_rounding_consistent_with_move`** — Vitest 對拍 Move 端的 `display_sssr` helper。

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

### S4.1 單次簽名衍生加密金鑰（Frontend）

- **`test_single_signature_derives_keypair`** — call `deriveKeypairFromWallet()` 兩次 → 只觸發一次 wallet sign request；同一 wallet 衍生相同 keypair（deterministic）。
- **`test_keypair_reused_across_responses`** — 同一 session 內多次填答 → 不再觸發 sign。
- **`test_keypair_cleared_on_disconnect`** — 切換錢包 → 舊 keypair 不可重用。

### S4.2 發起人加密公鑰存放策略（Frontend + Move）

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

### S5.1 SurveyPass 認證簽發設計拍板（pending → done by doc）

> 對應 [V2_改版目標.md §SurveyPass 認證簽發](V2_改版目標.md)。

Done Criteria（全部完成才算綠燈）：

- [ ] 問題 1（zkLogin / Google OAuth 機制定位）拍板，寫入 V2_改版目標 §設計決策表
- [ ] 問題 2（驗證階段是否要求連錢包）拍板
- [ ] 問題 3（真人驗證訊號組合）拍板
- [ ] 問題 4（BFF 角色）拍板
- [ ] V2_改版目標.md §SurveyPass 認證簽發章節從「待規劃」改為「定稿版」
- [ ] V2_TDD.md S6.1 / S6.2 / S6.3 子項的 pending 狀態移除、寫入具體 `test_*` 名稱

### S5.2 匿名投票初步方案設計交付（pending → done by doc）

> 對應 [V2_改版目標.md §匿名投票](V2_改版目標.md)。

Done Criteria：

- [ ] `docs/V2_AnonymousVoting_Sketch.md` 成形，必涵蓋：威脅模型、nullifier 結構草稿、與 SurveyPass 防女巫的衝突解法、預估工作量、下一版啟動條件
- [ ] V2_改版目標.md §匿名投票章節從「初步方案」改為「設計交付完成」

---

## S6：SurveyPass 實作（pending，等 S5.1）

> S5.1 拍板前**整個 S6 不開工**。S5.1 完成後，本章節對應子段會回填具體 `test_*` 名稱。在那之前，所有測試只列「類型 placeholder」。

### S6.1 SurveyPass 簽發合約 / BFF / FE（pending）

- Placeholder：
  - `test_surveypass_issue_*`（簽發路徑：admin / email OTP / KYC / zkLogin，依 S5.1 結果取捨）
  - `test_surveypass_anti_sybil_*`（不重複真人驗證）
  - `test_surveypass_not_consumed_after_multi_use`（保留 INV-6）

### S6.2 SurveyPass 首次連錢包檢查（pending）

- Placeholder：
  - `test_survey_page_checks_pass_on_first_connect` — 「提示 vs 強制」行為待 S5.1 結果
  - `test_survey_page_does_not_block_browsing_without_pass`

### S6.3 公鑰寫入 SurveyPass（條件性，pending）

- Placeholder：
  - `test_creator_pubkey_writable_to_surveypass` — 若 S5.1 決議寫入則回填，否則本項標 `wontfix` 並刪除測試。

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
| S5.1 / S5.2 | Done Criteria checklist 全勾 |
| S6.1 / S6.2 / S6.3 | **pending**，待 S5.1 拍板回填 |

> **S7 總驗收**：上述所有非 pending milestone 全綠 + INV-1～INV-7 全守住 + [V2_改版目標.md §驗收方向](V2_改版目標.md) 的 demo 動作 5 分鐘內手動跑完無 regression。
