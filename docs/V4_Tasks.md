# V4 進階 KYC 方案

## 守則
 - 採用安全的設計，隔離風險  
 - 改動前先確認最新的 commit  
 - 架構已經很複雜了，採用 "先完整計畫 -> 再依計畫實作 -> 確認改動有效且沒有破壞其他機制" 的工作模式  
 - 計畫時要先確認現有技術架構，例如語言、程式碼結構  
 - 後端使用 Serverless 架構，必要時使用 DB 或 雲存儲 SaaS  
 - 使用 i18n 架構，文字不要硬編碼  
 - 目前尚未正式上線，不考慮舊合約相容性  
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

## 待辦清單

- [ ] 完成前端說明文件，注意要遵守 ./docs/Style_Guide.md
- [ ] Ticket issuer 改 threshold multisig / KMS（Phase 3+）  
- [x] Gas 代付 2-of-3 multisig ；見 /安全指引.md、/託管架構.md  
- [x] 秘密及金鑰的輪換及管理準則  ./安全指引.md  
- [x] 檢查代幣經濟已對齊 ./system_design/TokenEconomics.md 


## 收尾檢查
- [ ] Env 集中在一個檔案，加註解（模板見 ./安全指引.md 
- [ ] 檢查前端說明文案：引導、防護、設計、代付及退回機制、儲存及銷毀機制
- [ ] 再次確認答卷上鏈的格式問題  
- [ ] 應對私鑰洩漏問題：錢包持有者可以完全銷毀錢包內的 SurveyPass，認證資訊從一個地址中刪除後，能綁到另一個地址  
- [ ] 確認 OAuth JWT 有驗簽
- [ ] 檢查 Gas 補助的計算邏輯
- [ ] 檢查防女巫抽乾補助池的機制: 刪除 Pass 及問卷時的押金處理
- [ ] **上線前重設所有 Secrets** ./安全指引.md  
- [ ] 確認佈署時的提示  
- [ ] 文件完整說明運作方式，特別是安全措施及利用的 Sui 特性
- [ ] 銷毀 Pass時的提示 message

## 進度紀錄  

### 2026/6/13
- [~] 確認文件內容_手動
    - [x] 身分認證  
    - [x] 費用與代付  
    - [x] 常見問題  
    - [ ] Overflow 2026 亮點說明
- [x] Markdown 表格渲染_opus  
- [x] 文檔導覽及頁面布局調整_手動  
- [x] 統一全站頁腳_opus  
- [ ] 警語文案修改_手動  
- [ ] 補足多語文件
- [ ] 實際部屬前後端 + devnet
- [ ] 線上測試功能完整性
- [ ] 實際部屬前後端 + devnet



### 2026/6/12
- [x] 修正在代付 Pass 中不能掛自付 credencial 的限制_opus  
- [x] 準備上線步驟文件_gemini  
- [x] 處理部屬合約時的無引用參數警告3、4_opus  
- [x] 修正 Pass 中 nulifier slot 的邏輯錯誤_opus  
- [x] 清理測試遺留雜碼_opus  
- [x] 首頁說明文件架構重構_opus  
- [x] 補足說明文件-中文_opus  
    - [x] 去除銷毀寬限期的延長功能_opus  
    - [x] 前端雜湊比對題目卷，加上竄改警告頁_opus  
- [~] 確認文件內容
    - [x] 開始使用_opus  
    - [x] 建立問卷_opus  
    - [x] 填答與領獎_opus  


### 2026/6/11
- [x] 修復 Pass &代付問題
  - [x] BFF Gas 只有1包gas、Gas 序列問題_fable  
  - [x] mint Pass 需要多次簽名_opus  
  - [x] 額度用盡後自付，顯示代付失效中_opus  
  - [x] 公開問卷顯示及跳轉問題_opus  
  - [x] BFF 不自動關閉過期問卷，等過期未銷毀才動作_opus  
  - [x] 部分文案沒有多語化_opus  
  - [x] 過期後前端去填答文案_opus  
  - [x] 型別檢查 sponsoredTx.ts:101 的錯誤_opus  
  - [x] 完成 certik 審計 + Claude code-review 內容修補

### 2026/6/10
- [x] 修改審計報告中的漏洞
  - [x] 建立AMM 及經濟模型文件初稿_Composer  
  - [x] 修正到期不自動結束的問題_Composer  
  - [x] 修正 Vault:問卷不是一對一的問題_Composer  
  - [x] 修正註銷行為問題_Composer  
  - [x] F14 RPC 歷史掃描上限 250_Composer
- [x] Claude code-review
  - [x] S1 所有 claim 在建構 PTB 前即 throw_Fable
  - [x] S2 revoke不再釋放 nullifier_Fable
  - [x] 補充系統行為文件_Fable

###　2026/6/9
- [-] 修改審計報告中的漏洞_Composer  
  - [x] 發現大量架構層面錯誤_Composer  
  - [x] 修正 Claim 多入口 -> 單一入口_Composer  
  - [x] 修正填答時 Pass 沒有驗簽_Composer  
  - [x] 修正 google Oauth 驗證時 JWT 沒有驗簽_Composer  
  - [x] 關閉錯誤行為：資金補注_Composer  
  - [x] 修復大量漏洞至階段四_Composer  
  - [x] 建立填答 ADR 文件_Composer  

### 2026/6/8
- [x] 準備 CertiK 審計：去除註解_Composer  
- [~] 修改報告中的漏洞_Composer  

### 2026/6/7
- [x] 確認項目方可不可追蹤填答者_Composer  
- [x] Gas 預算設定_手動  
- [x] 手續費的名義: 程式碼授權費_Composer  
- [x] 預留二階段問卷空位_Composer  
- [x] 防禦 "大型答卷直傳鏈上抽乾代付池"_Composer   
- [x] 修正 OAuth 代付次數瑕疵_Composer  
- [x] 自動銷毀收 50% 手續費後轉帳給發起人_Composer  
- [x] Walrus 儲存生命週期問題_Composer  
- [x] Gas Station 分散式 Coin Queue_Composer
- [x] Dashboard 銷毀文案修改_Composer

### 2026/6/6
- [x] 首頁的按鈕：`說明文件`、`新手教學`、`建立問卷`_Gemini  
- [x] 首頁問卷廣場卡片的樣式對齊 `新手教學` 按鈕_Gemini  
- [x] 首頁亮背景下，三步驟的圖標背景改亮區段的背景色_Gemini  
- [x] 確認題卷及答卷的總花費：實際測試 1、5、10、50kB 分別在鏈上跟 walrus 存續 30、90、180 天_Gemini  
- [x] 撤銷 Pass 的機制_Gemini&Composer  

### 2026/6/5
- [x] 修復被重製的修改_Gemini  
- [x] 實作 中英日韓西 語言支援_Gemini  
- [x] 實作公開問卷廣場，顯示當前語言新的題目公開問卷_Gemini  

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
