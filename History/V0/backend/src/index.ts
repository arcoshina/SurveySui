import { buildApp } from './app.js'
import { ProdZkLoginVerifier } from './auth/zklogin-verifier.js'
import { SbtService } from './sbt/sbt-service.js'
import { SuiSbtChainClient } from './sbt/sui-chain-client.js'
import { SurveyService } from './survey/survey-service.js'
import { NoOpSurveyChainClient } from './survey/noop-chain-client.js'
import { loadAndVerifyAdminKey } from './admin-key.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

// Abort startup if admin key is missing or doesn't match the configured address.
loadAndVerifyAdminKey()

const googleClientId = requireEnv('GOOGLE_OAUTH_CLIENT_ID')
const googleRedirectUri =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 'http://localhost:5173/auth/callback'
const adminSecret = requireEnv('ADMIN_SECRET')

const verifier = new ProdZkLoginVerifier({ googleClientId })
const sbtService = new SbtService(new SuiSbtChainClient())
const surveyService = new SurveyService(new NoOpSurveyChainClient())

const app = await buildApp({
  verifier,
  googleClientId,
  googleRedirectUri,
  sbtService,
  surveyService,
  adminSecret,
  logger: true,
})

const port = Number(process.env.PORT) || 4000
await app.listen({ port, host: '0.0.0.0' })
