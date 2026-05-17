# SurveySui MVP — 子任務清單 & TDD 測試規劃

## Context

`SurveySui` 是 Sui Overflow 2026 黑客松專案，瞄準 [DeFi & Payments 賽道](Overflow%20Tracks/DeFi%20%26%20Payments.md)。

本計畫的目的：把 MVP 規劃拆成**可執行的子任務清單**，每個任務搭配 **TDD 測試案例**（先寫測試，再實作）。

最終 MVP 要證明的兩件事：
1. **金流層**：發起者注資 → vault 鎖定 → 受訪者完成問卷 → 自動領到獎勵 → 可自由 swap 換 SUI
2. **產品層**：發起者能在 UI 上一氣呵成「設計問卷 + 設定獎勵 → 分享 → 看結果」

> **進度追蹤請見 [Tasks.md](Tasks.md)**。本文件保留設計決策與架構參照；已完成任務只保留摘要，未完成任務保留完整 TDD spec。

---

## 已對齊的設計決策

| 議題 | 決策 | 理由 |
|---|---|---|
| 網路 | **Testnet only**（demo 在 Testnet；合約參數化以便未來上 mainnet） | 跨網路橋接成本太高、會吃掉黑客松整段時程 |
| 獎勵代幣 | **平台統一 utility token `RWD`**（Coin\<RWD\>） | 簡單、demo 上有完整代幣概念 |
| Swap 機制 | **自建 CPMM**（RWD / SUI） | 使用者明確指定要自建，CPMM 模型最簡 |
| 受訪者 UX | **zkLogin 登入 + 後端代簽（受訪者完全免 gas、免簽名）** | 使用者要求 gasless；後端用 admin key 持 vault 提領權 |
| 女巫防護 | **ParticipantSBT（護照機制）**：不可轉移、有效期、可補發 / 重發 / 換發 / 註銷；同一 sub 在任一時刻只能持有 1 張**有效**的 SBT | 真人名單是核心資產；護照機制兼顧防女巫與帳戶恢復 |
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

## ✅ 已完成任務摘要（M0–M4，27/30）

> 下列為摘要。完整名單請參考 git history 或 [Tasks.md](Tasks.md) 對應段落。

- M0 基礎設施
- M1 Move Contracts（6/7）
- M2 Backend（Fastify + Prisma + PostgreSQL）
- M3 Frontend（Vite + React + @mysten/dapp-kit + Tailwind + Recharts）
- M4 整合 & Demo（2/3）

---

## ⏳ 未完成任務（保留完整規格）

### T1.7 — Deploy package + 初始化 AMM 流動性
- 寫 `scripts/init.ts`：deploy 後自動 mint 種子 RWD、開 RWD/SUI pool 並注入初始流動性
- **狀態**：程式碼已寫（`scripts/src/init.ts`），尚未對 testnet 真實執行
- **TDD**：執行後 query pool reserves，assertion: 兩邊 > 0（`INTEGRATION=1 AMM_POOL_ID=<id>`）

### T4.3 + M5 — Frontend ↔ Backend contract drift 全面對齊
> 2026-05-17 audit 發現 9 大整合問題（命名 drift、缺 session、FE 沒寫回 vault id、zkLogin 三段全部對不上、e2e 全 mock 沒守住）。
>
> **完整 spec 已遷至 [Tasks.md M5](Tasks.md)**（T5.1–T5.9，含每題 root cause、影響檔案、修法、TDD）。

驗收門檻：至少一條 e2e 跑真 backend（docker-compose 起 backend + Postgres，不再 `page.route()` mock）。

---

## 全域 TDD 策略

| 層級 | 工具 | 跑在哪 |
|---|---|---|
| Move 單元測試 | `sui move test` | CI + 本機 |
| Move 整合測試 | `sui move test` (test_scenario) | CI + 本機 |
| Backend unit | Vitest | CI |
| Backend integration | Vitest + 真 testnet（獨立 admin key） | 手動 / nightly |
| Frontend unit | Vitest + React Testing Library | CI |
| E2E | Playwright，連真 testnet 合約 | 手動 / pre-demo |
| **E2E real-backend**（M5 新增） | Playwright + docker-compose backend | CI（`e2e-real-backend` job） |

**TDD 原則**：每個 task 先在 PR 中提交「失敗的測試」，再提交「實作 + 測試通過」。Move 模組可一次 commit；Backend / Frontend 分兩 commit。

---

## 已知 Limitations（v2 roadmap，明確排除於 MVP）

- ❌ Testnet ↔ Mainnet 跨網路橋
- ❌ 多階段獎勵（前 100 名 10 token，101–1000 名 1 token...）
- ❌ AI 輔助 Markdown 編輯 / RAG 建議
- ❌ 進階參與條件（國籍、年齡、UID、邀請碼）
- ❌ 匿名化投票（與 SBT 防女巫衝突，需更深 zk 設計）
- ❌ 結果加密上鏈（MVP 只上 hash）
- ❌ Sponsored transaction 給受訪者（MVP 用後端代簽）

---

## 驗證方式（Definition of Done）

執行下列序列，能在 5 分鐘內完成完整 demo：

1. `pnpm -r build && pnpm -r test`（所有單元測試綠）
2. `pnpm move test`（合約測試綠）
3. `pnpm deploy:testnet`（合約 deploy + AMM 種子流動性 → T1.7）
4. `pnpm dev`（backend + frontend 起服）
5. 開瀏覽器：
   - **發起者**：建立「Sui Overflow 滿意度調查」、設 1 RWD/份 × 10 份、注資（看到鏈上交易）
   - **受訪者**（無痕視窗）：Google 登入（背景 mint SBT）→ 填問卷 → 看到「+1 RWD 已入帳」+ TX hash → 切到 swap 頁換成 SUI
   - **發起者**：dashboard 看到 1 份回覆、vault 餘額 9 RWD
6. `pnpm e2e`（Playwright 全綠，含 M5 T5.9 真 backend job）

---

## 推薦的開源參考

- AMM CPMM 範本：[interest-protocol/sui-defi](https://github.com/interest-protocol/sui-defi) 的 `amm` module
- zkLogin 整合：[Mysten Labs zkLogin demo](https://github.com/MystenLabs/sui/tree/main/sdk/zklogin)
- @mysten/dapp-kit 範例：[Sui dApp Kit docs](https://sdk.mystenlabs.com/dapp-kit)
- Sponsored transaction（v2 roadmap 用）：[Enoki by Mysten Labs](https://docs.enoki.mystenlabs.com/)
