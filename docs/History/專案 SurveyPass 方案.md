> 現行規格已收斂至 [system_design/PassLifecycle.md](../system_design/PassLifecycle.md)；本文為設計過程紀錄，不作規格引用。

# SurveySui — SurveyPass KYC 設計方案

> 防女巫 Soulbound Token：同一真人只能持有一組唯一 ID，同一地址只能持有一張有效 Pass。

---

## 設計目標

- 防女巫：同一身份只能申請一張有效 Pass（nullifier 防重複）
- 隱私保護：原始屬性不上鏈，只儲存 Merkle root commitment
- 可擴充：Dynamic Field 架構，未來可新增驗證來源而不改動核心結構

---

## 信任層級

| Tier | 驗證來源          | 防女巫強度 | Sui 整合路徑              |
| ---- | ----------------- | ---------- | ------------------------- |
| 2    | World ID          | 最強       | BFF 鏈下驗，簽 ticket 上鏈 |
| 2    | Self Protocol     | 強         | BFF 鏈下驗 或 官方 SDK    |
| 1    | Social Media OAuth | 中        | BFF 驗 OAuth，簽 ticket   |
| 0    | Email OTP / 自申報 | 弱/無     | BFF 簽 ticket             |

`effective_tier = max(所有未過期 CredentialSlot 的 tier)`

---

## 鏈上資料結構

**`SurveyPass`**（Soulbound Token）：持有人地址、effective_tier、expires_at、status（Active / Revoked）、可選加密 payload。

**`CredentialSlot`**：每個驗證來源一個 slot，以 Dynamic Field 掛載於 Pass 下（key = source 編號）。儲存 commitment（屬性 Merkle root）、nullifier、issued_at、expires_at。

**`NullifierRegistry`**（Shared Object）：全域 nullifier 登記表，防止同一身份跨錢包重複申請。

**關鍵設計決策**
- Dynamic Field 架構：新增來源只需加 `SRC_*` 常數，不改動 struct
- `credential_sources: vector<u8>`：補償 Dynamic Field 不支援迭代，記錄已掛載來源清單
- Pass 無 EXPIRED 狀態：以 `clock::timestamp_ms < expires_at` 判斷有效性

---

## BFF 與 Ticket 機制

BFF 持 ticket-only key（不持 admin 簽交易金鑰，符合 INV-7）。外部驗證完成後，BFF 計算 nullifier 和屬性 Merkle root，簽發 `TicketPayload`，由用戶自行呼叫合約上鏈。

流程：外部驗證 → BFF 驗真實性 → 計算 Merkle tree + 加密存 DB → 簽發 Ticket → 用戶送上鏈 → 合約驗簽 + nullifier 未重複 → 寫入。

---

## 生命週期

**Active** → 管理員撤銷 → **Revoked** → `delete_pass()` → Pass 物件消失（鏈上交易紀錄不可刪，但不含 PII）。

Credential 全部到期時 Pass 實質失效但 status 仍為 Active，需重新驗證（`update_pass_credential`）才能恢復。

---

## 資料刪除能力（GDPR）

| 層        | 資料                      | 可刪性       | 機制                              |
| --------- | ------------------------- | ------------ | --------------------------------- |
| Off-chain | 原始屬性、Merkle leaves   | 完全可刪     | BFF DB delete                     |
| On-chain  | CredentialSlot（單一來源） | 可單獨刪     | `dynamic_field::remove`           |
| On-chain  | Pass 物件                 | 可刪（Revoked 後） | `delete_pass()` → `object::delete()` |
| 鏈上歷史  | 交易紀錄                  | 不可刪       | 區塊鏈特性；nullifier hash 非 PII |

---

## 實作進度

**已完成**：合約核心（mint / update / revoke / delete）、Email OTP（Tier 0）、Social OAuth（Tier 1）、World ID 4.0（Tier 2，僅 Orb）、Gas 代付（終身 2 次）、AuthPage + Pass 存在性檢查

**World ID 4.0（Tier 2，僅 Orb）實作要點**：
- 來源 `SRC_WORLD_ID=5`，合約零改動（source-agnostic）。
- RP 簽名模型：前端開 IDKit widget 前先呼叫 BFF `POST /auth/worldid/sign-request`（以 `signing_key`+`action` 產生 rp_context；`signing_key` 絕不離開後端）。
- 驗證：BFF `POST /auth/worldid/verify` 轉發 proof 至 `https://developer.world.org/api/v4/verify/{rp_id}`，**並由後端強制 Orb**（`issuer_schema_id === 1` / `proof_of_human`），非 Orb 一律 403 不發 ticket。
- nullifier：`SHA256("worldid" + worldNullifier + SALT)`，沿用 `signTicket` 簽 ticket 上鏈。
- BFF 環境變數：`WORLDCOIN_APP_ID` / `WORLDCOIN_RP_ID` / `WORLDCOIN_SIGNING_KEY` / `WORLDCOIN_ACTION`（前端 app_id/action/rp_context 皆由 BFF 回傳，前端無需額外 env）。

**計劃中**：公鑰寫入（對接 Seal）

**未來版本**：Self Protocol（政府 ID ZK）、純鏈上屬性 ZK 驗證、Reclaim Protocol（財務屬性）

---

## 待決問題

- nullifier 是否需要二次雜湊（`hash(nullifier || app_secret)`）以降低洩漏風險
- ~~World ID 憑證到期策略：`expires_at` 預設應設多長~~（已採 `BFF_PASS_TTL_MS`，預設 7 天，與 Email/Social 一致）
- 屬性 schema 版本管理：leaf 格式改變後，舊 commitment 的相容性
- Social OAuth 雙 nullifier 合約改動（實作前必須完成）：同一 Gmail 跨來源申請的防重複計票機制

---

_最後更新：2026-05-29 by Claude Opus 4.8（World ID 4.0 接入）
