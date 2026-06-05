import { CHROME_STORE_URL, SLUSH_SITE_URL } from '../zh/guide'
import type { GuideDict } from '../zh/guide'

const guide: GuideDict = {
  title: '初心者ガイド：Suiウォレットの作成方法',
  intro:
    'SurveySuiは、Suiパブリックブロックチェーン上に構築されたアンケートプラットフォームです。無料のSuiウォレットを接続してSurveyPassを取得するだけで、アンケートへの回答を開始できます。回答は完全に無料で、手数料はアンケート主催者が代理で支払います。ここでは、SlushウォレットのzkLogin（Googleログイン）を使用してクイックスタートする5つのステップを紹介します。ニーモニックや暗号資産の所有は一切不要です。',
  stepLabel: 'ステップ',
  steps: [
    {
      title: 'Slushウォレット拡張機能のインストール',
      desc: 'Slushは、Sui公式が提供するブラウザ向けウォレット（旧Sui Wallet）です。Chromeウェブストアから拡張機能をインストールし、ツールバーにピン留めして簡単にアクセスできるようにします。詳細はslush.appをご覧ください。',
      links: [
        { label: 'Chromeストアからインストール', url: CHROME_STORE_URL, icon: 'chrome' },
        { label: 'Slush公式サイト', url: SLUSH_SITE_URL },
      ],
    },
    {
      title: 'ソーシャルアカウントでウォレットを作成（Googleを例に）',
      desc: 'Slushを開き、「Social Login」を選択します。ゼロ知識証明技術（zkLogin）を採用しており、Google（またはApple、Facebook、Twitch）アカウントを使って直接Suiアドレスを作成できます。ニーモニックの管理も不要で、ブロックチェーン初心者に最適です。Googleの認証が完了すると、ウォレットが作成されます。',
      links: [{ label: 'Slushでログインを開始', url: SLUSH_SITE_URL }],
    },
    {
      title: 'ウォレットの接続',
      desc: 'SurveySuiに戻り、右上にある「ウォレットを接続」ボタンをクリックし、リストからSlushを選択して接続を承認します。接続が成功すると、ナビゲーションバーの右上にウォレットのアドレスが表示されます。',
      links: [],
    },
    {
      title: 'SurveyPassについて',
      desc: 'SurveyPass（誰位通証）は、アンケート回答前のワンタイム本人確認証です。回答者1人につき1回の回答を保証し、報酬の二重受け取りを防止します。「SurveyPass」ページで検証を完了すれば、完全に無料で取得できます。',
      links: [],
    },
    {
      title: 'アンケートに回答する',
      desc: '参加したいアンケートを開いて回答を開始します。送信後、スマートコントラクトが自動で処理を行い、報酬が直接ウォレットに振り込まれます。回答者にGas代などのコストは一切かかりません。',
      links: [],
    },
  ],
  ctaAuth: 'SurveyPass検証に進む',
  ctaHome: 'ホームに戻る',
}

export default guide
