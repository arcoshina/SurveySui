import type { SuiClient } from '@mysten/sui/client'
import type { SurveyClaimedEvent } from '../types.js'

export async function fetchClaimedEvents(
  client: SuiClient,
  vaultId: string,
  packageId: string,
): Promise<SurveyClaimedEvent[]> {
  const events: SurveyClaimedEvent[] = []
  let cursor: Parameters<SuiClient['queryEvents']>[0]['cursor'] = null

  do {
    const page = await client.queryEvents({
      query: { MoveEventType: `${packageId}::survey_vault::SurveyClaimed` },
      cursor,
      limit: 50,
    })

    for (const ev of page.data) {
      const parsed = ev.parsedJson as SurveyClaimedEvent
      if (parsed.vault_id === vaultId) events.push(parsed)
    }

    cursor = page.hasNextPage ? page.nextCursor ?? null : null
  } while (cursor !== null)

  return events
}
