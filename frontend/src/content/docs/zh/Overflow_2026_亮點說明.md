---
title: Overflow 2026 亮點
order: 0
---

# Overflow 2026 亮點

## 即答即領的程式化支付

SurveySui 把 防女巫驗證-> 答卷上鏈-> 獎勵發放 打包在一筆 PTBs 交互內完成，也讓有獎徵答這件事，對於問答雙方都變得簡單高效。

**為什麼符合 DeFi & Payments 賽道**

在 SurveySui，不再只是填答之後等待問卷業者把錢匯出，而是一筆會自動驗證資格、防止灌水、並在條件成立時立刻放款的條件式支付。對照賽道 Idea bank，本專案落在 **Payments & Consumer Finance**：一條面向真實世界、零門檻 onboarding 的 micro-payment 流，而且獎勵發放由合約條件式執行、無需信任發起者或平台。


## What We Built


一個給小型創業者的**鏈上問卷平台**：發起者用 Markdown 寫問卷、注入獎勵預算；即便是非幣圈玩家的受訪者，也能在沒有 SUI 的情況完成初步的填答領獎。問卷的「收答案」與「發獎勵」不再是一串繁瑣、高成本的步驟，而是合約保證完成的一筆資訊交易。

| 角色 | 需求 |做的事 |
|------|--------|-----|
| 發起者 | 蒐集市場資訊 | 注資、宣傳、整理資訊 |
| 受訪者 | 表達意見 |填答、領 SSR |
| 管理者 | 營運服務 | 維護系統和獎勵儲備池 |

## Why We Built It

### 缺乏效率且滲透率仍低的市場

「提供獎勵時，問卷的回收率顯著提升、資訊也更詳細」。這是一個明確的利基市場，願意為可靠的樣本付費。

問卷可以提供比貼文分析更細緻的資訊。然而，單一問卷的資料沒有太多價值，問卷系統也有較高的摩擦。即便選擇領取不用匯款的禮品卡，受訪者也需要積累許多點數才能達到領獎門檻。許多受訪者因為達不到門檻而放棄繼續參與，甚至一部分人認為投入與付出不成比例，懷疑自己是不是遇到詐騙。

 SurveySui 希望用區塊鏈的效率重造既有流程，讓受訪者填完馬上領獎。受訪者不用等積累到門檻才能提領，也不用負擔高額手續費。

| 平台 | 區域 | 推估規模 | 依據說明 |
|-----|-----|-----:|--------|
| Toluna Influencers | 全球 | 6 MUSD | 2026 營收約 294M。growjo |
| Swagbucks | 美國 | 3 MUSD | 2024 營收約 65M。rocketreach |
| Premise | 全球 | 2 MUSD | 2023 營收約 30M。getlatka |
| OpinionWorld | 台灣 | 5 MUSD | 宣稱每年發放約 5M。swiftsalary |
| iX:Panel | 台灣 | 2 MUSD | 以會員數 22 萬粗估。ixresearch |

而獎勵問卷的主流收入模式是「每完成一份樣本」按件計價，單價內含受訪者獎勵成本與平台抽成。獎勵本身就是這門生意的核心引擎——而引擎的可靠度，正是鏈上能加值的地方。


## How It Works

### 代幣經濟


### SurveyPass 防女巫設計

一錢包一 Pass，內含多來源
Pass 的 nullifiers 防女巫
更換錢包時的刪除重綁機制，以及逃生門。

### 問卷的加解密及安全設計(防注入)





### 三條核心 PTB 鏈

所有金流都壓成單一交易（組裝邏輯見 [`frontend/src/lib/ptb.ts`](../frontend/src/lib/ptb.ts)）：

| 流程 | 單一 PTB 內完成的步驟 |
|------|----------------------|
| 問卷建立（6 步） | SUI 入池鑄 SSR → 建金庫注入預算 → 注入 gas 儲備 → 繳協議費 → 註冊問卷（內容雜湊綁定金庫）→ 共享金庫開放填答 |
| 填答領獎（claim） | 資格驗證 → nullifier 防女巫登記 → 加密答案掛載 → SSR 發獎 → gas／儲存補償轉給代付方 |
| 銷毀分帳（purge） | 分批刪除答案 dynamic field → 銷毀金庫與問卷物件 → storage rebate 盈餘 50/50 分帳轉給發起者（[`bff/src/purge/buildPurgePtb.ts`](../bff/src/purge/buildPurgePtb.ts)、[`rebateRefund.ts`](../bff/src/purge/rebateRefund.ts)） |

原子性是這裡的產品保證而不只是技術細節：**不存在「錢扣了問卷沒建好」「答案交了獎勵沒拿到」的中間狀態**。在帳戶模型鏈上，這需要多筆交易加離鏈協調器；在 Sui 上是一筆 PTB。

### 商業模式如何映射到鏈上

對應 [`bmc`](./Business_Model/bmc-small-founder-saas.md) 的收入設計：未來平台收入為 **SaaS 訂閱費 + 獎勵模組抽成（約 3–10%）**，獎勵本金由客戶預先儲值。本 MVP 已把抽成做成鏈上機制——建立問卷時合約自動扣協議費進 admin treasury，發起者投入的 SUI 同時成為獎勵代幣的儲備支撐。成本對使用者完全透明：前端在簽名前即顯示獎勵總額＋平台費的預估。

### 3 分鐘 Demo 動線（對齊賽事影片建議）

1. **（30–60s）問題**：小型創業者要發獎勵問卷，卻卡在跳票、灌水、領獎門檻——這些都是信任問題。
2. **（~3min）產品 Demo**：
   - **發起者（30s）**：Markdown 寫問卷 → 設定獎勵與名額 → 一筆簽名，展示費用明細與上鏈結果。
   - **受訪者（90s）**：開無痕視窗、Google 帳號建立全新 Slush 錢包（餘額 0）→ Email/OAuth 認證鑄 Pass（代付）→ 填答送出（代付、唯一一次簽名）→ 錢包即時收到 SSR。中途示範重複填答被合約拒絕。
   - **收尾（60s）**：儀表板看即時統計 → 發起者解密答案 → 結案退回剩餘預算 → purge 展示 storage rebate 分帳入帳。
3. **（30–60s）結論與未來願景**：見下方「未來展望」。

---

## How you used the Sui stack — Sui / Move 特性運用

### 1. PTB 原子金流 ＋ Sponsored — 把多步支付壓成一筆、餘額 0 也能跑完

- **原子金流**：建立（6 步）、claim、purge 三條流程各以單一 PTB 完成驗證／發獎／補償／銷毀／rebate 分帳，無「錢扣了問卷沒建好」「答案交了獎勵沒拿到」的中間狀態。帳戶模型鏈上需多筆交易＋離鏈協調器，Sui 上是一筆 PTB——*novel use of programmable transactions* 的直接體現。
- **物件可達性即閘門**：金庫初始為 owned object，配資未完成、`fee_paid` 未通過前外界無法互動（不是狀態檢查，是物件不可達）；`share_vault()` 轉 shared object 才開放填答。授權靠物件模型而非狀態旗標。
- **Sponsored Transactions**：受訪者從建立錢包到領獎全程不持有 SUI、只簽一次名。`/sponsor` 以 dry-run 拒簽必敗交易防 gas 抽乾、簽章驗證防額度狙擊；代付以 **2-of-3 multisig** 執行，免費額度直接即時數鏈上歷史、不另設帳本（[`GasSponsorship.md`](./system_design/GasSponsorship.md)）。

### 2. Soulbound Pass ＋ 雙層 nullifier — 不信任後端的物件化防女巫

資格驗證**全在合約**（[`survey_pass.move`](../contracts/sources/survey_pass.move)、[`survey_eligibility.move`](../contracts/sources/survey_eligibility.move)），後端只簽發認證 ticket——即使後端被攻破，攻擊者也無法偽造資格或重複領獎（*trust-minimized finance*）。

- **雙層 nullifier**：issuance 層將 Email／OAuth／World ID 帳號加鹽單向雜湊，全域綁定「一身分一錢包」、鏈上不存個資；per-survey 層以 `H(pass_nullifier ‖ vault_id)` 登記，同問卷只領一次且跨問卷不可關聯（隱私）。鏈上以 `Table` O(1) 去重，claim 失敗 Sui 自動回滾全部寫入。
- **Soulbound 是型別事實**：Pass 不給 `store`、`owner` 欄位不可變，「身分不可買賣」由型別系統保證而非後端規則。每個憑證槽存 `blake2b256(owner ‖ source ‖ nullifier ‖ expires_at)` commitment，claim 時合約重算比對防竄改。

### 3. 鏈上資源利用 — Storage rebate 產品化 ＋ 成本導向的混合儲存

- **Storage rebate 變產品機制**：Sui 的儲存押金返還多被當成本科目，本專案做成使用者價值——問卷到期 purge 時，刪除答案（存 dynamic field，每批 100 筆）與銷毀物件觸發的 rebate 經兩段 dry-run 估算後，**盈餘 50% 於同一 PTB 內回流發起者**，清理過期問卷還能拿回錢。代付鑄造的 Pass 帶 `escape_clawback` 保證金（[`passEscapeClawbackValidation.ts`](../packages/gas-station-core/src/passEscapeClawbackValidation.ts)），杜絕女巫「免費鑄造→刪除套利」抽乾代付池。
- **混合儲存**：答案 ≤6 KiB（`MAX_INLINE_ANSWER_BYTES`）直接 inline 上鏈、享 purge rebate；超標自動分流 **Walrus**，鏈上只存 blob 索引並以 `Table` 防重放（[`storage.ts`](../frontend/src/lib/storage.ts)、[`StorageStrategy.md`](./system_design/StorageStrategy.md)）。門檻依實測成本曲線——Walrus 任何小 blob 編碼後頂 ~63 MiB 下限，小資料走鏈上是工程決策。

---

## 對照「Top-Tier Project」清單

| 賽道標準 | 本專案的回應 |
|----------|--------------|
| Novel use of programmable transactions | claim 一筆 PTB 完成驗證＋發獎＋補償回流；purge 同 PTB 完成銷毀＋rebate 分帳；配資 6 步原子建鏈 |
| Strong composability across components | Pass（身分）、Vault（金流）、Registry（內容綁定）、Pool（代幣）四個獨立模組以物件引用組合；NFT 持有可作為外部資格來源直接組入 claim |
| Excellent UX for complex financial actions | 餘額 0 全程可用；全流程使用者只簽一次名；非 Web3 使用者以 Google 帳號（Slush zkLogin）一分鐘上手 |
| Real-world applicability | 對標既存付費市場：SurveyMonkey ~700M、Typeform ~140M、台灣 Rakuten Insight ~30M、LifePoints ~20M（[`Players.csv`](./Business_Model/Players.csv)）；有獎勵問卷的回收率與代表性優勢有研究佐證（[`有無獎勵比較.csv`](./Business_Model/有無獎勵比較.csv)）；已過 CertiK Scan 第一輪、i18n 五語系、部署文件齊備 |

---

## 未來展望

這個 MVP 只是起點。下一步沿三條軸線發展：

- **商業化**：落地 [`bmc`](./Business_Model/bmc-small-founder-saas.md) 的 SaaS 訂閱 + 獎勵抽成（3–10%）模式，把鏈上協議費機制接上對外計費；以創業加速器、共創空間、課程顧問作為導流通路。
- **可組合資格**：開放 NFT 持有、外部 DID 作為填答資格來源，直接組入 claim PTB——讓「持有某社群憑證才能填答」這類條件零後端達成。
- **更深的價值層**：分析服務獨立為利潤中心（深度報告、策略顧問）；持續擴充 onboarding（Slush zkLogin 已讓非 Web3 使用者一分鐘上手），把「鏈上」對終端使用者徹底隱形。

目標是讓 SurveySui 成為小型創業者驗證市場的預設工具——而「鏈上」只是背後讓金流可信、成本透明、防灌水的引擎。

---

## 現況

- 鏈上合約、BFF（代付／認證／清理）、前端全棧可運行，部署於 Sui devnet。
- 已完成 CertiK Scan_1 修補對齊（代幣經濟、nullifier 語意、claim 預檢一致性）。
- 文件齊備：系統設計（[`docs/system_design/`](./system_design/README.md)）、安全指引、部署指南、五語系前端說明。
