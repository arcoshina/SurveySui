import { SuiClient } from '@mysten/sui/client'

export interface SurveyPassData {
  objectId: string
  owner: string
  effectiveTier: number
  status: number
  expiresAt: number
  credentialSources: number[]
  createdAt: number
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
  suiClient: any,
  userAddress: string,
  registryId: string
): Promise<SurveyPassData | null> {
  if (!userAddress || !registryId) {
    return null
  }

  const attempt = async (): Promise<SurveyPassData | null> => {
    console.log('[fetchActivePass] start', { userAddress, registryId })

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

    const registryFields = registryRes.data.content.fields as any
    const tableId = registryFields.passes?.fields?.id?.id

    if (!tableId) {
      console.warn('[fetchActivePass] step1: passes table ID not found in NullifierRegistry fields', registryFields)
      return null
    }
    console.log('[fetchActivePass] step1 ok', { tableId })

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
    console.log('[fetchActivePass] step2 ok', { dfData: tableRes.data })

    // 3. Extract the SurveyPass object ID from the dynamic field value
    const content = tableRes.data.content
    if (content && 'fields' in content) {
      const passId = (content.fields as any).value
      if (passId) {
        // 4. Fetch the SurveyPass object itself
        const passRes = await suiClient.getObject({
          id: passId,
          options: {
            showContent: true,
          },
        })

        if (passRes.data && passRes.data.content && 'fields' in passRes.data.content) {
          const fields = passRes.data.content.fields as any
          const result = {
            objectId: passId,
            owner: fields.owner,
            effectiveTier: Number(fields.effective_tier ?? 0),
            status: Number(fields.status ?? 0),
            expiresAt: Number(fields.expires_at ?? 0),
            credentialSources: fields.credential_sources || [],
            createdAt: Number(fields.created_at ?? 0),
          }
          console.log('[fetchActivePass] step4 ok — returning pass', result)
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
