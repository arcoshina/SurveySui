# SurveySui — 手動驗收腳本

> **網路**：Sui Devnet
> **前端**：`http://localhost:5173`
> **BFF**：`http://localhost:3100`

---

## 一、啟動環境

```powershell
# 根目錄執行（pnpm 若不在 PATH，先補）
$env:PATH = "C:\Users\Arco_asus\AppData\Roaming\npm;" + $env:PATH
pnpm dev
```

啟動後確認：

```powershell
# BFF 健康檢查（另開 terminal）
curl http://localhost:3100/health
# 預期：{"status":"ok"}
```

瀏覽器打開 `http://localhost:5173`。

---

## 二、測試模式說明

| 測試方式                        | 適用情境                                | 命令                                                                |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| **Playwright 有頭模式**（推薦） | 完整 Flow A→B→C 含鏈上 Gas Sponsored TX | `pnpm exec playwright test frontend/e2e/lifecycle.spec.ts --headed` |
| **手動 UI 測試**                | 發起者流程（建立 + 注資 + Dashboard）   | 直接用瀏覽器                                                        |

> **注意**：受訪者的兩個步驟（SurveyPass 領取 `/api/pass/issue`、Sponsored TX `/api/gas/sponsor`）需要有 Admin 私鑰的後端服務。目前這兩個端點由 Playwright E2E 在測試執行時動態 mock，**不在 BFF 的功能範圍**（BFF 啟動時強制禁止帶 Admin 私鑰，見 T5.3）。手動測試若要走完整流程，請使用 Playwright 有頭模式。

---

## 三、Playwright 有頭模式（完整流程）

```powershell
# happy-path：建立 → 注資 → 受訪者填答（0 SUI Sponsored）→ 兌換 → Dashboard
cd frontend
pnpm exec playwright test e2e/lifecycle.spec.ts --headed

# sad-path：重複填答被拒 + 名額滿被拒
pnpm exec playwright test e2e/sad-path.spec.ts --headed
```

預期輸出：

```
✓  test_full_flow_a_to_c_real_chain      (~20–40 秒，含 Devnet indexer 延遲)
✓  test_duplicate_response_rejected_by_dry_run
✓  test_quota_exceeded_rejected
```

---

## 四、手動 UI 測試（發起者流程）

### 步驟 1 — 建立問卷 `/create`

打開 `http://localhost:5173/create`

**頁面結構**：左側 Markdown 編輯器 + 右側即時預覽（獎勵設定 + Markdown 渲染）

清空預設模板，貼入以下內容：

```
---
title: "Sui Overflow 2026 滿意度調查"
perResponse: 1
maxResponses: 5
deadline: "2027-06-30T23:59:59Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "您最喜歡 Sui 的哪個特性？"
    required: true
    options:
      - Move 語言
      - Object model
      - 低 gas
  - id: q2
    type: SHORT_ANSWER
    prompt: "有什麼建議？"
    required: false
---

在 Sui Overflow 黑客松中，您對開發體驗有什麼看法？
```

**驗收點**：

- [x] 右側「獎勵設定預覽」立即更新：perResponse = 1、maxResponses = 5、deadline = 2027-06-30...、預估總獎勵 = 5 sSSR
- [x] 「加密問卷題目（推薦，防範鏈上窺探並保護隱私）」checkbox 預設已勾
- [x] 輸入無效 YAML 或留空 → 右側顯示紅字錯誤、不導頁

點「**下一步：前往注資 →**」→ 自動跳至 `/fund/:draftId`

---

### 步驟 2 — 注資問卷金庫 `/fund/:draftId`

**頁面顯示**：每份獎勵、名額上限、獎勵總額、平台手續費（0.3%）、預估 SUI 消耗（含 1% 滑點緩衝）

1. 點「**Connect Wallet**」連接 Creator 錢包（需有 Devnet SUI ≥ 1）
2. 等費用估算欄位從「計算中…」變為具體數字
3. 點「**一鍵注資**」

**注資分兩次簽名**：

- 第一次：Personal Message 簽名（錢包衍生加密金鑰，用來加密問卷內容）
- 第二次：Transaction 簽名（atomic PTB：invest_and_mint + vault::create + registry::register）

**驗收點**：

- [x] 費用欄位正確顯示（非「計算中…」）
- [x] 錢包彈出兩次：第一次是 personal message，第二次是交易
- [x] 成功後自動跳至 `/dashboard/:vaultId#<contentKey>`
- [x] 失敗（簽名拒絕 / PTB 建構錯誤）→ 頁面顯示紅字 alert

> Devnet faucet：`sui client faucet --url https://faucet.devnet.sui.io`

---

### 步驟 3 — 發起者 Dashboard `/dashboard/:vaultId`

注資成功後自動跳轉，或從步驟 2 成功後的 URL 複製再打開。

**頁面顯示**：

- Vault ID（完整 hex）
- 三個數據卡：回覆數 / 名額上限 / Vault 餘額（鏈上即時）

**驗收點**：

- [x] Vault 餘額顯示正確 sSSR 數量（非「查詢中…」）
- [x] 名額上限顯示 `5`（即 maxResponses）
- [x] 回覆數顯示 `0`（尚無填答）
- [x] 狀態欄顯示「進行中」

**解密功能**（有回覆後才可操作）：

1. 點「**解密回覆並查看統計**」
2. 錢包彈出 personal message 簽名（衍生解密金鑰）
3. 批次解密鏈上加密答案 → Recharts 長條圖

**結束活動**：

- 「**結束活動**」按鈕：僅限 Creator + 狀態為進行中時可點
- 非 Creator 或已結束 → 按鈕灰化

---

### 步驟 4 — 兌換頁 `/redeem`（需先有 sSSR）

> 此頁面需受訪者已填答並取得 sSSR 憑證。手動測試需先跑 Playwright 有頭模式讓受訪者錢包拿到 sSSR，再切換到受訪者錢包開啟此頁。

打開 `http://localhost:5173/redeem`

**驗收點**：

- [x] 未連錢包 → 顯示「請先連接錢包」提示
- [x] 連錢包後自動列出所有 sSSR 憑證（ID + 額度）
- [x] 點「**兌換**」→ 錢包彈出交易簽名（需少量 SUI 支付 Gas）
- [x] 成功 → 頁面顯示「兌換成功！」+ TX hash；列表自動重整

---

### 步驟 5 — 受訪者問卷頁 `/s/:vaultId#contentKey`

> 受訪者用 URL（從 `/dashboard/:vaultId#contentKey` 複製 `vaultId` 部分）打開。

打開 `http://localhost:5173/s/<VAULT_ID>#<CONTENT_KEY>`

**驗收點**：

- [x] 未連錢包 → 顯示「請連接錢包」全頁提示
- [x] 連錢包後：從鏈上拉加密 blob → 解密 → 渲染問卷標題 + 各題
- [x] 選完答案點「**預覽答案**」：若無 SurveyPass → 跳至通行證領取頁
- [x] 通行證領取頁：輸入 Email → 點「**確認免費領取**」→ 呼叫 `/api/pass/issue`
  - 手動測試此步驟會 404（BFF 無此端點）
  - Playwright 有頭模式會 mock 此端點（真正上鏈發 pass）

---

## 五、受訪者完整填答流程（Playwright 有頭模式下觀察）

Playwright 有頭模式執行時，你可以在瀏覽器視窗觀察以下每個步驟：

1. 建立問卷 → 自動填 Markdown 並點「下一步」
2. 連接 Mock Wallet → 費用估算顯示 → 「一鍵注資」→ 兩次自動簽名
3. 跳轉 Dashboard → 抽出 vaultId + contentKey
4. 切換至受訪者帳號（0 SUI）→ 打開 `/s/:vaultId#key`
5. 連接 Mock Wallet → 問卷渲染 → 選答案 → 「預覽答案」
6. **SurveyPass 領取**：輸入 Email → 「確認免費領取」→ BFF mock 代簽上鏈
7. 返回問卷 → 再次「預覽答案」→ 確認畫面 → 「確認提交」
8. **Sponsored TX**：BFF mock dry-run → 代付 Gas → 上鏈 → 「提交成功！」
9. 切換至 Redeem 頁 → Creator 先轉 0.5 SUI 給受訪者 → 「兌換」→「兌換成功！」
10. 切換回 Creator → Dashboard：polling 等 Devnet indexer → 回覆數 = 1

---

## 六、鏈上查詢（Devnet）

```
https://devnet.suivision.xyz/txblock/<TX_DIGEST>
```

| 物件               | ID                                                                   |
| ------------------ | -------------------------------------------------------------------- |
| SUI_PACKAGE_ID     | `0x29e04f738842cd0d3651293187304084b089b3a6d5ee6daa4633f529622450b9` |
| AMM_POOL_ID        | `0xf5f6c69c8319631b301c59e2ae463b02870e031667d32d8337c11b4cb8afb260` |
| SURVEY_REGISTRY_ID | `0x535e687291960f157ed57347a163891d98654b4421e4e3f7930a9bf681fdd6e1` |
| PASS_REGISTRY_ID   | `0x4d10ba16b624a190ef9d3336e9f3dd6c5b1f397f71f47de7def48c3bae5b7b44` |
| 注資 TX 樣本       | `2dN2cPqQnSsKEFLgBp9BuDaEdrqnmqe7TZjNsDa7zXdU`                       |

---

## 七、備用問答

**Q：為什麼手動測試受訪者提交會失敗？**

> 受訪者填答需要兩個 Admin 私鑰操作：發 SurveyPass（`/api/pass/issue`）和代付 Gas（`/api/gas/sponsor`）。BFF 啟動時刻意禁止帶 Admin 私鑰（T5.3 安全設計）。Playwright E2E 透過 `page.route()` 在測試層面 mock 這兩個端點，讓真實上鏈得以完成。完整手動體驗請使用 `--headed` 模式。

**Q：受訪者 SUI 餘額 0 怎麼完成填答？**

> Sponsored Transactions（代付 Gas）。前端把 PTB 送給 `/api/gas/sponsor`，後端 dry-run 確認合法後代付 Gas 廣播上鏈。受訪者只需簽名，不消耗自己的 SUI。

**Q：答案的隱私怎麼保護？**

> 答案以 ECIES（X25519 + AES-GCM）加密後上鏈，只有 Creator 用錢包 personal message 衍生的私鑰才能解密。BFF 拿不到解密金鑰。

**Q：sSSR 和 SSR 有什麼差別？**

> `stakedSurveySuiReward`（sSSR）是填答後拿到的質押憑證，可在 `/redeem` 換成 `SurveySuiReward`（SSR）代幣。池中 SUI 越多，兌換比例越高。

**Q：注資 PTB 包含幾個合約呼叫？**

> 六個 command，三個核心 MoveCall：`amm_pool::invest_and_mint`（SUI → sSSR）、`survey_vault::create`（建金庫 + 收 0.3% 費）、`survey_registry::register`（加密 blob 上鏈）。三個呼叫 atomic，全成功或全失敗。
