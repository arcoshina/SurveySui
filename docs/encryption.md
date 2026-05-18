# 加密方案選型：問卷內容 & 答案鏈上加密

## 1. 背景與需求

SurveySui 需要在鏈上存兩類機密資料：

| 資料類型 | 上鏈位置 | 讀取方 | 加密需求 |
|---|---|---|---|
| **問卷內容**（Markdown） | `survey_registry::register(encrypted_blob)` | 受訪者（解密後填答） | 有連結即可解密；問卷問題本身非機密 |
| **填答內容**（答案） | `survey_vault::claim(..., encrypted_answers)` | 僅 Creator（Dashboard 解密統計） | 只有問卷創建者可解密 |

對應 [專案目標.md §2 step 4](../專案目標.md) 與 [§4 step 4](../專案目標.md)。

---

## 2. 方案比較

### 方案 A：Mysten Seal（推薦 v2）

[Mysten Seal](https://github.com/MystenLabs/seal) 是 Mysten Labs 推出的 **Identity-Based Encryption (IBE)** 函式庫，以 BLS12-381 曲線做門檻加密。

**運作流程**：
1. 加密時以一組 `key_id`（可自定義，如 `vault:{vault_id}`）加密資料
2. 解密時，用戶端向 Seal 金鑰服務群（閾值 k/n 節點）發送解密請求
3. 各節點在鏈上呼叫開發者預先部署的 Move 函式（條件合約）
4. 函式回傳 `true` → 節點釋出一份金鑰分片；客戶端收集 ≥ k 份後還原解密金鑰
5. 本機解密，明文不離開用戶端

| 評估維度 | Mysten Seal |
|---|---|
| **技術成熟度** | Beta（2025 Q2 上線 Testnet；Mainnet roadmap 尚未公告） |
| **金鑰管理** | 無需 Creator 自存私鑰；金鑰由閾值節點群持有 |
| **解密權限控制** | 完全鏈上（Move 函式回傳 bool），去中心化 |
| **Devnet 支援** | ❌ 目前 Seal 金鑰服務器**不支援 Devnet**，只有 Testnet |
| **外部服務依賴** | Mysten Labs Seal 金鑰服務器（SaaS，無 SLA 保證） |
| **整合複雜度** | 高：需部署 Move 存取條件合約；前端整合 `@mysten/seal` SDK |
| **MVP 開發時間** | 高（需額外撰寫 Move 條件模組、設計 key_id 策略） |
| **離線/CI 測試** | 困難（解密需聯網呼叫 Seal 金鑰服務器） |
| **金鑰遺失風險** | 低（閾值保護；Creator 無保管責任） |
| **費用** | Beta 期間免費；正式計費方式未公告 |

**Seal 整合 SurveySui 的設計草案**（供 v2 參考）：
```
key_id = "surveysui:vault:{vault_id}"

Move 條件合約：
  public fun can_decrypt(vault: &SurveyVault, ctx: &TxContext): bool {
      vault.creator == ctx.sender()
  }
```

---

### 方案 B：AES-GCM + Creator 錢包衍生金鑰（推薦 MVP）

使用瀏覽器原生 `Web Crypto API`（AES-256-GCM）做對稱加密；Creator 的加密金鑰由**錢包簽名衍生**，不需額外儲存。

**金鑰衍生流程**（deterministic，可重現）：
```typescript
// 1. Creator 以錢包對固定訊息簽名（不上鏈，純客戶端）
//    訊息為全域常數，與 vault 解耦，使 Flow A PTB 可保持 atomic（見 §5.4）。
const sig = await wallet.signPersonalMessage({
  message: 'SurveySui encryption key'
});

// 2. 對簽名做 SHA-256 → 32 bytes AES 金鑰
const seed   = await crypto.subtle.digest('SHA-256', sig.bytes);
const aesKey = await crypto.subtle.importKey('raw', seed, 'AES-GCM', false, ['encrypt', 'decrypt']);
```

Creator 只要持有相同的 Sui 錢包，隨時可在 Dashboard 重新衍生同一把金鑰解密。

**兩種加密用途的設計**：

```
┌─────────────────────────────────────────────────────────────┐
│  問卷內容 (Markdown)                                        │
│  ── 以「URL fragment 作為對稱金鑰 key」加密                  │
│  ── 任何持有連結的人（受訪者）都能解密並看到問題             │
│  ── key 隨機產生，嵌在分享 URL 的 # 後（永不送達後端）      │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  填答內容 (Answers)                                         │
│  ── 以 Creator 的「錢包衍生 AES 金鑰」加密                  │
│  ── 受訪者送出時用 Creator 公鑰（survey_registry 取得）加密  │
│  ── 只有 Creator 在 Dashboard 簽名後方能解密                 │
└─────────────────────────────────────────────────────────────┘
```

> **答案加密實作細節**：若需非對稱語意（受訪者加密 → Creator 解密），可改用 X25519-ECDH：  
> Creator 的 AES seed → 衍生 X25519 keypair；公鑰存於 `survey_registry`；  
> 受訪者用公鑰做 ECDH 產生共享金鑰後加密；Creator 用私鑰 ECDH 解密。  
> MVP 階段若 Creator 與受訪者在同一 session 可退化為對稱，v2 再升級為真正非對稱。

| 評估維度 | AES-GCM + 錢包衍生金鑰 |
|---|---|
| **技術成熟度** | 高（Web Crypto API 為瀏覽器標準；AES-256-GCM NIST 認可） |
| **金鑰管理** | Creator 的錢包簽名 → deterministic 衍生，不需另存私鑰 |
| **解密權限控制** | 客戶端（Creator 需連上正確錢包）；無鏈上執法，但 MVP 足夠 |
| **Devnet 支援** | ✅ 完全支援，無外部依賴 |
| **外部服務依賴** | 無 |
| **整合複雜度** | 低：Web Crypto API + 現有 dApp Kit 簽名 |
| **MVP 開發時間** | 低（1–2 天可完成 round-trip 測試） |
| **離線/CI 測試** | 易（`node:crypto` 可跑 Vitest，無網路需求） |
| **金鑰遺失風險** | 低（只要 Creator 保有錢包即可恢復；與錢包安全性等同） |
| **費用** | 零 |

---

## 3. 方案對照表

| 評估維度 | Mysten Seal | AES-GCM + 錢包衍生金鑰 |
|---|:---:|:---:|
| 技術成熟度 | Beta（Testnet only） | 高（瀏覽器標準） |
| Devnet 可用 | ❌ | ✅ |
| 外部服務依賴 | Seal 金鑰服務器 | 無 |
| 離線 / CI 測試 | 困難 | 容易 |
| 解密權限（鏈上執法） | ✅ 完全去中心化 | ❌ 客戶端執法 |
| Creator 金鑰保管責任 | 無 | 等同錢包安全 |
| MVP 整合工作量 | 高（需額外 Move 合約） | 低 |
| v2 升級路徑 | 直接沿用 | 可遷移至 Seal |

---

## 4. 最終決策（MVP）

**採用方案 B：AES-GCM + Creator 錢包衍生金鑰**

**理由**：
1. **Devnet 可用**：Seal 金鑰服務器不支援 Devnet，而整個 MVP 驗收在 Devnet 上進行
2. **無外部依賴**：消除 SaaS 服務可用性風險，測試 100% 離線可跑
3. **開發速度**：MVP 時間預算有限，AES-GCM 可在 1–2 天內完成 round-trip 驗收
4. **金鑰安全同等於錢包**：Creator 的錢包若安全，資料即安全；不引入新的金鑰管理複雜度

**v2 升級路徑**：M3 實作時保留清晰的加密介面層（`encryptForCreator` / `decryptAsCreator`），v2 遷移至 Seal 只需替換底層實作，上層呼叫介面不變。

---

## 5. 實作規格（對應 T3.2 / T3.3）

### 5.1 加密常數

```typescript
const SURVEY_CONTENT_KEY_LENGTH = 32;  // AES-256-GCM
const ANSWER_NONCE_BYTES = 12;          // GCM standard nonce

// 全域訊息：與任何 vault_id / survey_id 解耦。
// 設計理由：Flow A PTB 為 atomic（invest_and_mint → create vault → register），
// 加密內容必須在 PTB 送出**前**完成，此時 vault_id 還不存在。
// Rotation：未來若需換鑰，在訊息加版本後綴（例如 `\nv2`）即可；
// 每個 blob 前 32B 已內嵌當時的 creator pubkey，dashboard 解密時可反查所屬版本。
const KEY_DERIVE_MSG = 'SurveySui encryption key';
```

### 5.2 問卷內容加密（Creator 建立問卷時）

```typescript
// 產生一次性對稱金鑰（存入 URL fragment）
const contentKey = crypto.getRandomValues(new Uint8Array(32));
const encrypted  = await aesGcmEncrypt(markdownBlob, contentKey);

// survey URL = https://…/s/{survey_id}#{base64url(contentKey)}
// encrypted blob → survey_registry::register(encrypted_blob)
```

### 5.3 答案加密（受訪者填答時）

```typescript
// 從 survey_registry 取 Creator 公鑰（survey_id → creator_pub_key）
const creatorPubKey = await fetchCreatorPublicKey(surveyId);
const encrypted     = await x25519Encrypt(answers, creatorPubKey);
// encrypted → survey_vault::claim(..., encrypted_answers)
```

### 5.4 Creator 金鑰衍生（Dashboard 解密時）

```typescript
async function deriveCreatorKey(wallet: WalletAccount) {
  const { bytes } = await wallet.signPersonalMessage({
    message: new TextEncoder().encode(KEY_DERIVE_MSG),
    account: wallet,
  });
  // 後續以 SHA-256(bytes) 為 seed，匯入 X25519 keypair（見 crypto.ts::deriveCreatorKeyPair）。
}
```

> 因 `KEY_DERIVE_MSG` 為全域常數，**同一錢包跨所有 vault 共用同一把金鑰**。
> 此設計接受「金鑰外洩 → 該創建者所有問卷皆受影響」的取捨，換取 Flow A PTB 的 atomicity。
> 未來若需金鑰隔離或 rotation，於訊息加版本後綴（如 `\nv2`），dashboard 以 blob 前 32B pubkey 反查所屬版本。

---

## 6. 參考資料

- [Mysten Seal GitHub](https://github.com/MystenLabs/seal)
- [Mysten Seal 文件](https://docs.mystenlabs.com/seal)（若連結失效請查官方 docs）
- [Web Crypto API – MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [AES-GCM 規格 – NIST SP 800-38D](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistpublicationsp800-38d.pdf)
- [X25519 ECDH – RFC 7748](https://www.rfc-editor.org/rfc/rfc7748)
