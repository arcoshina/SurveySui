# V3 精細 UI 手動調整

V3 不採用 計畫-TDD 模式

## 待辦清單

- 新建問卷網頁 UI 細修
- 確認合約修改完成 - 重複設定、認證等級、SSR跟 sSSR 已完成改名

## 進度紀錄

### 2026/5/23

-[] 新增問卷 UI  

#### M-RP 重複填答獎勵 — 設計與驗證資產見 [M-RP/](M-RP/README.md)

- [x] T-RP-1.1 撰寫暫存 `docs/V3_TDD.md`（已併入 [M-RP/README.md](M-RP/README.md) 後刪除）
- [x] T-RP-1.2 `docs/改版備忘.md` 移除「重複填答」原條目
- [x] T-RP-1.3 `docs/encryption.md` 補「鏈上歷史不可抹除」揭露段落
- [x] T-RP-2.1 `survey_vault.move`：`SurveyVault` 加 `repeat_reward`、`repeat_max_times`、`claim_counts`（取代 `claimed_subs`）
- [x] T-RP-2.2 `survey_vault.move`：`create` / `create_empty` 加參數與 `EInvalidRewardConfig` 校驗
- [x] T-RP-2.3 `survey_vault.move`：`claim` 分支發獎；加 `ERepeatLimitReached`
- [x] T-RP-2.4 `survey_vault.move`：`merge_balances` 預算校驗納入 `repeat_reward × max_responses × repeat_max_times`
- [x] T-RP-2.5 `survey_vault.move`：`has_claimed` 改以 `claim_counts` 判斷；新增 `claim_count_of(respondent)` view
- [x] T-RP-2.6 合約測試 6 個情境：[docs/M-RP/survey_vault_repeat_tests.move](M-RP/survey_vault_repeat_tests.move)，臨時複製到 `contracts/tests/` 跑 `sui move test` 6/6 PASS
- [x] T-RP-3.1 `CreatePage.tsx`：`FullSurveyData` 加欄位 + 進階區塊 UI + 預估最大資金提示
- [x] T-RP-3.2 `SurveyPage.tsx`：讀 `SurveyClaimed` 事件、提示已填次數、達上限禁用送出
- [x] T-RP-3.3 `DashboardPage.tsx`：畫面「最新一次 / 所有」單選（預設所有）；CSV 維持全量輸出
- [x] T-RP-3.4 PTB 對應更新（`buildCreateSurveyPtb`、`estimateFundCostV2`、`FundPage`）
- [x] T-RP-4.1 `sui move build` 與 6 個 M-RP 測試全 PASS
- [x] T-RP-4.2 `pnpm typecheck` baseline 維持（殘留 2 處皆既存）
- [ ] T-RP-4.3 Devnet 5 情境驗證（待使用者依 [docs/M-RP/devnet_e2e.ps1](M-RP/devnet_e2e.ps1) 手動執行）
- [x] T-RP-5.1 刪除 `docs/V3_TDD.md` 並把 schema 摘要併入 `docs/M-RP/README.md`





### 2026/5/22

- [x] 發佈問卷前要可以回到上一頁
- [x] 問卷正常預覽
- [x] 題目輔助系統設計邏輯 - 參考google form
- [x] 問卷預覽時無法回到上一頁
- [x] 導覽列 UI 設計
- [x] 儀錶板頁面 UI 設計
- [x] 改名 SSR -> SR， sSSR -> SSR (StakedSurveysuiReward)
