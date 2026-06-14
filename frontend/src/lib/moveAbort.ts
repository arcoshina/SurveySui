/**
 * Translate Move abort errors returned by `dryRunTransactionBlock` /
 * `executeTransactionBlock` into user-facing messages (ZH / EN / JA / KO / ES).
 *
 * Sui error string formats observed across versions, e.g.:
 *   `MoveAbort(MoveLocation { module: ModuleId { address: 0x..., name: Identifier("survey_registry") }, function: 1, instruction: 5, function_name: Some("register") }, 1) in command 6`
 *
 * Some Sui builds surface the symbolic constant name (e.g. `EExpired`) instead
 * of (or alongside) the numeric abort code, so we also map known constant names
 * back to their code as a fallback.
 */

const ABORT_MAP: Record<string, Record<string, Record<number, string>>> = {
  ZH: {
    survey_registry: {
      1: '已發過相同內容的問卷（content_hash 重複）— 請改動 Markdown 內容任一處再試',
      2: '題型不合法（限 single_choice / multi_choice / text / scale）',
      3: '單題選項數量超過 50',
      4: '題目敘述不可為空',
      5: '問卷內出現重複的題目 ID',
      10: 'Walrus 模式缺少 blob 物件 ID（survey_blob_object_id）',
    },
    survey_vault: {
      0: '只有發起者能執行此操作',
      1: '回應名額已滿',
      2: '已過截止時間',
      3: '此 SurveyPass 已領取過該問卷',
      4: 'SurveyPass 無效',
      5: 'Vault 已關閉',
      6: '答案內容為空',
      7: 'Vault 餘額不足（AMM 滑點過大，請稍候重試）',
      12: '您已填答過本問卷。',
      21: '答卷超過此問卷的鏈上直傳大小上限，請縮短內容或改用 Walrus 儲存路徑。',
      23: '此鏈上入口已廢棄，請更新客戶端後重試。',
      27: '問卷尚未完成協議費用結算，無法發布。',
      28: '協議費用已結算，不可重複扣款。',
      29: 'Walrus blob ID 超過此問卷的鏈上長度上限。',
      30: 'blob ID 長度設定超出允許範圍。',
      33: '問卷有效期不可超過 92 天，請縮短截止時間後重試。',
    },
    amm_pool: {
      1: 'SUI 注資金額為 0',
      2: 'AMM 鑄出的 SSR 不足以滿足注資需求',
      6: '僅能使用協議登錄的 canonical AMM pool。',
      8: '此鏈上入口已廢棄，請更新部署腳本後重試。',
    },
    survey_pass: {
      0: '此 SurveyPass 已綁定至另一個錢包。',
      1: 'BFF 驗證簽章無效，請重新嘗試驗證。',
      2: '錢包地址與 SurveyPass 擁有者不符。',
      3: '驗證票券已過期，請重整頁面並重新獲取驗證碼。',
      4: '非管理員，無權執行此操作。',
      5: 'SurveyPass 目前處於非有效狀態。',
      6: 'SurveyPass 已被吊銷。',
      10: '同一憑證來源不可重複綁定至 SurveyPass。',
    },
  },
  EN: {
    survey_registry: {
      1: 'A survey with the same content has already been published (content_hash duplicate) — please make a small edit to the Markdown and try again.',
      2: 'Invalid question type (only single_choice / multi_choice / text / scale are allowed).',
      3: 'Number of options per question exceeds 50.',
      4: 'Question description cannot be empty.',
      5: 'Duplicate question IDs found within the survey.',
      10: 'Walrus mode requires survey_blob_object_id when survey_blob_id is set.',
    },
    survey_vault: {
      0: 'Only the creator can perform this operation.',
      1: 'Response slots are full.',
      2: 'The deadline has passed.',
      3: 'This SurveyPass has already responded to this survey.',
      4: 'Invalid SurveyPass.',
      5: 'Vault is closed.',
      6: 'Answer content cannot be empty.',
      7: 'Insufficient Vault balance (large AMM slippage, please try again later).',
      12: 'You have already responded to this survey.',
      21: 'Response exceeds this survey on-chain inline size limit; shorten answers or use Walrus storage.',
      23: 'This on-chain entry point is deprecated; please update the client.',
      27: 'Survey protocol fee has not been settled yet; cannot publish.',
      28: 'Protocol fee already settled; cannot charge twice.',
      29: 'Walrus blob ID exceeds this survey on-chain length limit.',
      30: 'Blob ID length setting is out of allowed range.',
      33: 'Survey lifetime cannot exceed 92 days; please shorten the deadline and try again.',
    },
    amm_pool: {
      1: 'SUI injection amount is 0.',
      2: 'The minted SSR from AMM is insufficient to meet the injection requirements.',
      6: 'Only the protocol-registered canonical AMM pool may be used.',
      8: 'This on-chain entry point is deprecated; update the deploy script.',
    },
    survey_pass: {
      0: 'This SurveyPass is already linked to another wallet.',
      1: 'Invalid BFF verification signature, please try again.',
      2: 'Wallet address does not match the SurveyPass owner.',
      3: 'Verification ticket expired, please refresh the page and try again.',
      4: 'Not admin, unauthorized to perform this operation.',
      5: 'The SurveyPass is currently inactive.',
      6: 'The SurveyPass has been revoked.',
      10: 'Duplicate credential source cannot be bound to the same SurveyPass.',
    },
  },
  JA: {
    survey_registry: {
      1: '同じ内容のアンケートは既に公開されています（content_hash の重複）— Markdown の内容を一部変更して再試行してください。',
      2: '不正な質問タイプです（single_choice / multi_choice / text / scale のみ）。',
      3: '1 問あたりの選択肢が 50 を超えています。',
      4: '質問文は空にできません。',
      5: 'アンケート内に重複した質問 ID があります。',
      10: 'Walrus モードには blob オブジェクト ID（survey_blob_object_id）が必要です。',
    },
    survey_vault: {
      0: 'この操作は作成者のみが実行できます。',
      1: '回答枠が満員です。',
      2: '締め切りを過ぎています。',
      3: 'この SurveyPass はこのアンケートに既に回答済みです。',
      4: 'SurveyPass が無効です。',
      5: 'Vault は閉じられています。',
      6: '回答内容が空です。',
      7: 'Vault の残高が不足しています（AMM のスリッページが大きすぎます。しばらくして再試行してください）。',
      12: 'このアンケートには既に回答済みです。',
      21: '回答がこのアンケートのオンチェーン直接送信サイズ上限を超えています。内容を短くするか、Walrus ストレージをご利用ください。',
      23: 'このオンチェーンエントリは廃止されました。クライアントを更新して再試行してください。',
      27: 'アンケートはプロトコル手数料の精算が完了していないため、公開できません。',
      28: 'プロトコル手数料は精算済みのため、二重に請求できません。',
      29: 'Walrus blob ID がこのアンケートのオンチェーン長さ上限を超えています。',
      30: 'blob ID の長さ設定が許容範囲を超えています。',
      33: 'アンケートの有効期間は92日を超えることはできません。締め切りを短くして再試行してください。',
    },
    amm_pool: {
      1: 'SUI の注入額が 0 です。',
      2: 'AMM が発行した SSR が注入要件を満たすには不足しています。',
      6: 'プロトコルに登録された canonical AMM プールのみ使用できます。',
      8: 'このオンチェーンエントリは廃止されました。デプロイスクリプトを更新して再試行してください。',
    },
    survey_pass: {
      0: 'この SurveyPass は別のウォレットに既に紐付けられています。',
      1: 'BFF の検証署名が無効です。もう一度検証をお試しください。',
      2: 'ウォレットアドレスが SurveyPass の所有者と一致しません。',
      3: '検証チケットの有効期限が切れています。ページを更新して検証コードを再取得してください。',
      4: '管理者ではないため、この操作を実行する権限がありません。',
      5: 'SurveyPass は現在有効でない状態です。',
      6: 'SurveyPass は失効しています。',
      10: '同じ証明書ソースを SurveyPass に重複して紐付けることはできません。',
    },
  },
  KO: {
    survey_registry: {
      1: '동일한 내용의 설문이 이미 게시되었습니다(content_hash 중복) — Markdown 내용을 일부 수정한 후 다시 시도하세요.',
      2: '잘못된 질문 유형입니다(single_choice / multi_choice / text / scale 만 허용).',
      3: '한 문항의 선택지 수가 50개를 초과했습니다.',
      4: '문항 설명은 비워둘 수 없습니다.',
      5: '설문 내에 중복된 문항 ID가 있습니다.',
      10: 'Walrus 모드에는 blob 객체 ID(survey_blob_object_id)가 필요합니다.',
    },
    survey_vault: {
      0: '이 작업은 생성자만 수행할 수 있습니다.',
      1: '응답 정원이 가득 찼습니다.',
      2: '마감 시간이 지났습니다.',
      3: '이 SurveyPass는 이미 이 설문에 응답했습니다.',
      4: 'SurveyPass가 유효하지 않습니다.',
      5: 'Vault가 닫혔습니다.',
      6: '답변 내용이 비어 있습니다.',
      7: 'Vault 잔액이 부족합니다(AMM 슬리피지가 너무 큽니다. 잠시 후 다시 시도하세요).',
      12: '이미 이 설문에 응답하셨습니다.',
      21: '답변이 이 설문의 온체인 직접 전송 크기 한도를 초과했습니다. 내용을 줄이거나 Walrus 저장 경로를 사용하세요.',
      23: '이 온체인 진입점은 더 이상 사용되지 않습니다. 클라이언트를 업데이트한 후 다시 시도하세요.',
      27: '설문이 프로토콜 수수료 정산을 완료하지 않아 게시할 수 없습니다.',
      28: '프로토콜 수수료가 이미 정산되어 중복 청구할 수 없습니다.',
      29: 'Walrus blob ID가 이 설문의 온체인 길이 한도를 초과했습니다.',
      30: 'blob ID 길이 설정이 허용 범위를 벗어났습니다.',
      33: '설문 유효 기간은 92일을 초과할 수 없습니다. 마감 시간을 줄인 후 다시 시도하세요.',
    },
    amm_pool: {
      1: 'SUI 주입 금액이 0입니다.',
      2: 'AMM가 발행한 SSR이 주입 요건을 충족하기에 부족합니다.',
      6: '프로토콜에 등록된 canonical AMM 풀만 사용할 수 있습니다.',
      8: '이 온체인 진입점은 더 이상 사용되지 않습니다. 배포 스크립트를 업데이트한 후 다시 시도하세요.',
    },
    survey_pass: {
      0: '이 SurveyPass는 이미 다른 지갑에 연결되어 있습니다.',
      1: 'BFF 검증 서명이 유효하지 않습니다. 인증을 다시 시도하세요.',
      2: '지갑 주소가 SurveyPass 소유자와 일치하지 않습니다.',
      3: '인증 티켓이 만료되었습니다. 페이지를 새로고침하고 인증 코드를 다시 받으세요.',
      4: '관리자가 아니므로 이 작업을 수행할 권한이 없습니다.',
      5: 'SurveyPass가 현재 유효하지 않은 상태입니다.',
      6: 'SurveyPass가 취소되었습니다.',
      10: '동일한 인증 출처를 SurveyPass에 중복으로 연결할 수 없습니다.',
    },
  },
  ES: {
    survey_registry: {
      1: 'Ya se ha publicado una encuesta con el mismo contenido (content_hash duplicado): modifica alguna parte del Markdown e inténtalo de nuevo.',
      2: 'Tipo de pregunta no válido (solo se permiten single_choice / multi_choice / text / scale).',
      3: 'El número de opciones por pregunta supera 50.',
      4: 'La descripción de la pregunta no puede estar vacía.',
      5: 'Hay ID de pregunta duplicados dentro de la encuesta.',
      10: 'El modo Walrus requiere el ID de objeto blob (survey_blob_object_id).',
    },
    survey_vault: {
      0: 'Solo el creador puede realizar esta operación.',
      1: 'Los cupos de respuesta están llenos.',
      2: 'La fecha límite ha pasado.',
      3: 'Este SurveyPass ya ha respondido a esta encuesta.',
      4: 'SurveyPass no válido.',
      5: 'El Vault está cerrado.',
      6: 'El contenido de la respuesta está vacío.',
      7: 'Saldo insuficiente en el Vault (deslizamiento de AMM demasiado grande, inténtalo de nuevo más tarde).',
      12: 'Ya has respondido a esta encuesta.',
      21: 'La respuesta supera el límite de tamaño de envío directo en cadena de esta encuesta; acorta el contenido o usa el almacenamiento Walrus.',
      23: 'Este punto de entrada en cadena está obsoleto; actualiza el cliente e inténtalo de nuevo.',
      27: 'La encuesta aún no ha liquidado la comisión del protocolo y no se puede publicar.',
      28: 'La comisión del protocolo ya se ha liquidado; no se puede cobrar dos veces.',
      29: 'El blob ID de Walrus supera el límite de longitud en cadena de esta encuesta.',
      30: 'La configuración de longitud del blob ID está fuera del rango permitido.',
      33: 'La duración de la encuesta no puede superar los 92 días; acorta la fecha límite e inténtalo de nuevo.',
    },
    amm_pool: {
      1: 'El monto de inyección de SUI es 0.',
      2: 'El SSR acuñado por el AMM es insuficiente para cumplir el requisito de inyección.',
      6: 'Solo se puede usar el pool AMM canónico registrado por el protocolo.',
      8: 'Este punto de entrada en cadena está obsoleto; actualiza el script de despliegue e inténtalo de nuevo.',
    },
    survey_pass: {
      0: 'Este SurveyPass ya está vinculado a otra billetera.',
      1: 'Firma de verificación de BFF no válida; vuelve a intentar la verificación.',
      2: 'La dirección de la billetera no coincide con el propietario del SurveyPass.',
      3: 'El ticket de verificación ha caducado; actualiza la página y obtén un nuevo código.',
      4: 'No eres administrador; no tienes permiso para realizar esta operación.',
      5: 'El SurveyPass está actualmente inactivo.',
      6: 'El SurveyPass ha sido revocado.',
      10: 'No se puede vincular la misma fuente de credencial al mismo SurveyPass.',
    },
  },
}

/**
 * 已知 Move 常數名稱 → abort code 對照（依 contracts/sources/*.move 的 `const E…: u64 = N`）。
 * 僅收錄 ABORT_MAP 內有對應文案的 code，作為符號名兜底解析之用。
 */
const NAME_TO_CODE: Record<string, Record<string, number>> = {
  survey_registry: {
    EDuplicateSurvey: 1,
    EInvalidQuestionType: 2,
    EOptionLimitExceeded: 3,
    EEmptyQuestion: 4,
    EDuplicateQuestionId: 5,
    EMissingBlobObjectId: 10,
  },
  survey_vault: {
    ENotCreator: 0,
    ENoQuota: 1,
    EExpired: 2,
    EAlreadyClaimed: 3,
    EInvalidPass: 4,
    EVaultClosed: 5,
    EEmptyAnswers: 6,
    EInsufficientVaultBalance: 7,
    EDuplicateNullifier: 12,
    EInlineAnswerTooLarge: 21,
    EFeeNotPaid: 27,
    EFeeAlreadyPaid: 28,
    EBlobIdTooLarge: 29,
    EMaxBlobIdOutOfRange: 30,
    EDeadlineTooFar: 33,
  },
  amm_pool: {
    EZeroAmount: 1,
    EInsufficientOutput: 2,
    ENotCanonicalPool: 6,
  },
  survey_pass: {
    EDuplicateNullifier: 0,
    EInvalidTicketSig: 1,
    EOwnerMismatch: 2,
    ETicketExpired: 3,
    ENotAdmin: 4,
    ENotActive: 5,
    EPassRevoked: 6,
    EDuplicateSource: 10,
  },
}

const ALL_MODULES = ['survey_registry', 'survey_vault', 'amm_pool', 'survey_pass'] as const

/** 從錯誤字串解析出 Move module 名稱（與某語系 map 的 key 比對）。 */
function resolveModuleName(
  error: string,
  localizedMap: Record<string, Record<number, string>>
): string | null {
  const idMatches = error.match(/Identifier\("(\w+)"\)/g)
  if (idMatches) {
    for (const m of idMatches) {
      const inner = /Identifier\("(\w+)"\)/.exec(m)?.[1]
      if (inner && localizedMap[inner]) return inner
    }
  }

  // 嘗試從 0x...::module_name::function_name 的格式中解析 module
  const pkgMatch = error.match(/0x[a-fA-F0-9]+::(\w+)::\w+/)
  if (pkgMatch && localizedMap[pkgMatch[1]]) return pkgMatch[1]

  const fnMatch = error.match(/function_name:\s*Some\("(\w+)"\)/)
  if (fnMatch) {
    const fnName = fnMatch[1]
    if (fnName === 'register' || fnName === 'archive' || fnName === 'new_question')
      return 'survey_registry'
    if (
      fnName === 'create' ||
      fnName === 'create_empty' ||
      fnName === 'claim' ||
      fnName === 'close' ||
      fnName === 'merge_balances' ||
      fnName === 'deposit_existing_ssr' ||
      fnName === 'split_fee_to_treasury'
    )
      return 'survey_vault'
    if (fnName === 'invest_and_mint' || fnName === 'admin_burn_pair') return 'amm_pool'
    if (
      fnName === 'mint_pass' ||
      fnName === 'mint_pass_with_extra_credentials' ||
      fnName === 'update_pass_credential' ||
      fnName === 'delete_pass' ||
      fnName === 'register_nullifier'
    )
      return 'survey_pass'
  }

  return null
}

export function translateMoveAbort(
  error: string | null | undefined,
  lang?: string
): string | null {
  if (!error) return null

  const currentLang =
    lang || (typeof window !== 'undefined' ? localStorage.getItem('surveysui:lang') : null) || 'ZH'
  const localizedMap = ABORT_MAP[currentLang] ?? ABORT_MAP.ZH

  // 1) 數字 abort code 路徑（最常見）
  const codeMatch =
    error.match(/MoveAbort\([\s\S]*?,\s*(\d+)\)/) ??
    error.match(/,\s*(\d+)\)\s+in command/) ??
    error.match(/abort code:\s*(\d+)/i)
  if (codeMatch) {
    const code = Number(codeMatch[1])
    const moduleName = resolveModuleName(error, localizedMap)
    if (moduleName) {
      const msg = localizedMap[moduleName]?.[code]
      if (msg) return msg
    }
  }

  // 2) 符號常數名兜底（例如某些 Sui 版本直接吐出 `EExpired` 文字）
  const nameMatches = error.match(/\bE[A-Z][A-Za-z0-9]*\b/g)
  if (nameMatches) {
    const moduleHint = resolveModuleName(error, localizedMap)
    const modulesToTry = moduleHint
      ? [moduleHint, ...ALL_MODULES.filter((m) => m !== moduleHint)]
      : [...ALL_MODULES]
    for (const name of nameMatches) {
      for (const mod of modulesToTry) {
        const code = NAME_TO_CODE[mod]?.[name]
        if (code !== undefined) {
          const msg = localizedMap[mod]?.[code]
          if (msg) return msg
        }
      }
    }
  }

  return null
}
