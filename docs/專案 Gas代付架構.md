# 專案 Gas 代付架構 (Gas Station) 設計方案與安全評估

本文件旨在解決受訪者 0 SUI 即可填答及身分認證的痛點，同時透過多層級隔離防範平台與發起人資金被惡意刷單或攻擊耗盡。

## 二層代付架構 (Layer-by-Layer Architecture)

### 第一層：隔離代付 (發起人自費、安全隔離)
* 核心機制：每個問卷金庫 (`SurveyVault`) 擁有其專屬的 Gas 基金。代付資金由問卷發起人提供，與平台資金完全隔離，將惡意刷單或交易故意失敗攻擊的 Gas 損失上限，限制在該問卷預存的額度內。
* 推薦實作：方案 C（鏈上合約託管 + PTB 即時補償） *(詳細設計見下文)*。

### 第二層：平台代付 (項目方緩衝)
* 核心機制：當第一層代付餘額不足或未設定時，由平台（項目方）的公共錢包提供有限度的 Gas 代付，作為免 Gas 體驗的緩衝。
* 安全限制：
  1. Rate Limiting：限制單個錢包地址在 Layer 2 的每日代付次數（例如每日最多 3 次）。

### 代付失效：訪客自付 (極端 Fallback)
* 核心機制：若前兩層皆失效，提示用戶後由其自付 Gas 提交交易。


## 核心設計方案評估

### 方案 C：鏈上合約託管 + PTB 即時補償

#### 運作邏輯**：
  1. 合約託管：
        在 `SurveyVault` 合約中設計一個 `gas_balance: Balance<SUI>` 欄位。發起人創建或充值問卷時，直接將 SUI 存入該合約中。
  2. PTB 即時補償：填答者在前端構建的 Transaction Block (PTB) 中，同時包含：
     - 填答調用：`submit_survey(&mut vault, ...)`
     - 補償調用：`withdraw_gas_compensation(&mut vault, amount, ctx)`，此步驟會從 `gas_balance` 中取出預估 Gas 費（例如 0.005 SUI）轉給 Sponsor (BFF 代付錢包)。
  3. BFF 簽名：BFF 收到 PTB 後，進行 dryRun 驗證。若驗證通過，BFF 作為 Sponsor 簽署此 PTB。
  4. 鏈上執行：交易成功執行時，BFF 支付了 Gas，但在同一個交易中收到了來自 `SurveyVault` 的 SUI 補償，BFF 熱錢包餘額幾乎保持不變。

#### BFF 斷線時須由訪客自付，且可能重扣 (PTB 需檢查)
  * 前端 `frontend/src/lib/sponsoredTx.ts` 應實作 `executeTxWithFallback`：當 BFF 回傳代付失敗或無法連線時，進行 client-side dry-run，並提示用戶（例如：「代付系統離線中，您仍可自付 Gas 完成鏈上提交」），經同意後使用用戶錢包自簽發送。

#### 餘額回收
- 發起人結案時，調用合約的 `reclaim_gas` 函數提走剩餘 SUI  
- 受訪者的錢包餘額即使為 0 SUI，也能正常簽章並發送交易  


### 結論
為了實現「受訪者 0 餘額填答」且「平台/發起人對代付擁有完全控制權（防刷）」，BFF 作為鏈下中繼器（Sponsor Signature Generator）的介入是必不可少的。

