# 部署清單：testnet 全 Cloudflare 架構（BFF Worker 化後）

> 本檔取代舊兩份過時清單（`docs/5-docs-md-ticklish-kite.md`、`docs/cloudeflare-delegated-candle.md`），
> 後者假設「BFF 跑 Render/Fly/VPS、BFF↔gas 走公網 `GAS_STATION_URL`」，已與實際架構不符。

## 架構現況

三個 Cloudflare 服務，皆在同一帳號免費額度內：

| 服務 | 角色 | 持久狀態 |
| :--- | :--- | :--- |
| `surveysui-gas-station` Worker | 多簽代付廣播 | D1 `surveysui-gas-testnet` + SQLite-backed Durable Object |
| `surveysui-bff` Worker | auth + pass + ticket + revocation + 影像淨化 + cron 背景任務 | D1 `surveysui-bff-testnet`（獨立） |
| `surveysui-frontend-testnet` Pages | SPA + OG Pages Function | 無（前端 storage 直連 Walrus 自驗 hash） |

- **BFF↔gas**：Service Binding（`bff/wrangler.toml` 的 `[[services]]` 綁 `surveysui-gas-station`），`GAS_STATION_MODE=do`，**不走公網**。
- **背景任務**：BFF Cron Triggers（`*/10`=coin 維護、`0 */6`=close/purge）。
- **OG 連結預覽**：前端 Pages Function `frontend/functions/og/[surveyId].ts`，隨 `pages deploy` 自動上線。

## 部署起點（2026-06-16 實查）

| 元件 | 狀態 | 動作 |
| :--- | :--- | :--- |
| 合約 package `0x6cb1cc…3e6ee8` | 已在 testnet | **沿用**，不重部 |
| `surveysui-gas-station` Worker + secret | 已部署 | **沿用**，僅驗證 |
| gas D1（`platform_sponsor_daily`/`wallet_sponsor_rate` 已 migrate） | 就緒 | **沿用** |
| `surveysui-bff` Worker / D1 | 不存在 | **本次新建** |
| 前端 Pages 專案 | 不存在 | **本次新建** |

## 兩趟部署

依賴真實網址才能填的設定（`FRONTEND_URL`、`BFF_URL`、`WORLDCOIN_RP_ID`/`APP_ID`、OAuth redirect、`VITE_BFF_URL`）
需先有部署網址。第一趟用平台預設網域（`*.workers.dev`、`*.pages.dev`）拿網址 → 第二趟回填正式網址＋外部憑證 redeploy。
**內部金鑰第一趟即放最終值**，第二趟不動。

---

## §0 前置
- `npx wrangler login`（帳號 `wesleyshun2@gmail.com`，token 具 workers/d1/pages write）。
- 本機 `pnpm` / Node / wrangler 就緒。
- 根 `.env` 已是 testnet 最終值（`SUI_PACKAGE_ID`、合約物件 ID、內部金鑰）。

## §A 沿用驗證（不重部）
1. **合約一致性**：根 `.env`、`bff/wrangler.toml`、`workers/gas-station/wrangler.toml` 三處 `SUI_PACKAGE_ID` 均為 `0x6cb1cc…`。
2. **gas-station**：`cd workers/gas-station && npx wrangler deployments list` 有紀錄。
   表已存在：`npx wrangler d1 execute surveysui-gas-testnet --remote --command "SELECT name FROM sqlite_master WHERE type='table'"`
   → 應含 `platform_sponsor_daily`、`wallet_sponsor_rate`。改過 gas 程式才需 `npx wrangler deploy`。
3. **gas secret 齊全**：`GAS_SPONSOR_PRIV_1`/`_2`、`GAS_SPONSOR_PUBKEY_3`、`GAS_STATION_SHARED_SECRET`、`SURVEY_PASS_ISSUER_PRIV`；缺則 `npx wrangler secret put <NAME>`。

## §B 新建 BFF Worker（`bff/` 目錄）— 本次重點

1. **建 D1**
   `cd bff && npx wrangler d1 create surveysui-bff-testnet`
   → 把回傳 `database_id` 回填 `bff/wrangler.toml` 的 `[[d1_databases]]`（取代 `0000-REPLACE…` placeholder）。

2. **套 schema**
   `npx wrangler d1 migrations apply surveysui-bff-testnet --remote`
   （schema = `bff/migrations/0001_init.sql`，11 張表：revoked_nullifiers、platform_sponsor_daily、wallet_sponsor_rate、pass_sponsor_reservation、realtime_ticket_slot、pass_sponsor_onchain_cache、task_cursor、otp、oauth_state、mint_rate_limit、http_rate_limit）。
   驗證：`npx wrangler d1 execute surveysui-bff-testnet --remote --command "SELECT name FROM sqlite_master WHERE type='table'"`。

3. **設 `[vars]`**（非機密，寫 `bff/wrangler.toml`）
   已有：`SUI_RPC_URL`、`SUI_PACKAGE_ID`、`GAS_STATION_MODE=do`。補上：
   - `SUI_NETWORK = "testnet"`
   - `SUI_GRAPHQL_URL`（testnet GraphQL，zkLogin 驗簽需傳網路對應 client）
   - `WORLDCOIN_APP_ID` / `WORLDCOIN_ACTION` / `WORLDCOIN_API_BASE`（`WORLDCOIN_RP_ID` 第二趟回填）
   - 啟用生命週期任務時：`CLOSE_TASK_ENABLED` / `PURGE_TASK_ENABLED` ＋ `SURVEY_REGISTRY_ID` / `PROTOCOL_CONFIG_ID` / `PASS_REGISTRY_ID` / `ISSUER_CONFIG_ID`（cron `0 */6` 才會跑，見 `bff/src/worker.ts`）
   - `FRONTEND_URL`、`BFF_URL`：**第二趟回填**
   - 其餘旋鈕（`BFF_PASS_TTL_MS*`、`SPONSOR_COUNT_SCOPE`、`PURGE_REBATE_*`、`MAX_INLINE_ANSWER_KB`…）依需求，缺則用程式預設

4. **注入 secrets**（逐一 `npx wrangler secret put <NAME>`；**勿寫 wrangler.toml / 勿進 git**）
   - 簽章/反女巫：`SURVEY_PASS_ISSUER_PRIV`、`SURVEY_PASS_ISSUER_SALT`、`GAS_SPONSOR_PRIV_1`、`GAS_SPONSOR_PRIV_2`、`GAS_SPONSOR_PUBKEY_3`、`GAS_SPONSOR_ADDRESS`
   - 串接/管理：`GAS_STATION_SHARED_SECRET`（**與 gas-station 同一把 HMAC**）、`ADMIN_SECRET`
   - 外部 SaaS：`RESEND_API_KEY`、`EMAIL_FROM`、`WORLDCOIN_SIGNING_KEY`、OAuth（Google/GitHub client id/secret，第一趟可暫時值）
   - ⚠️ **`SUI_ADMIN_PRIVATE_KEY` 絕不可設** → `assertSecureEnv()`（`bff/src/security.ts`）偵測即 crash。
   - **不需** `GAS_STATION_URL`（Service Binding 取代；缺它才會 fallback 公網）。

5. **部署** 
   `npx wrangler deploy`（Service Binding 解析既存 `surveysui-gas-station`）
   → **記下 `https://surveysui-bff.<subdomain>.workers.dev`**。

6. **冒煙**：`GET <BFF>/health` 回 `status: ok`、無金鑰缺失警告。

## §C 前端 Cloudflare Pages（`frontend/` 目錄）

1. 根 `.env` 的 `VITE_*`：`VITE_NETWORK=testnet`、各 `VITE_*_ID` 對齊合約、`VITE_BFF_URL=<§B.5 BFF URL>`。
2. `cd frontend && pnpm build`（Vite 把 `VITE_*` 打進 bundle）。
3. `npx wrangler pages deploy dist --project-name surveysui-frontend-testnet` → **記下 `*.pages.dev`**。
   - OG Pages Function `frontend/functions/og/[surveyId].ts` 隨此次部署自動上線（CF 自動偵測 `functions/` 目錄，無需額外設定）。
   - ⚠️ 確認 `functions/` 與 `dist` 並存被部署（SPA + Pages Functions 可同時存在）。

## §D 第二趟：回填網址＋外部憑證 redeploy

1. 彙整真實網址：BFF URL、Pages URL。
2. 註冊正式外部憑證（用真實網址）：
   - OAuth：redirect URI = `<BFF URL>/...callback`，取正式 client id/secret。
   - World ID：`WORLDCOIN_RP_ID=<rp_…>`、`WORLDCOIN_APP_ID=app_prod_…`、signing key、action。
   - Resend：API key、`EMAIL_FROM`。
3. 回填並 redeploy：
   - BFF：`[vars]` 補 `FRONTEND_URL=<Pages URL>`（CORS）、`BFF_URL=<BFF URL>`、`WORLDCOIN_RP_ID`；OAuth/Resend/WorldID secrets 換正式值 → `npx wrangler deploy`。
   - 前端：`VITE_BFF_URL` 對齊 → `pnpm build` + `pages deploy`。
   - 內部金鑰第一趟已最終值，第二趟不動。

## §E 公測 gate（驗證）

1. `GET <BFF>/health` ok、log 無 `assertSecureEnv` 報錯（確認 Admin Key 不在 BFF）。
2. **端到端**：前端連錢包 → mint SurveyPass → BFF 簽 ticket → **Service Binding** 轉 gas-station DO → 多簽 K1+K2 廣播 → 上鏈且**錢包未付 SUI**（代付生效）。
3. OAuth / Email OTP / World ID 各走一輪（正式憑證）。
4. **Cron**：等排程或手動觸發，確認 coin 維護有跑；啟用 purge/close 時看 D1 `task_cursor` 有界推進。
5. **OG**：`curl -A facebookexternalhit <Pages>/og/<surveyId>` 回靜態 meta；一般瀏覽器訪 `/og/<id>` 應 302 轉 `/s/<id>`。
6. CF Dashboard：看 BFF / gas Worker logs、BFF D1 各表有寫入。

## §F 安全 / 成本要點

- 全部 Tier 1 私鑰只走 `wrangler secret`；`SUI_ADMIN_PRIVATE_KEY`（Tier 0）**永不**進任何 Worker。
- testnet / mainnet 兩套 CF 資源（Worker 名、D1、Pages、secrets）完全隔離；mainnet 前重設金鑰。
- Free 方案足夠 testnet（Workers 10 萬 req/日、D1 讀 5M/寫 10 萬·日、SQLite-backed DO 免費）；BFF 與 gas 各自獨立 D1。
- 三個 Worker 共用同帳號免費額度；BFF cron（coin/purge）為 CPU 大戶，已有界化（`maxPerCycle` + D1 cursor），上線後觀察 D1 寫入量。

## §G（之後再做）

- 連 GitHub CI（Pages 綁 repo 或 GitHub Actions → wrangler deploy；`CLOUDFLARE_API_TOKEN` 與私鑰存 GitHub Encrypted Secrets）。
- 自訂網域：DNS zone 須加進「跑服務的同一個 CF 帳號」；接域後同步更新 `FRONTEND_URL`、`VITE_BFF_URL`、`WORLDCOIN_RP_ID`、OAuth redirect。
- mainnet 部署（另產一套金鑰，安全紅線 §5）。
