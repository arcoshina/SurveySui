export interface SurveyClaimedEvent {
  vault_id: string
  sub_hash: number[]
  respondent: string
  encrypted_answers: number[]
  claimed_at_ms: number
}

export interface StatsResponse {
  vaultId: string
  total_responses: number
  events: SurveyClaimedEvent[]
}
