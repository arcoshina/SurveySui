import { CHROME_STORE_URL, SLUSH_SITE_URL } from '../zh/guide'
import type { GuideDict } from '../zh/guide'

const guide: GuideDict = {
  title: '초보자 가이드: Sui 지갑 만들기',
  intro:
    'SurveySui는 Sui 퍼블릭 블록체인에 구축된 설문조사 플랫폼입니다. 무료 Sui 지갑을 연결하고 SurveyPass를 발급받기만 하면 설문조사에 참여할 수 있습니다. 참여 비용은 완전히 무료이며, 수수료는 설문조사 개설자가 대신 지불합니다. 다음 5단계를 거쳐 Slush 지갑의 zkLogin(Google 로그인)을 사용하여 빠르게 시작해 보세요. 복구 문구나 암호화폐 보유는 전혀 필요하지 않습니다.',
  stepLabel: '단계',
  steps: [
    {
      title: 'Slush 지갑 확장 프로그램 설치',
      desc: 'Slush는 Sui 공식 브라우저 지갑(이전 Sui Wallet)입니다. Chrome 웹 스토어에서 확장 프로그램을 설치하고 툴바에 고정하여 간편하게 사용해 보세요. 자세한 정보는 slush.app에서 확인하실 수 있습니다.',
      links: [
        { label: 'Chrome 스토어에서 설치하기', url: CHROME_STORE_URL, icon: 'chrome' },
        { label: 'Slush 공식 웹사이트', url: SLUSH_SITE_URL },
      ],
    },
    {
      title: '소셜 계정으로 지갑 생성 (Google 예시)',
      desc: 'Slush를 연 후 "Social Login(소셜 로그인)"을 선택하세요. 영지식 증명 기술인 zkLogin을 채택하여 Google(또는 Apple, Facebook, Twitch) 계정으로 직접 Sui 주소를 생성합니다. 복구 문구나 개인 키 관리 없이 블록체인 초보자에게 가장 적합합니다. Google 인증이 완료되면 지갑 생성이 완료됩니다.',
      links: [{ label: 'Slush에서 로그인 시작', url: SLUSH_SITE_URL }],
    },
    {
      title: '지갑 연결',
      desc: 'SurveySui로 돌아와 우측 상단의 "지갑 연결" 버튼을 클릭하고 목록에서 Slush를 선택하여 연결을 승인하세요. 연결이 완료되면 내비게이션 바 우측 상단에 지갑 주소 캡슐이 표시됩니다.',
      links: [],
    },
    {
      title: 'SurveyPass 설명',
      desc: 'SurveyPass(신원 인증서)는 설문 참여 전 1회성 신원 인증 증명서입니다. 각 설문조사 참여자가 한 번만 참여하도록 보장하고, 보상 중복 수령을 방지합니다. "SurveyPass" 페이지에서 인증을 완료하면 완전히 무료로 발급받을 수 있습니다.',
      links: [],
    },
    {
      title: '설문조사 참여',
      desc: '참여할 설문조사를 열고 작성을 시작합니다. 제출하면 스마트 계약이 자동으로 정산하여 보상을 지갑으로 직접 지급합니다. 참여자는 Gas 비용이 전혀 들지 않으며, 모든 수수료는 설문조사 개설자가 대납합니다.',
      links: [],
    },
  ],
  ctaAuth: 'SurveyPass 인증하러 가기',
  ctaHome: '홈으로 이동',
}

export default guide
