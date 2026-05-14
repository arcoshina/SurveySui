# Sui Overflow 2026  

這個專案的目的是製作參加黑克松的 MVP  
這個專案只是起點，我希望持續發展這個項目  
瞄準 [DeFi & Payments Problem Statement 賽道](https://mystenlabs.notion.site/defi-payments-problem-statement)的要求  

## MVP 方向：區塊鏈上的問卷平台  

在 SUI 上利用區塊鏈的特性打造流暢的**問卷激勵平台**，協助初創或 NPO 蒐集輿情  


## 一句話定位 & 使用者  

- 產品定位：  
  「給小型創業者用的鏈上問卷獎勵系統：用明確、可控且即時的激勵系統，有效率地蒐集回饋。」  

- 主要使用者：  
  - 小型創業者／電商／自有品牌主：原本就需要問卷＋獎勵來驗證市場。  
  - 行銷／顧問接案者：幫客戶跑小型調查，希望獎勵發放更透明可靠。  
  - 學術研究者：蒐集學術論文所需的問卷資料。  


## MVP 要證明什麼  

用最小功能證明兩件事：  
1. **金流層**：調查者回購併消耗項目代幣來建立問卷，受訪者完成合格問卷可以直接獲得獎勵代幣，自由售出獲得 Sui  
2. **產品層**：調查者透過前端完成「設定問卷＋獎勵條件 → 分享問卷 → 看基本結果與獎勵發放狀態」    
3. 問卷**使用 Markdown + metadata 設定**，透過後端轉換為智能合約可用的格式，把精力放在「資金流＋獎勵流」做得絲滑無縫  


## MVP 規格總覽  

### 1. 角色與錢的流向  

- 發起者（Creator）：創業者／顧問  
- 受訪者（Respondent）：填問卷拿獎勵的人  
- 合約資產：  
  - RewardVault：每個問卷對應一個 on-chain vault object，鎖定獎勵預算。  
  - RewardTicket：受訪者取得的一次性兌獎權利（NFT 或 object）。  
  - RewardCoin：用 SUI 或 USDC 類型穩定幣（視 Sui 目前常用資產而定）。  


### 2. 使用者流程（創業者）  

**Flow A：建立「問卷＋獎勵」活動**

1. 註冊／登入前台（Web2 身份即可，錢包另外連）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
2. 新建「問卷活動」：  
   - 輸入標題、描述（例如「Landing Page 設計 A/B 測試」）。  
   - 選擇問卷模板（MVP 只內建 2–3 個常見版型：滿意度、概念測試、NPS）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
   - 填一些簡單題目（單選、多選、1–5 分量表）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
3. 設定獎勵規則：
   - 單一固定獎勵金額（例如 1 USDC／人）。  
   - 最多發放名額（例如 100 份）。  
4. 連接 Sui 錢包並「注資」：
   - 前端顯示「預估總獎勵金額＋平台手續費」，類似你原本的預估總成本視覺，但基於鏈上資產。 [overflow.sui](https://overflow.sui.io)
   - 發起一筆 PTB：  
     - 建立 RewardVault object（紀錄活動 ID、單筆獎勵、上限份數）。  
     - 從錢包轉入對應金額到 vault（加上安全 buffer，例如多 5–10%）。 [overflow.sui](https://overflow.sui.io)

結果：產生一個「活動連結」，前端 URL + 後端對應一個 on-chain RewardVault ID。


### 3. 使用者流程（受訪者）

**Flow B：填答 & 拿獎勵**

1. 點擊創業者分享的問卷連結（RWD，mobile-first，保留你原本的體驗優勢）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
2. 填完問卷基本題目（前端表單，暫時仍 off-chain 儲存於後台 DB）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
3. 填入錢包地址或直接用 Sui wallet connect 簽名授權地址（MVP 可以先只支援「輸入地址 + 稍後發放」）。  
4. 按送出後：
   - 後端驗證：  
     - 該活動尚有剩餘名額。  
     - 該地址未領過（避免重複領獎）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
   - 若通過，後端呼叫合約發起 PTB：  
     - 從 RewardVault 轉出一個 RewardTicket 給該地址。  
     - 可選：同一筆 PTB 立即將 RewardCoin 發給受訪者（真正做到「submit → receive」同一筆交易），或先發 Ticket，之後再批次兌換。  
5. 受訪者在錢包裡看到：  
   - 一個 RewardTicket NFT（若設計為 ticket 模式）。  
   - 或直接收到 USDC / SUI 獎勵。

MVP 可以先實作「Ticket + 批次兌換」或「直接發放」其中一種，只要把可程式化金融流程做清楚即可。 [overflow.sui](https://overflow.sui.io)


### 4. 使用者流程（活動結束後）

**Flow C：創業者收尾 & 資金管理**

1. 在 dashboard 裡看到：
   - 回覆數、完成率、基本圖表（單選長條圖、量表平均分數等），延用原本 MVP 的簡易分析概念。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
   - 餘額狀態：已發放份數、已花費獎勵金額、剩餘 vault 餘額。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
2. 一鍵「結束活動」按鈕：
   - 發起 PTB：  
     - 關閉 RewardVault，不再接受新回覆領獎。  
     - 把剩餘資金退回創業者 Sui 錢包，或選擇「自動轉入某個 yield vault／穩定幣策略」作為加分點（整合現有 Sui DeFi protocol 即可）。 [overflow.sui](https://overflow.sui.io)

這一段是很符合賽道「付款 → swap → deposit」一次打包成 PTB 的展示空間，可以作為 top-tier 要求裡「novel use of programmable transactions」的亮點。 [overflow.sui](https://overflow.sui.io)


## MVP 功能列表（對齊 Sui 賽道版）

### A. 前台／後台（產品層）

1. 帳號與活動管理（簡化版）
   - Email 註冊／登入。  
   - 問卷活動列表：建立／關閉／刪除活動。  
   - 每個活動對應一個鏈上 RewardVault ID。

2. 問卷建立
   - 僅提供少數常用模板：  
     - 概念測試（5–10 題）。  
     - 滿意度調查（5–10 題）。  
   - 題型：單選、多選、1–5 分量表。  
   - 不做進階邏輯（跳題）—為了把資源集中在金流/DeFi 這一側。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)

3. 發佈與填答體驗
   - 問卷 public link + QR code（維持你原本 MVP 的優點）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
   - RWD 響應式設計，手機填寫順暢。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)

4. 基本分析
   - 回覆數、完成率、平均填答時間。  
   - 單選／多選長條圖、量表平均分數與簡單分布圖。  
   - 支援匯出 CSV（以方便後續進階分析）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)


### B. On-chain 核心（Sui Move + PTB）

1. RewardVault 模組
   - create_vault(creator, coin, reward_per_user, max_recipients)。  
   - fund_vault(vault, additional_funds)。  
   - close_vault_and_refund(creator)：結束活動，把剩餘資金退回或轉入另一合約。

2. RewardTicket 模組
   - issue_ticket(vault, recipient_addr)：檢查剩餘名額、標記該地址已領。  
   - redeem_ticket(ticket)：從 vault 轉出 reward_per_user 的 coin 到持有者；或由系統批次兌換。  

3. Programmable Transaction Blocks 用法
   - 創建活動時：一筆 PTB 同時完成「create_vault + fund_vault」。 [overflow.sui](https://overflow.sui.io)
   - 受訪者領獎時：  
     - 一筆 PTB 完成「issue_ticket + （可選）redeem_ticket」；或兩階段設計，用來展示不同金融 workflow。  
   - 結束活動：一筆 PTB 完成「close_vault_and_refund + optional deposit into DeFi 策略」。 [overflow.sui](https://overflow.sui.io)


### C. 安全與風險控管（MVP 等級）

- 每個 vault 只允許預設的合約方法提領，不可被任意地址抽乾。  
- 在 off-chain 層加上簡單的防濫用：  
  - 同一地址／IP／Email 僅能領一次（MVP 可以先從地址＋Email）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
- 前端清楚顯示：  
  - 已發放份數／剩餘份數／vault 價值。  
- 合約層可以加一個「每日發放上限」參數，避免誤設置超大獎勵被機器人瞬間抽空。


## 哪些你原本 MVP 要「砍掉」或「延後」

為了更聚焦 Sui 賽道評審想看的東西，可以刻意先不做：

- 複雜問卷邏輯（跳題、矩陣題等）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
- 多種獎勵類型（先鎖定一種最主流的鏈上資產：SUI 或穩定幣）。  
- 多金流入金方式（信用卡／本地金流），因為現在 vault 注資直接用鏈上轉帳即可。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/d0aae4e4-a8b6-42c4-9f44-499369148cff/mvp-small-founder-saas.md)
- 進階分析／顧問模組（留給 pitch 或未來 roadmap）。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/3a16c164-54c0-4eb2-9a6f-8070bd02eba1/pestel-small-founder-saas.md)

這樣可以讓你在 hackathon 期間把時間集中在：
- 合約安全性與資產所有權處理正確。  
- PTB 流程設計得漂亮（Demo 好講故事）。  
- 創業者端的 UX 夠直覺，真的做到「建立活動 → 一鍵注資 → 分享 → 自動發獎 → 結束活動退剩餘資金」。


## 如果你要馬上做 Demo，可以的情境腳本

- 情境：  
  「一個台北小型品牌要驗證新包裝設計，願意拿出 100 USDC 當問卷獎勵。」  

- Demo 步驟：
  1. 創業者登入 → 建立活動 → 設定每人 1 USDC，上限 80 人 → 連接 Sui wallet 注資 100 USDC（包含 buffer）。  
  2. 展示 on-chain vault 已建立，前台顯示「預算 100 USDC，可發 80 份」。  
  3. 找現場一位評審／觀眾掃 QR code → 填問卷 → 填入 Sui 地址 → 點提交。  
  4. 畫面顯示「恭喜完成，1 USDC 已發送到你的錢包」，評審在 Sui wallet 看到收到資產。  
  5. 回到創業者 dashboard，看到已完成 1 份、已發放 1 USDC、剩餘 99 USDC。  
  6. 最後示範「結束活動」→ vault 關閉，剩餘資金退回創業者錢包或自動轉入一個 yield vault。  

這樣一套 flow 非常對齊「Payments & DeFi today disconnected → on Sui, payments become programmable financial actions」的敘事，也完全呼應你原本產品核心——問卷＋獎勵——只是把「獎勵金流」升級到鏈上 programmable money。 [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_6947d2b0-4f14-4777-85e7-ce6904225e8e/6c4a9c25-eac8-4249-9434-7347a4cfe4fc/5w1h-small-founder-saas.md)

如果你願意，我可以下一步幫你把這個 MVP 切成「合約待開發任務清單」＋「前端介面 wireframe 大綱」，方便你直接丟給團隊。