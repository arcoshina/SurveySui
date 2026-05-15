export function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name}`)
  return val
}

export const REQUIRED_VARS: string[] = [
  'SUI_NETWORK',
  'SUI_ADMIN_PRIVATE_KEY',
  'SUI_ADMIN_ADDRESS',
  'DATABASE_URL',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'ZKLOGIN_PROVER_URL',
]

export function assertAllRequired(vars: string[] = REQUIRED_VARS): void {
  const missing = vars.filter((v) => !process.env[v])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
}
