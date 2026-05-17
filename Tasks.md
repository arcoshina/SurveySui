# SurveySui 任務進度清單

> 上游：[專案目標.md](專案目標.md)（願景／Flow A/B/C）→ [MVP_TDD.md](MVP_TDD.md)（架構與設計決策）→ 本檔（任務執行）
> 狀態圖例：`[ ]` 未開始 / `[~]` 進行中 / `[x]` 完成 / `[-]` 延後或排除
> TDD 原則：每個 task 先提交「失敗的測試」，再提交「實作 + 測試通過」
> 標籤：`[A]` Flow A 發起者建立 ／ `[B]` Flow B 受訪者填答 ／ `[C]` Flow C 收尾 ／ `[基建]` 不直接屬於任一 Flow

---

## 進度總覽

| 里程碑 | 完成 / 總數 | 對應目標 | 備註 |
|---|---|---|---|
| M0 基礎設施 | 3 / 3 | [基建] | ✅ 完成 |
| M1 Move Contracts | 6 / 7 | [A][B][C] 金流層 | T1.7 testnet 部署延後 |
| M2 Backend | 9 / 9 | [A][B][C] 金流層+產品層 | ✅ 完成 |
| M3 Frontend | 9 / 9 | [A][B][C] 產品層 | ✅ 完成 |
| M4 整合 & Demo | 2 / 3 | 跨 Flow 整合 | T4.3 frontend↔backend contract drift 待修 |
| M5 Contract drift 全面對齊 | 0 / 9 | 產品層驗收 | 2026-05-17 audit 發現，T4.3 為其子集 |
| **合計** | **29 / 40** | — | M5 完成前無法宣告整合可用 |

下一步：**M5 全部完成 → 重跑 e2e（真 backend）→ [Definition of Done](#definition-of-done最終驗收) 驗收**

### 兩個驗收軸（對齊 [專案目標.md §MVP 要證明什麼](專案目標.md)）

| 驗收軸 | 跨哪些 task | 驗收方式 |
|---|---|---|
| **金流層**：注資 → vault → claim → swap 全鏈路無縫 | M1 + T2.6 + T3.3 + T3.7 + T5.5 + T5.6 | 一筆 PTB atomic 注資；受訪者領到 RWD；swap 拿到 SUI；過程鏈上可查 |
| **產品層**：發起者一氣呵成設計→分享→看結果 | M3 + M5 全部 | e2e（真 backend）跑完 Flow A→B→C 不破 |

---

## ✅ 已完成里程碑摘要（M0–M4）

### M0 基礎設施
- **T0.1** Monorepo（pnpm workspaces, `/contracts` `/backend` `/frontend` `/scripts`），build/typecheck 全綠
- **T0.2** Faucet script、`.env.example`、`env-sync.ts` deploy 後自動寫回 object id
- **T0.3** GitHub Actions 三 job（`move-test` / `backend-test` 含 Postgres / `frontend-test` 含 Playwright）

### M1 Move Contracts
- **T1.1 `reward_coin`** — capped 1B + 9 decimals、admin mint / 開放 burn / `transfer_admin`（6 TDD）
- **T1.2 `participant_sbt`** — 護照機制（ACTIVE/REVOKED/SUPERSEDED、無 `store` 阻擋 transfer、SbtRegistry 保證單一 sub 1 張有效）、`issue/reissue/revoke` admin only、`is_valid` view（9 TDD 含 compile-fail）
- **T1.3 `survey_vault`** — `create` 回 vault 不內部 share、`fund` 開放、`claim` admin only（檢查 SBT 有效 + sub_hash 未領）、`close` creator 退款（12 TDD 含換發雙領防護）
- **T1.4 `amm_pool`** — CPMM `init_pool / add/remove_liquidity / swap_a_to_b / swap_b_to_a`、0.3% fee（6 TDD 含 k 不變式）
- **T1.5 `survey_registry`** — `Survey {vault_id, creator, content_hash, status}` + 註冊事件
- **T1.6** 多 module 整合 `test_scenario`：mint SBT → 注資 vault → claim → swap 全綠
- **T1.7** ⏳ 延後 — 見下節

### M2 Backend（Fastify + Prisma + PostgreSQL）
- **T2.1** 完整 Prisma schema（users / participant_sbts / surveys / questions / responses + 所有 UNIQUE 約束）
- **T2.2 zkLogin** — `/auth/google/start` + `/auth/zklogin/finalize`，`sub` SHA256 存 DB
- **T2.3 SBT issuance** — 首登發 180d、< 14d 自動 reissue、`/admin/sbt/{revoke,reissue}`、DB↔chain atomicity（8 TDD）
- **T2.4 Survey CRUD** — `POST /surveys` parse markdown、`GET /surveys/:id`、上鏈 `survey_registry::register`、4 題型（single/multi/text/scale）
- **T2.5 Response** — `POST /surveys/:id/responses` 四項資格檢查 + SHA256 hash
- **T2.6 Reward dispatcher** — admin 簽 `claim`、transaction queue 防 nonce 衝突（100 併發 serialized）、失敗 rollback
- **T2.7 Stats** — `GET /surveys/:id/stats` 回覆數/完成率/各題分佈/vault 餘額
- **T2.8 Close** — `POST /surveys/:id/close` creator 自簽
- **T2.9 Admin key 安全** — 啟動檢查 admin address 與合約一致

### M3 Frontend（Vite + React + @mysten/dapp-kit + Tailwind + Recharts）
- **T3.1** 四路由 + `<SuiClientProvider>` + `<WalletProvider>` + Testnet 設定 + baseline OG tags
- **T3.2 建立問卷頁** — Markdown editor + 預覽 + 獎勵/名額/截止日表單
- **T3.3 注資頁** — 預估 SUI 消耗（CPMM 反向公式 + 1% 滑點）、一鍵 PTB（swap→create→share_vault）、wallet rejection 處理
- **T3.4 儀表板** — Recharts 統計 + 鏈上即時 vault 餘額 + 結束活動按鈕
- **T3.5 zkLogin 登入頁** — Google OAuth + SBT pending polling `GET /me/sbt-status`
- **T3.6 填答頁** — 拉 questions JSON 渲染 + 提交前預覽 + 成功顯示 TX hash
- **T3.7 Swap UI** — 雙向 input + 自動算 amount_out + 5% 滑點警告
- **T3.8 RWD + i18n** — 桌機/手機（375/768/1440）+ 中文字型
- **T3.9 Social Sharing OG** — Cloudflare Worker 攔截 `/s/:id`，爬蟲 UA → 動態 OG，一般 UA → passthrough

### M4 整合 & Demo
- **T4.1 E2E** — Playwright happy-path + 3 sad-path（已領過 / 已截止 / 名額用盡），後端 + OAuth 以 `page.route()` mock
- **T4.2 Demo 腳本** — README + 5 分鐘 DEMO_SCRIPT.md

---

## ⏳ M1 待辦：T1.7（延後）

### [-] T1.7 — Deploy package + 初始化 AMM 流動性
- [x] `scripts/src/init.ts`：deploy + mint 種子 RWD + 開 RWD/SUI pool + 注入初始流動性（程式碼已寫）
- TDD
  - [-] `test_pool_reserves_both_nonzero`（integration，需 `INTEGRATION=1 AMM_POOL_ID=<id>`；尚未對 testnet 驗證）

---

## ⏳ M4 待辦：T4.3（將被 M5 取代）

### [ ] T4.3 — Frontend ↔ Backend API contract drift（2026-05-17 試用時發現）
> Frontend `CreatePage` 與 Backend `POST /surveys` 從未真正整合過。e2e 用 `page.route()` mock 掉了後端，所以 schema 不一致沒被 catch。
>
> **不一致點**：
> - 命名：`content_md` (FE) vs `contentMd` (BE)
> - 獎勵設定來源：FE 用三個獨立輸入框，BE 從 Markdown YAML frontmatter 解析
> - FE 沒送 `vaultObjectId`、`creatorAddress`，但 BE schema 標 required
> - 流程：FE 假設「先建問卷再注資」，BE 假設「先注資建 vault → 用 vault ID 註冊問卷」
>
> **影響檔案**：
> - [`frontend/src/pages/CreatePage.tsx`](frontend/src/pages/CreatePage.tsx#L51) （fetch payload + 三個 form field）
> - [`backend/src/survey/routes.ts`](backend/src/survey/routes.ts#L16) （`CreateSurveyBodySchema`）
> - [`frontend/vite.config.ts`](frontend/vite.config.ts) （已順手加 dev proxy 把 `/surveys` 等轉發到 :3000）
>
> **建議修法**：
> - 拿掉前端三個輸入框，改為提示使用者在 Markdown frontmatter 寫 `per_response/max_responses/deadline`
> - CreatePage 接 `useCurrentAccount()` 拿 `creatorAddress`、串接「先去 /fund 簽 PTB 建 vault 再回頭呼叫 POST /surveys」的流程
> - 寫真正的 contract test（不要 `page.route()` mock）：起 backend test instance + 直接 fetch
- TDD
  - [ ] integration test：frontend build 出來的 payload 能通過 backend zod schema
  - [ ] e2e 至少一個 case 用真實 backend（非 `page.route()` mock）

> **註**：完成 M5 後本任務可關閉（T5.1 已涵蓋）。

---

## 🩹 M5 Contract drift 全面對齊（2026-05-17 audit）

> 背景：T4.1 e2e 用 `page.route()` 把後端整套 mock 掉，且 mock body 是「FE 自己想要的 shape」，所以下列 9 大整合問題全部沒被 catch。T4.3 為本里程碑的 #1 子集，完成 M5 後可關閉 T4.3。
>
> **共同根因**：FE 對著「想像中的 backend」獨立開發，沒有任一條真實整合測試。
>
> **驗收門檻**：至少一條 e2e 跑真 backend（docker-compose 起 backend + Postgres，不用 `page.route()` mock 任何 `/surveys`、`/auth`、`/me/*`）。

### [ ] T5.1 — `GET /surveys/:id` 回傳 shape 對齊（取代 T4.3 #1）
> [backend/src/survey/routes.ts:57-67](backend/src/survey/routes.ts#L57-L67) 直接 spread Prisma 物件回 camelCase，且沒有 `title`；
> [frontend/src/pages/SurveyPage.tsx:12-19](frontend/src/pages/SurveyPage.tsx#L12-L19) 期望 snake_case + `title` + `options_json`。
> **更嚴重**：`answers` 用的 key 是 backend 的 DB UUID (`q.id`)，但 [survey-service.ts:161-208](backend/src/survey/survey-service.ts#L161-L208) stats 以 `questionKey`（markdown 的 `q1`/`q2`）做聚合 → 即便提交成功，stats 永遠 0 筆。
- [ ] backend route 顯式 map 成 FE 約定 shape（含 `title` 從 markdown frontmatter 取）
- [ ] 統一 `answers` key 為 `questionKey`
- TDD
  - [ ] backend response shape snapshot test
  - [ ] e2e（真 backend）：建問卷 → 填答 → stats 顯示 1 筆

### [ ] T5.2 — `POST /surveys/:id/responses` body schema + session（取代 T4.3 部分）
> [SurveyPage.tsx:73-77](frontend/src/pages/SurveyPage.tsx#L73-L77) 只送 `{ answers }`，BE 要 `{ subHash, suiAddress, answersJson }`。
> 根本問題：FE 沒有 session，無從取得 subHash / suiAddress。
- [ ] backend `/auth/zklogin/finalize` 發 httpOnly session cookie（或 JWT）
- [ ] FE fetch 統一帶 `credentials: 'include'`
- [ ] backend `/surveys/:id/responses` 改從 session 讀 subHash/suiAddress，body 只剩 `answersJson`
- TDD
  - [ ] e2e（真 backend）：login → 填答 → 201 + txDigest

### [ ] T5.3 — zkLogin 三段流程對齊
> 全部對不上：
> - [LoginPage.tsx:7-11](frontend/src/pages/LoginPage.tsx#L7-L11) `<a href="/auth/google/start">` 直接跳 → backend 是 JSON API + 要 `?nonce=` → 400
> - [LoginCallbackPage.tsx:25-29](frontend/src/pages/LoginCallbackPage.tsx#L25-L29) POST `{ id_token }` → BE 要 `{ jwt, zkProof, ephPubkey, maxEpoch, salt }`
> - [LoginCallbackPage.tsx:44-55](frontend/src/pages/LoginCallbackPage.tsx#L44-L55) poll `/me/sbt-status` → **backend 根本沒這條路由**；finalize 已同步發 SBT
- [ ] LoginPage 改先 fetch `/auth/google/start?nonce=...` 取 `{ url }` 再跳轉
- [ ] LoginCallbackPage 補齊 zkProof / ephPubkey / maxEpoch / salt 的取得與送出
- [ ] 移除 `/me/sbt-status` polling，改讀 finalize response 的 `sbtAction` / `sbtObjectId`（或在 backend 補這條路由）
- TDD
  - [ ] e2e（真 backend）：Google mock → finalize → 拿到 sbtObjectId

### [ ] T5.4 — Dashboard 欄位 + close API 對齊
> [DashboardPage.tsx:14-35](frontend/src/pages/DashboardPage.tsx#L14-L35) 期望 `vault_object_id` / `response_count` / `distributions[{question_id,data:[{label,count}]}]`，BE 回 camelCase + `questions[].distribution: Record<string, number>`。
> `survey.creator` ≠ BE 的 `creatorAddress` → 結束按鈕永遠灰；
> `handleClose` POST 沒帶 body → BE 要 `{ creatorAddress }` → 400；
> `vault_object_id` 取不到 → 「鏈上即時餘額」code path 從沒走過。
- [ ] 統一欄位命名（建議 BE 統一回 camelCase，FE 改 camelCase）
- [ ] `handleClose` 帶 `{ creatorAddress: account.address }`
- [ ] distributions 轉換為 `[{label,count}]` 陣列（在 BE 或 FE 擇一處理）
- TDD
  - [ ] e2e（真 backend）：建立 → 注資 → 填答 → dashboard 顯示 1 筆 + 鏈上餘額

### [ ] T5.5 — FundPage 接 vault id 回寫 backend + survey_registry::register
> [FundPage.tsx:63-100](FundPage.tsx#L63-L100) PTB 只做 `swap → create vault → share_vault`，digest 拿到就結束：
> - 沒從 PTB effects 抽出新 vault object id
> - 沒回頭呼叫 `POST /surveys` 帶 `vaultObjectId`
> - 沒呼叫 `survey_registry::register`（`grep register frontend/src` 0 hit）
>
> 額外：location.state 傳參數 → 重新整理就丟、URL share 不能用。
- [ ] PTB 串接 `survey_registry::register` 成第 4 個 command（atomic）
- [ ] 從 `result.effects.created` 抽 vault object id + survey object id
- [ ] 回頭呼叫 `POST /surveys`（與 T4.3 修法配合：先 fund 後 register survey row）
- [ ] params 改放 URL search params 或先存 backend draft
- TDD
  - [ ] `test_ptb_includes_register_command`
  - [ ] e2e（真 backend）：fund → DB 出現 survey row 且 vaultObjectId 正確

### [ ] T5.6 — AMM pool / vault Move struct 欄位真實驗證
> [FundPage.tsx:46-47](frontend/src/pages/FundPage.tsx#L46-L47)、[DashboardPage.tsx:73](frontend/src/pages/DashboardPage.tsx#L73)、[SwapPage.tsx:57-58](frontend/src/pages/SwapPage.tsx#L57-L58) 假設 `fields.reserve_a` / `fields.balance` 是字串，但 Move `Balance<T>` 序列化為 `{ value: "123" }` 巢狀物件。從未對真實 testnet object 驗證。
- [ ] 對 testnet pool / vault `getObject` 印出真實 fields shape
- [ ] 改成正確的 `fields.reserve_a.fields.value`（或實際 shape）
- TDD
  - [ ] 用真實 fixture（從 testnet 抓下來的 JSON）做 parse test

### [ ] T5.7 — SwapPage RWD coin merge/split
> [SwapPage.tsx:47-49](frontend/src/pages/SwapPage.tsx#L47-L49) 只取 `data[0].coinObjectId`，第一顆餘額不足就 abort。剛 claim 完手上是多顆 1 RWD coin，掃 1 顆必失敗。
- [ ] 用 `tx.mergeCoins` 把所有 RWD coin 合併，再 `tx.splitCoins(amountIn)`
- TDD
  - [ ] `test_swap_aggregates_multiple_rwd_coins`

### [ ] T5.8 — CORS credentials + session 基礎建設
> [backend/src/app.ts:25](backend/src/app.ts#L25) `cors({ origin: true })` 沒 `credentials: true`；FE fetch 沒 `credentials: 'include'`。
> 配合 T5.2 / T5.3 的 session 引入。
- [ ] backend CORS `{ origin: <FE_ORIGIN>, credentials: true }`
- [ ] FE 包一個 `apiFetch` helper 統一帶 credentials
- [ ] httpOnly + Secure + SameSite=Lax cookie
- TDD
  - [ ] `test_finalize_sets_session_cookie`
  - [ ] `test_protected_route_rejects_without_cookie`

### [ ] T5.9 — E2E 改用真 backend（守住前 8 項）
> T4.1 e2e 全 mock 是上述問題沒被 catch 的根因。M5 完成的驗收門檻。
- [ ] docker-compose：postgres + backend test instance
- [ ] Playwright global setup：等 backend `/health` 200 後才開跑
- [ ] 至少 happy-path（建立 → fund → login → 填答 → dashboard）跑真 backend
- [ ] 保留現有 `page.route()` mock 版作為快速回歸（標 `@mock`）
- TDD
  - [ ] CI 加 `e2e-real-backend` job

---

## v2 Roadmap（排除於 MVP）

### 已於 [專案目標.md](專案目標.md) §MVP 規格總覽中標為「進階」或於 [MVP_TDD.md](MVP_TDD.md) Limitations 排除

- [-] Testnet ↔ Mainnet 跨網路橋
- [-] 多階段獎勵（前 100 名 10 token，101–1000 名 1 token...）
- [-] AI 輔助 Markdown 編輯 / RAG 建議
- [-] 進階參與條件（國籍、年齡、UID、邀請碼、白名單、平台積分）
- [-] 匿名化投票（[專案目標.md](專案目標.md) §MVP 方向 #4）
- [-] 結果加密上鏈
- [-] Sponsored transaction 給受訪者
- [-] 發起者使用 SUI 自動 swap 成 RWD 並享手續費折扣
- [-] 追加金額／更新活動條件

### UI／UX 強化（從原「改進計畫.md」併入，2026-05-17）

- [-] **Logo**：墨水滴進方格（[A][B][C] 全站視覺識別）
- [-] **Markdown 問卷檔案匯入／匯出**（[A]，發起者可在本機備份問卷草稿）
- [-] **適當提示／引導**：登入流程、空白狀態、錯誤訊息（[A][B][C]）
- [-] 進階 Markdown 編輯：預覽即時更新 → AI 輔助 → 自有 RAG（[專案目標.md](專案目標.md) §2.2 b/c/d）

### 合約／部署強化

- [-] **Devnet 預檢部署**：上 testnet 前先在 devnet 試跑（devnet 會定期清除，適合快速反覆驗證）
- [-] **安全性審計**：admin key 託管、CORS、rate limit、secret rotation

> 上述項目原列於已刪除的 `改進計畫.md`，2026-05-17 整合進本檔。可執行項目進入 v2 開發時，請拉到 M6+ 子段重寫成完整 task + TDD spec。

---

## Definition of Done（最終驗收）

- [ ] `pnpm -r build && pnpm -r test` 全綠
- [ ] `pnpm move test` 合約測試綠
- [ ] `pnpm deploy:testnet` 合約 deploy + AMM 種子流動性（T1.7）
- [ ] `pnpm dev` 起 backend + frontend
- [ ] 發起者建立問卷 + 注資 + 看到鏈上交易
- [ ] 受訪者 Google 登入 → 填答 → 看到 +1 RWD + TX hash → swap 成 SUI
- [ ] 發起者 dashboard 看到回覆與正確 vault 餘額
- [ ] `pnpm e2e` Playwright 全綠（含 M5 T5.9 真 backend job）
