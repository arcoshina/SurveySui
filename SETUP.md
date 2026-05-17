# SurveySui — Windows 原生開發環境設定

> 目標讀者：在 Windows 11 上開發 SurveySui 的人。
> 路線：**Win 原生**（PowerShell + scoop），不走 WSL。
> 上游：[README.md](README.md) §快速開始 引用本檔。

---

## 為什麼用 Win 原生（而非 WSL）

- 跨檔案系統 I/O 慢（從 Windows 看 WSL 的 `\\wsl$\...` 或反過來都會掉 5–10x 速度）
- Claude Code / VSCode 直接在 Win 上跑省去 Remote-WSL 來回切換成本
- Sui CLI / Node 24 / PostgreSQL 18 在 Win 上都有官方 binary，沒必要再多一層

> 若你已有 WSL 環境且運作正常，本檔的命令也大多可以在 WSL bash 裡微調後使用，但本檔以 PowerShell 為主。

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
git config --global user.name "wesleyshun2"
git config --global user.email "wesleyshun2@gmail.com"
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

## Step 2 — Sui CLI（testnet）

```powershell
scoop bucket add extras
scoop install sui
sui --version
```

若 scoop bucket 沒有最新 testnet 版本，fallback：到 [Sui releases](https://github.com/MystenLabs/sui/releases) 抓 `sui-testnet-vX.Y.Z-windows-x86_64.tgz`，解壓後把 `sui.exe` 丟到 `%USERPROFILE%\scoop\shims\` 或任一 PATH 路徑。

### 設定 testnet 環境 + admin 錢包

```powershell
# 第一次跑會問要連哪個網路，選 testnet，URL 填 https://fullnode.testnet.sui.io:443
sui client

# 或手動：
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet

# 產 admin address（記下 mnemonic！）
sui client new-address ed25519 admin

# 查看 active address + 領 testnet SUI
sui client active-address
sui client faucet
sui client balance
```

> **取出 admin private key**（後面 `.env` 要用）：
> ```powershell
> sui keytool export --key-identity <admin-address>
> ```
> 取 `aliasedPrivateKey` 的 hex，去掉 `0x` 前綴，填到 `.env` 的 `SUI_ADMIN_PRIVATE_KEY`。

---

## Step 3 — PostgreSQL ≥ 16（scoop 18.4）

```powershell
scoop install postgresql
```

啟動／停止（repo 根目錄已備好 cmd 腳本）：

```powershell
# 啟動
.\scripts\start-pg.cmd

# 停止
.\scripts\stop-pg.cmd
```

> scoop 的 PostgreSQL 預設 data 目錄在 `%USERPROFILE%\scoop\persist\postgresql\data`。
> 第一次啟動前若 data 目錄是空的，需要先 `initdb -D <data-dir> -U postgres`，scoop 通常會自動做。

建立開發用 user + database：

```powershell
psql -U postgres -h 127.0.0.1 -c "CREATE USER surveysui WITH PASSWORD 'dev_password';"
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE surveysui_dev OWNER surveysui;"

# 驗證可連線
psql -h 127.0.0.1 -U surveysui -d surveysui_dev -c "SELECT version();"
```

`DATABASE_URL`（已寫在 `.env.example`）：

```
postgresql://surveysui:dev_password@127.0.0.1:5432/surveysui_dev
```

> ⚠️ **用 `127.0.0.1` 不要用 `localhost`**：Win 原生 PostgreSQL 在 IPv6 解析有時會卡住。

---

## Step 4 — Google OAuth Client（zkLogin 用）

T2.2 / Flow B 受訪者登入會用到：

1. 開 https://console.cloud.google.com/
2. 建立 Project（例如 `SurveySui-dev`）
3. **APIs & Services → Credentials → Create OAuth client ID**
4. Application type: **Web application**
5. Authorized redirect URIs 至少加：
   - `http://localhost:3000/auth/google/callback`
   - `http://localhost:5173/auth/google/callback`
6. 取得 `Client ID` 與 `Client Secret`，填進 `.env`

---

## Step 5 — Repo 初始化

```powershell
# 在 repo 根目錄
pnpm install

# 複製環境變數範本
Copy-Item .env.example .env
# 編輯 .env，填入：
#   SUI_ADMIN_PRIVATE_KEY / SUI_ADMIN_ADDRESS
#   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
# （SUI_PACKAGE_ID 等 object ID 在 `pnpm deploy:testnet` 後會自動寫回）

# 跑 DB migration
cd backend
pnpm db:migrate
cd ..

# 全部 build + 單元測試 + 合約測試
pnpm -r build
pnpm -r test
pnpm move:test
```

---

## Step 6 — 部署合約到 Testnet（T1.7）

```powershell
pnpm deploy:testnet
```

這會跑 `scripts/src/init.ts`：

1. `sui move build` + `sui client publish` 部署 package
2. mint 種子 RWD
3. 開 RWD/SUI pool 並注入初始流動性
4. 把所有 object ID 寫回 `.env`（`SUI_PACKAGE_ID`、`RWD_TREASURY_CAP_ID`、`AMM_POOL_ID`、`SBT_REGISTRY_ID`）

驗證：

```powershell
sui client object <AMM_POOL_ID>
# 應看到 reserve_a / reserve_b 兩邊都 > 0
```

---

## Step 7 — 跑開發伺服器

```powershell
# 在 repo 根目錄，同時起 backend (3000) + frontend (5173)
pnpm dev
```

開瀏覽器：

| 服務 | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend health | http://localhost:3000/health |

---

## Step 8 — 跑 e2e（Playwright）

```powershell
cd frontend
pnpm exec playwright install
pnpm exec playwright test
```

> 新版 e2e 規劃見 [Tasks.md](Tasks.md) M6：Playwright 直接跑真 testnet 合約 + 真 Gas Station，不再用 `page.route()` mock。

---

## VSCode 設定

裝下列 extension（在 Win 端，不是 Remote-WSL）：

- **ESLint**
- **Prettier**
- **Move on Sui**（Mysten Labs 官方）— Move syntax highlight
- **Prisma** — schema 高亮 + 自動補全
- **Tailwind CSS IntelliSense**
- **Claude Code**（如果用）

---

## 常見問題

### `psql` 連線失敗、卡住不回

九成是 `localhost` 走 IPv6。改 `127.0.0.1`，或在 `pg_hba.conf` 加：
```
host  all  all  ::1/128  scram-sha-256
```

### `sui client faucet` 拿不到 SUI

Testnet faucet rate limit，等 5-10 分鐘再試一次；或從 [Sui Discord](https://discord.gg/sui) 的 `#testnet-faucet` 頻道領。

### `pnpm install` 慢／失敗

確認你不是在 OneDrive 同步資料夾下開發。把 repo 移到 `D:\Users\<user>\Documents\GitHub\` 之外的純本機路徑會更穩。

### Move 編譯找不到依賴

```powershell
cd contracts
sui move build --skip-fetch-latest-git-deps
```

---

## 驗證一切就緒

```powershell
# 全部要有版本號
node -v
pnpm -v
sui --version
psql --version

# Sui testnet 連線
sui client active-env       # testnet
sui client active-address   # 0x...
sui client balance          # 有 SUI

# Postgres 連線
psql -h 127.0.0.1 -U surveysui -d surveysui_dev -c "SELECT 1;"

# Repo build
pnpm -r build
pnpm -r typecheck
```

全綠就 ok。

---

## 下一步

- 看 [Tasks.md](Tasks.md) 確認目前進度（M0 基建 → M1 合約是當前主軸）
- 看 [DEMO_SCRIPT.md](DEMO_SCRIPT.md) 試跑 5 分鐘 demo
- 看 [MVP_TDD.md](MVP_TDD.md) 理解架構與設計決策
