# SurveySui — 5 分鐘 Demo 腳本

> **目標時間**：5 分鐘內完成完整流程展示
> **網路**：Sui Testnet
> **預備動作**：開啟瀏覽器 + 後端 + 前端（`pnpm dev`），並確認 testnet SUI 餘額足夠

---

## 事前準備（Demo 前 5 分鐘）

```bash
# 1. 啟動開發服務
pnpm dev

# 2. 確認後端健康（另開 terminal）
curl http://localhost:3000/health
# 預期：{"ok":true}

# 3. 確認前端可開啟
# 瀏覽器打開 http://localhost:5173
```

**準備好的角色**：
- **發起者（Creator）**：已連接 Sui Wallet（Slipuito / Suiet），錢包有 ≥ 0.5 SUI testnet
- **受訪者（Respondent）**：一個 Google 帳號（zkLogin 用）

---

## Demo 腳本

### 場景說明（30 秒）

> 「SurveySui 解決了一個問題：傳統問卷平台的獎勵不透明、容易女巫攻擊、到付時間久。我們用 Sui 的物件模型 + zkLogin 打造了一個端到端透明的問卷獎勵系統，全程上鏈可驗證。」

**三個角色**：
1. 發起者 → 用 SUI 注資、設計問卷、分享連結
2. 受訪者 → Google 登入、填答、自動領 RWD
3. 鏈上合約 → 鎖定資金、防女巫、自動發獎

---

### 第一步：發起者建立問卷（1 分 30 秒）

**動作**：打開 `http://localhost:5173/create`

1. 在 Markdown 編輯器貼入問卷內容：
   ```markdown
   ---
   title: Sui Overflow 2026 滿意度調查
   per_response: 1
   max_responses: 50
   deadline: 2026-06-30T23:59
   ---

   ## Q1. 您最喜歡 Sui 的哪個特性？

   - [ ] Move 語言安全性
   - [ ] Object model
   - [ ] 低 gas fee
   - [ ] 快速最終性

   ## Q2. 您對這次黑客松有什麼建議？

   [簡答]
   ```

2. 右側預覽即時更新 → 展示 Markdown 解析

3. 填入獎勵設定：
   - 每份獎勵：`1 RWD`
   - 最大名額：`50`
   - 截止時間：`2026-06-30`

4. 點擊「建立問卷」→ 後端 parse Markdown + 寫入 DB + 呼叫 `survey_registry::register` 上鏈

5. 顯示：「問卷已成功建立！」→ 出現「前往注資」按鈕

**重點台詞**：「問卷的 content hash 已經上鏈，任何人都可以驗證問卷內容沒被竄改。」

---

### 第二步：發起者注資（45 秒）

**動作**：點擊「前往注資」，進入 `/fund/:id`

1. 頁面顯示預估消耗：
   - 所需 RWD = 50 × 1 = **50 RWD**
   - 對應 SUI（CPMM 反向公式 + 1% 滑點緩衝）≈ **0.3 SUI**

2. 點擊「連接錢包」，選 Slipuito

3. 點擊「一鍵注資」→ 錢包彈出確認視窗

4. 展示 PTB 內容（三個 command）：
   - `amm_pool::swap_b_to_a`（SUI → RWD）
   - `survey_vault::create`（建立 vault）
   - `survey_vault::share_vault`（共享 object）

5. 確認簽名 → 等待鏈上確認（約 1-2 秒）

6. 顯示 TX hash → Sui Explorer 開啟驗證

**重點台詞**：「這是一筆 atomic PTB，三個合約呼叫同時成功或同時失敗，不會出現資金卡在中間的情況。」

**Sui Explorer 連結**：
```
https://suiexplorer.com/txblock/<TX_HASH>?network=testnet
```

---

### 第三步：受訪者 zkLogin 登入（30 秒）

**動作**：開啟問卷分享連結 `http://localhost:5173/s/<SURVEY_ID>`（或新視窗）

1. 導向 `/login` 登入頁

2. 點擊「使用 Google 登入」

3. Google OAuth 流程（約 10 秒）

4. 後端自動完成：
   - 驗證 JWT → 取得 sub
   - SHA256(sub) → sub_hash
   - 呼叫 `participant_sbt::issue` → 發護照 SBT

5. 頁面顯示「護照已啟用」（polling `GET /me/sbt-status`）

**重點台詞**：「護照 SBT 是不可轉移的，每個 Google 帳號只能持有一張有效護照，這是我們的防女巫機制。」

---

### 第四步：填答 + 領 RWD（1 分鐘）

**動作**：自動跳轉回問卷頁 `/s/<SURVEY_ID>`

1. 渲染問卷題目（從後端 API 拉取）

2. 回答問題：
   - Q1：選「Move 語言安全性」
   - Q2：輸入「很棒的黑客松！」

3. 點擊「預覽答案」→ 顯示確認頁

4. 確認答案正確後，點擊「確認提交」

5. 後端處理：
   - 再次檢查：SBT 有效 + sub_hash 未領過 + 未截止 + 有名額
   - 呼叫 `survey_vault::claim` → 發 1 RWD 到受訪者地址
   - 寫回 `claimed_tx` 到 DB

6. 顯示「提交成功！」+ TX hash

**重點台詞**：「受訪者完全不需要錢包、不需要付 gas，後端用 admin key 代簽，但獎勵直接發到受訪者的 zkLogin 地址。」

---

### 第五步：Swap RWD → SUI（30 秒）

**動作**：點擊「前往兌換」或打開 `/swap`

1. 輸入「1 RWD」→ 顯示預估換得的 SUI（CPMM 公式）

2. 如果滑點 > 5%，顯示警告

3. 連接錢包、確認 swap

4. TX hash → Explorer 驗證

**重點台詞**：「受訪者拿到 RWD 後可以立刻換成 SUI，整個流程端到端在 Testnet 上完成，任何人都可以在 Explorer 上追蹤。」

---

### 第六步：發起者 Dashboard（15 秒）

**動作**：切換到 `/dashboard`

1. 顯示：
   - 回覆數：1 / 50
   - Vault 餘額：49 RWD（鏈上即時查詢）
   - 題目統計：Q1 長條圖

2. 點擊「結束活動」（可選，若要 demo 退回剩餘資金）

**重點台詞**：「儀表板的 vault 餘額是直接從鏈上讀的，不是資料庫快取，永遠與合約狀態同步。」

---

## 時間總結

| 步驟 | 預計時間 |
|------|---------|
| 場景說明 | 30 秒 |
| 建立問卷 | 1 分 30 秒 |
| 注資 | 45 秒 |
| zkLogin 登入 | 30 秒 |
| 填答 + 領 RWD | 1 分鐘 |
| Swap | 30 秒 |
| Dashboard | 15 秒 |
| **合計** | **~5 分鐘** |

---

## 備用問題回答

**Q：為什麼用自建 CPMM 而不用現成 DEX？**
> 展示 Sui Move 的 DeFi 基礎設施能力，同時讓 Demo 完全 self-contained，不依賴外部協議。

**Q：SBT 怎麼防止有人用多個 Google 帳號？**
> 每個 Google 帳號的 sub（subject ID）是唯一的，後端用 SHA256(sub) 作為 key，合約層同一個 sub_hash 只能在同一個 vault claim 一次。

**Q：後端代簽會不會有中心化風險？**
> MVP 是中心化的；Roadmap 是用 zkProof 讓受訪者自己在鏈上提交，後端只驗不簽。這個架構已預留升級空間（admin key 設計為可轉移）。

**Q：問卷結果上鏈嗎？**
> MVP 只上鏈 content hash（存在性證明），原始資料存後端。評審可以用 hash 驗證後端資料沒被竄改。

---

## TDD 驗證：跟著腳本跑 ≤ 5 分鐘

```bash
# 計時開始
time pnpm exec playwright test frontend/e2e/lifecycle.spec.ts --headed
# 預期：全部通過，耗時 < 5 分鐘（含瀏覽器啟動）
```

> 完整 happy-path 覆蓋於 `frontend/e2e/lifecycle.spec.ts`
> （後端與 OAuth 以 `page.route()` mock；錢包簽 PTB 部分於 Testnet 手動驗證）
