# CertiK Scan_1 處理紀錄（已完成）

> 來源：[`Scan_1.md`](Scan_1.md)（2026-06-08，73 項 finding）
> **全部 73 項 finding 已處理完成**；devnet fresh publish `0xb580522ae16762eec9ca86321c717e846118d0d59fcba38feee60e572c35f091`，`pnpm certik:smoke:devnet` **13/13 通過**。
> 證據：[`Deploy_R0P1_Evidence.md`](./Deploy_R0P1_Evidence.md)、[`certik-smoke-results.json`](./certik-smoke-results.json)。
> mainnet 前 Ops 決策（多 pool 遷移 / upgrade vs publish / P1-D1 `fund`）已移至 [`改版筆記.md`](../改版筆記.md)。

---

## 完成清單（73 項）

### P0 — 資金與授權核心
- [x] F64 (major) — 任意使用者可對他人 vault 註冊 Survey 並抽走獎勵 — Verified
- [x] F35 (major) — NFT claim 路徑可能繞過 survey 層級資格與 claim_mode — Verified
- [x] F36 (major) — `allowed_nft_type = None` 時 NFT marking 形同公開 claim — Verified
- [x] F72 (medium) — 公開 sponsor 路徑若無上游驗證，可能簽任意攻擊者交易 — Fixed
- [x] F24 (medium) — 缺少 `NODE_ENV` 檢查可能將 2-of-3 multisig 降級為單 key — Fixed
- [x] F21 (info) — Legacy fallback 可能讓 ticket issuer 金鑰成為鏈上 sponsor signer — Fixed
- [x] F25 (discussion) — Legacy fallback 繞過 sponsor-address 完整性檢查 — Fixed

### P1 — 鏈上資格、費用與獎勵完整性
- [x] F40 (medium) — Vault `create` 可能繞過 treasury 費用強制 — Verified
- [x] F33 (medium) — 任意 pool 參數讓建立者繞過協議費 — Verified
- [x] F41 (medium) — `claim` 可能繞過 `allowed_nullifiers` 受眾限制 — Verified
- [x] F49 (medium) — 重複同一 allowlisted nullifier 可繞過 threshold — Verified
- [x] F50 (info) — Attribute allowlist claim 可重放抽乾獎勵 — By Design
- [x] F48 (info) — Attribute nullifier 未消耗，受眾證明可跨 claim 重放 — By Design
- [x] F47 (info) — `count_hits` 信任 caller 提供的 nullifier hash — By Design
- [x] F31 (discussion) — Ticket claim 可能繞過 claim_mode 與受眾規則 — Verified
- [x] F30 (info) — One-time-ticket mode 未在一般 claim 路徑強制 — Verified
- [x] F55 (medium) — 重複 source ticket 永久 orphan 先前 nullifier — Verified
- [x] F45 (medium) — Blob answer 模式允許無界 on-chain payload — Verified
- [x] F28 (info) — 無許可 pool 初始化可能免費 mint SSR — Verified
- [x] F29 (info) — 無許可 pool 建立可將 survey 資金費用降為零 — Verified
- [x] F66 (info) — 共用 `SrTreasury` 經任意 pool 耗盡全域 SR 上限 — Verified

### P2 — BFF 認證、Ticket 與 Gas 代付濫用
- [x] F2 (medium) — Real-time ticket 簽名未綁定授權錢包 — Verified
- [x] F32 (discussion) — Signed ticket 可轉讓（未綁定 claimant） — Verified
- [x] F1 (info) — OAuth 可能用未驗證 email 鑄造 nullifier — Fixed
- [x] F3 (info) — 防重複依賴記憶體 cache + 隨機 nullifier — Fixed
- [x] F4 (info) — Ticket slot 過期/失敗後未釋放 — Fixed
- [x] F58 (discussion) — Ticket 簽名未綁定特定 deployment/registry — By Design
- [x] F59 (info) — 可重放 ticket 在舊簽名過期前恢復已 revoke credential — By Design
- [x] F12 (medium) — 平台 sponsor 每日上限 check-then-increment 競態 — Fixed
- [x] F13 (medium) — 未驗證 `senderAddress` 可耗盡他人 rate limit — Fixed
- [x] F14 (info) — Per-wallet rate limit 可競態、無硬上限 — Fixed
- [x] F16 (minor) — 唯讀 limit check 與 reservation 建立之間可超限 — Fixed
- [x] F20 (discussion) — Reservation 僅 process-local，重啟/多實例繞過上限 — Fixed
- [x] F15 (discussion) — 配額掃描僅 250 筆 sender 交易 — Partial（接受殘餘風險）
- [x] F17 (discussion) — Cache 未區分 `sponsorAddress` — Fixed
- [x] F18 (minor) — 並發 cache refresh 可能重複釋放 reservation — Fixed
- [x] F19 (info) — Reservation 120s 過期但 sponsored tx 有效期更長 — Fixed
- [x] F69 (info) — Platform cap 檢查後才加 buffer，可能繞過上限 — Fixed
- [x] F10 (info) — Pass-ticket 驗證信任未認證 sender，可污染配額 — Fixed
- [x] F11 (discussion) — 平台配額在 sender 簽名前就消耗 — By Design
- [x] F8 (info) — 混合 pass + claim PTB 繞過 claim sponsorship guardrail — Fixed
- [x] F5 (minor) — 動態補償可被高 gas claim 污染 — Fixed
- [x] F6 (info) — Gas quote 忽略部分 claim 入口，系統性 underfund — Verified
- [x] F7 (info) — 無界重複 extra ticket 放大 sponsor gas — Fixed
- [x] F9 (info) — 畸形 `Option<vector<u8>>` 未及早拒絕 — Fixed
- [x] F46 (info) — 可提高 gas compensation 但未重新 escrow — Mitigated
- [x] F67 (info) — Gas budget 基於 rebate 後 net gas 而非 upfront 成本 — Fixed
- [x] F68 (medium) — Gas budget 缺少下限，可能為 0 或負值 — Fixed
- [x] P2-EC（非編號） — 代付 mint/update 後自刪 rebate 使 sponsor 淨虧 — Fixed（Escape Clawback）

### P3 — 可用性、DoS 與營運
- [x] F70 (medium) — 過早釋放 gas coin → stale object DoS — Fixed
- [x] F71 (minor) — Stale coin metadata cache 導致 sponsorship 中斷 — Fixed
- [x] F73 (info) — Creator 可將 gas compensation 調低於 pipeline floor — Fixed
- [x] F39 (minor) — `create` 獎勵資金驗證不足 → claim DoS — N/A（`create` 已移除）
- [x] F42 (minor) — 大量 per-answer 刪除使 purge 永久不可呼叫 — Fixed
- [x] F38 (minor) — Royalty 計算 overflow 阻斷大額流程 — Verified
- [x] F34 (info) — 僅 attribute 的 survey 經 `claim` 永久無法領取 — Fixed
- [x] F62 (info) — Archive survey 未停用任何 reward claim 路徑 — Verified

### P4 — Pass/Credential 生命週期與次要邏輯
- [x] F51 (minor) — 刪除 revoked pass 永久洩漏其 nullifier — By Design
- [x] F52 (minor) — 手續費轉整顆 coin 而非應付金額 → 多付 — Fixed
- [x] F53 (minor) — 部分 rescue revoke 可釋放仍活躍於其他 slot 的 nullifier — By Design
- [x] F54 (info) — `mint_pass` 重複註冊第一個 source，膨脹 self-delete 費 — Fixed
- [x] F56 (info) — 過期 credential nullifier 仍用於 survey 去重 — By Design
- [x] F57 (info) — 單次 claim 消耗 pass 上無關 credential 的 nullifier — By Design
- [x] F60 (discussion) — 無 nullifier 的 credential 仍視為有效 source — Fixed
- [x] F61 (info) — `is_valid` 接受無 nullifier 的 credential — Fixed
- [x] F37 (info) — Public fee split 可能少發 respondent 獎勵且可重複 — Mitigated
- [x] F43 (info) — 晚 close 重置 purge timer，答案多留 grace period — Verified
- [x] F44 (info) — close 將未付協議費 reserve 退還 creator — By Design / Mitigated
- [x] F63 (minor) — 假 vault ID 使 content-hash squatting 永久化 — Fixed
- [x] F65 (minor) — Purge 只銷毀單一 Survey 物件，可能 orphan 合法 survey — Fixed
- [x] F27 (minor) — `invest_and_mint` 缺少最小輸出檢查 → 滑點/搶跑 — Fixed
- [x] F26 (info) — 投資永久鎖 SR 於 `sr_reserve`，累積可 brick mint — By Design
- [x] P1-D1（非編號） — post-share `fund` 可繞過 royalty — Verified（刪 `fund` + `fee_paid` 閘門）

### Defer — 設定錯誤類
- [x] F22 (discussion) — 畸形 hex 公鑰被靜默截斷為不同 multisig 成員 — Fixed
- [x] F23 (discussion) — Scheme-tagged 私鑰解碼錯誤 — Fixed

---

## 變更紀錄

| 日期 | 說明 |
|------|------|
| 2026-06-08 | 依 Scan_1.md 初版排程；尚未開始程式碼修改 |
| 2026-06-08 | **階段 0 Triage 完成**：產出 `T0_AttackSurface.md`；73 項初判（Valid 42 / Partial 27 / By Design 2） |
| 2026-06-08 | **R0 Claim 統一（草案）**：`ADR_ClaimUnified.md`、unified `claim`、BFF/frontend 收斂初稿 |
| 2026-06-08 | **R0 回退為未完成**：claim 相關 finding 全部重開；新增 R0-1～R0-8「重構 claim 領獎檢查流程」；NFT 功能不得未確認即關閉 |
| 2026-06-09 | ADR Accepted；R0 任務改對齊 Step 0～3；新增 R0↔Finding 對照表；區分規格確認 vs 實作未完成 |
| 2026-06-09 | **R0 實作完成**：unified `claim`（use_pass/use_nft）、claim_sentinel、BFF/前端對齊；Move 51 + BFF 141 + FE 61 tests pass；未部署 |
| 2026-06-09 | **P1 延後項排程**：新增階段 Deploy；F37/F38/F39 狀態更正；P4 新增 P1-D1（與 F44 叢集）；Defer §Ops（testnet reset / mainnet 遷移延後） |
| 2026-06-09 | **P4 規格**：`system_design/SystemBehaviorSpec.md`；F51/F56/F57 → By Design |
| 2026-06-10 | **Escape Clawback 實作**：`escape_clawback_mist` + `finalize-sponsored-ticket` + sponsor pipeline 閘門；F52 補充 clawback（保留 `REBATE_FEE_FLOOR`）；新增 P4 §Escape Clawback、P2-EC、Deploy D-6；測試 Move 72 / core 22 / BFF 156 |
| 2026-06-10 | **代幣經濟規格**：新增 `system_design/TokenEconomics.md`（V0 reserve-ratio 還原、實作偏差、F26/F27/F28 定性）；本檔 §代幣經濟對齊 + F26/F27 狀態文案更新 |
| 2026-06-10 | **F26/F27 狀態關閉（程式）**：F27 → Fixed（`min_ssr_out` + ratio 定價）；F26 → By Design；頂部代幣經濟摘要修正；鏈上 smoke 仍待 publish |
| 2026-06-10 | **D-6 / EC-6 devnet**：fresh publish + `certik:smoke:devnet` 13/13；smoke 腳本 Pass 佔位 + faucet v2；F16 原子 `tryReserveSponsorLimit`；見 `Deploy_R0P1_Evidence.md` §D-6 |
| 2026-06-10 | **F58 → By Design**：ticket 無 deployment domain separation 為可接受取捨；新部署仍須 mint 新 Pass |
| 2026-06-10 | **F59 → By Design**：Pass ticket TTL 內可重放；revoked credential 由 `ECredentialRevoked` 阻擋 |
| 2026-06-11 | **收斂為完成紀錄**：73 項全數完成，本檔改寫為簡易完成清單；mainnet 前 Ops 決策移至 `改版筆記.md` |
