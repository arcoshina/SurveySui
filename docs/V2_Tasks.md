# SurveySui V2 任務清單

進度追蹤用。設計意圖見 [V2_改版目標.md](V2_改版目標.md)，測試規格 / 綠燈條件 / 依賴細節見 [V2_TDD.md](V2_TDD.md)。

## S0：地基

- [x] S0.1 同助記詞測試帳號
- [x] S0.2 V1 contract drift 修對齊
- [x] S0.3 BFF admin key 啟動檢查

## S1：合約地基

- [x] S1.1 AMM / FeeConfig
- [x] S1.2 survey_registry 內容驗證 + 去重（單題選項數量上限放寬為 50）
- [x] S1.3 七步驟 PTB（前置：S1.1、S1.2）
- [x] S1 回歸閘

## S2：前端對齊合約

- [x] S2.1 estimateFundCostV2 對拍 Move（前置：S1.1）
- [x] S2.2 七步驟 PTB 前端整合 + 預覽合併步驟（前置：S1.3、S2.1）
- [x] S2.3 答案只記錄結果不記錄題目（前置：S1.2）
- [x] S2 回歸閘

## S3：UI Bug 修復

- [x] S3.1 sSSR 畸零修復
- [x] S3.2 Markdown 預覽修復（引入 XSS/ReDoS 防護與長度限制等安全機制）
- [ ] S3.3 隱藏非發起人「提早結束」按鈕
- [ ] S3.4 儀錶板補完
- [ ] S3 回歸閘

## S4：UX 改善

- [ ] S4.1 單次簽名衍生加密金鑰（前置：S2.2）
- [ ] S4.2 發起人加密公鑰存放策略（前置：S4.1）
- [ ] S4.3 Gas Station fallback（前置：S0.2）
- [ ] S4.4 首頁文案 / 視覺
- [ ] S4 回歸閘

## S5：設計交付

- [ ] S5.1 SurveyPass 認證簽發設計拍板
- [ ] S5.2 匿名投票初步方案設計交付

## S6：SurveyPass 實作（pending，等 S5.1）

- [ ] S6.1 SurveyPass 簽發合約 / BFF / FE
- [ ] S6.2 SurveyPass 首次連錢包檢查
- [ ] S6.3 公鑰寫入 SurveyPass（條件性）

## S7：總驗收

- [ ] 全部測試綠 + INV-1 ~ INV-7 守住 + demo 序列跑通
