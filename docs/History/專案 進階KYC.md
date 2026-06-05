# SurveySui: 基於 ZK-SNARK 的隱私屬性驗證長期方案

本方案旨在解決「如何根據使用者自我揭露的個人資訊（如年齡、國籍、資產等）判斷填答資格，同時確保這些個人資訊不被任何人（包括問卷發起者、BFF 後端及鏈上）得知，且答卷與使用者錢包地址完全解耦」的終極隱私問題。

---

## 一、 混合式憑證體系 (Hybrid Credentials)

為兼顧「採集便利性」與「防偽防女巫強度」，系統採行**混合憑證架構**。使用者的 `SurveyPass` 下可掛載多個不同來源（Issuer）的 `CredentialSlot`：

```
                    +---------------------------------------+
                    |           SurveyPass (SBT)            |
                    +---------------------------------------+
                                        |
      +---------------------------------+---------------------------------+
      | (Dynamic Field)                                                   | (Dynamic Field)
      v                                                                   v
+-----------------------------+                                     +-----------------------------+
|    CredentialSlot (BFF)     |                                     |  CredentialSlot (Reclaim)   |
+-----------------------------+                                     +-----------------------------+
| 屬性: 不重複真人、護照/身分證 |                                     | 屬性：自我申報、Web2 帳戶資訊 |
|       特定鏈上資產憑證       |                                     | 驗證方式：TLS 證明 (無許可)  |
| 驗證方式：BFF 審查/人臉      |                                     | 隱私承諾：Poseidon Hash     |
| 隱私承諾：Poseidon Hash     |                                     |                            |
+----------------------------+                                     +----------------------------+
```

1. **半中心化憑證 (BFF-verified)**：
   * **適用場景**：極易造假、必須嚴格去重、或**鏈上特定資產（特定 NFT、物件、特定代幣餘額）持有證明**。
   * **機制**：使用者向 BFF 提交實名資料，或由 BFF 透過 Sui RPC 鏈上快照查詢使用者錢包是否持有該 NFT 或餘額。BFF 驗證無誤後，計算鹽值雜湊並進行數位簽章，由使用者將其承諾寫入 `CredentialSlot`。
2. **去中心化憑證 (Reclaim / zkPass)**：
   * **適用場景**：容易獲取、不涉及嚴格法定實名的 Web2 資訊（如：GitHub 帳戶年資、LinkedIn 職業、網路銀行餘額、Amazon 消費頻率）。
   * **機制**：使用者在前端透過 MPC-TLS 產生證明，直接將憑證承諾寫入 `CredentialSlot`，BFF 不會接觸到 any 明文隱私。

---

## 二、 鏈上資產隱私驗證（特定 NFT、物件、代幣餘額）

若問卷限制「必須持有特定 NFT（如某個 Collection）」或「SUI 餘額大於 100」，但填答又必須匿名，**我們不能直接把 NFT 或錢包地址作為交易引數傳給合約**（否則會在區塊鏈瀏覽器上直接暴露關聯）。

本方案提供兩種實現路徑：

### 方案 A：BFF 憑證化（推薦，開發與 Gas 成本最低）
此方案將「鏈上資產」轉化為「SurveyPass 的一個隱私屬性槽」：

1. **資產快照**：使用者用持有資產的實名錢包登入，BFF 呼叫 Sui RPC（例如 `suix_getOwnedObjects` 或 `suix_getCoins`）驗證使用者是否確實持有該資產。
2. **憑證發行**：BFF 簽發一個資產持有憑證：
   $$\text{Commitment}_{\text{asset}} = \text{Poseidon}(\text{Asset\_Schema\_ID}, \text{Asset\_Amount}, \text{salt})$$
   * `Asset_Schema_ID`：例如 `HASH("NFT::0x...::MyCollection")` 或 `HASH("COIN::SUI")`。
   * `Asset_Amount`：對於 NFT 為 `1` (代表持有)；對於代幣為確切餘額（例如 `100`）。
3. **註冊上鏈**：使用者將此憑證寫入 `SurveyPass` 的 `CredentialSlot`。
4. **匿名填答**：填答時，ZK 電路只需證明「我的 `SurveyPass` 中包含一個被 BFF 簽署的該資產憑證，且 `Asset_Amount >= 門檻`」。

### 方案 B：純鏈上 ZK 帳戶解耦（無須更新 SurveyPass，隱私性最高）
若使用者不想每次資產變動都跑一次「更新 SurveyPass」的鏈上交易，可採用此方案：

1. **使用者準備**：使用者擁有「資產錢包 A」（持有 NFT/代幣）與「填答錢包 B」（乾淨無關聯的錢包，或交由 Relayer 代付）。
2. **ZK Proof 生成**：
   * 在前端，使用者使用錢包 A 的私鑰對問卷挑戰碼簽章：$\text{sig} = \text{Sign}_{A}(\text{vault\_id})$。
   * **公開輸入**：Sui 鏈上某個歷史高度的 **NFT 持有人 Merkle 樹根 (State Root)**。
   * **隱私輸入**：錢包 A 的公鑰 $PK_A$、簽章 $\text{sig}$、錢包 A 的 Merkle Inclusion Proof（證明 $PK_A$ 在持有人樹根中）。
   * **ZK 約束**：證明「我知道一個公鑰 $PK_A$ 存在於該 NFT 持有人名單中，且此簽章確實是由該公鑰的私鑰所簽署」。
3. **提交填答**：以錢包 B 或 Relayer 提交答卷、$\text{sig}$、ZK Proof 與 $\text{Nullifier} = \text{Poseidon}(PK_A, \text{vault\_id})$（防止錢包 A 重複填答）。
4. **效果**：合約能確保「填答者控制著持有該 NFT 的錢包」，但**完全不知道該錢包到底是哪一個**，且無須更新 `SurveyPass`。

---

## 三、 複雜條件篩選：通用邏輯求值電路 (Universal Evaluation Circuit)

問卷發起人可能設定非常複雜的篩選規則，例如：`同時滿足 A、B、C 且不在 D 集合中，或符合 E 條件`。

由於 Groth16 需要在編譯期確定電路約束（無法針對每個問卷動態編譯），我們採用 **通用 AST 邏輯求值電路 (Universal AST Evaluation Circuit)** 的架構：

```
[ 問卷篩選門檻 (AST JSON) ] 
        |
        v 解析為操作碼 (Opcodes) 與常數 (Constants)
+-----------------------------------------------------------------------+
| ZK 電路 (Groth16 Verifier)                                            |
|                                                                       |
|  [公開輸入]                                                           |
|    - opcodes: [AND, OR, NOT, IN, GTE] (定義運算邏輯)                  |
|    - constants: [18, "TW", ["Blacklist_ID_1", "Blacklist_ID_2"]]      |
|                                                                       |
|  [隱私輸入]                                                           |
|    - user_attributes: [age=20, country="TW", sbt_id="ID_3"]           |
|                                                                       |
|  [電路約束]                                                           |
|    1. 驗證 user_attributes 是否與鏈上 SurveyPass 的屬性承諾吻合       |
|    2. 依據 opcodes 逐步對 user_attributes 與 constants 進行邏輯求值  |
|    3. 約束最後的求值輸出必須為 1 (True)                               |
+-----------------------------------------------------------------------+
```

* **運作機制**：將邏輯條件序列化為一組固定的**操作碼（Opcodes）陣列**與**常數（Constants）陣列**，作為 ZK 的**公開輸入**。使用者的真實屬性則作為**隱私輸入**。電路內部模擬一個簡單的堆疊式計算機（Stack Machine），在零知識的前提下計算出該使用者的屬性是否滿足該操作碼陣列的限制。

---

## 四、 SurveyPass 門檻 Gatekeeping (防 Relayer DDoS 攻擊)

為了解決「匿名填答時，Relayer (Gas Station) 幫忙出 Gas，可能被惡意機器人狂刷 Proof 抽乾補助池」的威脅，我們利用 `SurveyPass` 的 Tier 機制建立防禦牆：

```
[用戶提交請求] ---> [Relayer (Gas Station)] ---> [驗證 SurveyPass Tier] ---> [驗證 ZK Proof] ---> [代付 Gas 送上鏈]
```

### 1. 驗證流程 (Gatekeeping Flow)
1. **初期階段**：
   * 暫時沿用現有 Ticket 機制，在 BFF 進行基本的 IP 限制與前端挑戰（CAPTCHA）。
2. **未來階段 (SurveyPass Gatekeeping)**：
   * 使用者向 Relayer 提交填答請求時，除了答卷與 ZK Proof 外，必須額外提供一個**身分所有權證明（Ownership Proof）**。
   * 此證明由 ZK 電路生成，向 Relayer 證明：「我持有一個在鏈上樹中的有效 `SurveyPass`，且該 Pass 的 `effective_tier >= 1`（例如已通過 Email 或 Social 驗證），且我的 `Nullifier` 在此問卷未被使用過。」
   * Relayer 進行鏈下快速驗證（毫秒級），若符合 Tier 限制且屬合法身分，才代理發送交易並幫忙代付 Gas。

### 2. 效益
* **防女巫攻擊 (Anti-Sybil)**：攻擊者若要消耗您的 Gas，必須先擁有 Tier 1 以上的 `SurveyPass`。由於 Tier 1 需要 Email OTP 或 Social 驗證，這極大地提高了攻擊者的防女巫成本（Sybil Cost）。
* **保護 Relayer 金庫**：免於被無效的垃圾證明（DDoS）抽乾代付池。

---

## 五、 混合式 ZK 證明的合約實現 (Sui Move)

在 Sui 合約中，將維護 `CommitmentTree` (包含所有已發行 Pass 的 Commitment) 與 `CredentialRegistry`：

```move
// 鏈上匿名驗證接口
public fun submit_anonymous_answer_with_rules(
    proof: vector<u8>,
    nullifier: vector<u8>,
    ast_root: vector<u8>, // 代表篩選規則的特徵值
    tree_root: vector<u8>,
    encrypted_answers: vector<u8>,
    ctx: &mut TxContext
) {
    // 1. 檢查 NullifierRegistry，避免重複填答
    assert!(!nullifier::is_used(nullifier), error::ALREADY_SUBMITTED);
    
    // 2. 呼叫 Sui 原生 Groth16 Verifier 驗證 ZK Proof
    // Proof 內含：
    //   a. 身分確實存在於 tree_root (證明擁有 SurveyPass)
    //   b. 隱私屬性符合 ast_root 所定義的複雜條件
    let is_valid = sui::groth16::verify_groth16_proof(
        verifying_key,
        public_inputs(nullifier, ast_root, tree_root),
        proof
    );
    assert!(is_valid, error::INVALID_PROOF);
    
    // 3. 記錄 Nullifier 並儲存加密答卷
    nullifier::register(nullifier);
    vault::store_encrypted_answer(encrypted_answers);
}
```

---

## 六、 發起人自主選擇：弱匿名直接標記 vs. BFF 即時一次性簽章（無 ZK 替代方案）

為降低開發與 Gas 成本，且不強制依賴複雜的前端 ZK 電路，本系統提供一個**由問卷發起人自主選擇的「雙軌制資產驗證方案」**：

```
                    +---------------------------------------+
                    |           問卷發起人選擇模式           |
                    +---------------------------------------+
                                        |
       +--------------------------------+--------------------------------+
       |                                                                 |
       v (選擇弱匿名)                                                    v (選擇強匿名)
+-----------------------------+                                   +-----------------------------+
|    弱匿名：合約直接標記     |                                   |  強匿名：BFF 即時一次性簽章 |
+-----------------------------+                                   +-----------------------------+
| * 錢包 A 直接發交易         |                                   | * 錢包 A 向 BFF 請求驗證    |
| * 合約直接修改或標記 NFT    |                                   | * BFF 驗證後簽發 Ticket     |
| * 無需 BFF 參與             |                                   | * 錢包 B / Relayer 送交易   |
| * 缺點：鏈上交易歷史暴露關聯|                                   | * BFF 離線時此模式暫停服務   |
+-----------------------------+                                   +-----------------------------+
```

### 軌道 1：弱匿名路徑 —— 合約直接標記
* **適用場景**：問卷發起人接受「外界知道哪些錢包地址參與了填答（ Participation Privacy 可見）」，但「答卷內容依然加密保密（Content Privacy）」的問卷。
* **運作機制**：
  1. 使用者用「持有特定 NFT 的錢包 A」直接向合約發送交易。
  2. 合約直接檢查該 NFT 是否屬於限制目標，並在 NFT 物件上寫入 Dynamic Field 或修改狀態（標記該問卷 `vault_id` 已填答）。
  3. 寫入加密答卷。整個過程**完全不需要 BFF 參與**，即使 BFF 離線也能正常運作。

### 軌道 2：強匿名路徑 —— BFF 即時一次性短效簽章 (BFF Real-time Ticket)
* **適用場景**：發起人需要「絕對的匿名」，既不能洩漏答卷內容，也不能在鏈上暴露填答者錢包與答卷的任何交易關聯。
* **運作機制**：
  1. **即時驗證**：使用者用「持有特定 NFT 的實名錢包 A」登入，向 BFF 發起即時資格驗證。
  2. **重複檢查與 Ticket 簽發**：
     * BFF 在其資料庫中記錄「錢包 A 已為 `vault_id` 申請過一次性 Ticket」，防止重複申請。
     * BFF 透過 Sui RPC 確認錢包 A 持有該 NFT。
     * BFF 產生一個臨時的隨機 `ephemeral_nullifier`。
     * BFF 使用私鑰（僅後端持有）為此 Ticket 進行數位簽署：
       $$\text{Ticket} = \text{Sign}_{\text{BFF}}(\text{vault\_id}, \text{ephemeral\_nullifier}, \text{expires\_at})$$
       其中 `expires_at` 設為非常短的效期（如：5 分鐘內有效，僅當次交易有效）。
  3. **無關聯提交**：
     * 前端收到 Ticket 後，**切換到一個乾淨的錢包 B，或透過匿名 Relayer** 提交答卷、$\text{Ticket}$ 與 $\text{ephemeral\_nullifier}$ 給合約。
  4. **合約驗證**：
     * 合約核對 BFF 的簽章合法、`vault_id` 符合、且 `expires_at` 未過期。
     * 合約將 `ephemeral_nullifier` 寫入鏈上已使用清單（防重複提交）。
     * 合約接收加密答卷。
* **安全性與權衡**：
  * **高隱私度**：因為 Ticket 中的 `ephemeral_nullifier` 是臨時隨機的，且是由 Relayer/錢包 B 送出交易，鏈上**完全沒有錢包 A 的蹤跡**。只要 BFF 不在公開日誌中關聯 `Wallet_A` 與 `ephemeral_nullifier`，即可達成等同於 ZK 的強匿名效果。
  * **局限性**：此模式**高度依賴 BFF 的即時在線服務**。若 BFF 離線，使用者將無法取得即時簽章，因此該問卷在此時段將無法進行強匿名填答。

---

## 七、 強匿名模式的經濟與收費機制 (Monetization Models)

由於強匿名模式涉及 **BFF 的伺服器運算/RPC 快照開銷**，以及 **Relayer (Gas Station) 的墊付代付費用**，為維持商業可持續性，設計以下三層收費與預算機制：

### 1. 發起人端 (Creator Side)：按量計費與高階服務附加費
強匿名服務主要向**問卷發起人**收費，因為發起人是獲得高品質隱私數據的最終受益者。

* **代付金庫預存機制 (Sponsorship Gold Pool)**：
  * 發起人創建問卷時，必須在合約建立一個 **Sponsorship Pool (代付池)**，預先存入 SUI。
* **強匿名填答服務費 (Premium Per-Response Fee)**：
  * 每當有一筆強匿名答卷被成功提交（合約成功驗證 BFF 簽章並寫入答卷），合約將自動從該問卷的 Sponsorship Pool 扣除：
    $$\text{Total Deducted} = \text{GasCost}_{\text{Tx}} + \text{PremiumFee}_{\text{Treasury}}$$
  * `GasCost` 補償給提交交易的 Relayer。
  * `PremiumFee`（例如每份答卷收取固定 0.05 SUI 或答卷金額的 5%）直接轉帳至**項目方國庫錢包 (Treasury Wallet)**。

### 2. BFF 端的防刷單控制 (BFF-level Rate Limiting & Billing)
為了防止發起人的 Sponsorship Pool 餘額不足，或者惡意用戶大量請求 Ticket 導致 BFF 負載過高：

* **餘額預先檢查**：
  * 使用者向 BFF 請求簽發 Ticket 時，BFF 會先查詢鏈上該問卷的 Sponsorship Pool 餘額是否 $\ge \text{估計費用}$。若餘額不足，BFF 直接拒絕提供即時驗證與簽發服務。
* **頻率防護 (Anti-DDoS)**：
  * 對單一 IP / 單一錢包 A 實行短時間內（如 1 分鐘內）最多申請 1 次 Ticket 的限制。BFF 的 Ticket 設有 5 分鐘過期機制，過期未提交則視為廢棄。

### 3. 填答者端 (Respondent Side)：零摩擦與獎勵機制
* **零摩擦 (Zero Friction)**：由於發起人代付了 Gas 與服務費，填答者無須支付任何 SUI（Gas 顯示為 0），提高了強匿名問卷的填答意願。
* **激勵發放解耦**：若問卷有填答獎勵（例如每人可得 0.5 SUI 填答金），合約在強匿名驗證成功後，會將獎勵金直接發送給**錢包 B（匿名提交地址）**，這同時保護了使用者的獎勵收款隱私，避免獎勵直接轉給實名錢包 A 導致地址被聯集分析。
