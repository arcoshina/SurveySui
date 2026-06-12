---
title: 身分認證與 SurveyPass
order: 4
---

# 身分認證與 SurveyPass

SurveyPass 是你在 SurveySui 的鏈上身分證明：一個**綁定你錢包、不可轉讓**的數位通行證。它讓問卷發起者能確認「每份答案來自不同的真實使用者」，同時不暴露你的任何個人資料。

## 四種認證方式

| 方式 | 流程 | 信任等級 | 有效期 |
|------|------|----------|--------|
| Email | 收驗證碼（OTP）回填 | Tier 0 | 3 個月 |
| Google | OAuth 授權登入 | Tier 1 | 3 個月 |
| GitHub | OAuth 授權登入 | Tier 1 | 3 個月 |
| World ID | World App 真人驗證 | Tier 1 | 365 天 |

選哪個？**有 Google 或 GitHub 帳號就用它們**——流程最快，信任等級也較高（部分問卷或平台代付政策可能要求 Tier 1）。World ID 提供最強的真人證明與最長有效期。Email 適合不想連結社群帳號的使用者。

一張 Pass 可以同時掛多種憑證（例如先用 Email 認證、之後再補 Google），憑證到期後重新認證即可刷新，不用重新鑄造 Pass。

## 隱私設計：鏈上沒有你的個資

認證流程中，你的 Email 或社群帳號**只在驗證的當下使用，不會上鏈、不會被永久儲存**。鏈上記錄的是一個叫 nullifier 的識別碼——由你的帳號經單向雜湊（加鹽）運算而來：

- 同一個帳號永遠算出同一個 nullifier → 可以防止重複註冊。
- 從 nullifier 無法反推出你的帳號 → 外人看鏈上資料不知道你是誰。

這就是「既能一人一票、又不暴露身分」的關鍵機制。

## 一人一本，不可轉讓

- 每個錢包最多持有一本 Pass。
- 同一個認證身分（同一個 Email、同一個 Google 帳號）只能綁定一個錢包——換錢包重綁是不行的，這正是防灌水機制的一部分。
- Pass 不可轉讓、不可買賣（soulbound）。

## 鑄造費用與代付

鑄造 Pass 需要一筆鏈上交易。平台為每個錢包提供**終身 2 次**的免費代付（鑄造 + 更新共用額度），所以一般使用者全程免費。超過額度後若需更新憑證，用自己錢包裡的 SUI 付 gas 即可，金額很小。

## 刪除 Pass

你隨時可以刪除自己的 Pass（例如想停用服務）。要注意：

- **自付鑄造的 Pass**：直接刪除，無額外費用。
- **平台代付鑄造的 Pass**：因為刪除鏈上物件會產生儲存押金返還（會退到出資方），代付的 Pass 需透過平台代刪，或自行支付一筆逃生費（約 0.025 SUI 起，實際金額依鑄造時的代付成本而定）後自刪。這是為了防止有人利用「免費鑄造、刪除套利」的漏洞濫用代付資源。
- 刪除後，**有效**憑證的 nullifier 會被釋放，同一帳號可以重新認證；但被平台**註銷（revoke）**的憑證不會釋放——違規帳號無法靠刪除重來。

## 給進階使用者

- Pass 為 shared object，欄位含 `owner`（不可變）、`deposit_payer`（出資方，決定刪除時押金流向）、平行的 `credential_sources` / `credential_keys` 陣列與以 nullifier 為鍵的 credential slot（dynamic field），單本上限 16 槽。
- 每個憑證槽存有 commitment（`blake2b256(BCS(owner ‖ source ‖ nullifier ‖ expires_at))`），claim 時合約重算比對，防止槽內容被竄改。
- 憑證簽發流程：外部驗證成功後由平台簽發 ticket（含 nullifier、有效期、escape_clawback），合約驗簽後寫入。代付鑄造時 `escape_clawback_mist ≥ ceil(netGas × 110%)`；自付鑄造強制為 0。
- 自刪費用公式：`max(escape_clawback_mist, 25_000_000 MIST)`，須精確支付，整筆轉給 `deposit_payer`。
- 註銷有三層：整本 revoke（鏈上）、批次憑證 revoke（鏈上、以 nullifier 列舉）、平台簽發端黑名單（鏈下 mint guard）。
