export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/slush-%E2%80%94-a-sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil'
export const SLUSH_SITE_URL = 'https://slush.app/'

type StepLink = { label: string; url: string; icon?: 'chrome' }
type Step = { title: string; desc: string; links: StepLink[] }
export type GuideDict = {
  title: string
  intro: string
  steps: Step[]
  ctaAuth: string
  ctaHome: string
}

const guide: GuideDict = {
  title: '新手教學：建立你的 Sui 錢包',
  intro:
    'SurveySui 是建立在 Sui 公開區塊鏈上的問卷平台。你只需要一個免費的 Sui 錢包即可連接、領取 SurveyPass 並開始填答——填答完全零成本，手續費由問卷發起者代付。以下五步驟帶你用 Slush 錢包的 zkLogin（Google 登入）快速上手，全程不需助記詞、不需持有任何加密貨幣。',
  steps: [
    {
      title: '安裝 Slush 錢包擴充',
      desc: 'Slush 是 Sui 官方推出的瀏覽器錢包（前身為 Sui Wallet）。前往 Chrome 線上應用程式商店安裝擴充功能，並將它釘選到工具列方便取用。也可造訪 slush.app 了解更多。',
      links: [
        { label: '前往 Chrome 商店安裝', url: CHROME_STORE_URL, icon: 'chrome' },
        { label: 'Slush 官方網站', url: SLUSH_SITE_URL },
      ],
    },
    {
      title: '用社群帳號建立錢包（以 Google 為例）',
      desc: '開啟 Slush 後選擇「Social Login（社群登入）」。它採用零知識證明技術 zkLogin，直接用你的 Google（或 Apple / Facebook / Twitch）帳號推導出一個 Sui 地址——免助記詞、免私鑰管理，最適合區塊鏈新手。完成 Google 授權後，你的錢包就建立好了。',
      links: [{ label: '在 Slush 開始登入', url: SLUSH_SITE_URL }],
    },
    {
      title: '連接錢包',
      desc: '回到 SurveySui，點選右上角的「連接錢包」按鈕，在彈出的清單中選擇 Slush 並授權連接。連接成功後，導覽列右上角會顯示你的錢包地址膠囊。',
      links: [],
    },
    {
      title: 'SurveyPass 說明',
      desc: 'SurveyPass（誰位通證）是填答前的一次性身份驗證憑證，用來確保每位受訪者只填答一次、防止重複領取獎勵。前往「SurveyPass」頁完成驗證即可領取，過程同樣零成本。',
      links: [],
    },
    {
      title: '填寫問卷',
      desc: '開啟想參與的問卷開始作答。送出後智慧合約會自動結算，SSR 獎勵直接打進你的錢包——全程零 Gas 成本，手續費由問卷發起者代付。',
      links: [],
    },
  ],
  ctaAuth: '前往 SurveyPass 驗證',
  ctaHome: '回首頁',
}

export default guide
