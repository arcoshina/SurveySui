# 專案設計：管理員救援註銷與憑證細粒度停權機制

本文件規劃當受訪者的一個或多個驗證來源遭駭、或需管理員介入止損時的**細粒度註銷機制**，涵蓋鏈上合約、BFF 與管理員工具。設計討論過程見 `docs/dialog.md`；漏洞與取捨摘要見 `docs/Pass停權設計討論紀錄.md`（待與本文件同步）。

---

## 一、系統模型

### 1.1 Pass 與憑證

- **一錢包一 Pass**：每個 Sui 地址在 `NullifierRegistry.passes` 中至多綁定一個活躍 `SurveyPass` 物件。
- **Pass 內多憑證**：每個驗證來源（`source: u8`）對應一個 `CredentialSlot`（dynamic field），內含：
  - `nullifiers`：該來源的身分雜湊（不可偽造）
  - `commitment`、`issued_at`、`expires_at`
  - `status`：`ACTIVE` | `REVOKED`（**新增**）
- **Mint 簽章**：鑄造／更新憑證時，BFF 簽發短期 Ticket（類 JWT）；合約在 `mint_pass` / `update_pass_credential` 時驗證簽章。鏈上持久保存的是綁定後的 slot 內容，而非每次填答重驗簽章。

### 1.2 正常填答流程

1. 受訪者持有 Pass，前往問卷填答（代付或自付 Gas，**過程不依賴 BFF**）。
2. `survey_vault::claim` 校驗：
   - Pass 整體為 `STATUS_ACTIVE`
   - **問卷 `allowed_sources` 中，至少有一個來源**通過 `is_source_valid(pass, source, clock)`（存在 slot、`status == ACTIVE`、未過期）
   - 以 Pass 上**有效（ACTIVE）憑證**的 nullifier 做 vault 防重複（見 §1.4）
3. 通過則記錄答案並發放獎勵。

### 1.3 細粒度註銷與誤報保護（重要）

管理員可註銷 **單一 `source`**（例如 Google），**不影響** Pass 內其他仍為 `ACTIVE` 的來源（例如 World ID）。

| 情境 | 填答結果 |
|------|----------|
| 問卷只接受 World ID，Google 被誤／惡意註銷 | **仍可填答**（World ID slot 仍 ACTIVE） |
| 問卷接受 Google 或 World ID，僅 Google 被註銷 | **仍可填答**（以 World ID 滿足資格） |
| 問卷只接受 Google，且 Google 已被註銷 | **拒絕填答**（無任一 allowed source 有效） |
| 問卷接受 Google，駭客僅能用已註銷的 Google | **拒絕填答** |

**原則**：填答資格是 **per-source（按來源）** 判定，不是「Pass 內曾有任一來源被註銷就整本作廢」。此設計可緩解惡意虛假通報造成的過度停權。

### 1.4 Nullifier 與防重複填答

- 註銷某來源時，其 nullifier 自 `registry.used` 釋放，合法用戶可在新錢包重綁**該來源**。
- `SurveyVault.used_nullifiers` 以 `H(nullifier ‖ vault_id)` **永久**記錄填答史；註銷／刪除 Pass **不會**清除，故同一身分無法重複領同一問卷獎勵。
- `claim` 做 vault 去重時，**僅納入 `status == ACTIVE` 的 slot 之 nullifier**，避免已註銷來源干擾聯集邏輯。

### 1.5 三層防線分工

| 時機 | 負責層 | 機制 |
|------|--------|------|
| **填答** | 鏈上（必須） | `is_source_valid`（含 slot `REVOKED`）；`check_eligibility` 對 `allowed_sources` 做 **OR** |
| **Mint／加憑證** | BFF（預設權威） | 簽 Ticket 前查已註銷庫；已註銷則拒簽（見 §4.1 `.env`） |
| **Pass 已刪、事後註銷** | BFF／Walrus | 管理員依 nullifier／OAuth ID 寫入離鏈庫；擋下次簽發 |
| **鏈上 `revoked_nullifiers` Table** | 可選、預設關閉 | 千筆級註銷的鏈上 storage 成本對上線初期不可接受；僅在 `.env` 開啟且合約已支援時才同步 |

填答路徑**不經 BFF**；BFF 僅在鑄造、更新憑證、管理員註銷紀錄與頻率限制時介入。

**成本原則**：止損的填答阻擋靠 **Pass 內 slot 狀態**（隨該 Pass 物件存在，無全域 Table 線性成本）。全域已註銷 nullifier 清單預設存 **BFF DB** 或 **Walrus**，不由鏈上 Table 承擔；待用戶體量與收入足以支應時，再透過 `.env` 開啟鏈上同步或 Merkle／Walrus 進階方案。

---

## 二、核心設計目標

1. **細粒度註銷**：`admin_rescue_revoke(source)` 將該 slot 標為 `REVOKED`（**不刪除** dynamic field），Pass 與其他來源保持 `ACTIVE`。
2. **身分釋放**：被註銷來源的 nullifier 自 `registry.used` 移除，供合法用戶在新錢包重綁。
3. **註銷紀錄可配置儲存**：鏈上 **必寫** slot `REVOKED` + 釋放 `used`；已註銷 nullifier **清單**預設寫 BFF DB（可選 Walrus），**不預設**寫鏈上 `revoked_nullifiers`（見 §4.1）。
4. **一錢包一 Pass**：`mint_pass` 若 `registry.passes` 已有該 owner 則 `abort`（不可靜默覆寫 mapping）。
5. **刪除套利對沖**：`self_delete_sponsored_pass` 規費 `REBATE_FEE_FLOOR * (1 + credentials_count)`。
6. **刪除不沖銷註銷紀錄**：駭客刪除 Pass 只影響鏈上物件與 `registry.used`／`passes`；**BFF／Walrus 已註銷庫保留**，管理員仍可事後登記。

---

## 三、Move 智能合約改動

### 3.1 常數與結構

```move
const CREDENTIAL_ACTIVE: u8 = 0;
const CREDENTIAL_REVOKED: u8 = 1;

public struct CredentialSlot has store {
    commitment: vector<u8>,
    nullifiers: vector<vector<u8>>,
    issued_at: u64,
    expires_at: u64,
    status: u8,  // CREDENTIAL_ACTIVE | CREDENTIAL_REVOKED
}

public struct NullifierRegistry has key {
    id: UID,
    used: Table<vector<u8>, address>,
    passes: Table<address, ID>,
    // [可選模組] 僅在部署「含鏈上註銷表」的 package 版本時存在；上線預設 package 可不包含此 Table
    // revoked_nullifiers: Table<vector<u8>, bool>,
}
```

**合約版本策略**：初期部署的 package **不含** `revoked_nullifiers`，`mint_pass` **不**查鏈上黑名單；Mint 防線完全由 BFF 已註銷庫負責。日後若開啟 `REVOCATION_ON_CHAIN_SYNC`，需升級或部署含 `revoked_nullifiers` 的 package，並由管理員工具送額外寫表交易。

### 3.2 `is_source_valid`（填答資格核心）

```move
/// 單一來源是否可用於填答：Pass 活躍、slot 存在、slot 未註銷、未過期
public fun is_source_valid(pass: &SurveyPass, source: u8, clock: &Clock): bool {
    if (pass.status != STATUS_ACTIVE) { return false };
    let key = CredentialKey { source };
    if (!dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key)) {
        return false
    };
    let slot = dynamic_field::borrow<CredentialKey, CredentialSlot>(&pass.id, key);
    slot.status == CREDENTIAL_ACTIVE && clock::timestamp_ms(clock) < slot.expires_at
}
```

`is_valid(pass)`（Pass 是否至少有一個 ACTIVE 且未過期憑證）應同樣尊重 `slot.status`。

### 3.3 `all_nullifiers`（僅 ACTIVE slot）

```move
/// 回傳 ACTIVE 憑證的 nullifier 聯集，供 vault 防重複使用
public fun all_nullifiers(pass: &SurveyPass): vector<vector<u8>> {
    // 遍歷 credential_sources，僅當 slot.status == CREDENTIAL_ACTIVE 時併入
    ...
}
```

### 3.4 `admin_rescue_revoke`（細粒度註銷）

```move
/// 管理員救援註銷：標記指定 source 為 REVOKED，釋放 used
/// （不在此函數寫 revoked_nullifiers；離鏈清單由 BFF／Walrus 維護，鏈上表為可選升級）
public fun admin_rescue_revoke(
    registry: &mut NullifierRegistry,
    pass: &mut SurveyPass,
    config: &IssuerConfig,
    source_to_revoke: u8,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == config.admin, ENotAdmin);
    assert!(pass.status == STATUS_ACTIVE, ENotActive);

    let key = CredentialKey { source: source_to_revoke };
    assert!(
        dynamic_field::exists_with_type<CredentialKey, CredentialSlot>(&pass.id, key),
        ENotActive,
    );

    let slot = dynamic_field::borrow_mut<CredentialKey, CredentialSlot>(&mut pass.id, key);
    assert!(slot.status == CREDENTIAL_ACTIVE, ENotActive);
    slot.status = CREDENTIAL_REVOKED;

    let nullifiers = *&slot.nullifiers;  // 複製，避免從 &mut 移出
    let owner = pass.owner;
    let mut k = 0;
    let klen = vector::length(&nullifiers);
    while (k < klen) {
        let nh = *vector::borrow(&nullifiers, k);
        if (table::contains(&registry.used, nh) && *table::borrow(&registry.used, nh) == owner) {
            table::remove(&mut registry.used, nh);
        };
        k = k + 1;
    };
    // credential_sources 保留該 source 條目，便於 UI 顯示「已註銷」
    // 離鏈已註銷庫寫入由 BFF／管理員 CLI 依 REVOCATION_REGISTRY_BACKEND 處理（§4.1）
}
```

**保留**整本 `revoke_pass`：整個錢包遭駭時將 `pass.status = STATUS_REVOKED`（極端情況）。

#### 可選：`admin_rescue_revoke_with_chain_registry`（進階 package）

僅在 `REVOCATION_ON_CHAIN_SYNC=true` 且已部署含 `revoked_nullifiers` 的合約時，管理員工具改呼叫此函數（或於同一 PTB 追加寫表），將 nullifier 寫入鏈上 Table。上線預設 **不部署、不呼叫**。

### 3.5 誤判恢復（`admin_unrevoke`）

- **離鏈**：BFF／Walrus 刪除或標記失效對應 nullifier 紀錄（管理員 API）。
- **鏈上（可選）**：若曾寫入 `revoked_nullifiers`，另送 `admin_unrevoke_nullifier` 移除。
- **Pass slot**：須由用戶重新驗證並 `update_pass_credential` 建立新 `ACTIVE` slot（或另訂 `admin_restore_credential`）。

### 3.6 `mint_pass` / `update_pass_credential`

```move
// mint_pass 新增：
assert!(!table::contains(&registry.passes, owner), EPassAlreadyExists);

// 預設 package：不在鏈上查 revoked_nullifiers；已註銷 nullifier 由 BFF 在簽 Ticket 前阻擋。
// 進階 package（REVOCATION_ON_CHAIN_SYNC=true）可另加：
// assert!(!table::contains(&registry.revoked_nullifiers, nh), EPassRevoked);

// 新建 slot 時：
let slot = CredentialSlot {
    commitment,
    nullifiers,
    issued_at: clock::timestamp_ms(clock),
    expires_at,
    status: CREDENTIAL_ACTIVE,
};
```

### 3.7 `do_delete` 修復

```move
fun do_delete(registry: &mut NullifierRegistry, mut pass: SurveyPass, _ctx: &mut TxContext) {
    let owner = pass.owner;

    if (table::contains(&registry.passes, owner)) {
        let current_id = *table::borrow(&registry.passes, owner);
        if (current_id == object::id(&pass)) {
            table::remove(&mut registry.passes, owner);
        };
    };

    let sources = *&pass.credential_sources;
    // ... 遍歷 slot ...
    // 僅當 pass.status == STATUS_ACTIVE 時，才自 registry.used 釋放 nullifier
    ...
}
```

### 3.8 `self_delete_sponsored_pass`

```move
let credentials_count = vector::length(&pass.credential_sources);
let required_fee = REBATE_FEE_FLOOR * (1 + credentials_count);
assert!(coin::value(&fee) >= required_fee, EFeeTooLow);
```

儲存返還歸交易 gas payer（`deposit_payer` 或自刪時的 owner）；扣除規費與 PTB gas 後無套利空間。

### 3.9 `survey_vault::claim`

**不需**為基本止損新增 `NullifierRegistry` 參數或全域黑名單檢查。現有流程已足夠：

```move
assert!(survey_pass::is_valid(pass, clock), EInvalidPass);
assert!(check_eligibility(pass, &survey_registry::allowed_sources(survey), clock), EInvalidPass);
// check_eligibility：allowed_sources 中任一 is_source_valid → true（OR 語意）
```

#### 可選問卷政策 `reject_revoked_pass`

若問卷建立時啟用，語意為：**禁止使用已標記 `REVOKED` 的來源填答**——與 `is_source_valid` 一致，**不**因「其他無關來源曾被註銷」而拒絕整筆 claim。

實作上無需額外 `has_revoked_credential(pass, registry)` 阻擋整本 Pass。

---

## 四、後端與管理員工具

### 4.1 環境變數：註銷紀錄儲存與行為開關

合約**無法**讀取 `.env`；下列變數由 **BFF** 與 **管理員 CLI** 在執行期解讀，用於上線後調整行為而無需改動填答鏈路。

| 變數 | 預設 | 說明 |
|------|------|------|
| `REVOCATION_REGISTRY_BACKEND` | `bff_db` | 已註銷 nullifier **清單**的權威儲存：`bff_db` \| `walrus` \| `walrus+bff_db`。不含 `on_chain` 時不送鏈上寫表交易。 |
| `REVOCATION_ON_CHAIN_SYNC` | `false` | `true`：管理員註銷成功後，**額外**送鏈上交易寫入 `revoked_nullifiers`（需已部署含該 Table 的 package）。上線初期保持 `false`。 |
| `REVOCATION_MINT_GUARD_ENABLED` | `true` | 簽發 Mint／更新 Ticket 前是否查已註銷庫；應保持 `true`。 |
| `REVOCATION_MINT_TICKET_RATE_LIMIT_HOURS` | `1` | 同資料來源取得 Mint Ticket 的最小間隔（小時）。 |
| `REVOCATION_WALRUS_PUBLISHER_URL` | （空） | `walrus` 後端用：Walrus 發布／讀取端點（依實際整合填入）。 |
| `REVOCATION_WALRUS_EPOCHS` | `1` | Walrus  blob 保留 epochs（成本與保存期權衡）。 |

**行為矩陣**（管理員完成一筆 source 註銷後）：

| `REVOCATION_REGISTRY_BACKEND` | `REVOCATION_ON_CHAIN_SYNC` | 鏈上 `admin_rescue_revoke` | 離鏈已註銷庫 | 鏈上 `revoked_nullifiers` |
|-------------------------------|----------------------------|----------------------------|--------------|---------------------------|
| `bff_db` | `false` | slot → REVOKED | PostgreSQL 寫入 | 不寫 |
| `walrus+bff_db` | `false` | slot → REVOKED | DB + Walrus 歸檔 | 不寫 |
| `bff_db` | `true` | slot → REVOKED | PostgreSQL 寫入 | 額外 tx 寫表（進階） |

**填答安全性**：上表任一欄位組合下，只要鏈上 slot 已標 `REVOKED`，自付／代付 `claim` 皆會因 `is_source_valid` 失敗而拒絕使用該來源；**不依賴**鏈上全域 Table。

設定於根目錄 `.env`：`REVOCATION_MINT_GUARD_ENABLED`、`REVOCATION_MINT_TICKET_RATE_LIMIT_HOURS`。

### 4.2 已註銷資料庫（BFF／Walrus）

- **欄位**：`nullifier_hash`、`source`、註銷時間、可選 `pass_object_id`、備註。
- **寫入時機**：
  1. 鏈上 `admin_rescue_revoke` 成功後，CLI 或 BFF 監聽依 `REVOCATION_REGISTRY_BACKEND` 寫入 DB／Walrus。
  2. **Pass 已被刪除**：管理員依 OAuth 帳號／nullifier **僅寫離鏈庫**（`--offline-only`）；鏈上無 Pass 可改 slot。
  3. `REVOCATION_ON_CHAIN_SYNC=true` 時，管理員工具在離鏈寫入後**可選**追加鏈上寫表（非預設）。
- **讀取時機**：`REVOCATION_MINT_GUARD_ENABLED=true` 時，簽發 Ticket 前查詢；已註銷則拒簽。

**Walrus 角色**：作為低成本、可擴展的**離鏈歸檔**（稽核、備份、多環境同步），**不**在本階段用於填答時的鏈上 Merkle 驗證。若日後體量與收入足夠，可再評估 Walrus + 鏈上 Root 進階方案（見 §七）。

### 4.3 管理員 CLI（`scripts/admin_rescue.ts`）

```bash
# Pass 仍存在：鏈上 slot 註銷 + 依 .env 寫離鏈庫（可選鏈上表）
npx ts-node scripts/admin_rescue.ts --pass <PASS_OBJECT_ID> --source <SOURCE_U8>

# Pass 已刪：僅離鏈庫（忽略 REVOCATION_ON_CHAIN_SYNC）
npx ts-node scripts/admin_rescue.ts --nullifier <HASH> --source <SOURCE_U8> --offline-only
```

CLI 應讀取 `.env` 的 `REVOCATION_*` 變數，決定是否呼叫 Walrus、是否追加鏈上 `revoked_nullifiers` 交易。

### 4.4 頻率限制

由 `REVOCATION_MINT_TICKET_RATE_LIMIT_HOURS` 控制（預設 1 小時）。緩解「刪 Pass → 搶跑重 Mint」在管理員介入前的窗口，並降低對項目方代付的濫用。

### 4.5 前端

- 填答前：若問卷 `allowed_sources` 與用戶 ACTIVE 憑證無交集，提示重新驗證或聯絡管理員。
- 代付路徑：BFF 簽名前可預檢（UX）；**安全邊界以鏈上 `is_source_valid` 為準**。

---

## 五、安全性與風險

| 風險 | 對策 |
|------|------|
| 舊 Pass 刪除釋放新 Pass 的 `registry.used` | `do_delete` 僅 `STATUS_ACTIVE` 時釋放 `used`；`passes` 比對 object ID |
| 自付繞過 BFF（填答） | 鏈上 slot `REVOKED`；不依 BFF |
| 自付繞過 BFF（Mint） | 預設靠 BFF 拒簽 Ticket；`REVOCATION_ON_CHAIN_SYNC=true` 時鏈上表為第二道防線 |
| 鏈上註銷表 storage 成本 | 預設關閉 `REVOCATION_ON_CHAIN_SYNC`；清單存 BFF／Walrus |
| 誤／惡意註銷單一來源 | **per-source** 資格；其他 ACTIVE 來源仍可填答 |
| 駭客刪 Pass 洗白 | BFF 註銷紀錄保留；頻率限制；管理員可 offline 登記 |
| 儲存返還套利 | 動態 `self_delete` 規費 |
| 重複填同一問卷 | `SurveyVault.used_nullifiers` 不受 Pass 刪除影響 |
| 主動刪除不寫註銷史 | 維持不將「自願刪除」自動寫入已註銷庫；僅管理員救援註銷或離鏈登記 |

---

## 六、實作順序建議

1. `CredentialSlot.status`、`is_source_valid` / `is_valid` / `all_nullifiers` 調整  
2. `admin_rescue_revoke`、`do_delete` / `mint_pass` 修復（**不含**鏈上 `revoked_nullifiers`）  
3. BFF 已註銷 DB + `.env` 開關 + 管理員 CLI  
4. `self_delete` 動態規費  
5. 前端提示與代付預檢  
6. （日後）`REVOCATION_ON_CHAIN_SYNC`、Walrus 歸檔、進階 package  

---

## 七、明確不採用與日後選項

**本階段不採用**

- **刪除 `CredentialSlot` 作為註銷手段**（改為 `REVOKED` 狀態）
- **預設啟用鏈上 `revoked_nullifiers` Table**（千筆級 storage 成本不可接受）
- **填答時鏈上 Merkle / 非成員證明**（複雜度與 Gas 過高）
- **一般問卷填答依賴 BFF 即時 Ticket**（`claim_with_ticket` 僅供匿名投票等場景）
- **「Pass 內曾有註銷史即整本拒絕填答」**（與細粒度止損及誤報保護衝突）

**日後可透過 `.env`／合約升級啟用**

- `REVOCATION_ON_CHAIN_SYNC=true` + 含 `revoked_nullifiers` 的 package（收入可支應時）
- `REVOCATION_REGISTRY_BACKEND=walrus` 或 `walrus+bff_db`（離鏈歸檔擴容）
- Walrus + 鏈上 Merkle Root（僅在註銷量極大、且需鏈上 Mint 硬擋時評估；填答仍建議靠 slot 狀態）
