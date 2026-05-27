# Devnet 重置後重新部署 SOP

當 Sui devnet 被官方重置、或本地 `.env` 中的 `SUI_PACKAGE_ID` 已在鏈上查不到，跑這份流程把所有合約物件重新發一次、把新 ID 寫回各份 `.env`。

---

## 何時用這份文件

- `sui client object <SUI_PACKAGE_ID>` 在 devnet 回 `Object not found`。
- 前端 console 出現 `Object 0x... is not a Move object` 或類似錯誤。
- 任何時候 Sui 官方公告 devnet reset。

---

## 前置檢查

1. `sui --version` 可執行。
2. repo 根目錄 `.env` 內 `SUI_ADMIN_PRIVATE_KEY` 與 `SUI_ADMIN_ADDRESS` 還是同一把 keypair（**不要重新生**，否則 BFF 內舊資料對不上）。
3. 已跑過 `pnpm install`（包含 `scripts/` workspace 的相依）。
4. `bff/` 與 `frontend/` 目前若在跑，先 Ctrl+C 停掉，避免它們在 deploy 過程持續打舊 ID。

---

## 一鍵指令

在 repo 根目錄執行：

```powershell
pwsh docs/Reset/redeploy-devnet.ps1
```

腳本會依序做 6 件事，全程不需互動：

| 步驟 | 動作                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `sui client switch --env devnet` 切到 devnet 並設為 active env                                                                                                                                               |
| 2    | 對 `.env` 中的 `SUI_ADMIN_ADDRESS` 領一次 devnet faucet                                                                                                                                                      |
| 3    | 刪掉 `contracts/Pub.devnet.toml` 與 `contracts/Move.lock` 中的 `[env.devnet]` 區塊（避免 stale chain-id 阻擋 publish）                                                                                       |
| 4    | 跑 `pnpm deploy:Devnet`（= `tsx scripts/src/init.ts`），完成 publish + `amm_pool::init_pool` + `survey_pass::set_issuer_pubkey`，並把 7 個新 ID 寫進 root `.env`、`.env.shared`、`frontend/.env`、`bff/.env` |
| 5    | 從更新後的 `.env` 印出 7 個新合約 ID                                                                                                                                                                         |
| 6    | 印出後續手動步驟（重啟服務、清 localStorage）                                                                                                                                                                |

跑完應該看到：

```
[5/6] 新合約 ID 摘要（從 .env 讀回）…
SUI_PACKAGE_ID=0x...
SR_TREASURY_ID=0x...
SSR_TREASURY_ID=0x...
AMM_POOL_ID=0x...
SURVEY_REGISTRY_ID=0x...
PASS_REGISTRY_ID=0x...
ISSUER_CONFIG_ID=0x...
```

---

## 完成後手動步驟

1. **重啟 BFF**：`cd bff; pnpm dev`
2. **重啟 Frontend**：`cd frontend; pnpm dev`
3. **清瀏覽器 localStorage**：把 `survey:*`、`draft:*`、`pass:*` 等 key 全清掉，重新連錢包。
4. （選擇性）**DB 清理**：`surveysui_dev` 內 `surveys` 表若有舊 `package_id` 紀錄，自行決定是否 `TRUNCATE`，本腳本不會動 DB。

5. **執行 `npx tsx scratch/fund_issuer.ts` 補 gas**

---

## 手動 Fallback

若一鍵腳本某一步失敗，可以單獨重跑對應的指令：

```powershell
# 1. 切環境
sui client switch --env devnet
sui client active-env   # 確認回傳 devnet

# 2. 領 gas
sui client faucet --address <SUI_ADMIN_ADDRESS>
sui client gas          # 確認有可用 coin

# 3. 清 stale 紀錄
Remove-Item contracts/Pub.devnet.toml -ErrorAction SilentlyContinue
# Move.lock 內若有 [env.devnet] 區塊，手動刪掉那一段

# 4. 重發合約
pnpm deploy:Devnet
```

---

## 常見錯誤排查

| 訊息                                  | 原因 / 解法                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Insufficient gas`                    | faucet 沒領到或被 rate-limit。等 30 秒後再 `sui client faucet --address <addr>`。                                                                    |
| `Package 0x... not found`             | `sui client active-env` 不是 devnet。重跑步驟 1。                                                                                                    |
| `chain-id mismatch`                   | `Move.lock` 或 `Pub.devnet.toml` 還留著舊 chain-id。重跑步驟 3，或手動刪除整份 `Move.lock` 後重 build。                                              |
| `EDuplicateSurvey`                    | **不會在 reset 場景出現**。若只是想清空 `SurveyRegistry`（不重置整個 devnet），改跑 `pnpm --filter scripts exec tsx scripts/src/reset-registry.ts`。 |
| `SUI_ADMIN_ADDRESS not found in .env` | `.env` 缺欄位。對照 `.env.example` 或 [docs/SETUP.md](../SETUP.md) 補上。                                                                            |

---

## 注意事項

- 所有鏈上舊的 Survey / Vault / Pass / Pool 物件在 devnet reset 後**全部變孤兒**，無法回收。
- 本腳本只更新合約 ID，**不會**動 PostgreSQL、不會清 BFF 的 issuer keypair（issuer pubkey 會用 `bff/.env` 中既有的 `SURVEY_PASS_ISSUER_PRIV` 推導後寫上鏈）。
- `pnpm deploy:Devnet` 用 `--build-env testnet` 編譯（見 [scripts/src/init.ts:50](../../scripts/src/init.ts#L50)）；對 devnet publish 沒有影響，但意味著 `Pub.devnet.toml` 平常不會被 deploy 流程寫入，第 3 步只是保險。

---

## 相關檔案

- 一鍵腳本：[redeploy-devnet.ps1](redeploy-devnet.ps1)
- 部署核心：[scripts/src/init.ts](../../scripts/src/init.ts)
- pnpm 入口：[package.json](../../package.json) 內 `deploy:Devnet`
- 初次安裝指南：[docs/SETUP.md](../SETUP.md)
