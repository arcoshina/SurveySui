# SurveySui 樣式與設計規範指南 (Style Guide)

本文件定義了 SurveySui 平台的前端樣式系統與設計規範。為了維持平台視覺的一致性與高品質的使用者體驗（UX），所有開發的頁面或元件均應遵循此規範。

題號文字
${q.required ? 'text-rose-800 dark:text-rose-400/80' 

必填徽章

必填徽章


**CSS 色階數值需以100為單位變化，否則會報錯**
---

## 1. 字型與文字層級 (Typography)

平台統一使用引入自 Google Fonts 的 **Noto Sans TC** 作為預設繁體中文與英文的無襯線字型。

- **全域字型**: `font-family: 'Noto Sans TC', ui-sans-serif, system-ui, sans-serif;` (定義於 [index.css](file:///d:/Users/Arco_asus/Documents/GitHub/SurveySui/frontend/src/index.css))
- **等寬字型**: 在簡答輸入框、交易哈希或程式碼顯示區域，使用 `font-mono`。
- **字重搭配規範**:
  - 全站標題與一般內文、按鈕文字一律遵循 **`font-normal`** 調性，避免過度使用 `font-bold` 或 `font-semibold`。
- **字級層級 (Font Size)**:
  - **H1 (.text-h1)**: `text-2xl font-normal text-slate-900 dark:text-neutral-100` (問卷大標題)
  - **H2 (.text-h2)**: `text-xl font-normal text-slate-900 dark:text-neutral-200` (區塊副標題)
  - **H3 (.text-h3)**: `text-lg font-normal text-slate-900 dark:text-neutral-200` (小標題 / 選項標題)
  - **Body (.text-body)**: `text-base font-normal text-slate-800 dark:text-neutral-300` (一般內文 / 填答主內容)
  - **Muted (.text-muted)**: `text-sm font-normal text-slate-600 dark:text-neutral-400` (輔助說明文字 / Placeholder / 次要標記)
- **最小字級限制**: 在所有可讀內容中，**最小字級為 `text-sm` (14px)**。僅允許在極少數輔助資訊（如交易雜湊 `font-mono text-xs`）使用 `text-xs`。

---

## 2. 按鈕狀態與配色 (Buttons)

按鈕統一使用高度為 `py-2` (文字大小為 `text-base`) 且字重為 `font-normal` 的圓角按鈕 (`rounded-xl`)。

| 按鈕類型 | 亮色模式類別 (Light Mode) | 暗色模式類別 (Dark Mode) |
| :--- | :--- | :--- |
| **主要操作 (.btn-primary)** | `bg-blue-700 hover:bg-blue-800 text-neutral-100` | `bg-blue-800 hover:bg-blue-600 text-neutral-200` |
| **次要操作 (.btn-secondary)** | `bg-slate-100 hover:bg-slate-200 text-slate-700` | `bg-neutral-700 hover:bg-neutral-600 text-neutral-300` |
| **邊框操作 (.btn-outline)** | `border border-slate-200 hover:bg-slate-100 text-slate-600` | `bg-neutral-800 hover:bg-neutral-600 text-neutral-300` |
| **危險操作 (.btn-danger)** | `bg-rose-800 hover:bg-rose-600 text-white` | `bg-rose-800 hover:bg-rose-700 text-neutral-200` |

*   **已停用按鈕 (Disabled)**:
    *   亮色主按鈕: `bg-blue-700/50 text-neutral-200`
    *   暗色主按鈕: `bg-blue-900/30 text-neutral-600`
    *   亮色次按鈕: `bg-slate-50 text-slate-400`
    *   暗色次按鈕: `bg-neutral-800 text-neutral-600`

---

## 3. 輸入框與表單元件 (Form Inputs)

表單輸入框統一高度與圓角，在不同主題下有清晰的外框與聚焦回饋。

- **輸入框容器 (For Preview or Card Sections)**:
  - 亮色模式: `bg-slate-100 border border-slate-300`
  - 暗色模式: `bg-neutral-950 border border-neutral-800`

- **欄位標籤 (.form-label)**:
  - `block text-sm font-normal text-slate-600 dark:text-neutral-300 uppercase tracking-wider mb-1`

- **文字輸入框 (.form-input)**:
  - **預設樣式**:
    *   亮色: `border border-slate-400 bg-white text-slate-800 rounded-xl px-4 py-2 text-sm font-normal`
    *   暗色: `border border-neutral-600 bg-neutral-900 text-neutral-200 rounded-xl px-4 py-2 text-sm font-normal placeholder:text-neutral-500`
  - **聚焦樣式 (Focus)**:
    *   亮色: `focus:ring-2 focus:ring-blue-500 focus:border-transparent` (或聚焦框 `ring-1 ring-blue-500`)
    *   暗色: `focus:ring-1 focus:ring-blue-300 focus:border-transparent` (或聚焦框 `ring-1 ring-blue-300`)
  - **已停用樣式 (Disabled)**:
    *   亮色: `border border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed`
    *   暗色: `border border-neutral-800 bg-neutral-800/50 text-neutral-500 cursor-not-allowed`

---

## 4. 狀態反饋與提示框 (Alerts)

狀態提示框分為成功 (Success)、錯誤 (Error)、一般資訊 (Info) 三種，使用統一的間距、圖示大小、邊框與圓角配置 (`p-4 rounded-xl text-sm font-semibold border`)。

### 成功提示 (.alert-success)
- **亮色模式**: `bg-emerald-50 text-emerald-800 border-emerald-100`
  - 標題: `text-base font-semibold text-emerald-900`
  - 描述: `text-sm text-emerald-700 font-normal`
- **暗色模式**: `bg-emerald-950/20 text-emerald-300 border-emerald-900/30`
  - 標題: `text-base font-semibold text-emerald-400`
  - 描述: `text-sm text-emerald-400 font-normal`

### 錯誤提示 (.alert-error)
- **亮色模式**: `bg-rose-50 text-rose-800 border-rose-100`
  - 標題: `text-base font-semibold text-rose-900`
  - 描述: `text-sm text-rose-800 font-normal`
- **暗色模式**: `bg-rose-900/20 text-rose-300 border-rose-900/30`
  - 標題: `text-base font-semibold text-rose-400`
  - 描述: `text-sm text-rose-400 font-normal`

### 一般資訊 (.alert-info)
- **亮色模式**: `bg-blue-50 text-blue-800 border-blue-100`
  - 標題: `text-base font-semibold text-blue-900`
  - 描述: `text-sm text-blue-800 font-normal`
- **暗色模式**: `bg-blue-900/20 text-blue-300 border-blue-900/30`
  - 標題: `text-base font-semibold text-blue-400`
  - 描述: `text-sm text-blue-400 font-normal`

---

## 5. 常用 UI CSS 類別封裝 (index.css Utilities)

為了減少 HTML/JSX 中冗長的 Inline Classes，全站推薦直接引用封裝好的全域 Utility 類別：

*   **標題與內文**: `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-muted`
*   **按鈕系列**: `btn-primary`, `btn-secondary`, `btn-outline`, `btn-danger`
*   **表單元件**: `form-label`, `form-input`
*   **反饋狀態**: `alert-success`, `alert-error`, `alert-info`

---

## 6. 身分驗證相關詞彙標準 (Auth Vocabulary)

為避免「身分驗證」相關文案在不同頁面出現多種寫法，所有新增 / 修改文案請依本詞彙表撰寫。歷史文件（`docs/History/*`、`docs/專案 *.md`、`docs/改版備忘.md`）保留原稱呼，不追溯改動。

### 中文標準

| 概念 | 標準用語 | 不可使用 |
| :--- | :--- | :--- |
| 品牌名稱（導覽列、頁面標題） | **誰位通證** | 真人認證、真人憑證 |
| 「Identity Center」中文 | **誰位通證中心** | 真人憑證認證中心 |
| 動作「身分驗證」（動詞/名詞） | **驗證** | 認證（僅可出現在品牌複合詞「誰位通證」） |
| Tier 0 | `Tier 0 - Email 驗證` | Email 認證 |
| Tier 1 | `Tier 1 - OAuth 驗證` | OAuth 級認證、社交帳號驗證 |
| Tier 2 | `Tier 2 - 真人驗證` | 政府/生物識別、高階驗證 |
| 認證等級欄位 label | `驗證等級` / `驗證等級門檻` | 身分憑證門檻 |
| Connect Wallet 提示 | `請連接錢包` | 請先連接錢包、請連結錢包 |

### 英文標準

| 概念 | 標準用語 | 不可使用 |
| :--- | :--- | :--- |
| 導覽列 link 文字 | `SurveyPass` | — |
| AuthPage 大標題 | `SurveyPass Identity Center` | — |
| 「身分驗證」動作 | `Verification` | Authentication、Identity verification |
| 驗證失敗訊息 | `Verification or transaction send failed` | Authentication or transaction send failed |
| 驗證 required 提示 | `Verification required` | Identity verification required |
| 認證等級欄位 label | `Verification level` / `Verification level threshold` | Identity level、Identity Pass Threshold |
| Tier 0 | `Tier 0 - Email` | Email Verified |
| Tier 1 | `Tier 1 - OAuth` | OAuth Verified、Social Account Verified |
| Tier 2 | `Tier 2 - Individual` | Gov/Biometric、Government/Biometric、Advanced Verification |
| Connect Wallet 提示句 | `Please connect your wallet` | Please Connect Wallet First |
| Connect Wallet 區塊標題 | `Wallet connection required` | Wallet Connection Required |
| 「Pass」單獨用 | 一律改為 `SurveyPass` 全名 | Update Pass、Delete Pass |

### SurveyPass 動詞區分（語意不同，請保留）

| 場景 | 標準動詞 |
| :--- | :--- |
| 首次取得 | `Claim SurveyPass` |
| 已過期重新驗證 | `Renew SurveyPass` |
| 升級 Tier | `Upgrade SurveyPass` |
| 一般更新 | `Update SurveyPass` |
| 管理員吊銷 | `Revoke SurveyPass` |
| GDPR 刪除 | `Delete SurveyPass` |

---

## 7. 必填 / 選填標示 (Required / Optional Indicator)

問卷題目在「填寫」與「確認」階段都會於題首顯示一個小型徽章 (chip) 標示題目是否為必填。為避免使用者誤判題目重要程度,**填寫與確認兩階段必須使用相同色系**,不可在其中一階段降為中性灰。

### 推薦用法:使用 utility class

色票已封裝為 `.chip-required` 與 `.chip-optional` 兩個 utility(定義於 [index.css](../frontend/src/index.css)),日後調色只需改 utility 一處即可全站同步:

```tsx
{/* 二分支:必填與選填 chip */}
<span className={q.required ? 'chip-required' : 'chip-optional'}>
  {q.required ? '必填' : '選填'}
</span>

{/* 單分支:僅必填出現時 */}
{q.required && <span className="chip-required">必填</span>}
```

### Utility class 對應的 Tailwind 色票

| Utility | 亮色模式 | 暗色模式 |
| :--- | :--- | :--- |
| **`.chip-required`** | `bg-rose-50 border-rose-100 text-rose-800` | `dark:bg-rose-600/20 dark:border-rose-400/70 dark:text-rose-400/80` |
| **`.chip-optional`** | `bg-slate-100 border-slate-200 text-slate-500` | `dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400` |

兩者共用結構:`px-2 py-0.5 rounded-full text-[10px] font-bold border`。

### 題號文字配色

題號文字採與徽章一致的紅/灰雙模式:

| 狀態 | 亮色模式 | 暗色模式 |
| :--- | :--- | :--- |
| **必填** | `text-rose-800` | `dark:text-rose-400/80` |
| **選填** | `text-slate-700` | `dark:text-neutral-200`(或 `dark:text-neutral-300`) |

### 與 §4 alert-error 的關係

alert-error 暗模式底色為 `bg-rose-950/20`,本節 chip 改用更實心的 `bg-rose-600/20` 並搭配高不透明度邊框 `dark:border-rose-400/70`。原因:徽章面積小,需要稍亮一階的紅才能在 `dark:bg-neutral-900` 卡片上被清楚看見;`alert-error` 為佔位較大的提示框,維持 §4 規範不變。

實作參考:[SurveyPage.tsx](../frontend/src/pages/SurveyPage.tsx) 填寫與確認兩階段均使用上述 utility。
