# SurveySui

> **Sui Overflow 2026 — DeFi & Payments 賽道**
>
> 鏈上問卷獎勵平台：發起者用 SUI 注資 → 受訪者填答領 stakedSurveySuiReward 憑證 → 一鍵向池子 redeem 兌換為 SurveySuiReward (SSR) 代幣，全程透明、防女巫、自動發獎。

---

## 快速開始（Quickstart）

### 前置需求

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 24 |
| pnpm | ≥ 9 |
| Sui CLI | ≥ 1.72 |

### 1. 安裝依賴

```bash
pnpm install
```

### 2. 設定環境變數

```bash
cp .env.example .env
# 填入 SUI_ADMIN_PRIVATE_KEY、SUI_ADMIN_ADDRESS 等必要值
```

> 詳細說明見 [SETUP.md](docs/SETUP.md)

### 3. 部署合約與初始化 AMM 池

在根目錄執行部署腳本（會將合約發布至 Devnet，初始化 AMM 池，並將 Object ID 自動寫回 `.env` 和 `.env.shared`）：

```bash
pnpm deploy:Devnet
```

### 4. 啟動開發伺服器

```bash
# 啟動 BFF (port 3000) 與前端 (port 5173)
pnpm dev
```

### 5. 跑測試

```bash
# 所有測試（前端 + BFF + 部署腳本測試）
pnpm test

# Move 合約測試
pnpm move:test
```

---

## 合約地址（Sui Devnet）

> 以下 ID 在執行 `pnpm deploy:Devnet` 後自動寫入 `.env.shared` 與 `.env`

| 物件 | Object ID |
|------|-----------|
| Package | `<SUI_PACKAGE_ID>` |
| SSR Treasury | `<SSR_TREASURY_ID>` |
| SSSR Treasury | `<SSSR_TREASURY_ID>` |
| AMM Pool | `<AMM_POOL_ID>` |
| Survey Registry | `<SURVEY_REGISTRY_ID>` |

---

## Demo URL

| 環境 | URL |
|------|-----|
| 線上 Demo（Devnet） | `https://surveysui.demo` *(部署後更新)* |
| 本機前端 | `http://localhost:5173` |
| 本機 BFF API | `http://localhost:3000` |

---

## 系統架構

```
┌─ Frontend (Vite + React + @mysten/dapp-kit + Gas Station) ─┐
│  /create        建立問卷 + Markdown editor                │
│  /fund/:id      注資 PTB（invest SUI → mint → vault）     │
│  /s/:id         受訪者連錢包 → 填答（Sponsored TX）       │
│  /redeem        stakedSurveySuiReward → SurveySuiReward   │
│  /dashboard     發起者儀表板 + 結束活動                   │
└────────────────────────────────────────────────────────────┘
        ↕ Sponsored sign                ↕ 唯讀查詢 (stats / OG)
┌─ Gas Station ────────────┐      ┌─ Backend BFF (stateless) ──┐
│  PTB Dry Run             │      │  /stats/:vault             │
│  代付 Gas（拒絕無效 TX） │      │  /og/:survey  (動態 meta)  │
└──────────────────────────┘      │  RPC 快取                  │
                                  │  ✗ 無 admin key            │
                                  │  ✗ 無 session              │
                                  │  ✗ 無業務資料              │
                                  └────────────────────────────┘
        ↕ @mysten/sui SDK                       ↕ Sui RPC / indexer
┌─ Sui Move Contracts (Devnet) ──────────────────────────────────┐
│  survey_sui_reward      Coin<SSR> + TreasuryCap（pool-only mint）│
│  staked_survey_reward   質押憑證物件（可向 pool burn 領 SSR）   │
│  survey_pass            通行證 NFT（不可轉、只驗證、不消耗）    │
│  survey_vault           問卷預算池（持已 mint 的 SSR）          │
│  amm_pool               單向 mint 池（SUI in → mint SSR）       │
│  survey_registry        on-chain 註冊 + 加密答案存儲            │
└────────────────────────────────────────────────────────────────┘
```

---

## 資金流

```
發起者 SUI 錢包
   │ (1) Flow A PTB (atomic)：
   │      a. amm_pool::invest_and_mint(SUI in)
   │         → 池中 SUI ↑，mint 增發 SurveySuiReward 至池
   │         → 手續費入 Treasury（admin 可賣或燒）
   │      b. survey_vault::create(reward_per_response, max, conditions)
   │         → 從池中提撥 SSR 至 vault
   │      c. survey_registry::register(vault_id, encrypted_content)
   │
   ▼
SurveyVault<SurveySuiReward> (shared object, 由合約驗證後派發)
   │ (2) Flow B：受訪者送出問卷
   │     a. Gas Station Dry Run（合約檢查 SurveyPass + 名額 + 未填答）
   │     b. 通過 → Gas Station 簽 + 廣播
   │     c. survey_vault::claim → mint stakedSurveySuiReward 給受訪者
   ▼
受訪者錢包 (stakedSurveySuiReward 物件)
   │ (3) Flow B 兌換：
   │     amm_pool::redeem(staked_receipt) → 銷毀憑證、轉出 SurveySuiReward
   ▼
受訪者 SurveySuiReward Coin
```

---

## 核心功能

- **SurveyPass 通行證機制**：一個地址持有一張 soulbound Pass NFT (不可轉移)，作為防女巫通行憑證，多個問卷可共用且不消耗該物件。
- **Sponsored Transactions 免 Gas 填答**：藉由 Shinami Gas Station 實現零門檻填答，乾跑（Dry Run）防惡意 Gas 消耗。
- **Atomic PTB 注資**：發起者一筆交易完成 SUI 投資兌換、金庫建立與問卷註冊，失敗自動 rollback。
- **單向 Mint Pool 經濟體系**：SUI 投資注入池子帶動 `SurveySuiReward` 升值，保障代幣價值，池中 SUI 僅 admin 可領。

---

## 5 分鐘 Demo

請見 [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)

---

## 開發文件

- [Tasks.md](docs/Tasks.md) — 任務進度（TDD，2026-05-17 架構 pivot 後新版 M0–M6）
- [MVP_TDD.md](docs/MVP_TDD.md) — 完整需求與架構設計（Sponsored TX + SurveyPass + 質押憑證 + 單向 mint 池）
- [SETUP.md](docs/SETUP.md) — 開發環境設定
- [Overflow Tracks/DeFi & Payments.md](docs/Overflow%20Tracks/DeFi%20%26%20Payments.md) — 賽道要求

---

## 技術堆疊

| 層 | 技術 |
|----|------|
| 前端 | Vite 6, React 19, @mysten/dapp-kit, Tailwind CSS, Recharts |
| BFF | Node.js, Fastify 5, lru-cache |
| 合約 | Sui Move (edition 2024.beta), Devnet |
| 測試 | Vitest, Playwright, `sui move test` |
| CI | GitHub Actions（move-test / bff-test / frontend-test） |
