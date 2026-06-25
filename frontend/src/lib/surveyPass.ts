// dapp-kit 綁定的 @mysten/sui 版本與 app 主版本不同（#private 成員不相容），
// 故 client 型別取自 dapp-kit useSuiClient 的回傳，與呼叫端（useSuiClient()）一致。
type SuiReadClient = ReturnType<typeof import('@mysten/dapp-kit').useSuiClient>

export interface SurveyPassData {
  objectId: string
  owner: string
  // 鑄造時支付儲存押金的一方：代付鑄造 = sponsor 位址；自付鑄造 = owner。
  // 決定刪除流程（代付 Pass 走後端代刪，自付 Pass 由 owner 自刪）。
  depositPayer: string
  effectiveTier: number
  status: number
  expiresAt: number
  credentialSources: number[]
  createdAt: number
  escapeClawbackMist: bigint
}

// 證件夾內單一憑證（鏈上 CredentialSlot dynamic field）的展示用資料。
export interface CredentialInfo {
  source: number // 1-5（見 getSourceTier）
  tier: number // 由 source 換算
  issuedAt: number // ms
  expiresAt: number // ms（0 = 永不過期）
}

/**
 * 合約 get_source_tier 的前端鏡像。
 * ⚠️ 務必與 contracts/sources/survey_pass.move get_source_tier 保持同步。
 * SELF_REPORT(1)→0、EMAIL(2)→0、SOCIAL(3)→1、SELF_PROTOCOL(4)→2、WORLD_ID(5)→2、
 * SOCIAL_GOOGLE(6)→1、SOCIAL_GITHUB(7)→1
 */
export function getSourceTier(source: number): number {
  switch (source) {
    case 1: // SRC_SELF_REPORT
      return 0
    case 2: // SRC_EMAIL
      return 0
    case 3: // SRC_SOCIAL
      return 1
    case 6: // SRC_SOCIAL_GOOGLE
      return 1
    case 7: // SRC_SOCIAL_GITHUB
      return 1
    case 4: // SRC_SELF_PROTOCOL
      return 2
    case 5: // SRC_WORLD_ID
      return 2
    case 8: // SRC_ATTRIBUTES — no tier; audience via unified claim + eligibility
      return 0
    default:
      return 0
  }
}

/** Mirrors `survey_pass::src_attributes()`. */
export const SRC_ATTRIBUTES = 8

/**
 * Fetches per-credential slots for a SurveyPass by enumerating its CredentialKey dynamic fields.
 *
 * 一憑證一槽（dynamic field，key = CredentialKey { nullifier }）；source 改存於 slot body。
 * 同一 source 可有多槽（如雙 email）。回傳各憑證的 source / tier / issuedAt / expiresAt。
 *
 * @param suiClient The SuiClient instance
 * @param passId The SurveyPass object ID
 * @returns Array of CredentialInfo (順序未排序；呼叫端自行排序)
 */
export async function fetchPassCredentials(
  suiClient: SuiReadClient,
  passId: string
): Promise<CredentialInfo[]> {
  if (!passId) {
    return []
  }

  const attempt = async (): Promise<CredentialInfo[]> => {
    const result: CredentialInfo[] = []
    let cursor: string | null = null

    // 列舉 Pass 的所有 dynamic field（即各 CredentialKey），支援分頁
    do {
      const page = await suiClient.getDynamicFields({ parentId: passId, cursor })
      for (const df of page.data ?? []) {
        const fieldObj = await suiClient.getDynamicFieldObject({
          parentId: passId,
          name: df.name,
        })
        const content = fieldObj?.data?.content
        if (content && 'fields' in content) {
          const wrapped = content.fields as { value?: { fields?: Record<string, unknown> } | Record<string, unknown> }
          const slot = ((wrapped.value as { fields?: Record<string, unknown> })?.fields ??
            wrapped.value) as Record<string, unknown> | undefined
          // source 改存於 slot body（key 現為 nullifier）；非 CredentialSlot 的 df 略過
          const source = Number(slot?.source)
          if (slot && Number.isFinite(source)) {
            result.push({
              source,
              tier: getSourceTier(source),
              issuedAt: Number(slot.issued_at ?? 0),
              expiresAt: Number(slot.expires_at ?? 0),
            })
          }
        }
      }
      cursor = page.hasNextPage ? page.nextCursor : null
    } while (cursor)

    return result
  }

  try {
    return await attempt()
  } catch (error) {
    console.warn('fetchPassCredentials first attempt failed, retrying once:', error)
    await new Promise((r) => setTimeout(r, 600))
    try {
      return await attempt()
    } catch (retryError) {
      console.error('Error in fetchPassCredentials (after retry):', retryError)
      return []
    }
  }
}

/**
 * Fetches the active SurveyPass for a user by querying the NullifierRegistry passes table on-chain.
 *
 * @param suiClient The SuiClient instance
 * @param userAddress The owner's wallet address
 * @param registryId The NullifierRegistry object ID
 * @returns The SurveyPass data if found, or null
 */
export async function fetchActivePass(
  suiClient: SuiReadClient,
  userAddress: string,
  registryId: string
): Promise<SurveyPassData | null> {
  if (!userAddress || !registryId) {
    return null
  }

  const attempt = async (): Promise<SurveyPassData | null> => {
    if (import.meta.env.DEV) console.log('[fetchActivePass] start', { userAddress, registryId })

    // 1. Fetch NullifierRegistry to get the passes Table object ID
    const registryRes = await suiClient.getObject({
      id: registryId,
      options: {
        showContent: true,
      },
    })

    if (!registryRes.data || !registryRes.data.content || !('fields' in registryRes.data.content)) {
      console.warn('[fetchActivePass] step1: NullifierRegistry content not found or invalid format', registryRes)
      return null
    }

    const registryFields = registryRes.data.content.fields as {
      passes?: { fields?: { id?: { id?: string } } }
    }
    const tableId = registryFields.passes?.fields?.id?.id

    if (!tableId) {
      console.warn('[fetchActivePass] step1: passes table ID not found in NullifierRegistry fields', registryFields)
      return null
    }
    if (import.meta.env.DEV) console.log('[fetchActivePass] step1 ok', { tableId })

    // 2. Query the passes Table dynamic field using the user's address as Key
    const tableRes = await suiClient.getDynamicFieldObject({
      parentId: tableId,
      name: {
        type: 'address',
        value: userAddress,
      },
    })

    if (tableRes.error || !tableRes.data) {
      console.warn('[fetchActivePass] step2: dynamic field not found for address', {
        userAddress,
        tableId,
        error: tableRes.error,
      })
      return null
    }
    if (import.meta.env.DEV) console.log('[fetchActivePass] step2 ok', { dfData: tableRes.data })

    // 3. Extract the SurveyPass object ID from the dynamic field value
    const content = tableRes.data.content
    if (content && 'fields' in content) {
      const passId = (content.fields as { value?: string }).value
      if (passId) {
        // 4. Fetch the SurveyPass object itself
        const passRes = await suiClient.getObject({
          id: passId,
          options: {
            showContent: true,
          },
        })

        if (passRes.data && passRes.data.content && 'fields' in passRes.data.content) {
          const fields = passRes.data.content.fields as {
            owner: string
            deposit_payer?: string
            status?: string | number
            credential_sources?: number[]
            created_at?: string | number
            escape_clawback_mist?: string | number
          }
          const result = {
            objectId: passId,
            owner: fields.owner,
            depositPayer: fields.deposit_payer ?? fields.owner,
            effectiveTier: 0,
            status: Number(fields.status ?? 0),
            expiresAt: 0,
            credentialSources: fields.credential_sources || [],
            createdAt: Number(fields.created_at ?? 0),
            escapeClawbackMist: BigInt(fields.escape_clawback_mist ?? 0),
          }
          if (import.meta.env.DEV) console.log('[fetchActivePass] step4 ok — returning pass', result)
          return result
        }
        console.warn('[fetchActivePass] step4: pass object fetched but content invalid', passRes)
      } else {
        console.warn('[fetchActivePass] step3: dynamic field has no passId value', content)
      }
    } else {
      console.warn('[fetchActivePass] step3: dynamic field content missing fields', content)
    }

    return null
  }

  try {
    return await attempt()
  } catch (error) {
    console.warn('fetchActivePass first attempt failed, retrying once:', error)
    await new Promise((r) => setTimeout(r, 600))
    try {
      return await attempt()
    } catch (retryError) {
      console.error('Error in fetchActivePass (after retry):', retryError)
      return null
    }
  }
}
