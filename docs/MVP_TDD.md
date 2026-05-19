# SurveySui MVP — 架構設計 & TDD 測試規劃

## Context

`SurveySui` 是 Sui Overflow 2026 黑客松專案，瞄準 [DeFi & Payments 賽道](Overflow%20Tracks/DeFi%20%26%20Payments.md)。

本檔的角色：在「**做什麼**」（[專案目標.md](專案目標.md)）與「**做到哪**」（[Tasks.md](Tasks.md)）之間，記錄**為什麼這樣設計**——設計決策、三層架構、TDD 策略。

> 本檔為 2026-05-17 架構 pivot 後新版。舊版（zkLogin 後端代簽 + RWD 直接發 + ParticipantSBT）封存於 [History/V0/MVP_TDD.md](History/V0/MVP_TDD.md)。

最終 MVP 要證明的（出自 [專案目標.md §MVP 要證明什麼](專案目標.md)）：

1. **零門檻產品層**：受訪者**錢包餘額為 0** 也能透過 Sponsored Transactions（Gas Station 代付）完成填答並領獎；合約 Dry Run 機制防止惡意 Gas 消耗。
2. **去中心化與防女巫**：資格驗證**全交給合約**；MVP 用 `SurveyPass` 物件當通行證，合約**只驗證不消耗**。
3. **代幣經濟層**：受訪者領到的是 `stakedSurveySuiReward` 質押憑證，再向 AMM 池兌換 `SurveySuiReward`；發起者投 SUI → 池 mint 增發 → 池中 SUI 帶動代幣升值；池中 SUI 僅 admin 可領、手續費可賣或燒。
4. **Markdown 問卷格式**：YAML frontmatter + Markdown 內容，前端 parse 後上鏈，把精力放在「資金流 + 獎勵流絲滑無縫」。

> **進度追蹤請見 [Tasks.md](Tasks.md)**。本文件保留設計決策與架構參照。

---

## 目標 → 架構映射

下表把 [專案目標.md](專案目標.md) §2-4 的三段 Flow 與驗收軸，對應到本檔的架構模組與 [Tasks.md](Tasks.md) 的里程碑。讀架構章節時可回頭對照這張表。

| [專案目標.md](專案目標.md) 章節    | 服務的 Flow | 落在哪個架構模組                                                                                                                           | 對應 [Tasks.md](Tasks.md) 里程碑           |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| §2 Flow A：發起者建「問卷＋獎勵」  | A           | Frontend `/create`、`/fund/:id`；Move `amm_pool::invest_and_mint`、`survey_vault::create`、`survey_registry::register`                     | M1（合約）、M4（前端）、M6（E2E）          |
| §3 Flow B：受訪者填答 & 拿質押憑證 | B           | Frontend `/s/:id`、`/redeem`；Gas Station（Sponsored TX）；Move `survey_pass::verify`、`survey_vault::claim`、`staked_survey_reward::mint` | M1、M2（Sponsored TX）、M3（加密答案）、M4 |
| §4 Flow C：活動結束 & 收尾         | C           | Frontend `/dashboard`；BFF stats 聚合；Move `survey_vault::close`、`amm_pool::admin_withdraw_sui`                                          | M1、M4、M5（BFF）、M6                      |
| §MVP 要證明什麼 #1 零門檻          | B           | Gas Station + Dry Run 整條路徑                                                                                                             | M2                                         |
| §MVP 要證明什麼 #2 防女巫          | B           | `survey_pass` + 合約純鏈上驗證                                                                                                             | M1                                         |
| §MVP 要證明什麼 #3 代幣經濟        | A+B+C       | `amm_pool` + `staked_survey_reward` + `survey_sui_reward` 全鏈路                                                                           | M1 + M6                                    |
| §MVP 要證明什麼 #4 Markdown 問卷   | A           | Frontend Markdown editor + YAML parse                                                                                                      | M4                                         |

---

## 已對齊的設計決策

| 議題         | 決策                                                                                                                                            | 理由                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 網路         | **Devnet only**（合約參數化以便未來上 mainnet）                                                                                                 | 2026-05-17 pivot：MVP 部署目標為 Devnet；跨網路橋接成本太高                                                            |
| 受訪者 UX    | **Sponsored Transactions（Gas Station 代付）** + 合約 Dry Run 防惡意消耗                                                                        | [專案目標.md §MVP 要證明什麼 #1](專案目標.md)；受訪者 0 餘額也能填                                                     |
| 女巫防護     | **`SurveyPass` 物件 + 純驗證不消耗**                                                                                                            | [專案目標.md §MVP 要證明什麼 #2](專案目標.md)；同一通行證可用於多份問卷，合約只檢查持有與資格、不銷毀物件              |
| 獎勵代幣     | **`SurveySuiReward`（fungible coin）+ `stakedSurveySuiReward`（質押憑證物件）**                                                                 | [專案目標.md §MVP 要證明什麼 #3](專案目標.md)；憑證模型把「填答」與「兌換」解耦，方便未來做空投/批次發放               |
| AMM 池機制   | **單向 mint pool**：發起者投 SUI → 池依價 mint 增發 `SurveySuiReward` → 池中 SUI 累積；admin-only 提領 SUI；手續費入 admin treasury（可賣或燒） | [專案目標.md §MVP 要證明什麼 #3](專案目標.md)；bonding-curve 式 — 池子越大代幣越貴；不對稱設計避開 CPMM 套利風險       |
| 問卷結果上鏈 | **加密上鏈**（鏈下解密讀取，[專案目標.md §4 step 4](專案目標.md)）                                                                              | 取代舊版「只上 hash」；加密方案 M3 開工前確認（Seal vs 對稱加密 + 鏈下分發）                                           |
| 問卷格式     | **Markdown + YAML frontmatter** → 前端 parse → 加密後上鏈                                                                                       | [專案目標.md §MVP 要證明什麼 #4](專案目標.md)                                                                          |
| 後端角色     | **無狀態 BFF**：合約是真理來源；BFF 只做統計聚合 / OG meta / RPC 快取；**不持 admin key、不簽交易、不存業務資料**                               | [專案目標.md §MVP 要證明什麼 #2](專案目標.md) 要求「去除中心化後端依賴」；BFF 掛掉只影響顯示速度，不影響資產與資格驗證 |
| 登入         | 連 Sui Wallet（含 zkLogin 錢包）；MVP 不自建 zkLogin verifier，沿用錢包 SDK 內建支援                                                            | 配合「移除中心化後端依賴」原則                                                                                         |

---

## 系統架構

### 三層（每行括號標出服務的 Flow）

```
┌─ Frontend (Vite + React + @mysten/dapp-kit + Gas Station SDK) ─┐
│  /create        建立問卷 + Markdown editor                [A] │
│  /fund/:id      注資 PTB（invest SUI → mint → vault）     [A] │
│  /s/:id         受訪者連錢包 → 填答（Sponsored TX）       [B] │
│  /redeem        stakedSurveySuiReward → SurveySuiReward   [B] │
│  /dashboard     發起者儀表板 + 結束活動                   [C] │
└────────────────────────────────────────────────────────────────┘
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

### 金流運作的大原則

發起人把 sSSR (stackedSurveySuiReward) 存入每個問卷專屬的 SurveyVault，受訪者從 SurveyVault 領獎勵 sSSR。如果發起人沒有足夠的 sSSR，也可以使用等價的 SUI，合約把 SUI 和新的 SSR 留在 pool，然後把新的 sSSR 跟發起人本來有的 sSSR 一起存進每個問卷專屬的 SurveyVault。

### 資金流（核心）

```
發起者 SUI 錢包
   │ (1) Flow A PTB (atomic)：
   │      a. amm_pool::invest_and_mint(SUI in)
   │         → 池中 SUI ↑，mint 增發 SurveySuiReward 至池
   │         → 手續費入 Treasury（admin 可賣或燒）
   │      b. survey_vault::create(reward_per_response, max, conditions)
   │         → 從池中提撥 SSR 至 vault
   │      c. survey_registry::register(vault_id, encrypted_content)
   ▼
SurveyVault<SurveySuiReward>  (shared object, 由合約驗證後派發)
   │ (2) Flow B：受訪者送出問卷
   │     a. Gas Station Dry Run（合約檢查 SurveyPass + 名額 + 未填答）
   │     b. 通過 → Gas Station 簽 + 廣播
   │     c. survey_vault::claim → mint stakedSurveySuiReward 給受訪者
   ▼
受訪者錢包  (stakedSurveySuiReward 物件)
   │ (3) Flow B 兌換：
   │     amm_pool::redeem(staked_receipt) → 銷毀憑證、轉出 SurveySuiReward
   │     （MVP 範圍內僅做憑證→SSR 兌換；SSR→SUI 不在金流主軸）
   ▼
受訪者 SurveySuiReward Coin

[Flow C 收尾]
   發起者 → survey_vault::close → 退還未派發 SSR
   admin  → amm_pool::admin_withdraw_sui（僅 admin）
```


### Sponsored Transaction 路徑（Flow B 核心）

```
1. 前端構建 PTB：survey_vault::claim(vault, pass, encrypted_answers)
2. 前端送 PTB → Gas Station
3. Gas Station Dry Run（合約原生驗證）：
   - 通過：Gas Station 用 sponsor key 簽 + 廣播 → 受訪者收到憑證
   - 失敗（無效 pass / 重複填答 / 名額滿）：拒絕簽名 → 受訪者不付 Gas，專案方也不付（節省 Gas）
4. 受訪者拿到 stakedSurveySuiReward
```

> **關鍵點**：所有資格驗證**寫在合約裡**，Gas Station 不需要客製邏輯，純粹依賴 Dry Run 結果決定要不要代付。BFF 完全不參與此路徑。

---

## Move 模組規格

| 模組                   | 職責                                                                                      | 關鍵函式                                            |
| ---------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `survey_sui_reward`    | `Coin<SurveySuiReward>` 定義；TreasuryCap 僅 `amm_pool` 可呼叫 mint                       | `init_treasury` / `mint_for_pool`                   |
| `staked_survey_reward` | 質押憑證物件（含 amount、issued_at、source vault id）；可被 pool 銷毀換 `SurveySuiReward` | `mint` / `burn_for_redeem`                          |
| `survey_pass`          | 通行證 NFT（不可轉移：no `store`）；admin issue/revoke；合約純驗證 `is_valid`             | `issue` / `revoke` / `is_valid`                     |
| `survey_vault`         | 問卷預算 + 領取狀態；`claim` 驗證 `survey_pass` + 未填答 + 名額                           | `create` / `claim` / `close`                        |
| `amm_pool`             | 單向 mint 池：SUI in → mint SSR；admin-only `withdraw_sui`；redeem 質押憑證               | `invest_and_mint` / `redeem` / `admin_withdraw_sui` |
| `survey_registry`      | 註冊問卷 metadata + 加密內容 hash；活動結束事件                                           | `register` / `mark_closed`                          |

---

## TDD 策略

| 層級              | 工具                                                       | 跑在哪          |
| ----------------- | ---------------------------------------------------------- | --------------- |
| Move 單元         | `sui move test`                                            | CI + 本機       |
| Move 整合         | `sui move test (test_scenario)` 全 Flow A→B→C atomic       | CI + 本機       |
| Sponsored TX 整合 | Vitest + Gas Station Devnet sandbox（dry-run reject 路徑） | 手動 / nightly  |
| 加密答案          | Vitest 對稱加密 round-trip；鏈下解密一致性                 | CI              |
| Frontend unit     | Vitest + React Testing Library                             | CI              |
| BFF unit          | Vitest（無 admin key 啟動檢查、stats 聚合純函式）          | CI              |
| E2E（真合約）     | Playwright + Devnet + 真 Gas Station                       | 手動 / pre-demo |

**TDD 原則**：每個 task 先在 PR 提交「失敗的測試」，再提交「實作 + 測試通過」。

### 必驗的不變式（Invariants）

- **AMM bonding-curve**：每次 `invest_and_mint` 後，池中 SUI 與已 mint SSR 比值符合預期曲線；無法逆轉提領 SUI（除 admin）
- **SurveyPass 不消耗**：同一 pass 完成多份問卷後，`exists(pass.id)` 仍為 true
- **防重複填答**：相同 (vault, sub_hash) 第二次 claim 必失敗
- **Gas Station 防破產**：無效 PTB 在 dry-run 階段被拒，sponsor key 不簽名
- **BFF 無權限**：BFF 啟動時不需要也不接受 admin key；任何寫操作都會被合約拒絕

---

## 驗證方式（Definition of Done）

執行下列序列，能在 5 分鐘內完成完整 demo：

1. `pnpm -r build && pnpm -r test`（所有單元測試綠）
2. `pnpm move test`（合約測試綠，含 Flow A→B→C 整合）
3. `pnpm deploy:Devnet`（合約 deploy + AMM 種子流動性）
4. `pnpm dev`（BFF + frontend 起服）
5. 開瀏覽器：
   - **發起者**：建立「Sui Overflow 滿意度調查」、Markdown 寫題、設 1 SSR/份 × 10 份、注資（一筆 PTB invest→mint→create vault→register）
   - **受訪者**（無痕視窗，**錢包餘額為 0**）：連錢包 → 取得 SurveyPass（代付 Gas） → 填問卷 → Sponsored TX 上鏈 → 看到「+1 stakedSurveySuiReward」憑證
   - **受訪者**：到 `/redeem` 銷毀憑證 → 拿到 SurveySuiReward
   - **發起者**：dashboard 看到 1 份回覆、vault 餘額 9 SSR
6. `pnpm e2e`（Playwright 跑真合約，全綠）

對齊 [專案目標.md](專案目標.md)：
- §MVP 要證明什麼 #1：受訪者錢包 0 SUI 也完成填答 → ✅
- §MVP 要證明什麼 #2：合約純鏈上驗證 SurveyPass、無中心化後端 → ✅
- §MVP 要證明什麼 #3：質押憑證 → 兌換 SSR 全鏈路 → ✅
- §MVP 要證明什麼 #4：Markdown 問卷成功註冊上鏈 → ✅

---

## 推薦的開源參考

- AMM 單向 mint 池：可參考 bonding-curve 範本（如 friend.tech 模型）
- Sponsored Transaction：[Mysten Labs Enoki](https://docs.enoki.mystenlabs.com/) / [Shinami Gas Station](https://docs.shinami.com/)
- @mysten/dapp-kit：[Sui dApp Kit docs](https://sdk.mystenlabs.com/dapp-kit)
- 結果加密：[Mysten Labs Seal](https://github.com/MystenLabs/seal)（M3 評估）
