# Code Review 報告 — `origin/main...HEAD`

- **審查範圍**：`git diff origin/main...HEAD`（108 檔，約 +17,480 行；重點為 gas 贊助管線、Move 合約、auth）
- **審查模式**：high effort、recall-biased
- **日期**：2026-06-10　|　**結案複查**：2026-06-11

> 全部項目已複查結案。狀態總覽如下；底部列出原本即排除的誤報。

---

## 處理狀態總覽

| 項目 | 標題 | 狀態 | 結論 |
|---|---|---|---|
| S1 | claim 前即 throw（`VITE_VOID_NFT_ID` / `VITE_CLAIM_PASS_SENTINEL_ID` 缺失） | ✅ 已修 | `vite.config.ts` 的 `define` 補映射 + 補 Pass-only / NFT-only claim e2e |
| S2 | `admin_rescue_revoke` 不釋放 nullifier | ✅ By-Design | 永久黑名單語意（非 rescue）；改名 `admin_revoke_credential`、移除 `_registry` 死參數（與 CertiK F53 一致） |
| M3 | `all_nullifiers` 含已撤銷 credential 的 nullifier | ✅ By-Design | claim 去重集合刻意寬於資格判定（CertiK F56/F57）；已補 doc comment 界定語意，行為不變 |
| M4 | `claim()` 對 attribute 問卷不檢查 pass 有效性 | ✅ 已修 | `pass_satisfies_step1a` 加 `is_active` 守衛、刪 dead `assert_claim_common`、補測試 `claim_attribute_with_revoked_pass_aborts` |
| M5 | `releaseOldest` 時間戳碰撞誤刪多筆 | ✅ 已修 | 刪除鍵改物件參照，與 SQLite rowid 語意一致；補 `passReservationStore.test.ts` |
| C6 | `normalizeAddress` 重複約 8 處 | ✅ 已收斂 | 單一來源 `gas-station-core/src/txUtils.ts`，其餘檔案改 import |
| C7 | `getPureBytes` 重複 3 份 | ✅ 已收斂 | 實作收進 `txUtils.ts`；驗證器內僅剩綁定 `tx` 的薄封裝 |
| C8 | 可贊助函式清單重複 3 份 | ⛔ 誤報 | `PASS_MINT_FNS`（mint-only）與 `ALLOWED_*_FNS`（含 `update_pass_credential`）語意不同，非單純重複 |
| C9 | `SSR_BASE_PER_UNIT` 在 `ptb.ts` 硬編 | ✅ 已修 | 改 `import { SSR_BASE_PER_UNIT } from './format'`，回歸權威值 |
| C10 | 每次贊助請求重複反序列化 PTB | 🛡️ 安全措施（By-Design） | 各解碼點為獨立的防禦性重解析，非缺陷；見下方說明 |

---

## C10 — 安全措施說明（By-Design，非缺陷）

gas 贊助流程對同一份 `txBytes` 的多次 `Transaction.fromKind` 解碼，**並非無意義的重複，而是各自獨立、語意不同的防禦性重解析**。每段都從 canonical 原始 bytes 獨立 re-derive，使任一階段的 mutation／bug 無法滲漏到另一階段的驗證（defense-in-depth）。

| 解碼點 | 作用 | 為何獨立解析 |
|---|---|---|
| `assertTxSenderMatches`（[sponsorAuth.ts:55](../bff/src/gas/sponsorAuth.ts#L55)） | 比對 PTB 內嵌 sender = 已驗證錢包 | 最早期安全閘，搶在 rate-limit／quota 前擋下；finalize 路徑亦單獨使用（該路徑不呼叫 `validateSponsorTransaction`） |
| `validateSponsorTransaction`（[sponsorTxValidation.ts:145](../packages/gas-station-core/src/sponsorTxValidation.ts#L145)） | 稽核整個 PTB 結構（可贊助函式、`deposit_payer`、答卷大小…） | 對**未信任 client 輸入**的結構驗證，從原始 bytes 重新 parse |
| `runSponsorPipeline`（[sponsorPipeline.ts:132](../packages/gas-station-core/src/sponsorPipeline.ts#L132)） | mutate（setSender／GasOwner／GasPayment）→ build → sign | 最終簽章的 bytes 必須來自伺服器自己掌控的一次 parse，不沿用驗證器碰過的物件 |
| `validatePassEscapeClawbackAfterDryRun`（[passEscapeClawbackValidation.ts:24](../packages/gas-station-core/src/passEscapeClawbackValidation.ts#L24)） | dry-run 後拿實測 `gasUsed` 重核 `escape_clawback` | **刻意從原始 `txBytes` 重解**（非 pipeline 已 mutate 的物件），確保校驗的是 client 原始請求而非中途被改寫的版本 |

**結論**：四段皆從 canonical 原始 bytes 獨立 re-derive，為 defense-in-depth；合併成共用可變物件等同拿資安換低頻端點上微秒級的 CPU，不採用。若日後在意效能，零資安代價的方向是縮小被解析的 payload（答卷走 blob 而非 inline，已有 `MAX_INLINE_ANSWER_BYTES` 機制），而非合併解碼。

---

## 已排除（誤報）

| 候選 | 排除理由 |
|---|---|
| C8 可贊助函式清單重複 | `PASS_MINT_FNS`（mint-only）與 `ALLOWED_FNS` / `ALLOWED_PASS_FNS`（含 `update_pass_credential`）為**不同語意集合**，非單純重複定義 |
| `finalizeSponsoredTicket` dry-run 無 gas coin | `setGasOwner(sponsorAddress)` + `tx.build({ client })` 會自動由 sponsor 帳戶選 gas coin，dry-run 可正常執行 |
| `sponsorLedger` reserve race | `pending` 在 `withReserveLock` 內計數，第二個請求看得到第一個的 reservation，已正確序列化（且 SQLite 以 `BEGIN IMMEDIATE` 跨程序原子化） |
| `VITE_PROTOCOL_CONFIG_ID` 缺失 | `vite.config.ts:27` 已從 `env.PROTOCOL_CONFIG_ID` 正確映射 |
| extra ticket 參數位移 / escapeClawback 索引 | builder 與 parser（`extractPassTicketsFromMoveCall`）同步更新，`ticketBase+4` 內部一致 |
| 多筆 update 的 `escape_clawback_mist = 1` | `PLACEHOLDER_CLAWBACK = 1n` 為刻意設計（主 slot 帶實際金額，其餘帶佔位值滿足 `>0` 斷言），非缺陷 |
| auth message 位址未正規化 | 真實錢包回傳的 Sui 位址恆為 canonical（0x + 64 hex），與後端 `normalizeAddress` 後相等，不會觸發 |
