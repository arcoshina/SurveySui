# SurveySui 任務進度清單

> 上游：[專案目標.md](專案目標.md)（願景／Flow A/B/C）→ [MVP_TDD.md](MVP_TDD.md)（架構與設計決策）→ 本檔（任務執行）
> 狀態圖例：`[ ]` 未開始 / `[~]` 進行中 / `[x]` 完成 / `[-]` 延後或排除
> TDD 原則：每個 task 先提交「失敗的測試」，再提交「實作 + 測試通過」
> 標籤：`[A]` Flow A 發起者建立 ／ `[B]` Flow B 受訪者填答 ／ `[C]` Flow C 收尾 ／ `[基建]` 不直接屬於任一 Flow

> 本檔為 2026-05-17 架構 pivot 後新版。舊版（M0–M5 + T5.1–T5.9 contract drift）封存於 [History/V0/Tasks.md](History/V0/Tasks.md)。

---

## 進度總覽

| 里程碑 | 完成 / 總數 | 對應目標 | 備註 |
|---|---|---|---|
| M0 基礎建設 | 1 / 4 | [基建] | T0.1 ✅；T0.2 命名就位（deploy 驗收延至 M1.7）；T0.3/T0.4 待執行 |
| M1 核心 Move 合約 | 6 / 7 | [A][B][C] 代幣經濟層 | T1.1–T1.6 ✅；T1.7 待 Devnet 驗收 |
| M2 Sponsored Transactions 整合 | 0 / 4 | [B] 零門檻層 | Gas Station + Dry Run |
| M3 加密問卷答案 | 0 / 3 | [A][C] 隱私層 | 加密方案 + 鏈下解密 |
| M4 Frontend（重寫） | 0 / 6 | [A][B][C] 產品層 | /create /fund /s /redeem /dashboard |
| M5 無狀態 BFF | 0 / 3 | [C] 顯示加速 | stats / OG / RPC 快取 |
| M6 E2E + Demo | 0 / 3 | 跨 Flow 整合 | 真合約 + Sponsored TX 全鏈路 |
| **合計** | **0 / 30** | — | 全新里程碑（舊 M 編號已廢） |

下一步：**M1 T1.7 Devnet 部署 → M2 Sponsored Transactions**

### 兩個驗收軸（對齊 [專案目標.md §MVP 要證明什麼](專案目標.md)）

| 驗收軸 | 跨哪些 task | 驗收方式 |
|---|---|---|
| **零門檻產品層**（§#1） | M1（survey_pass + vault.claim）+ M2 全部 + M4.B + M6 | 受訪者錢包 SUI 餘額為 0，仍能透過 Sponsored TX 完成填答並收到 stakedSurveySuiReward |
| **代幣經濟層**（§#3） | M1（amm_pool + staked_survey_reward + survey_sui_reward）+ M6 | 一筆 PTB atomic 注資；受訪者領到質押憑證；憑證可換 `SurveySuiReward`；池中 SUI 僅 admin 提領 |

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

### [~] T0.2 — Devnet faucet + env-sync
- `scripts/faucet.ts`：要 Devnet SUI
- `scripts/deploy.ts`：發布 package 後寫回 object id 至 `.env`
- TDD
  - [~] 部署後 `.env` 內 `AMM_POOL_ID`、`SSR_TREASURY_ID`、`SURVEY_REGISTRY_ID` 非空
    - **命名已對齊**（.env.example / init.ts / env-sync.ts 全部更新）；真實 deploy 驗收延至 M1.7 真合約完成

### [ ] T0.3 — CI（GitHub Actions）
- `move-test` / `bff-test` / `frontend-test` 三 job
- 主分支 PR 必須全綠才能 merge
- TDD
  - [ ] 故意 break 一個合約測試 → CI 必紅

### [ ] T0.4 — 文件骨架
- [README.md](README.md)：對外 quickstart + demo 連結
- [SETUP.md](SETUP.md)：Win 原生 / WSL / macOS 開發環境
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md)：5 分鐘 demo 腳本（M6 完成時補完）
- TDD
  - [ ] README 至少能讓新人 30 分鐘內跑起 `pnpm dev`

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
- `register(vault_id, content_hash, clock, ctx)` 發 `SurveyRegistered` 事件
- `archive(registry, survey_id, ctx)` 只有 creator 可呼叫
- TDD ✅（2 tests）

### [~] T1.7 — 多模組整合 + 部署 ｜ [A][B][C]
- `test_scenario`：完整 Flow A→B→C ✅（`test_full_lifecycle_a_to_c` 已通過，29/29 綠）
- `scripts/init.ts` 對齊新部署順序（已更新）
- TDD
  - [x] `test_full_lifecycle_a_to_c`
  - [ ] Devnet 真實部署成功 + `.env` 寫回（待執行）

---

## M2 Sponsored Transactions 整合 ｜ [B] 零門檻層

> 目的：[專案目標.md §MVP 要證明什麼 #1](專案目標.md)；受訪者錢包 0 SUI 也能填問卷。

### [ ] T2.1 — Gas Station 選型 + 沙箱串接 ｜ [B]
- 比較 [Mysten Enoki](https://docs.enoki.mystenlabs.com/) vs [Shinami](https://docs.shinami.com/)：價格、SDK、Dry Run API、Devnet 支援
- 選定後寫 [docs/gas-station.md](docs/gas-station.md)（決策記錄）
- TDD
  - [ ] 用 Gas Station SDK 在 Devnet 發一筆無 op PTB，受訪者錢包 SUI 0 → 成功

### [ ] T2.2 — PTB 建構工具（前端 lib）｜ [B]
- `frontend/src/lib/sponsoredTx.ts`：包裝 build PTB → Dry Run → 送 Gas Station → 廣播
- 錯誤分類：dry-run reject / sponsor reject / network error
- TDD
  - [ ] `test_build_claim_ptb_includes_all_args`
  - [ ] `test_dry_run_reject_does_not_call_sponsor`

### [ ] T2.3 — 防惡意消耗驗證（合約 + Gas Station 聯動）｜ [B]
- 對應 [專案目標.md §3 step 4](專案目標.md)「防惡意消耗機制」
- 三組 sad-path 都要在 Dry Run 階段被拒：
  - 無效 SurveyPass
  - 重複 sub_hash
  - vault 名額已滿
- TDD
  - [ ] `test_invalid_pass_rejected_in_dry_run`（sponsor 不簽，受訪者也不付 Gas）
  - [ ] `test_duplicate_claim_rejected_in_dry_run`

### [ ] T2.4 — SurveyPass 首次發放（亦走 Sponsored）｜ [B]
- 對應 [專案目標.md §3 step 2](專案目標.md)
- 受訪者首次連錢包 → 前端發 sponsored PTB → 合約 issue pass（驗證 Email/DID — MVP 用簡化驗證）
- TDD
  - [ ] `test_first_login_issues_pass_via_sponsored_tx`

---

## M3 加密問卷答案 ｜ [A][C] 隱私層

> 目的：[專案目標.md §2 step 4](專案目標.md)「結果如何交付」 + §4 step 4「鏈上解密讀取或匯出報告」。

### [ ] T3.1 — 加密方案選型
- 比較 [Mysten Seal](https://github.com/MystenLabs/seal) vs 對稱加密（AES-GCM + creator 持金鑰 + 鏈下分發）
- 寫 [docs/encryption.md](docs/encryption.md)
- TDD
  - [ ] 比較表完成 + 用戶簽核

### [ ] T3.2 — Creator-side 加密 + 上鏈
- 前端用 creator 公鑰加密問卷內容 → `survey_registry::register(encrypted_blob)`
- 答案以 creator 可解密的方式上鏈（`survey_vault::claim(..., encrypted_answers)`）
- TDD
  - [ ] `test_encrypted_blob_round_trip`
  - [ ] `test_third_party_cannot_decrypt`

### [ ] T3.3 — Creator-side 解密 + 統計報告
- Dashboard 撈 events → 用 creator 私鑰解密 → 統計
- 對應 [專案目標.md §4 step 4](專案目標.md)
- TDD
  - [ ] `test_dashboard_decrypts_all_responses`
  - [ ] `test_stats_match_decrypted_count`

---

## M4 Frontend（重寫）｜ [A][B][C] 產品層

> 目的：[專案目標.md §MVP 要證明什麼 #4](專案目標.md) — Markdown 問卷 + 絲滑資金流。
> 對應 [專案目標.md §2 §3 §4](專案目標.md) Flow A/B/C。

### [ ] T4.1 — Router + dApp Kit 基底 ｜ [基建]
- 6 路由：`/`（landing）/ `/create` / `/fund/:id` / `/s/:id` / `/redeem` / `/dashboard/:vaultId`
- `<SuiClientProvider>` + `<WalletProvider>` Devnet
- TDD
  - [ ] 各路由 navigate 後渲染對應頁面 component

### [ ] T4.2 — `/create` 建立問卷頁 ｜ [A]
- Markdown editor（textarea 即可，MVP 不做 WYSIWYG，對應 [專案目標.md §2 step 2a](專案目標.md)）
- 預覽：解析 frontmatter 顯示獎勵設定
- 「下一步：注資」按鈕 → 帶 markdown blob 跳 `/fund/:draftId`（localStorage 暫存）
- TDD
  - [ ] `test_parse_frontmatter`
  - [ ] `test_invalid_yaml_shows_error`

### [ ] T4.3 — `/fund/:id` 注資頁 ｜ [A]
- 顯示「預估 SUI 消耗 + 平台手續費」（呼叫 amm_pool 模擬）
- 一鍵 PTB：`invest_and_mint → create vault → register survey` 三步 atomic
- 從 PTB effects 抽出 vault_id、survey_id
- 處理錢包 reject / 餘額不足
- 對應 [專案目標.md §2 step 4](專案目標.md)
- TDD
  - [ ] `test_ptb_contains_three_commands`
  - [ ] `test_extract_vault_id_from_effects`

### [ ] T4.4 — `/s/:id` 受訪者填答頁 ｜ [B]
- 拉鏈上 survey 資料 → 解密 markdown → 渲染問卷
- 連錢包 → 沒有 SurveyPass 自動發 sponsored 取 pass（呼 M2.T2.4）
- 送出 → 呼叫 `sponsoredTx.ts`（M2.T2.2）
- 成功顯示 TX digest + 「我的質押憑證」連結
- 對應 [專案目標.md §3 全部](專案目標.md)
- TDD
  - [ ] `test_render_questions_from_decrypted_md`
  - [ ] `test_submit_uses_sponsored_path`

### [ ] T4.5 — `/redeem` 兌換頁 ｜ [B]
- 列出受訪者持有的所有 `stakedSurveySuiReward` 物件
- 選擇 → 呼叫 `amm_pool::redeem`
- 對應 [專案目標.md §3 step 5](專案目標.md)
- TDD
  - [ ] `test_lists_user_receipts`
  - [ ] `test_redeem_returns_ssr`

### [ ] T4.6 — `/dashboard/:vaultId` ｜ [A][C]
- Recharts 統計（單選長條圖、量表平均）
- 鏈上即時 vault 餘額（從 BFF 或直接 RPC）
- 結束活動按鈕 → `survey_vault::close` PTB（creator 自簽）
- 對應 [專案目標.md §4 step 1-3](專案目標.md)
- TDD
  - [ ] `test_close_button_only_for_creator`
  - [ ] `test_stats_render_with_zero_responses`

---

## M5 無狀態 BFF ｜ [C] 顯示加速

> 目的：[MVP_TDD.md 設計決策表](MVP_TDD.md) — BFF 不持 admin key、不簽交易、不存業務資料；只做查詢加速。

### [ ] T5.1 — Stats 聚合 ｜ [C]
- `GET /stats/:vaultId`：query Sui events → 聚合成 dashboard 用 JSON
- 純函式 + RPC 快取（記憶體 LRU 60s）
- TDD
  - [ ] `test_stats_aggregates_events`
  - [ ] `test_cache_hit_skips_rpc`

### [ ] T5.2 — OG meta 動態產生 ｜ [A]
- `GET /og/:surveyId`：爬蟲 UA → 動態 HTML with OG tags；一般 UA → 302 至前端
- TDD
  - [ ] `test_crawler_ua_gets_og_html`
  - [ ] `test_normal_ua_gets_redirect`

### [ ] T5.3 — 啟動安全檢查 ｜ [基建]
- BFF 啟動時斷言：
  - 環境變數**無** `ADMIN_PRIVATE_KEY`（誤設要直接 crash）
  - 無 session secret、無 DB connection string
- TDD
  - [ ] `test_bff_crashes_if_admin_key_present`
  - [ ] `test_bff_starts_with_minimal_env`

---

## M6 E2E + Demo ｜ 跨 Flow 驗收

> 目的：[MVP_TDD.md Definition of Done](MVP_TDD.md) — 真合約 + 真 Gas Station 跑完 Flow A→B→C。

### [ ] T6.1 — Playwright happy-path（真合約）｜ [A][B][C]
- 接 Devnet 真合約 + 真 Gas Station sandbox
- 流程：建立 → 注資 → 切換錢包（受訪者 0 SUI）→ 填答 → 看憑證 → /redeem 換 SSR → /dashboard 看 1 筆
- TDD
  - [ ] `test_full_flow_a_to_c_real_chain`

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
- [-] `SurveySuiReward` → SUI 反向 swap（需另開 CPMM 池）
- [-] 追加金額／更新活動條件
- [-] 鏈下 indexer / 子圖
- [-] Logo 與品牌視覺識別
- [-] Markdown 問卷匯入／匯出
- [-] WYSIWYG Markdown 編輯 / 預覽即時更新
- [-] Devnet 預檢部署
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
