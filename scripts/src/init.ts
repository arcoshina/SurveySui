import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Transaction } from '@mysten/sui/transactions'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { requireEnv } from './env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTRACTS_PATH = resolve(__dirname, '../../contracts')

// Manually load root .env file
try {
  const rootEnvPath = resolve(__dirname, '../../.env')
  if (existsSync(rootEnvPath)) {
    const envLines = readFileSync(rootEnvPath, 'utf8').split('\n')
    for (const line of envLines) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/)
      if (match) {
        const key = match[1].trim()
        let val = match[2].trim()
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
} catch (e) {
  console.warn('Failed to load root .env file:', e)
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface DeployResult {
  packageId: string
  srTreasuryId: string
  ssrTreasuryId: string
  surveyRegistryId: string
  nullifierRegistryId: string
  issuerConfigId: string
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildPackage(): { modules: string[]; dependencies: string[] } {
  const stdout = execSync(
    `sui move build --dump-bytecode-as-base64 --path "${CONTRACTS_PATH}" --build-env testnet`,
    { encoding: 'utf8' }
  )
  const match = stdout.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON in build output:\n${stdout}`)
  const parsed = JSON.parse(match[0]) as {
    modules?: string[]
    dependencies?: string[]
  }
  if (!parsed.modules || !parsed.dependencies) {
    throw new Error(`Unexpected build output format: ${match[0]}`)
  }
  return { modules: parsed.modules, dependencies: parsed.dependencies }
}

function mergeEnvFile(filePath: string, updates: Record<string, string>): void {
  const existing: Record<string, string> = {}
  if (existsSync(filePath)) {
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      existing[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
    }
  }
  const merged = { ...existing, ...updates }
  writeFileSync(
    filePath,
    Object.entries(merged)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
    'utf8'
  )
}

// ── exported functions ────────────────────────────────────────────────────────

/**
 * Compile and publish the Move package.
 * The `init` functions of survey_reward, stacked_survey_reward, and survey_registry
 * create shared objects automatically on publish; we extract their IDs from the effects.
 */
export async function deployPackage(
  client: SuiClient,
  keypair: Ed25519Keypair,
  adminAddress: string
): Promise<DeployResult> {
  console.log('Building Move package…')
  const { modules, dependencies } = buildPackage()

  console.log('Publishing package…')
  const tx = new Transaction()
  const [upgradeCap] = tx.publish({ modules, dependencies })
  tx.transferObjects([upgradeCap], adminAddress)

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showObjectChanges: true, showEffects: true },
  })
  await client.waitForTransaction({ digest: result.digest, timeout: 120_000 })

  let packageId = ''
  let srTreasuryId = ''
  let ssrTreasuryId = ''
  let surveyRegistryId = ''
  let nullifierRegistryId = ''
  let issuerConfigId = ''

  for (const change of result.objectChanges ?? []) {
    if (change.type === 'published') {
      packageId = change.packageId
    }
    if (change.type === 'created') {
      if (change.objectType.includes('::survey_reward::SrTreasury')) srTreasuryId = change.objectId
      if (change.objectType.includes('::stacked_survey_reward::SsrTreasury'))
        ssrTreasuryId = change.objectId
      if (change.objectType.includes('::survey_registry::SurveyRegistry'))
        surveyRegistryId = change.objectId
      if (change.objectType.includes('::survey_pass::NullifierRegistry'))
        nullifierRegistryId = change.objectId
      if (change.objectType.includes('::survey_pass::IssuerConfig'))
        issuerConfigId = change.objectId
    }
  }

  if (
    !packageId ||
    !srTreasuryId ||
    !ssrTreasuryId ||
    !surveyRegistryId ||
    !nullifierRegistryId ||
    !issuerConfigId
  ) {
    throw new Error(
      `Deploy incomplete. packageId="${packageId}" srTreasuryId="${srTreasuryId}" ` +
        `ssrTreasuryId="${ssrTreasuryId}" surveyRegistryId="${surveyRegistryId}" ` +
        `nullifierRegistryId="${nullifierRegistryId}" issuerConfigId="${issuerConfigId}"`
    )
  }

  console.log(`  packageId:            ${packageId}`)
  console.log(`  srTreasuryId:         ${srTreasuryId}`)
  console.log(`  ssrTreasuryId:        ${ssrTreasuryId}`)
  console.log(`  surveyRegistryId:     ${surveyRegistryId}`)
  console.log(`  nullifierRegistryId:  ${nullifierRegistryId}`)
  console.log(`  issuerConfigId:       ${issuerConfigId}`)
  return {
    packageId,
    srTreasuryId,
    ssrTreasuryId,
    surveyRegistryId,
    nullifierRegistryId,
    issuerConfigId,
  }
}

/**
 * Call `amm_pool::init_pool(admin)` to create and share the bonding-curve pool.
 * The pool starts empty — no initial liquidity required.
 * Returns the created Pool object ID.
 */
export async function initAmmPool(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  adminAddress: string
): Promise<string> {
  console.log('Initialising AMM bonding-curve pool…')
  const tx = new Transaction()
  tx.moveCall({
    target: `${packageId}::amm_pool::init_pool`,
    arguments: [tx.pure.address(adminAddress)],
  })

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showObjectChanges: true, showEffects: true },
  })
  await client.waitForTransaction({ digest: result.digest, timeout: 120_000 })

  for (const change of result.objectChanges ?? []) {
    if (change.type === 'created' && change.objectType.includes('amm_pool::Pool')) {
      console.log(`  poolId: ${change.objectId}`)
      return change.objectId
    }
  }
  throw new Error('AMM Pool object not found in transaction result')
}

/**
 * Read on-chain pool state. Used by `init.test.ts` to verify the pool is live.
 */
export async function queryPoolState(
  client: SuiClient,
  poolId: string
): Promise<{ suiReserve: bigint; srReserve: bigint; totalSuiInvested: bigint }> {
  const obj = await client.getObject({ id: poolId, options: { showContent: true } })
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new Error(`Pool object ${poolId} not found or not a Move object`)
  }
  const f = obj.data.content.fields as Record<string, unknown>
  const suiReserve = BigInt(f.sui_reserve as string | number)
  const srReserve = BigInt(f.sr_reserve as string | number)
  const totalSuiInvested = BigInt(f.total_sui_invested as string)
  return { suiReserve, srReserve, totalSuiInvested }
}

/**
 * Persist deployed object IDs into `.env.shared` (merges with existing values).
 */
export function writeEnvShared(updates: Record<string, string>): void {
  const envPath = resolve(__dirname, '../../.env.shared')
  mergeEnvFile(envPath, updates)
  const rootEnvPath = resolve(__dirname, '../../.env')
  mergeEnvFile(rootEnvPath, updates)
  console.log(`\nWritten to .env.shared and .env:`)
  for (const [k, v] of Object.entries(updates)) {
    console.log(`  ${k}=${v}`)
  }
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

async function main() {
  const network = (process.env.SUI_NETWORK ?? 'testnet') as 'testnet' | 'devnet' | 'localnet'
  const adminPrivKey = requireEnv('SUI_ADMIN_PRIVATE_KEY')
  const adminAddress = requireEnv('SUI_ADMIN_ADDRESS')

  const keypair = adminPrivKey.startsWith('suiprivkey')
    ? Ed25519Keypair.fromSecretKey(adminPrivKey)
    : Ed25519Keypair.fromSecretKey(Buffer.from(adminPrivKey, 'hex'))
  const client = new SuiClient({ url: getFullnodeUrl(network) })

  // 1. Deploy (creates SrTreasury, SsrTreasury, SurveyRegistry, NullifierRegistry, IssuerConfig)
  const {
    packageId,
    srTreasuryId,
    ssrTreasuryId,
    surveyRegistryId,
    nullifierRegistryId,
    issuerConfigId,
  } = await deployPackage(client, keypair, adminAddress)

  // 2. Init AMM pool (empty bonding-curve pool; no initial liquidity required)
  const poolId = await initAmmPool(client, keypair, packageId, adminAddress)

  // 3. Set Issuer Pubkey in IssuerConfig
  let issuerPrivHex = process.env.SURVEY_PASS_ISSUER_PRIV
  if (!issuerPrivHex) {
    const bffEnvPath = resolve(__dirname, '../../bff/.env')
    if (existsSync(bffEnvPath)) {
      const bffEnv = readFileSync(bffEnvPath, 'utf8')
      const match = bffEnv.match(/SURVEY_PASS_ISSUER_PRIV\s*=\s*([a-fA-F0-9xX]+)/)
      if (match) {
        issuerPrivHex = match[1]
      }
    }
  }
  if (!issuerPrivHex) {
    issuerPrivHex = '0101010101010101010101010101010101010101010101010101010101010101'
  }
  const issuerPrivClean = issuerPrivHex.startsWith('0x') ? issuerPrivHex.slice(2) : issuerPrivHex
  const issuerKeypairBytes = new Uint8Array(Buffer.from(issuerPrivClean, 'hex')).slice(0, 32)
  const issuerKeypair = Ed25519Keypair.fromSecretKey(issuerKeypairBytes)
  const issuerPubkeyBytes = issuerKeypair.getPublicKey().toRawBytes()

  console.log('Setting issuer public key on-chain…')
  const setPubkeyTx = new Transaction()
  setPubkeyTx.moveCall({
    target: `${packageId}::survey_pass::set_issuer_pubkey`,
    arguments: [
      setPubkeyTx.object(issuerConfigId),
      setPubkeyTx.pure.vector('u8', Array.from(issuerPubkeyBytes)),
    ],
  })
  const setPubkeyResult = await client.signAndExecuteTransaction({
    transaction: setPubkeyTx,
    signer: keypair,
  })
  await client.waitForTransaction({ digest: setPubkeyResult.digest })
  console.log('  Issuer public key set successfully!')

  // 4. Persist IDs into root .env and .env.shared
  writeEnvShared({
    SUI_PACKAGE_ID: packageId,
    SR_TREASURY_ID: srTreasuryId,
    SSR_TREASURY_ID: ssrTreasuryId,
    AMM_POOL_ID: poolId,
    SURVEY_REGISTRY_ID: surveyRegistryId,
    PASS_REGISTRY_ID: nullifierRegistryId,
    ISSUER_CONFIG_ID: issuerConfigId,
  })

  // 4. Write VITE_* variables to frontend/.env
  const frontendEnvPath = resolve(__dirname, '../../frontend/.env')
  mergeEnvFile(frontendEnvPath, {
    VITE_PACKAGE_ID: packageId,
    VITE_SR_TREASURY_ID: srTreasuryId,
    VITE_SSR_TREASURY_ID: ssrTreasuryId,
    VITE_AMM_POOL_ID: poolId,
    VITE_SURVEY_REGISTRY_ID: surveyRegistryId,
    VITE_PASS_REGISTRY_ID: nullifierRegistryId,
    VITE_NULLIFIER_REGISTRY_ID: nullifierRegistryId,
    VITE_ISSUER_CONFIG_ID: issuerConfigId,
    VITE_ADMIN_ADDRESS: adminAddress,
    VITE_BFF_URL: 'http://localhost:3100',
  })
  console.log(`\nWritten VITE_* variables to frontend/.env`)

  // 5. Write variables to bff/.env
  const bffEnvPath = resolve(__dirname, '../../bff/.env')
  if (existsSync(bffEnvPath)) {
    mergeEnvFile(bffEnvPath, {
      SUI_PACKAGE_ID: packageId,
      PASS_REGISTRY_ID: nullifierRegistryId,
      ISSUER_CONFIG_ID: issuerConfigId,
    })
    console.log(`Written variables to bff/.env`)
  }

  // 5. Verify pool is live
  const state = await queryPoolState(client, poolId)
  console.log(`\nPool verified (empty at start):`)
  console.log(`  sui_reserve:        ${state.suiReserve}`)
  console.log(`  sr_reserve:         ${state.srReserve}`)
  console.log(`  total_sui_invested: ${state.totalSuiInvested}`)
  console.log('\nDeployment complete!')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
