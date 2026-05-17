# SurveySui

> **Sui Overflow 2026 — DeFi & Payments 賽道**
>
> 鏈上問卷獎勵平台：發起者用 SUI 注資 → 受訪者填答領 RWD 代幣 → 一鍵 swap 回 SUI，全程透明、防女巫、自動發獎。

---

## 快速開始（Quickstart）

### 前置需求

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 24 |
| pnpm | ≥ 9 |
| Sui CLI | ≥ 1.72 |
| PostgreSQL | ≥ 16（本機可用 scoop 裝 18.x） |

### 1. 安裝依賴

```bash
pnpm install
```

### 2. 設定環境變數

```bash
cp .env.example .env
# 填入 SUI_ADMIN_PRIVATE_KEY、GOOGLE_OAUTH_CLIENT_ID 等必要值
```

> 詳細說明見 [SETUP.md](SETUP.md)

### 3. 初始化資料庫

```bash
cd backend
pnpm db:migrate
```

### 4. 啟動開發伺服器

```bash
# 根目錄，同時起 backend (port 3000) + frontend (port 5173)
pnpm dev
```

### 5. 跑測試

```bash
# 所有測試
pnpm test

# Move 合約測試
pnpm move:test

# E2E（Playwright）
cd frontend && pnpm exec playwright test
```

---

## 合約地址（Sui Testnet）

> 以下 ID 在執行 `pnpm deploy:testnet` 後自動寫入 `.env.shared`

| 物件 | Object ID |
|------|-----------|
| Package | `<PACKAGE_ID>` |
| RWD TreasuryCap | `<RWD_TREASURY_CAP_ID>` |
| AMM Pool (RWD/SUI) | `<AMM_POOL_ID>` |
| SBT Registry | `<SBT_REGISTRY_ID>` |

> 部署方式：`pnpm deploy:testnet`（執行 `scripts/src/init.ts`）

---

## Demo URL

| 環境 | URL |
|------|-----|
| 線上 Demo（Testnet） | `https://surveysui.demo` *(部署後更新)* |
| 本機前端 | `http://localhost:5173` |
| 本機 Backend API | `http://localhost:3000` |

---

## 系統架構

```
┌─ Frontend (Vite + React + @mysten/dapp-kit) ─────────────┐
│  /create        發起者建立問卷 + 設定獎勵                  │
│  /fund/:id      連 Sui Wallet 注資（PTB atomic）           │
│  /dashboard     儀表板：回覆數、vault 餘額、結束活動         │
│  /s/:id         受訪者 zkLogin → 填答 → 顯示 TX hash       │
│  /swap          RWD ↔ SUI swap UI                        │
└──────────────────────────────────────────────────────────┘
                       ↕ REST API
┌─ Backend (Fastify + Prisma + PostgreSQL) ────────────────┐
│  zkLogin verifier   Google OAuth → sub → SBT 對映        │
│  Survey CRUD        Markdown + YAML metadata              │
│  Response store     資格檢查 + hash 計算                  │
│  Reward dispatcher  admin key 代簽 PTB → 發 RWD           │
│  Stats aggregator   儀表板 API                            │
└──────────────────────────────────────────────────────────┘
                       ↕ @mysten/sui SDK
┌─ Sui Move Contracts (Testnet) ───────────────────────────┐
│  reward_coin       Coin<RWD> + TreasuryCap               │
│  participant_sbt   一人一張護照（防女巫）                   │
│  survey_vault      鎖定 RWD + 發獎邏輯                    │
│  amm_pool          CPMM: RWD/SUI swap                    │
│  survey_registry   問卷註冊 + 事件                        │
└──────────────────────────────────────────────────────────┘
```

---

## 資金流

```
發起者 SUI 錢包
   │ (1) 自己簽 PTB：swap SUI→RWD + 建 SurveyVault
   ▼
SurveyVault<RWD>
   │ (2) 受訪者送出問卷後，後端代簽 PTB：vault.claim → 發 RWD
   ▼
受訪者 zkLogin 地址
   │ (3) 受訪者選擇換 SUI：自己簽 PTB swap RWD→SUI on amm_pool
   ▼
受訪者 SUI
```

---

## 核心功能

- **ParticipantSBT 護照機制**：每個 Google 帳號對應一張不可轉移的 SBT，有效期 180 天，到期自動補發，防止女巫攻擊
- **zkLogin 無縫登入**：受訪者用 Google 帳號登入，無需安裝錢包、無需付 gas（後端代簽）
- **Atomic PTB 注資**：發起者一筆交易完成 swap + 建 vault + 共享 object，失敗自動 rollback
- **CPMM AMM**：自建恆積做市商，0.3% 手續費，RWD/SUI 雙向 swap

---

## 5 分鐘 Demo

請見 [DEMO_SCRIPT.md](DEMO_SCRIPT.md)

---

## 開發文件

- [Tasks.md](Tasks.md) — 任務進度（TDD，2026-05-17 架構 pivot 後新版 M0–M6）
- [MVP_TDD.md](MVP_TDD.md) — 完整需求與架構設計（Sponsored TX + SurveyPass + 質押憑證 + 單向 mint 池）
- [History/V0/](History/V0/) — pivot 前舊版規劃封存
- [SETUP.md](SETUP.md) — 開發環境設定
- [Overflow Tracks/DeFi & Payments.md](Overflow%20Tracks/DeFi%20%26%20Payments.md) — 賽道要求

---

## 技術堆疊

| 層 | 技術 |
|----|------|
| 前端 | Vite 6, React 19, @mysten/dapp-kit, Tailwind CSS, Recharts |
| 後端 | Node.js, Fastify 5, Prisma 6, PostgreSQL ≥ 16 |
| 合約 | Sui Move (edition 2024.beta), Testnet |
| 測試 | Vitest, Playwright, sui move test |
| CI | GitHub Actions（move-test / backend-test / frontend-test） |
