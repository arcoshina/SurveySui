/**
 * Translate Move abort errors returned by `dryRunTransactionBlock` /
 * `executeTransactionBlock` into Traditional Chinese, user-facing messages.
 *
 * Sui error string formats observed across versions, e.g.:
 *   `MoveAbort(MoveLocation { module: ModuleId { address: 0x..., name: Identifier("survey_registry") }, function: 1, instruction: 5, function_name: Some("register") }, 1) in command 6`
 */

const ABORT_MAP: Record<string, Record<number, string>> = {
  survey_registry: {
    1: '已發過相同內容的問卷（content_hash 重複）— 請改動 Markdown 內容任一處再試',
    2: '題型不合法（限 single_choice / multi_choice / text / scale）',
    3: '單題選項數量超過 50',
    4: '題目敘述不可為空',
    5: '問卷內出現重複的題目 ID',
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
  },
  amm_pool: {
    1: 'SUI 注資金額為 0',
    2: 'AMM 鑄出的 SSR 不足以滿足注資需求',
  },
  survey_pass: {
    0: '該身分（Email）已被其他錢包綁定。如果您需要更換錢包，請先使用原錢包進行「銷毀憑證（Delete Pass）」，或更換其他信箱進行驗證。',
    1: 'BFF 驗證簽章無效，請重新嘗試驗證。',
    2: '錢包地址與憑證擁有者不符。',
    3: '驗證票券已過期，請重整頁面並重新獲取驗證碼。',
    4: '非管理員，無權執行此操作。',
    5: '憑證目前處於非有效狀態。',
    6: '憑證已被撤銷。',
  },
}

export function translateMoveAbort(error: string | null | undefined): string | null {
  if (!error) return null

  const codeMatch =
    error.match(/MoveAbort\([\s\S]*?,\s*(\d+)\)/) ??
    error.match(/,\s*(\d+)\)\s+in command/)
  if (!codeMatch) return null
  const code = Number(codeMatch[1])

  let moduleName: string | null = null
  const idMatches = error.match(/Identifier\("(\w+)"\)/g)
  if (idMatches) {
    for (const m of idMatches) {
      const inner = /Identifier\("(\w+)"\)/.exec(m)?.[1]
      if (inner && ABORT_MAP[inner]) {
        moduleName = inner
      }
    }
  }
  if (!moduleName) {
    const fnMatch = error.match(/function_name:\s*Some\("(\w+)"\)/)
    if (fnMatch) {
      const fnName = fnMatch[1]
      if (fnName === 'register' || fnName === 'archive' || fnName === 'new_question') moduleName = 'survey_registry'
      else if (fnName === 'create' || fnName === 'create_empty' || fnName === 'claim' || fnName === 'close' || fnName === 'merge_balances' || fnName === 'deposit_existing_ssr' || fnName === 'split_fee_to_treasury') moduleName = 'survey_vault'
      else if (fnName === 'invest_and_mint' || fnName === 'redeem') moduleName = 'amm_pool'
      else if (fnName === 'mint_pass' || fnName === 'update_pass_credential' || fnName === 'delete_pass') moduleName = 'survey_pass'
    }
  }
  if (!moduleName) return null

  return ABORT_MAP[moduleName]?.[code] ?? null
}
