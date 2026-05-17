# V0 封存

這裡是 SurveySui 在 **2026-05-17 架構 pivot 之前**的舊版規劃與測試資產。

## 為什麼封存

2026-05-17 [專案目標.md](../../專案目標.md) 大幅改寫，從「zkLogin + 後端代簽 + RWD 直接發放」改為：

- **Sponsored Transactions**（Gas Station 代付 + Dry Run 防惡意消耗，受訪者 0 餘額也能填）
- **SurveyPass**（純驗證、不消耗、取代 ParticipantSBT）
- **質押憑證模型**（受訪者領到 `stakedSurveySuiReward`，再向池子兌換 `SurveySuiReward`）
- **AMM 質押池**（單向 mint pool，bonding-curve 式定價，admin-only 提領 SUI）
- **結果加密上鏈**（取代「只上 hash」）

舊版設計的大量決策（reward dispatcher、後端 zkLogin verifier、`page.route()` mock 全 backend 的 e2e 等）已不再對齊新架構。

## 內容

| 檔案 | 原位置 | 角色 |
|---|---|---|
| [Tasks.md](Tasks.md) | 根目錄 `Tasks.md` | 舊 M0–M5 任務進度（含 2026-05-17 audit 出的 9 大整合 drift） |
| [MVP_TDD.md](MVP_TDD.md) | 根目錄 `MVP_TDD.md` | 舊版架構決策與 TDD 策略 |
| [frontend-e2e-lifecycle.spec.ts](frontend-e2e-lifecycle.spec.ts) | `frontend/e2e/lifecycle.spec.ts` | 依附舊架構（zkLogin + RWD 直接發 + swap UI 舊版）的 Playwright e2e |

## 新版在哪

- 任務追蹤：[根目錄 Tasks.md](../../Tasks.md)
- 架構決策：[根目錄 MVP_TDD.md](../../MVP_TDD.md)
- 願景與 Flow：[根目錄 專案目標.md](../../專案目標.md)

> 本目錄不再隨主線維護。保留純粹為歷史脈絡與技術決策考古，方便未來回顧「為什麼 pivot」。
