# M-RP 重複填答獎勵 — 設計總結 + 測試/驗證資產

這個資料夾承載 V3 M-RP「重複填答獎勵」的**測試與驗證資料**及最終設計摘要。
V3 整體不採用「計畫-TDD」模式，但本工作觸及合約 schema 改動，故將驗證憑據與設計摘要落地於此。

## 設計收斂與最終 schema

鏈上事件不可變、不可刪除 →「覆蓋」與「變化追蹤」在鏈上沒有差別；舊版本密文永遠留在事件歷史。
因此設計收斂為：

- **合約**只認「初次填答」與「重複填答」兩種狀態
- **`repeat_reward = 0`** 即等於「禁止重複填答」（不再有 `repeat_policy` 旗標）
- **「覆蓋 / 追蹤」純粹是 Dashboard 顯示切換**，建立問卷時不必選

### Vault 新增欄位

| 欄位               | 型別                     | 驗證                | 預設                | 語意                                     |
| ------------------ | ------------------------ | ------------------- | ------------------- | ---------------------------------------- |
| `per_response`     | u64                      | 正整數（≥ 1）       | 既有                | 首次填答獎勵                             |
| `repeat_reward`    | u64                      | 非負整數（≥ 0）     | **0**               | 每次重填獎勵；**`0` = 禁止重複填答**     |
| `repeat_max_times` | u64                      | 正整數（≥ 1）無上限 | **3**               | 每地址最多重填次數                       |
| `claim_counts`     | `Table<vector<u8>, u64>` | —                   | 取代 `claimed_subs` | 每地址累計提交次數（首次為 1，重填遞增） |

### `claim` 行為

1. **`create` 入口驗證**：`per_response ≥ 1` 且 `repeat_max_times ≥ 1`，否則拋 `EInvalidRewardConfig`
2. `repeat_reward == 0`：第二次 claim 拋 `EAlreadyClaimed`（保持現行行為）
3. `repeat_reward > 0`：以 `prior = claim_counts[address]` 判斷
   - 首次（`prior == 0`）：發 `per_response`、`claimed_count++`（人頭 cap）
   - 重填（`1 ≤ prior ≤ repeat_max_times`）：發 `repeat_reward`、`claimed_count` 不變
   - `prior > repeat_max_times`：拋 `ERepeatLimitReached`（總提交上限 = `1 + repeat_max_times`）
4. **截止時間後**：所有 claim 拋 `EExpired`
5. **SurveyPass 過期**：拋 `EInvalidPass`
6. **預算上限**（`merge_balances`）：`balance ≥ per_response × max_responses + repeat_reward × max_responses × repeat_max_times`

### Dashboard / CSV

- 畫面切換「最新一次 / 所有提交」，預設「所有」
- CSV **永遠匯出全部**（不受畫面切換影響）
- 不導入 chart library

### SurveyPage

- 讀 `SurveyClaimed` 事件（按 `respondent` 過濾）計算「您已填過 N 次」
- 達 `1 + repeat_max_times` 上限時禁用送出按鈕
- 不做「預填上次答案」的複雜 UX

## 檔案

| 檔案                                                             | 用途                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [survey_vault_repeat_tests.move](survey_vault_repeat_tests.move) | M-RP 6 個合約測試情境。若要實際以 `sui move test` 執行，先複製至 `contracts/tests/`。     |
| [devnet_e2e.ps1](devnet_e2e.ps1)                                 | Devnet 5 情境端到端驗證 PowerShell 腳本範本。需先設好 PACKAGE_ID 等環境變數，再手動執行。 |

## 6 個合約測試情境

1. `test_create_per_response_zero_fails`：`per_response = 0` 拋 `EInvalidRewardConfig`
2. `test_create_repeat_max_zero_fails`：`repeat_max_times = 0` 拋 `EInvalidRewardConfig`
3. `test_repeat_disabled_blocks_second_claim`：`repeat_reward = 0` 時二次 claim 拋 `EAlreadyClaimed`
4. `test_repeat_within_limit_pays_repeat_reward`：`repeat_reward > 0, max = 3`，首次發 `per_response`、2–4 次發 `repeat_reward`，餘額正確
5. `test_repeat_over_limit_fails`：上一情境第 5 次（即第 4 次重填）拋 `ERepeatLimitReached`
6. `test_claim_after_deadline_fails`：時間超過 deadline 後 claim 拋 `EExpired`

> SurveyPass 過期情境因 `survey_pass::is_valid` 已是現行邏輯，依賴既有測試覆蓋；本檔不重複。

## 5 個 Devnet 情境

見 [devnet_e2e.ps1](devnet_e2e.ps1) 內註解。腳本不會自動部署 package，需先：

1. `cd contracts && sui client publish --build-env testnet`
2. 將回傳的 PackageID / Treasury / Registry / Pool 等寫進 `frontend/.env.local`
3. 啟動 `pnpm --filter frontend dev`，瀏覽器跑流程
