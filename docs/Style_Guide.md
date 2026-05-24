# SurveySui 樣式與設計規範指南 (Style Guide)

本文件定義了 SurveySui 平台的前端樣式系統與設計規範。為了維持平台視覺的一致性與高品質的使用者體驗（UX），所有開發的頁面或元件均應遵循此規範。


**CSS 顏色數值需以100為單位變化，否則會報錯**
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
