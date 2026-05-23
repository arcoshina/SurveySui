import type { SurveyClaimedEvent, StatsResponse } from '../types.js'

export function aggregateEvents(vaultId: string, events: SurveyClaimedEvent[]): StatsResponse {
  return { vaultId, total_responses: events.length, events }
}
