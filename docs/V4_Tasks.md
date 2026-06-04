# V4 進階 KYC 方案
## 守則
 - 採用安全的設計，隔離風險  
 - 改動前先確認最新的 commit   
 - Pool 中的 SUI 只有項目方可以提領  
 - 不再提供使用 SSR/sSSR 從 pool 中領出/存入 SR (原SSR) 的功能  
 - 後端使用 Serverless 架構，必要時使用 DB 或 雲存儲 SaaS  
 - 後端和前端互不信任，傳輸的資訊全部都要檢查過  
 - V4 架構已經很複雜了，採用 "先完整計畫 -> 再逐步實作 -> 確認改動" 的模式  
 - 所有 env 設定都集中在根目錄 /.env 中


## 待辦清單
- [ ] 問卷銷毀後，儀表板仍顯示進行中  

- [ ] 無錢包時，填答頁引導 (開新視窗)  

- [ ] 檢查問卷是否含有惡意內容 (發起)
- [ ] 檢查答卷是否含有惡意內容 (填答)

- [ ] 制定機密輪換政策    

- [ ] 單簽的金鑰在上線前要改為多簽安全機制  

- [ ] BFF 執行銷毀時收到的押金，扣除 Gas 後轉帳給發起人 (如果可以有權限限制，改成人工定時掃鏈退回)
- [ ] 確認不同問卷能不能產生不同的答卷加解密金鑰  

抗量子、問卷到期銷毀、多語系架構、多Pass機制與UI

- [ ] 項目方 (我) 可不可追蹤填答者  

- [ ] 確認有對雙方收取合適的託管費用
- [ ] 填答時的 Gas 預算設定
- [ ] 確認題目卷及答案卷的大小門檻及總花費含 Gas：需實際測試 1、5、10、50kB 乘以存 30、90、180 天
- [ ] 跨網路方案 (部分批次映射)

- [ ] 重新修復選項去重問題  

- [ ] 確認文案
- [ ] 更多語系支援: 切換本地or英文
- [ ] 引導填寫更多問卷 (docs\專案 公開問卷探索廣場.md)
- [ ] 顯示曾經填過的問卷?


## 進度紀錄  

### 2026/6/3
- [x] 調整Pass預設效期：E-mail: 3個月，社群:3個月，World ID: 一年_Claude 
- [x] 卡片尺寸比例問題_Claude 
- [x] 答卷抗量子 + Nulifier 的 SALT 強化_Claude   
- [x] 答卷進金庫，可定時刪除_Claude  
- [x] 多語系支援架構_Claude  
- [x] 放棄虛擬錢包，也不用 Enoki_Claude   


抗量子、問卷到期銷毀、多語系架構、多Pass機制與UI

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
- [~] 防堵女巫抽乾代付池：BFF 代付刪除 Pass 時的 Gas 取回押金，但有自付逃生門_Claude   
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



