import type { GuideDict } from '../zh/guide'
import { CHROME_STORE_URL, SLUSH_SITE_URL } from '../zh/guide'

const guide: GuideDict = {
  title: 'Getting Started: Set Up Your Sui Wallet',
  intro:
    'SurveySui is a survey platform built on the public Sui blockchain. All you need is a free Sui wallet to connect, claim your SurveyPass, and start answering — filling is completely free, with gas fees sponsored by survey creators. The five steps below get you up and running with Slush wallet’s zkLogin (Google sign-in): no seed phrase, no cryptocurrency required.',
  steps: [
    {
      title: 'Install the Slush wallet extension',
      desc: 'Slush is the official Sui browser wallet (formerly Sui Wallet). Add the extension from the Chrome Web Store and pin it to your toolbar for quick access. Visit slush.app to learn more.',
      links: [
        { label: 'Install from Chrome Web Store', url: CHROME_STORE_URL, icon: 'chrome' },
        { label: 'Slush official site', url: SLUSH_SITE_URL },
      ],
    },
    {
      title: 'Create a wallet with a social account (ex. Google)',
      desc: 'Open Slush and choose “Social Login”. It uses zero-knowledge login (zkLogin) to derive a Sui address straight from your Google (or Apple / Facebook / Twitch) account — no seed phrase, no key management, ideal for newcomers. Once you authorize with Google, your wallet is ready.',
      links: [{ label: 'Sign in on Slush', url: SLUSH_SITE_URL }],
    },
    {
      title: 'Connect your wallet',
      desc: 'Back on SurveySui, click the “Connect Wallet” button at the top right, pick Slush from the list, and approve the connection. Once connected, your wallet address pill appears in the top-right navbar.',
      links: [],
    },
    {
      title: 'About SurveyPass',
      desc: 'SurveyPass is a one-time identity credential required before answering. It ensures each respondent fills a survey only once and prevents duplicate reward claims. Head to the “SurveyPass” page to verify and claim yours — also at zero cost.',
      links: [],
    },
    {
      title: 'Fill out a survey',
      desc: 'Open a survey you want to join and start answering. After you submit, the smart contract settles automatically and SSR rewards land directly in your wallet — with zero gas cost, since fees are sponsored by the survey creator.',
      links: [],
    },
  ],
  ctaAuth: 'Go to SurveyPass',
  ctaHome: 'Back to home',
}

export default guide
