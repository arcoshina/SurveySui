# SurveySui — Sui Overflow 2026 亮點說明

> 賽道：[DeFi & Payments — Programmable Money, Payments & Financial Systems on Sui](./Overflow_2026_DeFi%20%26%20Payments.md)
> 本文為提交底稿，著重說明專案如何運用 Sui 區塊鏈與 Move 語言的特性。

## 一句話定位

**SurveySui 把「問卷獎勵」變成一筆可程式化支付**：受訪者送出答案的同一筆交易內，合約原子完成「資格驗證 → 防女巫登記 → 加密答案上鏈 → 獎勵發放 → gas 補償回流」——支付不再是靜態轉帳，而是被條件、身分與資料交付綁定的金融動作。這正是賽道命題 *payments become programmable financial actions* 的具體實例。

賽道 Idea bank 對照：本專案同時落在 **Trust-Minimized Finance**（conditional execution、automated enforcement——獎勵發放無需信任發起者或平台）與 **Payments & Consumer Finance**（真實世界的 micro-payment 流、零門檻 onboarding）兩個方向。

## 為什麼這個問題值得做

中小企業、研究者發問卷給獎勵的市場早已存在，痛點也很具體：獎勵跳票（發起者賴帳）、資料灌水（女巫帳號）、平台抽成不透明、受訪者領獎門檻高。這些全是「信任」問題——恰好是鏈上金融的主場。SurveySui 用 Sui 的合約把四個痛點一次解掉，且受訪者**錢包餘額為 0 也能完成全程**。

---

## Sui / Move 特性運用

### 1. PTB 原子金流 — 把多步金融操作壓成一筆交易

本專案有三條核心 PTB 鏈（組裝邏輯見 [`frontend/src/lib/ptb.ts`](../frontend/src/lib/ptb.ts)）：

| 流程 | 單一 PTB 內完成的步驟 |
|------|----------------------|
| 問卷建立（6 步） | SUI 入池鑄 SSR → 建金庫注入預算 → 注入 gas 儲備 → 繳協議費 → 註冊問卷（內容雜湊綁定金庫）→ 共享金庫開放填答 |
| 填答領獎（claim） | 資格驗證 → nullifier 防女巫登記 → 加密答案掛載 → SSR 發獎 → gas／儲存補償轉給代付方 |
| 銷毀分帳（purge） | 分批刪除答案 dynamic field → 銷毀金庫與問卷物件 → storage rebate 盈餘 50/50 分帳轉給發起者（[`bff/src/purge/buildPurgePtb.ts`](../bff/src/purge/buildPurgePtb.ts)、[`rebateRefund.ts`](../bff/src/purge/rebateRefund.ts)） |

原子性是這裡的產品保證而不只是技術細節：**不存在「錢扣了問卷沒建好」「答案交了獎勵沒拿到」的中間狀態**。在帳戶模型鏈上，這需要多筆交易加離鏈協調器；在 Sui 上是一筆 PTB。

### 2. 物件生命週期當作狀態機 — owned → shared → destroyed

[`survey_vault.move`](../contracts/sources/survey_vault.move)、[`survey_registry.move`](../contracts/sources/survey_registry.move) 利用 Sui 獨有的物件所有權轉換控制問卷生命週期：

- 金庫與問卷建立時是 **owned object**——配資未完成、費未繳前，外界根本無法與之互動（不是「檢查狀態擋下」，是「物件不可達」）。
- 發起者完成 6 步配資後 `share_vault()` 轉為 **shared object**，才開放公眾填答；合約以 `fee_paid` 閘門強制「先繳費才能共享」。
- 結案後 purge 銷毀物件，鏈上不留垃圾。

金庫與問卷 1:1 綁定由 registry 維護全域不變式，同一內容雜湊只能註冊一次——**問卷內容不可竄改**由型別與物件模型直接保證。

### 3. Move 型別系統承載金融規則

- 預算池與 gas 儲備是 `Balance<STACKED_SURVEY_REWARD>` 與 `Balance<SUI>` 兩個型別隔離的池子，編譯期就排除「拿獎勵池付 gas 補償」這類錯帳。
- SR / SSR 代幣以 **One-Time Witness** 初始化（[`survey_reward.move`](../contracts/sources/survey_reward.move)、[`stacked_survey_reward.move`](../contracts/sources/stacked_survey_reward.move)），鑄幣權由型別系統唯一化。
- SurveyPass 是 **soulbound** 物件：不給 `store` 進轉讓路徑、`owner` 欄位不可變，「身分不可買賣」是型別層面的事實而非後端規則。

### 4. Dynamic field + Table — 鏈上資料結構的成本工程

[`survey_vault.move`](../contracts/sources/survey_vault.move) 對不同存取模式選用不同結構：

- **答案存 dynamic field**（序號 → 加密答案）：寫入互不衝突、可分批刪除（purge 每批 100 筆），且不撐大金庫物件本體。
- **去重用 `Table`**：`used_nullifiers`（防女巫）、`used_blob_ids`（防答案重放）、`claim_counts`（重複填答限額）O(1) 查詢，claim 失敗時 Sui 自動回滾全部寫入。
- **Pass 憑證槽存 dynamic field**（nullifier 為鍵，上限 16 槽）：一本 Pass 多憑證、各自有獨立有效期與註銷狀態（[`survey_pass.move`](../contracts/sources/survey_pass.move)）。

### 5. Storage rebate 變成產品機制 — Sui 獨有的儲存經濟

Sui 的儲存押金返還在多數專案只是成本科目，本專案把它做成了**使用者價值**：問卷到期銷毀時，刪除答案與物件觸發的 rebate 經兩段 dry-run 估算後，**盈餘 50% 在同一筆 PTB 內轉給發起者**——「清理過期問卷還能拿回錢」，同時讓鏈保持乾淨。配套防線：代付鑄造的 Pass 帶 `escape_clawback` 保證金（[`packages/gas-station-core/src/passEscapeClawbackValidation.ts`](../packages/gas-station-core/src/passEscapeClawbackValidation.ts)），杜絕女巫靠「免費鑄造→刪除套利」抽乾代付池。

### 6. Sponsored Transactions — 餘額為 0 的完整金融體驗

賽道要求 *excellent user experience for complex financial actions*，本專案的答案是：受訪者**從建立錢包到領到獎勵，全程不需要持有任何 SUI**。

- **單簽授權模型**：`/api/gas/sponsor` 做白名單驗證＋dry-run＋代簽，`/api/gas/execute` 驗「使用者交易簽章＝代付同意憑證」後原子消耗額度並雙簽廣播——使用者全程只簽一次，額度狙擊（冒用他人地址耗額度）被簽章驗證直接杜絕（[`docs/system_design/GasSponsorship.md`](./system_design/GasSponsorship.md)）。
- **dry-run 守門**：必敗交易（資格不符、名額已滿）拒簽，惡意者無法消耗代付方 gas（[`packages/gas-station-core/src/sponsorPipeline.ts`](../packages/gas-station-core/src/sponsorPipeline.ts)）。
- **兩層代付**：問卷方 gas 儲備優先（補償在 claim PTB 內鏈上回流代付方），儲備耗盡落到平台日額度（3 次/錢包/日）。代付簽名由 **2-of-3 multisig** 執行，免費額度**不靠資料表記帳，直接即時數鏈上歷史**——記帳本身也去中心化。

### 7. Soulbound Pass + 雙層 nullifier — 不信任後端的防女巫

資格驗證**全在合約**（[`survey_pass.move`](../contracts/sources/survey_pass.move)、[`survey_eligibility.move`](../contracts/sources/survey_eligibility.move)），後端只負責簽發認證 ticket：

- **Issuance nullifier**：Email／OAuth／World ID 帳號經加鹽單向雜湊，全域登記「同一身分只綁一個錢包」——換錢包灌水無效，且鏈上不存任何個資。
- **Per-survey nullifier**：claim 時以 `H(pass_nullifier ‖ vault_id)` 登記，同一身分同一問卷只算一次，跨問卷不可關聯（隱私保護）。
- **Commitment 防竄改**：每個憑證槽存 `blake2b256(owner ‖ source ‖ nullifier ‖ expires_at)`，claim 時合約重算比對。

即使平台後端被攻破，攻擊者也無法偽造資格或重複領獎——這是賽道 *trust-minimized finance* 的直接體現。

### 8. 混合儲存 — 依資料大小自動選擇最便宜的層

加密問卷 ≤10KB、答案 ≤6KB 直接 inline 上鏈（小資料上鏈反而便宜，且享受 purge rebate）；超過門檻自動分流 **Walrus**，鏈上只存 blob 索引（[`frontend/src/lib/storage.ts`](../frontend/src/lib/storage.ts)、[`docs/system_design/StorageStrategy.md`](./system_design/StorageStrategy.md)）。門檻的依據是實測成本曲線：Walrus 任何小 blob 編碼後都頂到約 63MiB 下限，小資料走鏈上是經過計算的工程決策，不是偷懶。

### 9. Reserve-ratio 儲備池 — 預算注入即托底代幣

發起者投入的 SUI 進入 canonical pool（[`amm_pool.move`](../contracts/sources/amm_pool.move)），依儲備比率 `ssr_out = floor(sui_in × sr_reserve / sui_reserve)` 鑄造獎勵代幣 SSR，池內 SR 與流通 SSR 維持 1:1 背書恆等式。**每一份問卷預算同時是 SSR 的價值支撐**——平台增長與代幣價值由同一條金流驅動，無需外部做市。

---

## 對照「Top-Tier Project」清單

| 賽道標準 | 本專案的回應 |
|----------|--------------|
| Novel use of programmable transactions | claim 一筆 PTB 完成驗證＋發獎＋補償回流；purge 同 PTB 完成銷毀＋rebate 分帳；配資 6 步原子建鏈 |
| Strong composability across components | Pass（身分）、Vault（金流）、Registry（內容綁定）、Pool（代幣）四個獨立模組以物件引用組合；NFT 持有可作為外部資格來源直接組入 claim |
| Excellent UX for complex financial actions | 餘額 0 全程可用；全流程使用者只簽一次名；非 Web3 使用者以 Google 帳號（Slush zkLogin）一分鐘上手 |
| Real-world applicability | 中小企業／學研問卷市場既存且付費意願明確；已通過 CertiK Scan 第一輪並完成修補；i18n 五語系、上線部署文件齊備 |

## 3 分鐘 Demo 動線

1. **（30s）發起者**：Markdown 寫一份問卷 → 設定獎勵與名額 → 一筆簽名，展示費用明細與上鏈結果。
2. **（90s）受訪者**：開無痕視窗、Google 帳號建立全新 Slush 錢包（餘額 0）→ Email/OAuth 認證鑄 Pass（代付）→ 填答送出（代付、唯一一次簽名）→ 錢包即時收到 SSR。中途示範重複填答被合約拒絕。
3. **（60s）收尾**：儀表板看即時統計 → 發起者解密答案 → 結案退回剩餘預算 → purge 展示 storage rebate 分帳入帳。

## 現況

- 鏈上合約、BFF（代付／認證／清理）、前端全棧可運行，部署於 Sui devnet。
- 已完成 CertiK Scan_1 修補對齊（代幣經濟、nullifier 語意、claim 預檢一致性）。
- 文件齊備：系統設計（[`docs/system_design/`](./system_design/README.md)）、安全指引、部署指南、五語系前端說明。
