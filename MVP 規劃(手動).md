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
1. **金流層**：發起者回購 (扣除手續費) 併消耗項目代幣來建立問卷，受訪者完成合格問卷可以直接獲得獎勵代幣，自由售出 (無手續費，對手付 gas) 換取 Sui  
2. **產品層**：發起者透過前端完成「設定問卷＋獎勵條件 → 分享問卷 → 看基本結果與獎勵發放狀態」    
3. 問卷**使用 Markdown + metadata 設定**，透過後端轉換為智能合約可用的格式，把精力放在「資金流＋獎勵流」做得絲滑無縫  
4. 進階：匿名化投票系統


## MVP 規格總覽  

### 1. 角色與錢的流向  

- 發起者 (Creator): 創業者／顧問  
- 受訪者 (Respondent): 填問卷拿獎勵的人  
- 合約資產：  
  - RewardVault：每個問卷對應一個 on-chain vault object，鎖定獎勵預算。(暫定，視 SUI 區塊鏈的機制而定)  
  - RewardCoin：受訪者取得的獎勵（項目代幣質押證明 stacken object）  
  - SwapPool：讓把項目代幣換成 SUI (或其他DEX)  


### 2. 使用者流程（發起者）  

**Flow A：建立「問卷＋獎勵」活動**

1. 註冊／登入前台（連錢包）。
2. 新建「問卷活動」：  
   - 輸入標題、描述（例如「 Overflow 滿意度調查」）。  
   - 編輯問卷 Markdown 檔（MVP 只內建 1個模板 MD 檔）。
      a. MVP: 使用者可文字編輯 Markdown
      b. 基礎: 使用者可編輯 & 預覽
      c. 進階: 可串接 AI 輔助編輯
      d. 強化: 自有 RAG 資料庫給建議
3. 設定獎勵規則：
   - 填完一份的獎勵金額（例如 1 token ／人）  
     - 進階: 多階段獎勵，例如前 100份 10 token，101 ~ 1000 份 1 token，之後沒有獎勵  
   - 最多發放名額（例如 100 份）  
   - 結束時間  
   - 設定統計結果如何交付 (是否上鏈、如何加密，之類的)
   - 進階: 設定參與條件  
     - 例如國籍、年齡層、年收入、教育程度、白名單、平台積分、UID、邀請碼，之類的  
     - 不接受外部API控制  
     - 不接受事後審查/撤回  
     - 資格需要發行 NFT/DID 物件  
1. 連接 Sui 錢包並「注資」：
   - 前端顯示「問卷頁面預覽」+「預估總Token消耗」+「平台手續費」  
   - 發起一筆 PTB：  
     - 建立 RewardVault object（紀錄活動 ID、單筆獎勵、上限份數、其他必要條件）    
     - 從錢包轉入對應數量的 RewardCoin 到 vault（不需要加上安全 buffer）  
     - 進階：
       - 使用 SUI 自動 swap 成 RewardCoin，手續費有折扣  
       - 可設定追加金額和份數，或更新條件  
結果：產生一個「活動連結」，前端 URL + 後端對應一個 on-chain RewardVault ID  


### 3. 使用者流程（受訪者）

**Flow B：填答 & 拿獎勵**

1. 點擊發起者分享的問卷連結，連到前端網站（RWD，mobile-first）。  
2. 引導社群登入註冊/連錢包。
3. 進入問卷：
   - 後端驗證：  
     - 該活動尚有剩餘名額  
     - 該地址未領過（避免重複領獎/女巫）  
     - 未通過導向適當說明頁面  
4. 填完問卷（前端表單，暫存於後端）  
     - 填完顯示預覽，讓受訪者能再次確認內容  
5. 受訪者送出問卷
     - 後端再次檢查資格及表單完整性
     - 後端呼叫合約發起 PTB：  
       - 從 RewardVault 轉出 stacked RewardCoin 獎勵給該地址  
       - 問卷結果加密後上鏈 (發起人可選)
       - 前端顯示結果
6. 受訪者在鏈上資訊確認：  
   - 收到正確的 Rewardcoin  
   - 進階：額外的參與積分/token

### 4. 使用者流程（活動結束後）

**Flow C：發起者收尾 & 資金管理**

1. 活動進行中，在 dashboard 裡看到：  
   - 回覆數、完成率、基本統計表（單選長條圖、量表平均分數等），延用原本 MVP 的簡易分析概念。
   - 各種設定：已發放份數、已花費獎勵金額、剩餘 vault 餘額、結束時間。  
2. 達成結束條件：  
   - 時間超過設定  
   - RewardVault 餘額用盡  
3. 一鍵「結束活動」按鈕：
   - 發起 PTB：  
     - 關閉 RewardVault，不再接受新回覆  
     - 更新問卷狀態和顯示內容  
     - 把剩餘資金退回發起者的錢包
4. 送出結果：
   - 依照設定方法送出結果 (e-mail通知、鏈上記錄，之類的)


# 編輯進度到此


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
   - 不做進階邏輯（跳題）—為了把資源集中在金流/DeFi 這一側。

3. 發佈與填答體驗
   - 問卷 public link + QR code（維持你原本 MVP 的優點）。
   - RWD 響應式設計，手機填寫順暢。 

4. 基本分析
   - 回覆數、完成率、平均填答時間。  
   - 單選／多選長條圖、量表平均分數與簡單分布圖。  
   - 支援匯出 CSV（以方便後續進階分析）。


### B. On-chain 核心（Sui Move + PTB）

1. RewardVault 模組
   - create_vault(creator, coin, reward_per_user, max_recipients)。  
   - fund_vault(vault, additional_funds)。  
   - close_vault_and_refund(creator)：結束活動，把剩餘資金退回或轉入另一合約。

2. RewardTicket 模組
   - issue_ticket(vault, recipient_addr)：檢查剩餘名額、標記該地址已領。  
   - redeem_ticket(ticket)：從 vault 轉出 reward_per_user 的 coin 到持有者；或由系統批次兌換。  

3. Programmable Transaction Blocks 用法
   - 創建活動時：一筆 PTB 同時完成「create_vault + fund_vault」。
   - 受訪者領獎時：  
     - 一筆 PTB 完成「issue_ticket + （可選）redeem_ticket」；或兩階段設計，用來展示不同金融 workflow。  
   - 結束活動：一筆 PTB 完成「close_vault_and_refund + optional deposit into DeFi 策略」。


### C. 安全與風險控管（MVP 等級）

- 每個 vault 只允許預設的合約方法提領，不可被任意地址抽乾。  
- 在 off-chain 層加上簡單的防濫用：  
  - 同一地址／IP／Email 僅能領一次（MVP 可以先從地址＋Email）。
- 前端清楚顯示：  
  - 已發放份數／剩餘份數／vault 價值。  
- 合約層可以加一個「每日發放上限」參數，避免誤設置超大獎勵被機器人瞬間抽空。


## 哪些你原本 MVP 要「砍掉」或「延後」

為了更聚焦 Sui 賽道評審想看的東西，可以刻意先不做：

- 複雜問卷邏輯（跳題、矩陣題等）。
- 多種獎勵類型（先鎖定一種最主流的鏈上資產：SUI 或穩定幣）。  
- 多金流入金方式（信用卡／本地金流），因為現在 vault 注資直接用鏈上轉帳即可。 
- 進階分析／顧問模組（留給 pitch 或未來 roadmap）。

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

這樣一套 flow 非常對齊「Payments & DeFi today disconnected → on Sui, payments become programmable financial actions」的敘事，也完全呼應你原本產品核心——問卷＋獎勵——只是把「獎勵金流」升級到鏈上 programmable money。 