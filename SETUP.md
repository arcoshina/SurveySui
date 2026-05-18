# SurveySui — Windows 原生開發環境設定

> 目標讀者：在 Windows 11 上開發 SurveySui 的人。
> 路線：**Win 原生**（PowerShell + scoop），不走 WSL。
> 上游：[README.md](README.md) §快速開始 引用本檔。

---

## 為什麼用 Win 原生（而非 WSL）

- 跨檔案系統 I/O 慢（從 Windows 看 WSL 的 `\\wsl$\...` 或反過來都會掉 5–10x 速度）
- VSCode / Claude Code 直接在 Win 上跑省去 Remote-WSL 來回切換成本
- Sui CLI / Node 24 在 Win 上都有官方 binary，沒必要再多一層

---

## Step 0 — 前置工具

需要先有的：

| 工具 | 安裝方式 |
|---|---|
| **Git for Windows** | https://git-scm.com/download/win |
| **scoop** | PowerShell：`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`，再 `irm get.scoop.sh \| iex` |
| **Windows Terminal** | Microsoft Store（可選，但比預設 PowerShell 視窗好用） |

設定 git（換成你的）：

```powershell
git config --global user.name "your-username"
git config --global user.email "your-email@example.com"
git config --global init.defaultBranch main
git config --global core.autocrlf true
```

---

## Step 1 — Node.js ≥ 24 + pnpm ≥ 9

```powershell
scoop install nodejs-lts
node -v   # v24.x.x
npm install -g pnpm@9
pnpm -v   # 9.x.x
```

---

## Step 2 — Sui CLI (Devnet)

```powershell
scoop bucket add extras
scoop install sui
sui --version
```

若 scoop bucket 沒有最新 devnet 版本，fallback：到 [Sui releases](https://github.com/MystenLabs/sui/releases) 抓 `sui-devnet-vX.Y.Z-windows-x86_64.tgz`，解壓後把 `sui.exe` 丟到 `%USERPROFILE%\scoop\shims\` 或任一 PATH 路徑。

### 設定 Devnet 環境 + Admin 錢包

```powershell
# 第一次執行會詢問要連哪個網路，選 devnet，URL 填 https://fullnode.devnet.sui.io:443
sui client

# 或手動設定：
sui client new-env --alias devnet --rpc https://fullnode.devnet.sui.io:443
sui client switch --env devnet

# 產生 admin address（請務必記下助記詞！）
sui client new-address ed25519 admin

# 查看當前作用中地址、領取 Devnet SUI 並查詢餘額
sui client active-address
sui client faucet
sui client balance
```

> **取出 admin private key**（後面 `.env` 設定要用）：
> ```powershell
> sui keytool export --key-identity <admin-address>
> ```
> 複製輸出的 `aliasedPrivateKey` hex 字串，去掉 `0x` 前綴，填到 `.env` 的 `SUI_ADMIN_PRIVATE_KEY` 欄位中。

---

## Step 3 — Repo 初始化

```powershell
# 在專案根目錄
pnpm install

# 複製環境變數範本
Copy-Item .env.example .env
# 編輯 .env，填入：
#   SUI_ADMIN_PRIVATE_KEY
#   SUI_ADMIN_ADDRESS
# （其餘合約 Object ID 在 `pnpm deploy:Devnet` 後會自動寫回）

# 全域編譯與單元測試、合約測試
pnpm -r build
pnpm -r test
pnpm move:test
```

---

## Step 4 — 部署合約到 Devnet

```powershell
pnpm deploy:Devnet
```

這會執行 `scripts/src/init.ts`：

1. `sui move build` + `sui client publish` 部署合約 package
2. 自動建立共享物件（`SsrTreasury`、`SssrTreasury`、`SurveyRegistry`）
3. 初始化 `amm_pool` 共享物件（無須初始資金，空池啟動）
4. 將所有部署成功的物件 ID 自動寫回 `.env` 和 `.env.shared` 中（`SUI_PACKAGE_ID`、`SSR_TREASURY_ID`、`SSSR_TREASURY_ID`、`AMM_POOL_ID`、`SURVEY_REGISTRY_ID`）

---

## Step 5 — 啟動本地開發伺服器

```powershell
# 在專案根目錄，同時啟動無狀態 BFF (3000) 與前端開發伺服器 (5173)
pnpm dev
```

開啟瀏覽器存取：

| 服務 | URL |
|---|---|
| 前端 | http://localhost:5173 |
| BFF 健康檢查 | http://localhost:3000/health |

---

## Step 6 — 跑 E2E 測試（Playwright）

```powershell
cd frontend
pnpm exec playwright install
pnpm exec playwright test
```

> E2E 測試規劃見 [Tasks.md](Tasks.md) M6：Playwright 直接跑真實 Devnet 合約與真 Gas Station，不採用 mock。

---

## VSCode 推薦設定

建議在 Windows 端安裝下列延伸模組：

- **ESLint**
- **Prettier**
- **Move on Sui**（Mysten Labs 官方，Move 語法高亮）
- **Tailwind CSS IntelliSense**

---

## 常見問題

### `sui client faucet` 拿不到 SUI

Devnet Faucet 有速率限制，若失敗請等 5-10 分鐘再試；或前往 [Sui Discord](https://discord.gg/sui) 的 `#devnet-faucet` 頻道手動領取。

### `pnpm install` 慢或失敗

請確認您不在 OneDrive 同步資料夾下開發。將 repo 移動到本機路徑（例如非 GitHub 同步的純本機資料夾）將使 pnpm 與 node 運作更穩定。

---

## 驗證一切就緒

```powershell
# 全部要有版本號
node -v
pnpm -v
sui --version

# Sui Devnet 連線與餘額驗證
sui client active-env       # devnet
sui client active-address   # 0x...
sui client balance          # 有 SUI 餘額

# 專案編譯與測試
pnpm -r build
pnpm -r typecheck
pnpm move:test
pnpm test
```

全綠即代表開發環境設定就緒。

---

## 下一步

- 閱讀 [Tasks.md](Tasks.md) 確認目前進度與里程碑。
- 閱讀 [DEMO_SCRIPT.md](DEMO_SCRIPT.md) 了解 5 分鐘 demo 跑測流程。
- 閱讀 [MVP_TDD.md](MVP_TDD.md) 理解架構與核心設計決策。
