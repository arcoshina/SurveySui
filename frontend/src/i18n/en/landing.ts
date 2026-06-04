import type { LandingDict } from '../zh/landing'

const landing: LandingDict = {
  heroTitle: 'Make Surveys Truly Fair and Transparent',
  heroDesc: 'Free to fill, automatic rewards, tamper-proof data — SurveySui is a survey platform built on the public blockchain.',
  btnCreate: 'Create Survey',
  btnGuide: 'Get Started Guide',
  stepsTitle: 'Three Steps to Complete a Survey',
  stepLabel: 'Step',
  steps: [
    { title: 'Creator Sets Up Survey', desc: 'Write questions in Markdown and set the reward amount per response. Publish in a single transaction.' },
    { title: 'Respondents Answer Free', desc: 'No cryptocurrencies required. Gas fees are sponsored by the survey creator.' },
    { title: 'Rewards Sent Automatically', desc: 'Instantly settled upon completion. SSR rewards are sent directly to your wallet.' },
  ],
  featuresTitle: 'Why Choose SurveySui?',
  features: [
    { title: 'Zero Cost to Fill', desc: 'Answering surveys costs you nothing. The creator pre-funds the reward pool and gas fees.' },
    { title: 'Permanent Data Storage', desc: 'Survey data is stored on the Sui blockchain, enabling public auditability and preventing deletions.' },
    { title: 'Direct Rewards', desc: 'Smart contracts handle distribution automatically, without needing to trust intermediaries or manual reviews.' },
  ],
  faqTitle: 'FAQ',
  faqs: [
    { q: 'Do I need a cryptocurrency wallet?', a: 'You will need a Sui wallet (free to set up), but you do not need to hold any cryptocurrency. Gas fees are pre-funded by creators so you can fill for free.' },
    { q: 'Who can see my answers?', a: 'Answers are encrypted before uploading. Only the survey creator can decrypt and read them, while others see aggregated statistics.' },
    { q: 'Where do the rewards come from?', a: 'They are pre-deposited by creators into smart contracts before publishing. The contract executes distribution automatically.' },
    { q: 'How does the platform handle the Gas fees required for on-chain submissions?', a: 'The platform adopts a "creator pre-funds, BFF sponsors" mechanism, where the creator pre-deposits Gas into the contract, and the platform assists in paying the Gas at submission, allowing respondents to submit with 0 balance. Since Gas cannot be pre-determined on-chain and there is a risk of transaction failure, the platform uses a conservative fixed value. The overpaid portion of a single transaction\'s Gas will serve as a reserve pool or be used for system maintenance fees. Unused prepaid Gas will be refunded to the creator when the survey is closed.' },
  ],
}

export default landing
