# 修復問卷載入與認證、發起人管理問題

此計畫旨在修復手動測試中發現的問卷載入失敗、`Buffer` 未定義的瀏覽器執行期錯誤、Event 限制，以及訪客無按鈕連結錢包/認證、發起人無法提早關閉問卷等問題。

## 解決方案細節

### 1. 前端應用修復

#### SurveyPage.tsx
- **解決 `Buffer is not defined` 錯誤**：
  - 實作或引入 `hexToBytes` 函數。
  - 將 `new Uint8Array(Buffer.from(data.nullifier_hash, 'hex'))` 替換為 `hexToBytes(data.nullifier_hash)`。
  - 將 `new Uint8Array(Buffer.from(data.bff_sig, 'hex'))` 替換為 `hexToBytes(data.bff_sig)`。
- **解決 Event 限制問題**：
  - 重構 `resolveSurvey` 中的 `suiClient.queryEvents`，改用分頁循環查詢，最高限制查詢 10 頁，避免無限迴圈。
- **解決訪客無連結錢包與認證按鈕**：
  - 引入 `@mysten/dapp-kit` 的 `ConnectButton`。
  - 在 `!account`（未連接錢包）的提示頁面中渲染 `ConnectButton`，供訪客點選連結。
  - 在填答表單底部，若 `!isPassValid` 或憑證等級不足，在「預覽/提交」按鈕上方渲染一個提示區塊，包含「獲取/升級 SurveyPass 憑證」按鈕。點選後，將 phase 設為 `'need_pass'` 並重設 OTP 步驟為 `'input'`，引導訪客進入真人認證與鑄造流程。

#### AuthPage.tsx
- **解決 `Buffer is not defined` 錯誤**：
  - 實作或引入 `hexToBytes` 函數。
  - 將 `Buffer.from` 替換為 `hexToBytes`。

#### DashboardPage.tsx
- **修復解密金鑰遺失與填答連結失效**：
  - 在組件頂部使用 `useMemo` 將當前問卷的 `contentKeyB64` 儲存為可供渲染引用的變數。
  - 在「問卷填答連結」的 `href` 與「複製」按鈕的 URL 中，拼接 `#${contentKeyB64}`。
- **解決 Event 限制問題**：
  - 在 `resolveSurvey` 與 `loadCreatorSurveys` 內改用分頁循環查詢。
- **優化路由跳轉 UX 與金鑰快取**：
  - 將「我的問卷」列表中的 `<a>` 標籤替換為 React Router 的 `<Link>` 標籤，防止頁面整頁重整。
  - 在點擊「查看」時，若本地儲存有該問卷的解密金鑰，則將其附加到路徑後（`/dashboard/${s.vault_id}#${key}`）。
- **解決發起人不能提早結束問卷 / 無法使用解密按鈕**：
  - 將發起人權限判定 `isCreator` 改為標準化地址對比：
    ```typescript
    const isCreator = !!account && !!vault && normalizeSuiId(account.address) === normalizeSuiId(vault.creator)
    ```

---

## 驗證計畫

### 自動化測試
執行前端的 Vitest 單元測試以確保沒有 regression：
```bash
cd frontend
pnpm test
```

### 手動驗證步驟
1. 訪客未連錢包時進入 `/s/<surveyId>`，確認頁面中央有「連接錢包」按鈕。
2. 連接錢包後，若無 SurveyPass 憑證，確認表單下方有「獲取 SurveyPass 憑證」按鈕，點擊後能順利進入 Email OTP 認證畫面並成功鑄造憑證。
3. 發起人進入 `/dashboard/<vaultId>`，確認能看到「結束活動」與「解密回覆並查看統計」按鈕，點選「結束活動」交易能正常送出並成功關閉。
