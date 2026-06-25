import type { ResultsDict } from '../zh/results'

const results: ResultsDict = {
  title: 'Resultados de la encuesta',
  subtitle: 'Progreso de respuestas',
  loading: 'Cargando datos estadísticos de la encuesta...',
  errLoadFailed: 'Error al cargar la encuesta. Confirma si el Vault ID es correcto.',
  errEncrypted: 'Esta encuesta está configurada como "respuestas encriptadas". Los datos de las respuestas están encriptados y protegidos en la blockchain. Solo el creador de la encuesta puede desencriptar y ver los resultados mediante una firma de billetera; no se pueden mostrar públicamente.',
  noResponses: 'Actualmente no hay respuestas para esta encuesta. Espera a que los participantes las envíen.',
  statResponseCount: 'Respuestas',
  statResponseProgress: 'Progreso de respuestas',
  statDeadline: 'Fecha límite',
  responsesTitlePublic: 'Gráfico estadístico',
  displayCount: (n: number) => `Mostrando ${n} registros`,
  csvTooltipPublic: 'El archivo CSV contendrá el texto de las respuestas de texto libre, pero no incluirá ninguna dirección de billetera de los encuestados.',
  downloadCsvPublic: 'Exportar datos (CSV)',
  questionTypeText: 'Respuesta corta',
  textAnswersHiddenInfo: 'Los gráficos no enumerarán las respuestas de texto libre',
  questionTypeSingle: 'Opción única',
  questionTypeMulti: 'Opción múltiple',
  questionTypeScale: 'Calificación (Escala)',
  backToSurvey: '⬅ Volver a la página de respuestas',
  metaUnavailable: 'Sin información de configuración',
  statusLabel: 'Estado de la encuesta',
  statusActive: 'En progreso',
  statusFull: 'Cupo completo',
  statusClosed: 'Cerrada',
  statusClosedAt: (ts: string) => `Cerrada el ${ts}`,
  questionIndex: (n: number) => `Pregunta ${n}`,
  protectedData: 'Datos protegidos',
}

export default results
