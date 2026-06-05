import type { ResultsDict } from '../zh/results'

const results: ResultsDict = {
  title: '설문조사 통계 결과',
  subtitle: '통계 결과 그래프',
  loading: '설문 통계 데이터를 불러오는 중...',
  errLoadFailed: '설문조사를 불러오지 못했습니다. Vault ID가 올바른지 확인해 주세요.',
  errEncrypted: '이 설문조사는 "답변 암호화"로 설정되어 있으며, 답변 데이터는 온체인에서 암호화되어 보호됩니다. 설문조사 개설자만 지갑 서명을 통해 복호화하여 결과를 확인할 수 있으며, 일반 공개는 되지 않습니다.',
  noResponses: '현재 제출된 설문 답변이 없습니다. 참여자가 답변을 제출할 때까지 기다려 주세요.',
  statResponseCount: '응답 수',
  statResponseProgress: '응답 진행 상황',
  statDeadline: '마감 시간',
  responsesTitlePublic: '통계 차트',
  displayCount: (n: number) => `${n}건 표시`,
  csvTooltipPublic: 'CSV 파일에는 주관식 답변의 텍스트가 포함되나, 답변자의 지갑 주소는 포함되지 않습니다.',
  downloadCsvPublic: '데이터 내보내기 (CSV)',
  questionTypeText: '주관식',
  textAnswersHiddenInfo: '차트에는 주관식 답변 내용이 나열되지 않습니다.',
  questionTypeSingle: '객관식 (단일 선택)',
  questionTypeMulti: '객관식 (복수 선택)',
  questionTypeScale: '평가형 (척도)',
  backToSurvey: '⬅ 설문조사 답변 페이지로 돌아가기',
  metaUnavailable: '설정 정보 없음',
  statusLabel: '설문 상태',
  statusActive: '진행 중',
  statusFull: '인원 초과',
  statusClosed: '종료됨',
  statusClosedAt: (ts: string) => `종료일: ${ts}`,
  questionIndex: (n: number) => `질문 ${n}`,
  protectedData: '보호된 데이터',
}

export default results
