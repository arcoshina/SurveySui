# 專案目標與架構更新計畫

根據您的最新需求，這個專案將會轉變為一個**高度去中心化、原生整合 Sui 特性（zkLogin, Sponsored Transactions）、且具備獨立代幣經濟模型**的 Web3 原生應用。

以下是針對 `專案目標.md` 更新的實作計畫與技術可行性分析，請您確認是否有偏離您的構想：

## User Review Required

### 1. 無後端與代付 Gas (Sponsored Transactions) 的實作方式
您提到「去除後端」且「受訪者 0 餘額可填答」。
*   **技術方案**：在 Sui 上，我們可以讓前端直接構建 PTB (Programmable Transaction Block)，然後將這筆交易送到 **Gas Station 服務 (例如 Shinami API 或 Mysten 官方的贊助節點)** 請求代付簽名。拿到 Gas 簽名後，前端再把交易廣播上鏈。
*   **避免 Gas 被惡意消耗**：Gas Station 可以在簽名前先**模擬 (Dry Run)** 交易。如果合約驗證失敗（例如沒有通行證、重複填答），模擬就會失敗，Gas Station 就不會簽名，因此專案方不會白白損失 Gas。

### 2. SUI zkLogin 與防女巫 (Anti-Sybil)
您提到「驗證 Gmail / MVP 先用暫時的通行證」。
*   **技術方案**：Sui 內建的 **zkLogin** 技術完美符合這個需求！使用者可以直接用 Google 帳號登入，Sui 會在背景利用零知識證明生成一個隱私的錢包地址。
*   **MVP 策略**：MVP 階段我們可以發行一個簡單的 `SurveyPass` 物件（暫時的通行證）。使用者連線錢包後，前端發起一筆（一樣由專案方代付 Gas 的）交易來 Mint 這個通行證，合約在填答時會消耗或驗證這個通行證。未來再全面串接 zkLogin。

### 3. 代幣經濟模型 (Tokenomics) 釐清
您的描述非常接近 DeFi 中的 **聯合曲線模型 (Bonding Curve)**。為了確保寫入文件的邏輯正確，我將您的流程梳理如下，請確認是否符合您的想像：
1.  **儲備與發行 (Pool & Mint)**：存在一個智能合約池 (Pool)，裡面鎖定 Sui。發起者投入 Sui，Pool 會根據當前價格 Mint 出 `SurveySuiReward` 代幣給發起者。池子裡的 Sui 越多，代幣價格越高。
2.  **建立問卷 (Create Vault)**：發起者將 `SurveySuiReward` 存入問卷專屬的 Vault，作為獎勵池。
3.  **填寫與領獎 (Respond & Claim)**：受訪者填完問卷，合約驗證通過後，發給受訪者一張 `Receipt` (質押憑證/收據物件)。
4.  **兌換 (Swap/Redeem)**：受訪者可以拿著 `Receipt` 回到 Pool，銷毀憑證並領出等值的 `SurveySuiReward` 或直接換成 Sui。
5.  **手續費 (Fee)**：在 Mint 或 Swap 過程中抽取 % 的手續費，流入專案方的金庫 (Treasury)。

## 預計修改的 `專案目標.md` 內容結構

我將會大幅更新 `專案目標.md`，主要修改以下段落：

*   **MVP 要證明什麼**：
    *   移除依賴後端的描述，強調**全鏈上智能合約驗證 (Fully On-Chain Verification)**。
    *   加入 **Sponsor Gas (代付手續費)** 證明 0 門檻體驗。
    *   明確描述 Bonding Curve 的金流模型。
*   **角色與錢的流向**：
    *   重新定義合約資產：`RewardPool` (AMM 池), `RewardVault` (問卷資金池), `SurveyReceipt` (質押憑證)。
*   **Flow A / B / C 流程重構**：
    *   **Flow A (發起者)**：流程改為 `Sui -> 換成代幣 -> 存入 Vault 建立問卷`。
    *   **Flow B (受訪者)**：流程改為 `前端生成 PTB -> 請求 Gas Station 代付 -> 上鏈驗證 Pass NFT 並發放 Receipt`。移除後端干預，並明確說明使用 `SurveyPass` 防女巫。
    *   **Flow C (收尾)**：結算時剩餘代幣退還，發起者可選擇保留或倒貨回 Pool 換回 Sui。

---
如果您同意上述的技術方案與代幣模型梳理，請回覆「**同意**」或補充您的修改意見，我將立刻為您更新 `專案目標.md`！
