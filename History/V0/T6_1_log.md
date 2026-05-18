# M6 T6.1：E2E Happy-Path 全鏈路測試進度

> 狀態：**✅ 完成**（2026-05-18，於 Devnet 一次跑綠，耗時 19.4 秒）

---

## 🟢 已完成 & 修復

我們已成功將 E2E 腳本對齊真實 React 應用的 UX 與鏈上行為。沿途克服的問題如下：

### 1. Step 4（填答與通行證領取）

- **動態身份**：受訪者 email 改為帶 timestamp 的 `respondent_${Date.now()}@example.com`，避免鏈上 `EAlreadyActive` 因重複註冊 abort。
- **消除 race condition**：加上 `page.waitForResponse('**/api/pass/issue')`，在嘗試再次預覽問卷前等 pass API 回應完成 — 完美模擬真實用戶等待行為，確保前端狀態同步。
- **斷言修正**：提交成功斷言改為對 `h1` heading 的「提交成功！」做匹配。

### 2. Step 5（兌換）

- **路由修正**：兌換頁從 `/swap` 改為 `/redeem`。
- **受訪者 gas 注資**：發現受訪者需要 SUI gas 才能執行 swap，於 Step 5 開頭加上一筆 Creator → Respondent 的 **0.5 SUI** 鏈上轉帳。
- **Indexer 延遲緩衝**：轉帳後等 3 秒，讓 devnet RPC indexer 認得新的 gas coin，wallet standard 才查得到。

### 3. Step 2（注資導航 timeout 偶發）

- **修法**：把 `expect(page).toHaveURL(/\/dashboard\/.+/)` 的 timeout 從預設 5s 拉到 **30s**。
- **原因**：FundPage 的 `onSuccess` 內部對 `getTransactionBlock` 有 5 輪 1s retry 緩衝期，devnet event indexer 慢時可能耗到 5–8 秒才取得 `objectChanges`，預設 5s 不夠。
- 檔案：[frontend/e2e/lifecycle.spec.ts:519](frontend/e2e/lifecycle.spec.ts#L519)

### 4. Step 6（Dashboard 永遠看到 0 筆回覆）— **真正的硬骨頭**

- **症狀**：填答 TX 已成功上鏈、SurveyClaimed event 也有 emit，但 dashboard 一直顯示 `response-count = 0`，即使等 60 秒也不會變。
- **根因**：[frontend/src/lib/dashboardDecrypt.ts](frontend/src/lib/dashboardDecrypt.ts) 的 `fetchClaimedEvents` 用 `All + MoveEventField` 做 server-side 預過濾 `vault_id`。但 Devnet RPC **對 `ID` 型別欄位的 `MoveEventField` 過濾不支援**，會直接回傳 `Invalid params` 錯誤，SDK 吞掉錯誤後變成空陣列 — 看起來像「indexer 沒索引到」，其實是 API 設計問題。
- **驗證方式**：用 curl 對 devnet RPC 直接打：

  ```
  {"All":[
    {"MoveEventType":"...::survey_vault::SurveyClaimed"},
    {"MoveEventField":{"path":"/vault_id","value":"0x..."}}
  ]}
  ```

  回傳 `{"error":{"code":-32602,"message":"Invalid params"}}`。

- **修法**：移除 `MoveEventField` 預過濾，改為只用 `MoveEventType`，依賴既有的 client-side `vault_id === vaultId` filter 收尾。
- **檔案**：[frontend/src/lib/dashboardDecrypt.ts:62-77](frontend/src/lib/dashboardDecrypt.ts#L62-L77)
- **連動**：[frontend/src/__tests__/dashboardDecrypt.test.ts](frontend/src/__tests__/dashboardDecrypt.test.ts) 同步更新預期 query，9/9 仍綠。

### 5. Step 6（Indexer 延遲輪詢）

- 從固定 `waitForTimeout(4000)` 改為 `expect.toPass({ timeout: 60000, intervals: [3000] })` 輪詢 reload。
- **原因**：DashboardPage 只在 mount 拉一次 events，固定 sleep 抓不到 devnet event indexer 不可預測的延遲；輪詢 reload 能在事件可見的瞬間立即通過。
- **檔案**：[frontend/e2e/lifecycle.spec.ts:629-637](frontend/e2e/lifecycle.spec.ts#L629-L637)

---

## ✅ 最後一次成功測試的鏈上資訊

> 執行時間：2026-05-18 19:48 UTC+8｜耗時：**19.4 秒**｜結果：**1/1 綠**
>
> 全部物件可於 [SuiVision Devnet](https://devnet.suivision.xyz/) 或 [SuiScan Devnet](https://suiscan.xyz/devnet) 查詢。

### 部署資訊（共用）

| 項目 | 值 |
| --- | --- |
| Network | `devnet` |
| Package ID | `0x29e04f738842cd0d3651293187304084b089b3a6d5ee6daa4633f529622450b9` |
| Creator 地址 | `0x0b459e39bd7553e28c5641ab90ba8b015e4cdf153877791e0222e11695348a87` |
| Respondent 地址（本次 ephemeral） | `0xd818798fee2ac6335d4f4c2941068869da71030cf43bbe6b8e95575c935fa881` |

### Step 2 — 注資（Creator）：建立 Vault + 註冊 Survey

| 項目 | 值 |
| --- | --- |
| Tx Digest | `8uPdE2ABZr4TT65V6PSbtyfbEq9BKtvPvDX882Vwyu2N` |
| Status | ✅ success |
| Gas 消耗（Computation） | 0.001 SUI |
| Gas 消耗（Storage 淨） | 0.0097 SUI |
| 觸發事件 | `survey_registry::SurveyRegistered` |
| 建立 Vault | `0x218a5e3e4ed9f1fc16e1e137b411dd71cf49e68483145507b5234db4fa274457` |
| 註冊 Survey | `0x69f611dfd809929d21c94541eb3f47e68cfb08f536009f7f60ac57a53d9a4723` |
| Vault 當前狀態 | `status=0` (ACTIVE), `max_responses=2`, `claimed_count=1`, `balance=900,346,456 sSSR base units (~0.9 sSSR)` |

🔗 瀏覽：

- Tx：https://suiscan.xyz/devnet/tx/8uPdE2ABZr4TT65V6PSbtyfbEq9BKtvPvDX882Vwyu2N
- Vault：https://suiscan.xyz/devnet/object/0x218a5e3e4ed9f1fc16e1e137b411dd71cf49e68483145507b5234db4fa274457
- Survey：https://suiscan.xyz/devnet/object/0x69f611dfd809929d21c94541eb3f47e68cfb08f536009f7f60ac57a53d9a4723

### Step 4a — SurveyPass 發行（Sponsored，Creator 代付 gas）

| 項目 | 值 |
| --- | --- |
| 受訪者 Email | `respondent_1779104984680@example.com`（動態 timestamp） |
| 發出的 SurveyPass | `0xfb1844ea399f9f1809ea4d3744ea6924557552af22938b8f2166f67213fb6591` |
| Soulbound | ✅（無 `store` ability，無法轉移） |

🔗 瀏覽：

- SurveyPass：https://suiscan.xyz/devnet/object/0xfb1844ea399f9f1809ea4d3744ea6924557552af22938b8f2166f67213fb6591

### Step 4b — 填答（Sponsored，Respondent 0 SUI 也能送出）

| 項目 | 值 |
| --- | --- |
| Tx Digest | `5UdTKSxEwZi29dft8KeYg7fnR6df4PqnXbt1qjvhGqYY` |
| Status | ✅ success |
| 觸發事件 | `survey_vault::SurveyClaimed` |
| 受訪者 | `0xd818798fee2ac6335d4f4c2941068869da71030cf43bbe6b8e95575c935fa881` |
| Claimed At | `2026-05-18T11:49:52.319Z` (ms `1779104992319`) |
| Vault claimed_count | `1` (本筆即第 1 筆) |

🔗 瀏覽：

- Tx：https://suiscan.xyz/devnet/tx/5UdTKSxEwZi29dft8KeYg7fnR6df4PqnXbt1qjvhGqYY

### Step 5 — Gas 轉帳 + 兌換（Respondent）

| 項目 | 值 |
| --- | --- |
| Gas 注資 Tx（Creator → Respondent，0.5 SUI） | `386FFEtGKY2kfntyuGc3VxJLrv2eJLJ6wcc4mrSVTMko` |
| 兌換動作 | 1 sSSR → SurveySuiReward（透過 `amm_pool::redeem`） |
| UI 顯示 | `1.0000 sSSR` 可兌換 → `兌換成功！` |

🔗 瀏覽：

- Gas Tx：https://suiscan.xyz/devnet/tx/386FFEtGKY2kfntyuGc3VxJLrv2eJLJ6wcc4mrSVTMko

### Step 6 — Dashboard 驗證（Creator）

- `response-count` 由 `0` 變為 `1`（dashboard reload polling 在第二輪取得結果）
- `vault-balance` 與鏈上 `0.9 sSSR` 對齊
- `max-responses` 顯示 `2`

---

## 🚀 重新執行

每次跑大約消耗 Creator **~2–3 SUI**（注資 ~2 SUI + 兌換 gas 注資 0.5 SUI + 其他 gas）。如餘額不足，先到 Sui Discord `#devnet-faucet` 補：

```
Creator Address: 0x0b459e39bd7553e28c5641ab90ba8b015e4cdf153877791e0222e11695348a87
```

執行命令（自 frontend/ 目錄）：

```powershell
$env:CI="true"; npx playwright test e2e/lifecycle.spec.ts --workers=1 --retries=0
```

預期輸出最後一行：

```
1 passed (26.2s)
```

---

## 📌 後續延伸

- **T6.2 — Sad-path E2E**：重複填答、名額已滿、自動補發 SurveyPass 三組情境。
- **T6.3 — Demo 腳本**：5 分鐘 walkthrough，含 screenshot 與本檔列出的 TX digest。
