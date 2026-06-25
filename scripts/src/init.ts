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

function parseEnvU64(name: string, fallback: bigint): bigint {
  const raw = process.env[name]
  if (!raw) return fallback
  const cleaned = raw.replace(/_/g, '').replace(/,/g, '').trim()
  if (!/^\d+$/.test(cleaned)) return fallback
  return BigInt(cleaned)
}

// ── types ─────────────────────────────────────────────────────────────────────

/** Fully-resolved object reference for `tx.receivingRef`. */
export interface ObjectRef {
  objectId: string
  version: string
  digest: string
}

export interface DeployResult {
  packageId: string
  srTreasuryId: string
  ssrTreasuryId: string
  surveyRegistryId: string
  nullifierRegistryId: string
  issuerConfigId: string
  voidNftId: string
  claimPassSentinelId: string
  srCurrency: ObjectRef
  ssrCurrency: ObjectRef
}

/** Sui system CoinRegistry shared object (address 0xc). */
const COIN_REGISTRY_ID =
  '0x000000000000000000000000000000000000000000000000000000000000000c'

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

type ObjectChange = NonNullable<
  Awaited<ReturnType<SuiClient['signAndExecuteTransaction']>>['objectChanges']
>[number]

function findCurrencyRef(
  objectChanges: ObjectChange[] | null | undefined,
  packageId: string,
  coinTypeSuffix: 'survey_reward::SURVEY_REWARD' | 'stacked_survey_reward::STACKED_SURVEY_REWARD'
): ObjectRef | null {
  const needle = `${packageId}::${coinTypeSuffix}`
  for (const change of objectChanges ?? []) {
    if (change.type !== 'created') continue
    if (!change.objectType.includes('coin_registry::Currency')) continue
    if (!change.objectType.includes(needle)) continue
    if (!('digest' in change) || !('version' in change)) continue
    return {
      objectId: change.objectId,
      version: String(change.version),
      digest: change.digest,
    }
  }
  return null
}

async function resolveObjectRef(
  client: SuiClient,
  objectId: string,
  partial?: ObjectRef | null
): Promise<ObjectRef> {
  if (partial?.digest && partial?.version) return partial
  const obj = await client.getObject({ id: objectId, options: { showContent: false } })
  if (!obj.data?.digest || !obj.data?.version) {
    throw new Error(`Cannot resolve object ref for ${objectId}`)
  }
  return { objectId, digest: obj.data.digest, version: obj.data.version }
}

/**
 * OTW coin_registry step 2: promote Currency objects sent to 0xc during publish init.
 */
export async function finalizeCurrencyRegistration(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  srCurrency: ObjectRef,
  ssrCurrency: ObjectRef
): Promise<void> {
  console.log('Finalizing SR/SSR currency registration in CoinRegistry…')
  const tx = new Transaction()
  tx.moveCall({
    target: '0x2::coin_registry::finalize_registration',
    typeArguments: [`${packageId}::survey_reward::SURVEY_REWARD`],
    arguments: [tx.object(COIN_REGISTRY_ID), tx.receivingRef(srCurrency)],
  })
  tx.moveCall({
    target: '0x2::coin_registry::finalize_registration',
    typeArguments: [`${packageId}::stacked_survey_reward::STACKED_SURVEY_REWARD`],
    arguments: [tx.object(COIN_REGISTRY_ID), tx.receivingRef(ssrCurrency)],
  })

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  })
  await client.waitForTransaction({ digest: result.digest, timeout: 120_000 })
  console.log('  Currency registration finalized for SR and SSR')
}

/**
 * 將 `updates` 合併進 env 檔，逐行保留原檔內容（含註解、空行、排序）。
 * 既有鍵就地換值；原檔不存在的鍵附加到檔尾。idempotent：重跑不重複附加、
 * 不持續增生空行。
 *
 * 為何不重寫整檔：舊版只擷取 `KEY=VALUE` 再純值重寫，會洗掉 `.env` 的所有
 * 註解與空行——每次 `pnpm deploy:Devnet` 都摧毀人為文件化的設定。
 */
export function mergeEnvFile(filePath: string, updates: Record<string, string>): void {
  const remaining = new Set(Object.keys(updates))
  let lines: string[] = []
  if (existsSync(filePath)) {
    lines = readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => {
        const trimmed = line.trim()
        // 原樣保留註解與空行。
        if (!trimmed || trimmed.startsWith('#')) return line
        const idx = trimmed.indexOf('=')
        if (idx === -1) return line
        const key = trimmed.slice(0, idx)
        if (key in updates) {
          remaining.delete(key)
          return `${key}=${updates[key]}` // 就地更新既有鍵的值
        }
        return line
      })
  }
  // 移除最後一行因檔尾換行而產生的空字串，避免每次跑都多疊一行空白。
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  // 附加原檔不存在的新鍵。
  for (const key of remaining) lines.push(`${key}=${updates[key]}`)
  writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
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
  let voidNftId = ''
  let claimPassSentinelId = ''

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
      if (change.objectType.endsWith('::claim_sentinel::VoidNft')) voidNftId = change.objectId
      // publish 交易中唯一的 SurveyPass 就是 survey_pass::init 的 padding sentinel
      if (change.objectType.endsWith('::survey_pass::SurveyPass'))
        claimPassSentinelId = change.objectId
    }
  }

  let srCurrency = findCurrencyRef(result.objectChanges, packageId, 'survey_reward::SURVEY_REWARD')
  let ssrCurrency = findCurrencyRef(
    result.objectChanges,
    packageId,
    'stacked_survey_reward::STACKED_SURVEY_REWARD'
  )

  if (
    !packageId ||
    !srTreasuryId ||
    !ssrTreasuryId ||
    !surveyRegistryId ||
    !nullifierRegistryId ||
    !issuerConfigId ||
    !voidNftId ||
    !claimPassSentinelId ||
    !srCurrency ||
    !ssrCurrency
  ) {
    throw new Error(
      `Deploy incomplete. packageId="${packageId}" srTreasuryId="${srTreasuryId}" ` +
        `ssrTreasuryId="${ssrTreasuryId}" surveyRegistryId="${surveyRegistryId}" ` +
        `nullifierRegistryId="${nullifierRegistryId}" issuerConfigId="${issuerConfigId}" ` +
        `voidNftId="${voidNftId}" claimPassSentinelId="${claimPassSentinelId}" ` +
        `srCurrency=${srCurrency?.objectId ?? 'missing'} ssrCurrency=${ssrCurrency?.objectId ?? 'missing'}`
    )
  }

  srCurrency = await resolveObjectRef(client, srCurrency.objectId, srCurrency)
  ssrCurrency = await resolveObjectRef(client, ssrCurrency.objectId, ssrCurrency)

  console.log(`  packageId:            ${packageId}`)
  console.log(`  srTreasuryId:         ${srTreasuryId}`)
  console.log(`  ssrTreasuryId:        ${ssrTreasuryId}`)
  console.log(`  surveyRegistryId:     ${surveyRegistryId}`)
  console.log(`  nullifierRegistryId:  ${nullifierRegistryId}`)
  console.log(`  issuerConfigId:       ${issuerConfigId}`)
  console.log(`  voidNftId:            ${voidNftId}`)
  console.log(`  claimPassSentinelId:  ${claimPassSentinelId}`)
  console.log(`  srCurrencyId:         ${srCurrency.objectId}`)
  console.log(`  ssrCurrencyId:        ${ssrCurrency.objectId}`)
  return {
    packageId,
    srTreasuryId,
    ssrTreasuryId,
    surveyRegistryId,
    nullifierRegistryId,
    issuerConfigId,
    voidNftId,
    claimPassSentinelId,
    srCurrency,
    ssrCurrency,
  }
}

export interface ProtocolPoolInitResult {
  poolId: string
  protocolConfigId: string
}

/**
 * Create shared `ProtocolConfig` and bootstrap the canonical bonding-curve pool.
 * Replaces deprecated `amm_pool::init_pool`.
 */
export async function initProtocolAndCanonicalPool(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  adminAddress: string
): Promise<ProtocolPoolInitResult> {
  console.log('Creating ProtocolConfig…')
  const configTx = new Transaction()
  configTx.moveCall({
    target: `${packageId}::amm_pool::create_protocol_config`,
    arguments: [],
  })
  const configResult = await client.signAndExecuteTransaction({
    transaction: configTx,
    signer: keypair,
    options: { showObjectChanges: true, showEffects: true },
  })
  await client.waitForTransaction({ digest: configResult.digest, timeout: 120_000 })

  let protocolConfigId: string | null = null
  for (const change of configResult.objectChanges ?? []) {
    if (change.type === 'created' && change.objectType.includes('amm_pool::ProtocolConfig')) {
      protocolConfigId = change.objectId
      break
    }
  }
  if (!protocolConfigId) {
    throw new Error('ProtocolConfig object not found in transaction result')
  }
  console.log(`  protocolConfigId: ${protocolConfigId}`)

  const minGasComp = parseEnvU64('MIN_GAS_COMPENSATION_AMOUNT', 100_000_000n)
  const purgeBatch = parseEnvU64('PURGE_ANSWERS_BATCH', 500n)
  console.log(
    `Configuring protocol limits (min_gas_compensation=${minGasComp}, purge_batch=${purgeBatch})…`
  )
  const limitsTx = new Transaction()
  limitsTx.moveCall({
    target: `${packageId}::amm_pool::configure_protocol_limits`,
    arguments: [
      limitsTx.object(protocolConfigId),
      limitsTx.pure.u64(minGasComp.toString()),
      limitsTx.pure.u64(purgeBatch.toString()),
    ],
  })
  const limitsResult = await client.signAndExecuteTransaction({
    transaction: limitsTx,
    signer: keypair,
    options: { showEffects: true },
  })
  await client.waitForTransaction({ digest: limitsResult.digest, timeout: 120_000 })

  // Authorise BFF sponsor address(es) for normal-grace purge. Comma-separated, ≤3.
  // Defaults to GAS_SPONSOR_ADDRESS (the multisig sponsor the BFF signs purge with)
  // so deploy/reset wire this up automatically; set SUI_PURGE_SPONSORS to override
  // (e.g. to add backup sponsors). Without any sponsor the BFF falls into the long
  // liveness-fallback window — only the creator could purge at grace.
  const purgeSponsorsRaw = process.env.SUI_PURGE_SPONSORS ?? process.env.GAS_SPONSOR_ADDRESS
  const sponsors = (purgeSponsorsRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (sponsors.length > 3) {
    throw new Error(`SUI_PURGE_SPONSORS supports at most 3 addresses, got ${sponsors.length}`)
  }
  if (sponsors.length > 0) {
    console.log(`Setting purge sponsors (${sponsors.length})…`)
    const sponsorsTx = new Transaction()
    sponsorsTx.moveCall({
      target: `${packageId}::amm_pool::set_purge_sponsors`,
      arguments: [
        sponsorsTx.object(protocolConfigId),
        sponsorsTx.pure.vector('address', sponsors),
      ],
    })
    const sponsorsResult = await client.signAndExecuteTransaction({
      transaction: sponsorsTx,
      signer: keypair,
      options: { showEffects: true },
    })
    await client.waitForTransaction({ digest: sponsorsResult.digest, timeout: 120_000 })
    console.log(`  purge sponsors set: ${sponsors.join(', ')}`)
  } else {
    console.warn(
      '  ⚠️  Neither SUI_PURGE_SPONSORS nor GAS_SPONSOR_ADDRESS set — purge_sponsors is empty; BFF cannot purge at grace until admin calls set_purge_sponsors.'
    )
  }

  console.log('Bootstrapping canonical AMM pool…')
  const poolTx = new Transaction()
  poolTx.moveCall({
    target: `${packageId}::amm_pool::bootstrap_canonical_pool`,
    arguments: [poolTx.object(protocolConfigId), poolTx.pure.address(adminAddress)],
  })
  const poolResult = await client.signAndExecuteTransaction({
    transaction: poolTx,
    signer: keypair,
    options: { showObjectChanges: true, showEffects: true },
  })
  await client.waitForTransaction({ digest: poolResult.digest, timeout: 120_000 })

  let poolId: string | null = null
  for (const change of poolResult.objectChanges ?? []) {
    if (change.type === 'created' && change.objectType.includes('amm_pool::Pool')) {
      poolId = change.objectId
      break
    }
  }
  if (!poolId) {
    throw new Error('AMM Pool object not found in bootstrap transaction result')
  }
  console.log(`  poolId: ${poolId}`)
  return { poolId, protocolConfigId }
}

/** @deprecated Use `initProtocolAndCanonicalPool`. Kept for tests importing pool id only. */
export async function initAmmPool(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  adminAddress: string
): Promise<string> {
  const { poolId } = await initProtocolAndCanonicalPool(client, keypair, packageId, adminAddress)
  return poolId
}

/**
 * Read on-chain pool state. Used by `init.test.ts` to verify the pool is live.
 */
export async function queryPoolState(
  client: SuiClient,
  poolId: string
): Promise<{ suiReserve: bigint; srReserve: bigint; spotMistPerSsrBase: number }> {
  const obj = await client.getObject({ id: poolId, options: { showContent: true } })
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new Error(`Pool object ${poolId} not found or not a Move object`)
  }
  const f = obj.data.content.fields as Record<string, unknown>
  const suiReserve = BigInt(f.sui_reserve as string | number)
  const srReserve = BigInt(f.sr_reserve as string | number)
  const spotMistPerSsrBase =
    suiReserve === 0n || srReserve === 0n
      ? 1
      : Number(suiReserve) / Number(srReserve)
  return { suiReserve, srReserve, spotMistPerSsrBase }
}

/**
 * Persist deployed object IDs into root `.env` (merges with existing values).
 */
export function mergeRootEnv(updates: Record<string, string>): void {
  const rootEnvPath = resolve(__dirname, '../../.env')
  mergeEnvFile(rootEnvPath, updates)
  console.log(`\nWritten to .env:`)
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
    voidNftId,
    claimPassSentinelId,
    srCurrency,
    ssrCurrency,
  } = await deployPackage(client, keypair, adminAddress)

  // 2. Promote OTW Currency objects into CoinRegistry (wallet metadata discoverability)
  await finalizeCurrencyRegistration(client, keypair, packageId, srCurrency, ssrCurrency)

  // 3. ProtocolConfig + canonical AMM pool (empty at start; no initial liquidity required)
  const { poolId, protocolConfigId } = await initProtocolAndCanonicalPool(
    client,
    keypair,
    packageId,
    adminAddress
  )

  // 4. Set Issuer Pubkey in IssuerConfig
  let issuerPrivHex = process.env.SURVEY_PASS_ISSUER_PRIV
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

  // 5. Persist IDs into root .env
  mergeRootEnv({
    SUI_PACKAGE_ID: packageId,
    SR_TREASURY_ID: srTreasuryId,
    SSR_TREASURY_ID: ssrTreasuryId,
    AMM_POOL_ID: poolId,
    PROTOCOL_CONFIG_ID: protocolConfigId,
    SURVEY_REGISTRY_ID: surveyRegistryId,
    PASS_REGISTRY_ID: nullifierRegistryId,
    ISSUER_CONFIG_ID: issuerConfigId,
    VOID_NFT_ID: voidNftId,
    CLAIM_PASS_SENTINEL_ID: claimPassSentinelId,
  })



  // 6. Verify pool is live
  const state = await queryPoolState(client, poolId)
  console.log(`\nPool verified (empty at start):`)
  console.log(`  sui_reserve:          ${state.suiReserve}`)
  console.log(`  sr_reserve:           ${state.srReserve}`)
  console.log(`  spot_MIST/SSR_base:   ${state.spotMistPerSsrBase}`)
  console.log('\nDeployment complete!')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
