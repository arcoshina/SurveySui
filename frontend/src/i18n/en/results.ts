import type { ResultsDict } from '../zh/results'

const results: ResultsDict = {
  title: 'Survey Statistics',
  subtitle: 'Statistical Results Charts',
  loading: 'Loading statistics data...',
  errLoadFailed: 'Failed to load survey. Please check your Vault ID.',
  errEncrypted: 'This survey is configured with "Encrypted Responses". The response data is securely encrypted on-chain. Only the survey creator can sign with their wallet to decrypt and view results; it cannot be displayed publicly.',
  noResponses: 'No responses yet. Please wait for submissions before checking statistics.',
  statResponseCount: 'Responses',
  statResponseProgress: 'Progress',
  statDeadline: 'End Time',
  responsesTitlePublic: 'Statistics Charts',
  displayCount: (n: number) => `Showing ${n} entries`,
  csvTooltipPublic: 'The CSV file will include plaintext answers for text questions, but will not contain any respondent wallet addresses.',
  downloadCsvPublic: 'Export Data (CSV)',
  questionTypeText: 'Text',
  textAnswersHiddenInfo: 'Text answers are not displayed in the charts.',
  questionTypeSingle: 'Single Choice',
  questionTypeMulti: 'Multiple Choice',
  questionTypeScale: 'Scale',
  backToSurvey: '⬅ Back to Survey Page',
  metaUnavailable: 'No settings available',
  statusLabel: 'Status',
  statusActive: 'Active',
  statusFull: 'Full',
  statusClosed: 'Closed',
  statusClosedAt: (ts: string) => `Closed ${ts}`,
  questionIndex: (n: number) => `Question ${n}`,
  protectedData: 'Protected Data',
}

export default results
