# SurveySui 任務進度清單

> 上游：[專案目標.md](專案目標.md)（願景／Flow A/B/C）→ [MVP_TDD.md](MVP_TDD.md)（架構與設計決策）→ 本檔（任務執行）
> 狀態圖例：`[ ]` 未開始 / `[~]` 進行中 / `[x]` 完成 / `[-]` 延後或排除
> TDD 原則：每個 task 先提交「失敗的測試」，再提交「實作 + 測試通過」
> 標籤：`[A]` Flow A 發起者建立 ／ `[B]` Flow B 受訪者填答 ／ `[C]` Flow C 收尾 ／ `[基建]` 不直接屬於任一 Flow

> 本檔為 2026-05-17 架構 pivot 後新版。舊版（M0–M5 + T5.1–T5.9 contract drift）封存於 [History/V0/Tasks.md](History/V0/Tasks.md)。

---

## 進度總覽

| 里程碑                         | 完成 / 總數 | 對應目標             | 備註                                                       |
| ------------------------------ | ----------- | -------------------- | ---------------------------------------------------------- |
| M0 基礎建設                    | 4 / 4       | [基建]               | T0.1–T0.4 ✅ 基礎建設全部完成，Devnet 部署成功              |
| M1 核心 Move 合約              | 7 / 7       | [A][B][C] 代幣經濟層 | T1.1–T1.7 ✅ 核心合約全部就位，並在 Devnet 完成真實部署驗收 |
| M2 Sponsored Transactions 整合 | 4 / 4       | [B] 零門檻層         | T2.1–T2.4 ✅ Gas Station + Dry Run + 首登發 Pass 全部完成   |
| M3 加密問卷答案                | 3 / 3       | [A][C] 隱私層        | 加密方案 + 鏈下解密 ✅                                      |
| M4 Frontend（重寫）            | 6 / 6       | [A][B][C] 產品層     | T4.1–T4.6 ✅ /create /fund /s /redeem /dashboard 全綠       |
| M5 無狀態 BFF                  | 3 / 3       | [C] 顯示加速         | stats / OG / RPC 快取 ✅                                    |
| M6 E2E + Demo                  | 1 / 3       | 跨 Flow 整合         | 真合約 + Sponsored TX 全鏈路；T6.1 ✅                       |
| **合計**                       | **25 / 30** | —                    | 全新里程碑（舊 M 編號已廢）                                |

下一步：**M6 T6.2 + T6.3**（T6.1 happy-path 已在 Devnet 上跑通 ✅）

### 兩個驗收軸（對齊 [專案目標.md §MVP 要證明什麼](專案目標.md)）

| 驗收軸                  | 跨哪些 task                                                   | 驗收方式                                                                                     |
| ----------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **零門檻產品層**（§#1） | M1（survey_pass + vault.claim）+ M2 全部 + M4.B + M6          | 受訪者錢包 SUI 餘額為 0，仍能透過 Sponsored TX 完成填答並收到 stakedSurveySuiReward          |
| **代幣經濟層**（§#3）   | M1（amm_pool + staked_survey_reward + survey_sui_reward）+ M6 | 一筆 PTB atomic 注資；受訪者領到質押憑證；憑證可換 `SurveySuiReward`；池中 SUI 僅 admin 提領 |

---

## M0 基礎建設 ｜ [基建]

> 目的：建立可重複部署的工作環境，後續所有 task 依賴此基底。

### [x] T0.1 — Monorepo skeleton
- pnpm workspaces：`/contracts` `/frontend` `/bff` `/scripts`
- 統一 TypeScript / ESLint / Prettier config
- 根 `package.json` 提供 `pnpm dev` / `pnpm build` / `pnpm test`
- TDD
  - [x] `pnpm -r build` 全綠
  - [x] `pnpm -r typecheck` 全綠

### [x] T0.2 — Devnet faucet + env-sync
- `scripts/faucet.ts`：要 Devnet SUI
- `scripts/init.ts`（原 `deploy.ts`）：發布 package 後寫回 object id 至 `.env`
- TDD
  - [x] 部署後 `.env` 內 `AMM_POOL_ID`、`SSR_TREASURY_ID`、`SURVEY_REGISTRY_ID` 非空 ✅ (Devnet 部署成功且同步)

### [x] T0.3 — CI（GitHub Actions）
- `move-test` / `bff-test` / `frontend-test` 三 job
- 主分支 PR 必須全綠才能 merge
- TDD
  - [x] CI 配置完成，包含完整的 Sui + Node + PostgreSQL 測試工作流 ✅

### [x] T0.4 — 文件骨架
- [README.md](README.md) ：對外 quickstart + demo 連結
- [SETUP.md](SETUP.md) ：Win 原生 / WSL / macOS 開發環境
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) ：5 分鐘 demo 腳本（M6 完成時補完）
- TDD
  - [x] README + SETUP 完成，指導新人和開發者 30 分鐘內跑起 `pnpm dev` ✅

---

## M1 核心 Move 合約 ｜ [A][B][C] 代幣經濟層

> 目的：[MVP_TDD.md §Move 模組規格](MVP_TDD.md) 六個模組全部上鏈、整合測試綠。
> 對應 [專案目標.md §1 角色與錢的流向](專案目標.md)。

### [x] T1.1 — `survey_sui_reward`（獎勵代幣）｜ [基建]
- `Coin<SURVEY_SUI_REWARD>` 定義；9 decimals；OTW `SURVEY_SUI_REWARD`
- `TreasuryCap` 封裝在共享 `SsrTreasury`；`mint` 為 `public(package)` — 外部 package 無法呼叫
- 開放任意持有者 `burn`
- TDD ✅
  - [x] `test_only_pool_can_mint`
  - [x] `test_burn_reduces_supply`

### [x] T1.2 — `survey_pass`（通行證 NFT）｜ [B]
- 物件**無 `store` ability**（soulbound，不可轉移）；以 `PassRegistry` 管理 serial
- admin `issue` / `revoke` / `reissue`；`is_valid(pass, clock): bool` 純驗證
- 對應 [專案目標.md §3 step 2-3](專案目標.md) 與 §MVP 要證明什麼 #2
- TDD ✅（9 tests）

### [x] T1.3 — `stacked_survey_reward`（sSSR 可替換代幣）｜ [B]
- **sSSR = stacked SurveySuiReward**；是 `Coin<STACKED_SURVEY_REWARD>` 型別（非含 vault_id 的 Object）
- `TreasuryCap` 封裝在共享 `SssrTreasury`；`mint`/`burn` 皆為 `public(package)`
- TDD ✅
  - [x] `test_only_pool_can_mint_sssr`
  - [x] `test_burn_reduces_sssr_supply`

### [x] T1.4 — `survey_vault`（問卷預算池）｜ [A][B][C]
- 持有 `Balance<STACKED_SURVEY_REWARD>`（固定幣種，無泛型）
- `create / fund` 時扣 0.3% 手續費送 `admin_treasury`（**費用在 sSSR 進 vault 時收取**）
- `claim(vault, pass, sub_hash, encrypted_answers, clock, ctx)` 受訪者直接呼叫，驗 SurveyPass
- `close(vault)` creator 退還剩餘 sSSR
- TDD ✅（7 tests）

### [x] T1.5 — `amm_pool`（bonding-curve 池）｜ [A][B]
- `init_pool(admin, ctx)` — 空池啟動，不需初始流動性
- `invest_and_mint(pool, ssr_t, sssr_t, sui_in, ctx) → Coin<STACKED_SURVEY_REWARD>`
  - **此步驟不扣費**；費用在 vault 端收取
  - 公式：`sssr = sui_mist × DECAY / (DECAY + total_invested)`（DECAY = 1 000 SUI）
  - SUI 留在 pool；鑄 SSR 1:1 作 sSSR 背書；全部 sSSR 回傳 creator
- `redeem(pool, sssr_t, sssr_in, ctx) → Coin<SURVEY_SUI_REWARD>`：燒 sSSR，扣 0.3% 費給 admin
- `admin_withdraw_sui(pool, amount, ctx)` admin only
- TDD ✅（5 tests）

### [x] T1.6 — `survey_registry`（註冊 + 加密內容）｜ [A][C]
- `register(vault_id, encrypted_content, clock, ctx)` 發 `SurveyRegistered` 事件（`encrypted_content` 為完整 blob，非 hash）
- `archive(registry, survey_id, ctx)` 只有 creator 可呼叫
- TDD ✅（2 tests）

### [x] T1.7 — 多模組整合 + 部署 ｜ [A][B][C]
- `test_scenario`：完整 Flow A→B→C ✅（`test_full_lifecycle_a_to_c` 已通過，29/29 綠）
- `scripts/init.ts` 對齊新部署順序（已更新）
- TDD
  - [x] `test_full_lifecycle_a_to_c`
  - [x] Devnet 真實部署成功 + `.env` 寫回 ✅ (順利部署至 Devnet 且 pool 驗證通過)

---

## M2 Sponsored Transactions 整合 ｜ [B] 零門檻層

> 目的：[專案目標.md §MVP 要證明什麼 #1](專案目標.md)；受訪者錢包 0 SUI 也能填問卷。

### [x] T2.1 — Gas Station 選型 + 沙箱串接 ｜ [B]
- 比較 [Mysten Enoki](https://docs.enoki.mystenlabs.com/) vs [Shinami](https://docs.shinami.com/)：價格、SDK、Dry Run API、Devnet 支援
- 選定後寫 [docs/gas-station.md](docs/gas-station.md)（決策記錄）
- TDD
  - [x] 用 Gas Station SDK 在 Devnet 發一筆無 op PTB，受訪者錢包 SUI 0 → 成功

### [x] T2.2 — PTB 建構工具（前端 lib）｜ [B]
- `frontend/src/lib/sponsoredTx.ts`：包裝 build PTB → Dry Run → 送 Gas Station → 廣播
- 錯誤分類：dry-run reject / sponsor reject / network error
- TDD
  - [x] `test_build_claim_ptb_includes_all_args`
  - [x] `test_dry_run_reject_does_not_call_sponsor`

### [x] T2.3 — 防惡意消耗驗證（合約 + Gas Station 聯動）｜ [B]
- 對應 [專案目標.md §3 step 4](專案目標.md)「防惡意消耗機制」
- 三組 sad-path 都要在 Dry Run 階段被拒：
  - 無效 SurveyPass
  - 重複 sub_hash
  - vault 名額已滿
- TDD
  - [x] `test_invalid_pass_rejected_in_dry_run`（sponsor 不簽，受訪者也不付 Gas）
  - [x] `test_duplicate_claim_rejected_in_dry_run`

### [x] T2.4 — SurveyPass 首次發放（亦走 Sponsored）｜ [B]
- 對應 [專案目標.md §3 step 2](專案目標.md)
- 受訪者首次連錢包 → 前端發 sponsored PTB → 合約 issue pass（驗證 Email/DID — MVP 用簡化驗證）
- TDD
  - [x] `test_first_login_issues_pass_via_sponsored_tx`

---

## M3 加密問卷答案 ｜ [A][C] 隱私層

> 目的：[專案目標.md §2 step 4](專案目標.md)「結果如何交付」 + §4 step 4「鏈上解密讀取或匯出報告」。

### [x] T3.1 — 加密方案選型
- 比較 [Mysten Seal](https://github.com/MystenLabs/seal) vs 對稱加密（AES-GCM + creator 持金鑰 + 鏈下分發）
- 寫 [docs/encryption.md](docs/encryption.md)
- TDD
  - [x] 比較表完成 + 用戶簽核 ✅ (MVP 採 AES-GCM + 錢包衍生金鑰；v2 遷 Seal)

### [x] T3.2 — Creator-side 加密 + 上鏈
- 前端用 creator 公鑰加密問卷內容 → `survey_registry::register(encrypted_blob)`
- 答案以 creator 可解密的方式上鏈（`survey_vault::claim(..., encrypted_answers)`）
- 實作：`frontend/src/lib/crypto.ts`
  - `encryptSurveyContent(markdown, creatorPubKey)` → `{encryptedBlob, contentKey}`；blob 格式：`[32B pubkey | 12B iv | ciphertext]`
  - `decryptSurveyContent(blob, contentKey)` → `{markdown, creatorPublicKeyBytes}`
  - `deriveCreatorKeyPair(walletSigBytes)` → 以 SHA-256(signature) 為 seed 衍生 X25519 keypair（deterministic）
  - `encryptAnswers(answers, creatorPubKeyBytes)` → ECIES：`[32B ephemeral_pubkey | 12B iv | ciphertext]`
  - `decryptAnswers(encryptedAnswers, creatorPrivKey)` → 字串
- TDD ✅（7 tests）
  - [x] `test_encrypted_blob_round_trip`（內容 + 答案 round trip + 確定性 keypair 三項）
  - [x] `test_third_party_cannot_decrypt`（錯金鑰 / 錯 keypair / 篡改 4 項）

### [x] T3.3 — Creator-side 解密 + 統計報告
- Dashboard 撈 events → 用 creator 私鑰解密 → 統計
- 對應 [專案目標.md §4 step 4](專案目標.md)
- 實作：`frontend/src/lib/dashboardDecrypt.ts`
  - `fetchClaimedEvents(suiClient, vaultId, packageId)` → 分頁拉 SurveyClaimed events + 依 vault_id 過濾
  - `decryptAllResponses(events, creatorPrivateKey)` → 批次解密，失敗計入 `failed`
  - `aggregateStats(responses, totalEvents)` → 逐題計頻率，回傳 `DashboardStats`
- TDD ✅（9 tests）
  - [x] `test_dashboard_decrypts_all_responses`
  - [x] `test_stats_match_decrypted_count`

---

## M4 Frontend（重寫）｜ [A][B][C] 產品層

> 目的：[專案目標.md §MVP 要證明什麼 #4](專案目標.md) — Markdown 問卷 + 絲滑資金流。
> 對應 [專案目標.md §2 §3 §4](專案目標.md) Flow A/B/C。

### [x] T4.1 — Router + dApp Kit 基底 ｜ [基建]
- 6 路由：`/`（landing）/ `/create` / `/fund/:id` / `/s/:id` / `/redeem` / `/dashboard/:vaultId`
- `<SuiClientProvider>` + `<WalletProvider>` Devnet
- 既存舊路由 `/login` `/login/callback` `/swap` 從 routing table 移除（舊 page 檔暫留，後續 T4.x 重寫）
- TDD ✅（7 tests，`src/__tests__/router.test.tsx`）
  - [x] 各路由 navigate 後渲染對應頁面 component（含 fallback `*` → LandingPage）

### [x] T4.2 — `/create` 建立問卷頁 ｜ [A]
- Markdown editor（textarea 即可，MVP 不做 WYSIWYG，對應 [專案目標.md §2 step 2a](專案目標.md)）
- 預覽：解析 frontmatter 顯示獎勵設定（perResponse / maxResponses / deadline）
- 「下一步：注資」按鈕 → 產生 `draft-<uuid>` draftId、寫 `surveysui:draft:<draftId>` 至 localStorage、跳 `/fund/:draftId`
- 實作：`frontend/src/pages/CreatePage.tsx` + 既有 `lib/frontmatter.ts`；test-setup 補 localStorage polyfill（jsdom 29 預設無）
- TDD ✅（3 tests，`src/__tests__/CreatePage.test.tsx`）
  - [x] `test_parse_frontmatter` — 預覽區顯示解析後的 perResponse / maxResponses / deadline
  - [x] `test_invalid_yaml_shows_error` — 空內容 / 缺欄位 / 無 frontmatter 三種情境皆顯示錯誤且不導頁
  - [x] `test_submit_persists_draft_and_navigates_to_fund_with_draft_id` — 有效 frontmatter 時寫 localStorage 並跳 `/fund/:draftId`

### [x] T4.3 — `/fund/:id` 注資頁 ｜ [A]
- 顯示「預估 SUI 消耗 + 平台手續費」（依 bonding curve + 0.3% vault fee 估算）
- 一鍵 PTB：`invest_and_mint → survey_vault::create → survey_registry::register` 三步 atomic
  - PTB 實際 6 個 command：splitCoins / invest_and_mint / vault::create / vault::id_of / registry::register / vault::share_vault；「三步」指三個 surveysui 核心 MoveCall
  - 新增 `survey_vault::id_of(&SurveyVault): ID` helper，讓 PTB 把剛建立的 vault ID 餵給 `survey_registry::register`
- 從 PTB `objectChanges` 抽出 `vault_id` / `survey_id`（match `::survey_vault::SurveyVault` 與 `::survey_registry::Survey`）
- 成功後：寫 `surveysui:survey:<id>` 索引（vaultId + contentKey base64url）、刪除 draft、`navigate(/dashboard/<vaultId>#<contentKey>)`
- 失敗路徑：簽名/加密例外、PTB 建構錯誤、wallet reject 都顯示 `role="alert"`
- 實作：`frontend/src/lib/ptb.ts`（重寫；新增 `estimateFundCost` / `buildCreateSurveyPtb` / `extractVaultIdFromEffects` / `extractSurveyIdFromEffects`），`frontend/src/pages/FundPage.tsx`（重寫），`contracts/sources/survey_vault.move`（補 `id_of`）
- 對應 [專案目標.md §2 step 4](專案目標.md)
- TDD ✅（13 tests，`src/__tests__/FundPage.test.tsx`）
  - [x] `test_ptb_contains_three_commands` — PTB 含 invest_and_mint / vault::create / registry::register 三個 MoveCall
  - [x] `test_extract_vault_id_from_effects` — 從 objectChanges 找出 SurveyVault / Survey 並排除 mutated Pool

### [x] T4.4 — `/s/:id` 受訪者填答頁 ｜ [B]
- 拉鏈上 survey 資料 → 解密 markdown → 渲染問卷 ✅
- 連錢包 → 沒有 SurveyPass 自動發 sponsored 取 pass（呼 M2.T2.4） ✅
- 送出 → 呼叫 `sponsoredTx.ts`（M2.T2.2） ✅
- 成功顯示 TX digest + 「我的質押憑證」連結 ✅
- 對應 [專案目標.md §3 全部](專案目標.md)
- TDD ✅
  - [x] `test_render_questions_from_decrypted_md`
  - [x] `test_submit_uses_sponsored_path`

### [x] T4.5 — `/redeem` 兌換頁 ｜ [B]
- 列出受訪者持有的所有 `stakedSurveySuiReward` 物件
- 選擇 → 呼叫 `amm_pool::redeem`
- 對應 [專案目標.md §3 step 5](專案目標.md)
- TDD ✅（5 tests，`src/__tests__/RedeemPage.test.tsx`）
  - [x] `test_lists_user_receipts`
  - [x] `test_redeem_returns_ssr`

### [x] T4.6 — `/dashboard/:vaultId` ｜ [A][C]
- Recharts 統計：creator 簽 personal message 衍生私鑰 → `decryptAllResponses` + `aggregateStats` → 每題長條圖
- 鏈上即時 vault 餘額：`useSuiClientQuery('getObject')` 拉 `SurveyVault.balance` / `claimed_count` / `max_responses` / `creator` / `status`
- 結束活動按鈕：`buildClosePtb` → `signAndExecute(survey_vault::close)`；僅 creator + ACTIVE 時 enabled
- 實作：`frontend/src/pages/DashboardPage.tsx`（重寫；fetch events → 點解密按鈕才動 wallet）、`frontend/src/lib/ptb.ts` 新增 `buildClosePtb`、`frontend/src/__tests__/DashboardPage.test.tsx`（重寫）
- 對應 [專案目標.md §4 step 1-3](專案目標.md)
- TDD ✅（8 tests，`src/__tests__/DashboardPage.test.tsx`）
  - [x] `test_close_button_only_for_creator` — 4 子情境：creator+ACTIVE 可點 / 非 creator disabled / 未連錢包 disabled / CLOSED disabled；點擊觸發 `buildClosePtb` + `signAndExecute`
  - [x] `test_stats_render_with_zero_responses` — 0 回覆時顯示「尚無回覆」，不渲染 BarChart，vault 餘額仍正常顯示

---

## M5 無狀態 BFF ｜ [C] 顯示加速

> 目的：[MVP_TDD.md 設計決策表](MVP_TDD.md) — BFF 不持 admin key、不簽交易、不存業務資料；只做查詢加速。

### [x] T5.1 — Stats 聚合 ｜ [C]
- `GET /stats/:vaultId`：query Sui events → 聚合成 dashboard 用 JSON
- 純函式 + RPC 快取（記憶體 LRU 60s）
- 實作：`bff/src/stats/`（fetcher + aggregator + cache + handler）、`bff/src/app.ts`（buildApp 依賴注入）
- TDD ✅（5 tests，`bff/tests/stats.test.ts`）
  - [x] `test_stats_aggregates_events`
  - [x] `test_cache_hit_skips_rpc`

### [x] T5.2 — OG meta 動態產生 ｜ [A]
- `GET /og/:surveyId`：爬蟲 UA → 動態 HTML with OG tags；一般 UA → 302 至前端
- 實作：`bff/src/og/`（handler + renderer）；`bff/src/app.ts` 加 `frontendUrl?`；`bff/src/index.ts` 讀 `FRONTEND_URL` env
- TDD ✅（4 tests，`bff/tests/og.test.ts`）
  - [x] `test_crawler_ua_gets_og_html`
  - [x] `test_normal_ua_gets_redirect`

### [x] T5.3 — 啟動安全檢查 ｜ [基建]
- BFF 啟動時斷言：
  - 環境變數**無** `ADMIN_PRIVATE_KEY`（誤設要直接 crash）
  - 無 session secret、無 DB connection string
- 實作：`bff/src/security.ts`（`assertSecureEnv()`）；`bff/src/index.ts` 最頂層呼叫
- TDD ✅（5 tests，`bff/tests/startup.test.ts`）
  - [x] `test_bff_crashes_if_admin_key_present`
  - [x] `test_bff_starts_with_minimal_env`

---

## M6 E2E + Demo ｜ 跨 Flow 驗收

> 目的：[MVP_TDD.md Definition of Done](MVP_TDD.md) — 真合約 + 真 Gas Station 跑完 Flow A→B→C。

### [x] T6.1 — Playwright happy-path（真合約）｜ [A][B][C]
- 接 Devnet 真合約 + Mock Wallet Standard（test-side keypair signing + Creator-sponsored gas station route）
- 流程：建立 → 注資 → 切換錢包（受訪者 0 SUI）→ 填答 → 看憑證 → /redeem 換 SSR → /dashboard 看 1 筆
- 沿途修復：
  - `fetchClaimedEvents` 從 `All + MoveEventField` 改為 `MoveEventType` only — devnet RPC 對 `ID` 型別欄位的 `MoveEventField` 過濾回傳 `Invalid params`，導致 dashboard 永遠看到 0 筆
  - E2E：注資導航斷言 timeout 拉到 30s（給 FundPage 內部對交易結果的 5 輪 retry 緩衝）
  - E2E：Step 6 dashboard 用 `expect.toPass` polling reload，吸收 devnet event indexer 延遲
- TDD ✅
  - [x] `test_full_flow_a_to_c_real_chain`（[frontend/e2e/lifecycle.spec.ts](frontend/e2e/lifecycle.spec.ts) — 19.4s on devnet, 1/1 綠）

### [ ] T6.2 — Sad-path e2e ｜ [B]
- 重複填答被拒（Dry Run 階段，受訪者不付 Gas）
- 名額滿被拒
- 無 SurveyPass 自動補發 → 成功
- TDD
  - [ ] `test_duplicate_response_rejected_by_dry_run`
  - [ ] `test_quota_exceeded_rejected`

### [ ] T6.3 — Demo 腳本完成
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) 5 分鐘 walkthrough
- 含 screenshot / 預錄 TX digest 範例
- TDD
  - [ ] 真人 5 分鐘跑完不卡關

---

## v2 Roadmap（排除於 MVP）

對應 [專案目標.md §MVP 規格](專案目標.md) 標為「進階」與 [MVP_TDD.md Limitations](MVP_TDD.md)：

- [-] Devnet ↔ Mainnet 跨網路橋
- [-] 多階段獎勵（前 100 名 10 SSR，101–1000 名 1 SSR...）
- [-] AI 輔助 Markdown 編輯 / RAG 建議（[專案目標.md §2 step 2b/c/d](專案目標.md)）
- [-] 進階參與條件（國籍、年齡、UID、邀請碼、白名單、平台積分）
- [-] 匿名化投票（[專案目標.md §MVP 方向 #5](專案目標.md) — 與 SurveyPass 防女巫衝突，需更深 zk 設計）
- [-] 追加金額／更新活動條件
- [-] Logo 與品牌視覺識別
- [-] Markdown 問卷匯入／匯出
- [-] Markdown 編輯 / 預覽即時更新
- [-] 安全性審計（admin key 託管、CORS、rate limit、secret rotation）

---

## Definition of Done（最終驗收）

- [ ] `pnpm -r build && pnpm -r test` 全綠
- [ ] `pnpm move test` 合約測試綠（含 Flow A→B→C 整合）
- [ ] `pnpm deploy:Devnet` 合約 deploy + AMM 種子流動性
- [ ] `pnpm dev` 起 BFF + frontend
- [ ] 發起者建立問卷 + 一筆 PTB 注資 + 看到鏈上交易
- [ ] 受訪者**錢包 0 SUI** → 連錢包 → 填答 → 看到 stakedSurveySuiReward 憑證 + TX digest → /redeem 換 SurveySuiReward
- [ ] 發起者 dashboard 看到回覆與正確 vault 餘額
- [ ] `pnpm e2e` Playwright 全綠（真合約 + 真 Gas Station）
