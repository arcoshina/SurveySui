# V4 進階 KYC 方案

## 守則
 - 採用安全的設計，隔離風險  
 - 改動前先確認最新的 commit  
 - 架構已經很複雜了，採用 "先完整計畫 -> 再依計畫實作 -> 確認改動有效且沒有破壞其他機制" 的工作模式  
 - 計畫時要先確認現有技術架構，例如語言、程式碼結構  
 - 目前尚未正式上線，不考慮舊合約相容性  
 - 後端使用 Serverless 架構，必要時使用 DB 或 雲存儲 SaaS  
 - 所有 env 設定都集中在根目錄 /.env 中  
 - Pool 中的 SUI 只有項目方可以提領  
 - 不再提供使用 SSR/sSSR 從 pool 中領出/存入 SR (原SSR) 的功能  


## 踩坑紀錄
 - Sui zkLogin 事實上無法協助取得 JWT ，只能協助算出地址，且不具備一般錢包的加解密功能。  
 - 認證 Gas `0.009 SUI`，需要檢查 Gas 消耗  
 - Sui 的 Passkey 不適合做為防女巫/KYC用途  
 - Walrus 儲存的單位是 63 MB 的整數  
 - 放棄自架 zkLogin，有託管資產的法律問題 

=====

## 剩 3 天
 - 6/7 需上線無重大瑕疵的版本 (到 Testnet)


## 待辦清單

- [ ] 秘密及金鑰的輪換及管理準則  
- [ ] 單簽的金鑰在上線前要改為多簽安全機制  

- [ ] 項目方 (我) 可不可追蹤填答者  

- [ ] 確認有對雙方收取合適的託管費用  
- [ ] Gas 預算設定  
- [ ] 確認題目卷及答案卷的大小門檻及總花費含 Gas：需實際測試 1、5、10、50kB 乘以存 30、90、180 天
- [ ] BFF 執行銷毀時收到的押金，扣除 Gas 後轉帳給發起人 (如果可以有權限限制，改成人工定時掃鏈退回)

env註解;修復OTP,填答頁,銷毀UI;Pass扁平化,驗NFT,選項容重


- [ ] 修復硬編碼問題
- [ ] 更多語系支援: 切換本地or英文

- [ ] Gas Station 支援高併發的 Coin Queue 管理器 (完成前先用先用 Shinami ?)  
- [ ] 跨網路方案：部分批次映射，注意預防 Testnet 清空
- [ ] 引導填寫更多問卷 (docs\專案 公開問卷探索廣場.md)

## 收尾檢查
- [ ] 檢查前端說明文案：引導、防護、設計、代付及退回機制、儲存及銷毀機制
- [ ] 檢查代幣經濟  
- [ ] 再次確認答卷上鏈的格式問題  
- [ ] 應對私鑰洩漏問題：錢包持有者可以完全銷毀錢包內的 SurveyPass，認證資訊從一個地址中刪除後，能綁到另一個地址  
- [ ] 檢查 Gas 補助的計算邏輯
- [ ] 檢查防女巫抽乾補助池的機制: 刪除 Pass 及問卷時的押金處理
- [ ] **上線前重設所有 Secrets**
- [ ] 審計公司 CertiK 有 AI 審計服務，駭客松有免費額度
- [ ] 確認佈署時的提示  
- [ ] 文件完整說明運作方式，特別是安全措施及利用的 Sui 特性




## 進度紀錄  

### 2026/6/5



### 2026/6/4
- [x] 問卷銷毀後，儀表板仍顯示進行中_Gemini  
- [x] 問卷列表與儀表板 UI 強化_Gemini  
- [x] 無錢包時，填答頁引導 (開新視窗)_Gemini  
- [x] 問卷惡意內容防護_Gemini  
- [x] 同錢包發起的不同答卷解密金鑰不同_Gemini  
- [x] 選項序列化容許重複_Gemini  
- [x] 加入開發中警告_Gemini  
- [x] 前端刪除不可用的驗證選項_Gemini

### 2026/6/3
- [x] 調整Pass預設效期：E-mail: 3個月，社群:3個月，World ID: 一年_Claude 
- [x] 卡片尺寸比例問題_Claude 
- [x] 答卷抗量子 + Nulifier 的 SALT 強化_Claude   
- [x] 答卷進金庫，可定時刪除_Claude  
- [x] 多語系支援架構_Claude  
- [x] 放棄虛擬錢包，也不用 Enoki_Claude   

### 2026/6/2  
- [x] 簡答題增加字數上限 (供發起者設定，預設 100 字)_Gemini  
- [x] 新增問卷時能完整顯示長題目_Gemini  
- [x] 選項隨機排序_Gemini
- [x] Walrus 的問卷標題問題_Gemini  
- [x] 量表的填答改滑桿，交換 必選填 及 題型 的位子_Gemini  
- [x] 問卷最長有效時間 3 個月_Gemini  
- [x] Pass 有效期限設計、過期設定與過期提示_Claude 
- [x] 展示所有 Pass_Claude

### 2026/6/1
- [x] 解鎖兩次問題是正常現象_Gemini  
- [x] 實現 Walrus 儲存機制_Gemini  
- [x] 防堵女巫抽乾代付池：BFF 代付刪除 Pass 時的 Gas 取回押金，但有自付逃生門_Claude

### 2026/5/31
- [x] 確認 World ID Simulator 只能產生一個身分_Claude   
- [x] 修改填答成功提示文字_Claude   
- [x] 防堵女巫抽乾代付池：BFF 代付刪除 Pass 時的 Gas 取回押金，但有自付逃生門_Claude   
- [x] 重部屬發現問題_Claude   
- [x] 修復 OAuth_Claude   

### 2026/5/30
- [x] 更新 Logo: 加底色_手工  
- [x] 可正常連接 World ID simulator_Claude  
- [x] Gas補助次數計算：預設只算當前 Package_Claude  
- [x] 填答區與真人認證共用元件和頁面

### 2026/5/29
- [x] Email OTP 驗證 by Resend_Claude  
- [x] 隱私資訊兩次 nullifier_Claude  
- [x] 確認 zkLogin 需要自備 Client ID_Claude  
- [x] 修復首頁的錯誤連結_Claude  
- [x] 接入 World ID 4.0（Tier 2，僅 Orb）_Claude  

### 2026/5/28
- [x] 代付Gas 相關文案及提示更新_Gemini  
- [x] 預算顯示 UI 更新_Gemini  
- [x] 統一箭頭樣式_Gemini  
- [x] 提示卡溢位問題_Gemini  
- [x] 同地址代付最多 2 次 Pass 的 Gas_Gemini
- [x] SurveyPass Tire 1 方案及初步實作_Claude  
- [x] Oauth 設定: Google、Github  
- [x] Zk login salt 設定
- [x] 申請網域 SurveySui.com  

### 2026/5/27
- [x] 規劃 Gas 代付方案_Gemini
- [x] 規劃跨子網方案_Gemini
- [x] 實作二層 Gas 代付機制_Gemini
- [x] 網頁 UI 加入代付說明_Gemini
- [x] 網頁 UI 加入 SSR 匯率_Gemini
- [x] Gas 方案定案_Gemini
