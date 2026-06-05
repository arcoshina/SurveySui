import type { ResultsDict } from '../zh/results'

const results: ResultsDict = {
  title: 'アンケート集計結果',
  subtitle: '集計結果グラフ',
  loading: 'アンケート集計データを読み込んでいます...',
  errLoadFailed: 'アンケートの読み込みに失敗しました。Vault IDが正しいか確認してください。',
  errEncrypted: 'このアンケートは「回答暗号化」が有効に設定されています。回答データはチェーン上で暗号化保護されており、アンケートの主催者のみがウォレットの署名を用いて復号し、結果を表示できます。一般には公開されません。',
  noResponses: '現在、このアンケートへの回答はありません。回答者が提出するまでしばらくお待ちください。',
  statResponseCount: '回答数',
  statResponseProgress: '回答進捗',
  statDeadline: '締切日時',
  responsesTitlePublic: '統計グラフ',
  displayCount: (n: number) => `${n} 件を表示`,
  csvTooltipPublic: 'CSVファイルには自由記述回答のプレーンテキストが含まれますが、回答者のウォレットアドレスは含まれません。',
  downloadCsvPublic: 'データをエクスポート (CSV)',
  questionTypeText: '自由記述',
  textAnswersHiddenInfo: 'グラフには自由記述の内容は表示されません',
  questionTypeSingle: '単一選択',
  questionTypeMulti: '複数選択',
  questionTypeScale: '評価スケール',
  backToSurvey: '⬅ 回答ページに戻る',
  metaUnavailable: '設定情報なし',
  statusLabel: 'アンケートステータス',
  statusActive: '進行中',
  statusFull: '定員到達',
  statusClosed: '終了',
  statusClosedAt: (ts: string) => `終了日: ${ts}`,
  questionIndex: (n: number) => `問 ${n}`,
  protectedData: '保護されたデータ',
}

export default results
