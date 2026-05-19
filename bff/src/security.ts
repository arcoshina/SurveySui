export function assertSecureEnv(): void {
  if (process.env.SUI_ADMIN_PRIVATE_KEY) {
    throw new Error('BFF must not hold admin TX key')
  }
  if (process.env.SURVEY_PASS_ISSUER_PRIV) {
    console.log('ticket-only, cannot sign TX')
  }
}
