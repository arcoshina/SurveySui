# SurveySui V1 — 工作摘要與錯誤修復紀錄

> 封存時間：2026-05-19
> 對應分支：main（M0–M6 全部完成，27/27 task ✅）
> 完整設計決策見：[docs/MVP_TDD.md](../../docs/MVP_TDD.md)
> 完整任務清單見：[docs/Tasks.md](../../docs/Tasks.md)

---

## 架構快照

三層架構：**Frontend（Vite + React）→ Gas Station / BFF → Sui Move Contracts（Devnet）**

| 設計決策   | 選定方案                                                      |
| ---------- | ------------------------------------------------------------- |
| 網路       | Devnet only                                                   |
| 受訪者 Gas | Sponsored Transactions（Gas Station Dry Run 防惡意消耗）      |
| 女巫防護   | `SurveyPass` soulbound NFT，合約純驗證不消耗                  |
| 獎勵代幣   | `SurveySuiReward`（SSR）+ `stakedSurveySuiReward`（sSSR）兩層 |
| AMM        | 單向 mint pool：SUI in → bonding curve mint sSSR              |
| 答案加密   | AES-GCM + wallet 衍生 X25519 keypair（SHA-256(sig) 為 seed）  |
| 後端角色   | 無狀態 BFF：無 admin key、無 session、無業務資料              |

---

## 各里程碑工作摘要

### M0 基礎建設

- pnpm workspaces monorepo（`/contracts` `/frontend` `/bff` `/scripts`）
- `scripts/faucet.ts` + `scripts/init.ts`：部署後自動寫回 object id 至 `.env`
- GitHub Actions CI：`move-test` / `bff-test` / `frontend-test` 三 job
- 文件骨架：README / SETUP / DEMO_SCRIPT

### M1 核心 Move 合約（6 模組）

| 模組                    | 主要工作                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `survey_sui_reward`     | `Coin<SSR>`；TreasuryCap 封裝，`mint` 限 package 內呼叫                                                              |
| `survey_pass`           | soulbound NFT（無 `store`）；`is_valid` 純驗證；PassRegistry 管 serial                                               |
| `stacked_survey_reward` | `Coin<sSSR>`；TreasuryCap 封裝                                                                                       |
| `survey_vault`          | 問卷預算池；`claim` 驗 pass + sub_hash 去重 + 名額；`create/fund` 收 0.3% 費                                         |
| `amm_pool`              | bonding curve：`sssr = sui_mist × DECAY / (DECAY + total_invested)`（DECAY = 1000 SUI）；`redeem` 燒 sSSR 收 0.3% 費 |
| `survey_registry`       | 上鏈加密 blob（完整 blob，非 hash）；`archive` 僅 creator 可呼叫                                                     |

整合測試：`test_full_lifecycle_a_to_c`（Flow A→B→C，29/29 綠）；Devnet 真實部署成功。

新增 `survey_vault::id_of(&SurveyVault): ID` helper，供 PTB 把剛建立的 vault ID 傳給 `registry::register`。

### M2 Sponsored Transactions 整合

- 選型記錄：Shinami vs Mysten Enoki → 見 [docs/gas-station.md](../../docs/gas-station.md)
- `frontend/src/lib/sponsoredTx.ts`：build PTB → Dry Run → Gas Station → 廣播；錯誤分類三類
- Dry Run sad-path 驗證：無效 pass / 重複 sub_hash / 名額滿，三種皆在 Dry Run 階段被拒，sponsor 不簽
- 首次登入透過 Sponsored TX 自動發 SurveyPass（受訪者 0 SUI）

### M3 加密問卷答案

- 方案選型：AES-GCM + 錢包衍生金鑰（MVP）；v2 評估遷 Mysten Seal
- `frontend/src/lib/crypto.ts`：
  - `encryptSurveyContent` / `decryptSurveyContent`（blob 格式：`[32B pubkey | 12B iv | ciphertext]`）
  - `deriveCreatorKeyPair`（SHA-256(walletSig) → X25519 deterministic keypair）
  - `encryptAnswers` / `decryptAnswers`（ECIES：`[32B ephemeral_pubkey | 12B iv | ciphertext]`）
- `frontend/src/lib/dashboardDecrypt.ts`：
  - `fetchClaimedEvents` / `decryptAllResponses` / `aggregateStats`
  - 批次解密，失敗計入 `failed` 欄位

### M4 Frontend（重寫）

6 路由全部完成：

| 路由                  | 主要工作                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/create`             | Markdown editor + YAML frontmatter preview；localStorage draft                                                                                                                                                   |
| `/fund/:id`           | 估算 SUI 消耗（bonding curve + 0.3%）；6-command PTB atomic（splitCoins / invest_and_mint / vault::create / vault::id_of / registry::register / vault::share_vault）；從 `objectChanges` 抽 vault_id / survey_id |
| `/s/:id`              | 拉鏈上加密 blob → 解密 → 渲染問卷；自動補發 SurveyPass；Sponsored TX 送答案                                                                                                                                      |
| `/redeem`             | 列出持有的所有 sSSR；呼叫 `amm_pool::redeem`                                                                                                                                                                     |
| `/dashboard/:vaultId` | 點解密才動錢包；Recharts 逐題長條圖；`buildClosePtb`（僅 creator + ACTIVE 可用）                                                                                                                                 |
| `/`（landing）        | fallback `*` → LandingPage                                                                                                                                                                                       |

`frontend/src/lib/ptb.ts`：新增 `estimateFundCost` / `buildCreateSurveyPtb` / `extractVaultIdFromEffects` / `extractSurveyIdFromEffects` / `buildClosePtb`。

### M5 無狀態 BFF

- `GET /stats/:vaultId`：Sui events 聚合 + LRU 記憶體快取 60s
- `GET /og/:surveyId`：爬蟲 UA → 動態 OG HTML；一般 UA → 302 前端
- 啟動安全檢查（`assertSecureEnv()`）：偵測到 `ADMIN_PRIVATE_KEY` 直接 crash

### M6 E2E + Demo

- `frontend/e2e/lifecycle.spec.ts`：完整 Flow A→B→C（Mock Wallet Standard + Devnet 真合約 + Gas Station）
- `frontend/e2e/sad-path.spec.ts`：重複填答 / 名額滿，兩種 Dry Run 422 拒絕路徑
- `DEMO_SCRIPT.md`：5 分鐘 walkthrough + `docs/screenshots/` 真實 Devnet TX

---

## 錯誤修復紀錄

| 位置                                           | 症狀                                                                                              | 修復                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `dashboardDecrypt.ts` `fetchClaimedEvents`     | Devnet RPC 對 `ID` 型別欄位的 `MoveEventField` 過濾回傳 `Invalid params`，dashboard 永遠顯示 0 筆 | 改用 `MoveEventType` only 過濾，捨棄 `All + MoveEventField` 組合 |
| `lifecycle.spec.ts` Step 2（注資導航）         | FundPage 內部對交易結果做 5 輪 retry，導致 `expect(page).toHaveURL` 提前 timeout                  | 注資導航斷言 timeout 從預設拉到 30s                              |
| `lifecycle.spec.ts` Step 6（dashboard 回覆數） | Devnet event indexer 延遲，dashboard 剛載入時 event 尚未索引到，斷言失敗                          | 改用 `expect.toPass` polling reload，吸收 indexer 延遲           |

---

## Definition of Done 驗收結果

| 驗收項目                                                            | 結果                   |
| ------------------------------------------------------------------- | ---------------------- |
| `pnpm -r build && pnpm -r test`（frontend 62 + bff 14 + scripts 5） | ✅ 全綠                |
| `pnpm move:test`（29/29）                                           | ✅ 全綠                |
| `pnpm deploy:Devnet`                                                | ✅ 成功，pool 驗證通過 |
| `pnpm dev`（BFF 3000 + Vite 5173）                                  | ✅ 正常起服            |
| lifecycle.spec — 受訪者 0 SUI 填答全流程                            | ✅ 27.6s（devnet）     |
| sad-path.spec — Dry Run 拒絕兩種路徑                                | ✅ 1.4m（devnet）      |
