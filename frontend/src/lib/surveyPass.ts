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

  try {
    // 1. Fetch NullifierRegistry to get the passes Table object ID
    const registryRes = await suiClient.getObject({
      id: registryId,
      options: {
        showContent: true,
      },
    })

    if (!registryRes.data || !registryRes.data.content || !('fields' in registryRes.data.content)) {
      console.warn('NullifierRegistry content not found or invalid format.')
      return null
    }

    const registryFields = registryRes.data.content.fields as any
    const tableId = registryFields.passes?.fields?.id?.id

    if (!tableId) {
      console.warn('passes table ID not found in NullifierRegistry fields.')
      return null
    }

    // 2. Query the passes Table dynamic field using the user's address as Key
    const tableRes = await suiClient.getDynamicFieldObject({
      parentId: tableId,
      name: {
        type: 'address',
        value: userAddress,
      },
    })

    if (tableRes.error || !tableRes.data) {
      // Dynamic field not found means the user doesn't have a pass registered
      return null
    }

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
          return {
            objectId: passId,
            owner: fields.owner,
            effectiveTier: Number(fields.effective_tier ?? 0),
            status: Number(fields.status ?? 0),
            expiresAt: Number(fields.expires_at ?? 0),
            credentialSources: fields.credential_sources || [],
            createdAt: Number(fields.created_at ?? 0),
          }
        }
      }
    }

    return null
  } catch (error) {
    console.error('Error in fetchActivePass:', error)
    return null
  }
}
