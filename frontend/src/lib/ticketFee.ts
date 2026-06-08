/** Per-ticket SUI fee (MIST) written onto SurveyVault at publish. Default 0. */
export function getTicketFeeMist(): bigint {
  const raw =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TICKET_FEE_MIST) ||
    (typeof process !== 'undefined' && process.env?.VITE_TICKET_FEE_MIST) ||
    '0'
  const normalized = String(raw).replace(/_/g, '').trim()
  if (!normalized || !/^\d+$/.test(normalized)) return 0n
  return BigInt(normalized)
}
