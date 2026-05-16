# SurveySui — Windows 開發環境設定

> 遷移自 WSL 環境，現在直接在 Windows 原生開發。
> 需要跑 Linux-only 腳本時才進 WSL，其他開發流程都在 Windows 完成。

---

## 已完成的工具安裝

| 工具 | 版本 | 安裝位置 |
|------|------|---------|
| Node.js | v25.9.0 | 系統 |
| pnpm | v9.15.9 | npm global (`C:\Users\Arco_asus\AppData\Roaming\npm`) |
| Sui CLI | v1.72.1 | `C:\sui\sui.exe` |
| git | v2.52.0 | 系統 |

---

## 環境驗證

開新的 PowerShell（PATH 會自動讀到 `C:\sui` 和 npm global）：

```powershell
node --version    # v25.x.x
pnpm --version    # 9.x.x
sui --version     # 1.72.1-...
git --version     # 2.52.x
```

---

## 待完成

### Sui testnet 錢包設定

```powershell
# 第一次執行，選 testnet，RPC 填 https://fullnode.testnet.sui.io:443
sui client

# 建 admin address（記下 mnemonic！）
sui client new-address ed25519 admin

# 確認連線
sui client active-env
sui client active-address

# 領 testnet SUI
sui client faucet
sui client balance
```

### PostgreSQL（後端開發時才需要）

選項 A — 直接安裝（推薦）：
從 https://www.postgresql.org/download/windows/ 下載 v16 安裝程式

選項 B — Docker Desktop：
```powershell
docker run -d --name surveysui-pg `
  -e POSTGRES_USER=surveysui `
  -e POSTGRES_PASSWORD=dev_password `
  -e POSTGRES_DB=surveysui_dev `
  -p 5432:5432 `
  postgres:16
```

`DATABASE_URL`：
```
postgresql://surveysui:dev_password@localhost:5432/surveysui_dev
```

---

## Google OAuth（zkLogin 用，T2.2 才需要）

1. 開 https://console.cloud.google.com/
2. 建 Project（例如 `SurveySui-dev`）
3. APIs & Services → Credentials → OAuth client ID → Web application
4. Redirect URIs：
   - `http://localhost:3000/auth/google/callback`
   - `http://localhost:4000/auth/google/callback`
5. 把 Client ID 和 Client Secret 存好，放進 `.env`

---

## 下一步

開始 T0.1 monorepo 初始化：
> 「幫我建立 T0.1 的 monorepo 骨架」

會建立 `pnpm-workspace.yaml`、三個 package 的 `package.json`、共用 tsconfig、`.env.example`。

## VS Code 設定

直接以 Windows 本地模式開啟 `d:\Users\Arco_asus\Documents\GitHub\SurveySui`（不用 Remote-WSL）。

推薦安裝的 Extension：
- Move (by Mysten Labs)
- Prisma
- ESLint
- Prettier
- Tailwind CSS IntelliSense
