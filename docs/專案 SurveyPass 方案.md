# SurveySui — SurveyPass KYC 設計方案

> 本檔記錄 SurveyPass 身分認證的設計架構，作為 V2 S5.1 拍板輸出與後續版本的設計基線。
> 實作約束見 [V2_TDD.md](V2_TDD.md)，任務追蹤見 [V2_Tasks.md](V2_Tasks.md)。

---

## 設計目標

最小目標: 人機驗證  
中期目標:

- 防女巫 - 同一真人只能持有一組獨特 ID ，多張有效 Pass
- 同一地址只能持有一張有效 Pass - 基本 KYC（國籍、收入區間等受眾屬性）- 作為一個 Pass 下的子物件  
  長期目標: 與匿名投票方案（nullifier 架構）相容

## 空白問卷解密金鑰存取策略（S4.2 延後評估）

- 只對合格的受訪者顯示解密的空白問卷內容，或是由發起者自建密碼
- 受訪者仍需從連結取得 `contentKey`；若要改為「持有有效 SurveyPass 即可換取」，需引入以下其中一種機制，評估留至下一版：
  - **BFF 金鑰伺服器**：鏈上驗證 Pass 後由 BFF 回傳 `contentKey`（中心化，實作較簡單）
  - **Seal（Mysten 閾值加密服務）**：policy 寫在 Move 合約，去中心化，與 SurveyPass 整合後 URL 可完全不攜帶金鑰

**核心設計原則**

- 鏈上**零 PII**：鏈上只存承諾雜湊（Merkle root）和 nullifier hash，不存任何可識別個資。
- 多來源**相容**：支援多個驗證來源，可同時存在、各自獨立過期。
- Pass 的 `effective_tier` 由有效憑證中的最高 tier 決定，自動計算。
- BFF 符合 **INV-7**：只簽發 issuance ticket，不持簽交易的 admin key。

---

## 一、信任層級（Trust Tier）

| Tier | 驗證來源               | 防女巫強度 | 說明                                                |
| ---- | ---------------------- | ---------- | --------------------------------------------------- |
| 2    | **World ID**           | 最強       | 虹膜 ZK proof，唯一生物特徵，已生產環境驗證         |
| 2    | **Self Protocol**      | 強         | 政府 ID ZK（護照/身分證 NFC），年齡、國籍可機器驗證 |
| 1    | **Social Media OAuth** | 中         | Google、X、GitHub 帳號；成本低但多帳號仍可繞        |
| 0    | **Email OTP**          | 弱         | 只做輔助訊號，不單獨作為防女巫依據                  |
| 0    | **自申報**             | 無         | 屬性僅供問卷篩選，無法防女巫                        |

`effective_tier = max(tier of all non-expired credentials)`

### 各來源與 Sui 的整合現況

| 來源              | Sui 鏈上直驗             | 目前可行路徑                  | 備註                                   |
| ----------------- | ------------------------ | ----------------------------- | -------------------------------------- |
| **World ID**      | 技術可行，官方未支援     | BFF 鏈下驗，簽 ticket 上鏈    | 見下方說明                             |
| **Self Protocol** | 技術可行（亦為 Groth16） | BFF 鏈下驗 或 官方 SDK        | Self Protocol 支援非 EVM，整合相對開放 |
| **Social OAuth**  | 不適用（OAuth 非 ZK）    | BFF 驗 OAuth token，簽 ticket | 永遠走 BFF，無法去中心化               |
| **Email OTP**     | 不適用                   | BFF 驗 OTP，簽 ticket         | 同上                                   |
| **自申報**        | 不適用                   | BFF 簽 ticket 即可            | 無外部驗證                             |

#### World ID 在 Sui 的限制說明

Sui Move 標準庫內建 `sui::groth16` 模組，可在鏈上驗任意 Groth16 ZK proof，而 World ID 的底層協議（Semaphore）正是基於 Groth16，因此**密碼學層面可在 Sui 上直驗**。

然而存在一個核心障礙：**Identity Commitment Merkle Root 同步問題**。

```
用戶需證明「我的 identity commitment 在 Merkle tree 內」
合約驗證時需要 當前最新的 Merkle root
                      ↑
  Worldcoin 只在 Ethereum / Optimism / Polygon 上維護此 root
  Sui 上沒有官方的 root 來源
```

| 解法                                          | 可行性       | 問題                                |
| --------------------------------------------- | ------------ | ----------------------------------- |
| 跨鏈橋（Wormhole / Axelar）同步 root          | 可行         | 延遲高，多一個信任假設              |
| Worldcoin 官方支援 Sui                        | 目前無路線圖 | —                                   |
| **BFF 鏈下驗 World ID proof，簽 ticket 上鏈** | **最務實**   | 信任集中在 BFF，符合現有 INV-7 架構 |

**S6 採用 BFF 鏈下驗**。待 Worldcoin 官方支援 Sui 或跨鏈 root 同步方案成熟後，可升級為鏈上直驗——Pass 資料結構不需改動。

---

## 二、鏈上資料結構（Move 虛擬碼）

Credential 以 **Dynamic Field** 掛載在 `SurveyPass` 下，key = `source: u8`。
這樣可以在不修改 struct 定義的情況下，未來新增驗證來源，或單獨刪除某個來源的憑證。

```move
use sui::dynamic_field;

// SourceType 常數 (注意：此為來源編號，非信任等級 Trust Tier)
const SRC_SELF_REPORT:   u8 = 1; // 對應 Tier 0
const SRC_EMAIL:         u8 = 2; // 對應 Tier 0
const SRC_SOCIAL:        u8 = 3; // 對應 Tier 1
const SRC_SELF_PROTOCOL: u8 = 4; // 對應 Tier 2
const SRC_WORLD_ID:      u8 = 5; // 對應 Tier 2

// PassStatus 常數
const STATUS_ACTIVE:    u8 = 0;
const STATUS_EXPIRED:   u8 = 1;  // 到期，可續期
const STATUS_SUSPENDED: u8 = 2;  // 暫停（待調查，可恢復）
const STATUS_REVOKED:   u8 = 3;  // 永久撤銷，不可續期

// 每個驗證來源一個 slot
// 以 dynamic_field::add<u8, CredentialSlot>(&mut pass.id, SRC_*, slot) 掛載
struct CredentialSlot has store {
    commitment: vector<u8>,  // 屬性 Merkle root（不含原始資料）
    nullifier:  vector<u8>,  // 唯一身份錨（防同一身份多次申請）
    issued_at:  u64,
    expires_at: u64,
}

// SurveyPass 本體（Soulbound Token，不可轉移）
// Credentials 不存在 struct 欄位內，改由 dynamic_field 動態掛載
struct SurveyPass has key {
    id:                 UID,
    owner:              address,
    effective_tier:     u8,         // max of valid slots，每次 add/remove 時重算
    credential_sources: vector<u8>, // 已掛載的 SRC_* 清單（dynamic_field 不支援迭代，需自行維護）

    // 生命週期
    created_at: u64,
    expires_at: u64,  // = max(非過期 credential.expires_at)
    status:     u8,   // STATUS_*

    // 可選：以 owner 公鑰加密的鏈上敏感資料（法規要求必須存鏈上者）
    encrypted_payload: Option<vector<u8>>,
    encryption_pubkey: Option<vector<u8>>,  // 對接 S6.3 公鑰存放
}

// 全域 nullifier 登記表（shared object，防女巫核心）
struct NullifierRegistry has key {
    id:   UID,
    // key = hash(source_type || nullifier_value)，value = pass owner address
    used: Table<vector<u8>, address>,
}
```

### Credential 操作介面

```move
// 新增或更新某來源的 credential（首次驗證 或 到期後重新驗證）
fun add_credential(pass: &mut SurveyPass, source: u8, slot: CredentialSlot) {
    if (dynamic_field::exists_<u8>(&pass.id, source)) {
        // 已有同來源 → 移除舊的再掛新的
        dynamic_field::remove<u8, CredentialSlot>(&mut pass.id, source);
    } else {
        vector::push_back(&mut pass.credential_sources, source);
    };
    dynamic_field::add<u8, CredentialSlot>(&mut pass.id, source, slot);
    recompute_tier_and_expiry(pass);  // 更新 effective_tier / expires_at
}

// 單獨移除某來源的 credential
// 用途：GDPR 部分刪除 / 外部來源吊銷（例如 World ID nullifier 被 ban）
fun remove_credential(pass: &mut SurveyPass, source: u8): CredentialSlot {
    let slot = dynamic_field::remove<u8, CredentialSlot>(&mut pass.id, source);
    let (found, idx) = vector::index_of(&pass.credential_sources, &source);
    if (found) { vector::remove(&mut pass.credential_sources, idx); };
    recompute_tier_and_expiry(pass);
    slot
}

// 讀取某來源的 credential（唯讀）
fun borrow_credential(pass: &SurveyPass, source: u8): &CredentialSlot {
    dynamic_field::borrow<u8, CredentialSlot>(&pass.id, source)
}
```

**說明**

- `CredentialSlot` 沒有 `drop`——移除時必須顯式 `remove`，防止資料被靜默丟棄。
- `credential_sources: vector<u8>` 是 dynamic_field 不支援迭代的補償機制，負責記錄哪些 source 已掛載。`recompute_tier_and_expiry` 以此清單迭代計算 `effective_tier` 和 `expires_at`。
- `commitment` 是屬性的 Merkle root，不含任何原始資料。
- `nullifier` 由外部驗證系統產生，對同一人永遠相同，用來擋重複申請。
- `encrypted_payload` 僅在法規明確要求部分資料存鏈上時使用，以 owner 公鑰加密。

---

## 三、屬性隱私架構（Off-chain Merkle tree）

### 屬性編碼

原始屬性以 Merkle tree 的**葉節點**形式存在 BFF 資料庫（加密保存）：

```
leaf = hash( attribute_key || ":" || attribute_value || random_salt )
```

範例葉節點：

```
hash("gender:male" || salt)
hash("age_range:25-34" || salt)
hash("country:US" || salt)
hash("state:NY" || salt)
hash("income_range:40k-80k" || salt)
hash("voting_eligible:true" || salt)
```

`commitment = merkle_root(leaves)` → 存鏈上

原始 leaves + salt → 加密存 BFF DB，用戶可請求刪除。

### 支援的屬性類別

| 類別 | 範例屬性                                 | 可能來源                         |
| ---- | ---------------------------------------- | -------------------------------- |
| 人口 | gender, age_range, language              | 自申報、Self Protocol            |
| 地理 | country, state, city, zip_code           | 自申報、Self Protocol            |
| 法律 | age_verified, voting_eligible, residency | Self Protocol                    |
| 財務 | income_range, employment_status          | 自申報、Reclaim Protocol（未來） |

### 問卷屬性驗證流程

問卷設定 `min_tier: 2, required: [age≥18, gender:male]`：

```
1. 用戶 → BFF：我要填 #{vault_id}，Pass = #{pass_id}
2. BFF  → 鏈上確認：pass 存在、status = Active、tier ≥ 2
3. 用戶 → BFF：提交對應葉節點的 Merkle proof
4. BFF  → 驗 proof 通過 → 簽發 survey_access_token（短效，5 分鐘）
5. 用戶 → 合約：填答 + token
6. 合約 → 驗 token 簽名 + pass 有效性 → 寫入鏈上
```

> **設計決策**：屬性條件由 BFF 驗證（Merkle proof），合約只守 pass 有效性和 tier 門檻。
> 純鏈上 ZK 屬性驗證留待未來評估（Move ZK 整合複雜度高）。

---

## 四、生命週期狀態機

```
[未發行]
    │ mint（BFF 簽 ticket → 用戶送上鏈）
    ▼
[Active] ◀──────────────── 續期（re-verify）
    │                              ▲
    ├─ 到期 ──▶ [Expired] ──────────┘
    │
    ├─ 管理員暫停 ──▶ [Suspended] ──▶ [Active]（查清後恢復）
    │                    │
    │                    └─ 確認違規 ──┐
    │                                  │
    └─ 直接撤銷 ───────────────────────▶ [Revoked]
                                            │
                                GDPR 刪除 / 用戶主動刪
                                            │
                                    object::delete()
                                    （Pass 物件消失；
                                     tx 歷史不可刪，但不含 PII）
```

### 狀態轉換觸發

| 轉換               | 觸發者                      | 說明                                            |
| ------------------ | --------------------------- | ----------------------------------------------- |
| → Expired          | 時間（合約讀 `expires_at`） | 到期後可透過續期恢復 Active                     |
| → Suspended        | 管理員                      | 詐騙調查、臨時鎖定                              |
| Suspended → Active | 管理員                      | 調查結束，清除嫌疑                              |
| → Revoked          | 管理員 / 用戶               | 確認違規、帳號刪除、GDPR 請求                   |
| → 物件刪除         | 用戶 / 管理員               | Revoked 後呼叫 `object::delete()`，清除鏈上紀錄 |

---

## 五、BFF 角色與 Ticket 機制

BFF 持 **ticket-only key**（符合 INV-7：不持簽 TX 的 admin key）。

### Issuance Ticket 結構

```
IssuanceTicket {
    owner:          address,    // 用戶錢包地址
    source:         u8,         // SRC_* 常數
    nullifier_hash: vector<u8>, // hash(source || nullifier)
    commitment:     vector<u8>, // Merkle root of attributes
    expires_at:     u64,
    bff_sig:        vector<u8>, // BFF Ed25519 簽名，合約驗章
}
```

### 簽發流程

```
1. 用戶完成外部驗證（World ID、OAuth 等）
2. BFF 驗證外部憑證真實性
3. BFF 計算 Merkle tree，加密存 DB
4. BFF 簽發 IssuanceTicket
5. 用戶以 ticket 呼叫合約 mint_pass / add_credential
6. 合約驗 BFF 簽名 + nullifier 未重複 → 寫入鏈上
```

---

## 六、資料刪除能力（GDPR / 隱私合規）

| 層        | 資料                           | 可刪性                 | 刪除機制                                                              |
| --------- | ------------------------------ | ---------------------- | --------------------------------------------------------------------- |
| Off-chain | 原始屬性（性別、年齡…）        | **完全可刪**           | BFF DB delete                                                         |
| Off-chain | Merkle leaves + salt           | **完全可刪**           | BFF DB delete（commitment 成孤立，屬性不可再證明）                    |
| On-chain  | 單一來源 `CredentialSlot`      | **可單獨刪**           | `remove_credential(pass, SRC_*)` via dynamic_field                    |
| On-chain  | `encrypted_payload`            | **可覆寫為空**         | 呼叫 `clear_payload` entry                                            |
| On-chain  | Pass 物件（含全部 credential） | **可刪**（Revoked 後） | 先逐一 `remove_credential` 清空 dynamic fields，再 `object::delete()` |
| 鏈上歷史  | 交易紀錄、Pass 曾存在的事實    | **不可刪**             | 區塊鏈特性；但 nullifier hash 本身不是 PII                            |

**GDPR 聲明立場**：鏈上承諾雜湊（Merkle root）和 nullifier hash 屬於假名識別碼，非 PII。原始個人屬性僅存於 BFF，用戶可請求完整刪除。刪除後 Pass 物件仍在鏈上，但屬性不再可證明，用戶可選擇進一步刪除 Pass 物件。

---

## 七、實作順序（對應 V2_Tasks S6）

```
S6.1   合約：NullifierRegistry + SurveyPass struct + mint / revoke entry
       BFF：/auth/issue-ticket（先支援 Email (SRC_EMAIL = 2, 對應 Tier 0) + Social (SRC_SOCIAL = 3, 對應 Tier 1)）
       前端：AuthPage + 首次連錢包 pass 檢查（S6.2）

S6.2   World ID 整合（SRC_WORLD_ID = 5, 對應 Tier 2）
       BFF：/auth/world-id endpoint

S6.3   公鑰寫入 SurveyPass.encryption_pubkey（對接 Seal / 加密公鑰方案）

未來版本
       Self Protocol（SRC_SELF_PROTOCOL = 4, 對應 Tier 2，政府 ID ZK）
       屬性 ZK proof 替換 BFF Merkle 驗證（純鏈上屬性驗證）
       Reclaim Protocol（財務屬性自主證明）
```

---

## 八、與其他模組的依賴

| 依賴點                 | 說明                                                    |
| ---------------------- | ------------------------------------------------------- |
| S4.2 / S6.3 加密公鑰   | `encryption_pubkey` 欄位預留，等 Seal 方案確認後填入    |
| 匿名投票（S5.2）       | Pass 需預留 ZK 友善的 commitment 結構，避免未來重大改版 |
| Gas Station（S4.3）    | mint pass 的交易是否走 sponsored 路徑，待 S6.1 確認     |
| INV-6 Pass 不消耗      | 已在既有 Move 測試中驗證，新欄位加入後需回歸            |
| INV-7 BFF 無 admin key | ticket-only key 架構確保符合此不變式                    |

---

## 九、尚未決定的問題（待後續版本評估）

1. **nullifier 洩漏風險**：nullifier 存鏈上（NullifierRegistry），雖非 PII，但理論上可推回「此人在此服務驗證過」。是否需要二次雜湊（`hash(nullifier || app_secret)`）？
2. **credential 過期策略**：World ID 目前無固定過期機制，SurveyPass 的 expires_at 預設應設多長？
3. **Suspended 狀態的通知機制**：合約層無推播能力，BFF 如何通知用戶 Pass 被暫停？
4. **多錢包問題**：`NullifierRegistry` 只防同一 nullifier 重複，但同一人可用不同錢包各拿一張 tier 1（自申報）Pass，tier 1 的防女巫強度本來就低，可接受？
5. **屬性 schema 版本管理**：Merkle tree leaf 格式若改變，舊 commitment 是否仍可驗？

---

_最後更新：2026-05-20_
_設計者：S5.1 設計拍板（與 Claude 協作）_
