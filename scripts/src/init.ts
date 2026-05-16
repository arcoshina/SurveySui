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

const SEED_RWD_AMOUNT = 1_000_000n * 1_000_000_000n // 1,000,000 RWD (9 decimals)
const SEED_SUI_AMOUNT = 1_000_000_000n              // 1 SUI (9 decimals)

// ── types ─────────────────────────────────────────────────────────────────────

export interface DeployResult {
  packageId: string
  treasuryId: string
  sbtRegistryId: string
}

export interface PoolReserves {
  reserveA: bigint
  reserveB: bigint
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildPackage(): { modules: string[]; dependencies: string[] } {
  const stdout = execSync(
    `sui move build --dump-bytecode-as-base64 --path "${CONTRACTS_PATH}"`,
    { encoding: 'utf8' },
  )
  // The CLI may print progress lines before the JSON; extract the first JSON object.
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
    'utf8',
  )
}

// ── exported functions ────────────────────────────────────────────────────────

/**
 * Compile and publish the Move package.
 * Returns the package ID and shared-object IDs created by `init` functions.
 */
export async function deployPackage(
  client: SuiClient,
  keypair: Ed25519Keypair,
  adminAddress: string,
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
  await client.waitForTransaction({ digest: result.digest })

  let packageId = ''
  let treasuryId = ''
  let sbtRegistryId = ''

  for (const change of result.objectChanges ?? []) {
    if (change.type === 'published') {
      packageId = change.packageId
    }
    if (change.type === 'created') {
      if (change.objectType.includes('::reward_coin::Treasury')) treasuryId = change.objectId
      if (change.objectType.includes('::participant_sbt::SbtRegistry')) sbtRegistryId = change.objectId
    }
  }

  if (!packageId || !treasuryId || !sbtRegistryId) {
    throw new Error(
      `Deploy incomplete. packageId="${packageId}" treasuryId="${treasuryId}" sbtRegistryId="${sbtRegistryId}"`,
    )
  }

  console.log(`  packageId:    ${packageId}`)
  console.log(`  treasuryId:   ${treasuryId}`)
  console.log(`  sbtRegistryId:${sbtRegistryId}`)
  return { packageId, treasuryId, sbtRegistryId }
}

/**
 * Mint `amount` RWD seed tokens to `adminAddress`.
 * Returns the created Coin<REWARD_COIN> object ID.
 */
export async function mintSeedRwd(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  treasuryId: string,
  adminAddress: string,
  amount: bigint = SEED_RWD_AMOUNT,
): Promise<string> {
  console.log(`Minting ${amount} MIST RWD to admin…`)
  const tx = new Transaction()
  tx.moveCall({
    target: `${packageId}::reward_coin::mint`,
    arguments: [
      tx.object(treasuryId),
      tx.pure.u64(amount),
      tx.pure.address(adminAddress),
    ],
  })

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showObjectChanges: true, showEffects: true },
  })
  await client.waitForTransaction({ digest: result.digest })

  for (const change of result.objectChanges ?? []) {
    if (change.type === 'created' && change.objectType.includes('REWARD_COIN')) {
      console.log(`  rwdCoinId: ${change.objectId}`)
      return change.objectId
    }
  }
  throw new Error('Minted RWD Coin<REWARD_COIN> not found in transaction result')
}

/**
 * Call `amm_pool::init_pool<REWARD_COIN, SUI>` with the given RWD coin + split SUI from gas.
 * The pool is shared inside the Move function; the LP coin is transferred to `adminAddress`.
 * Returns the created Pool object ID.
 */
export async function initAmmPool(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  rwdCoinId: string,
  adminAddress: string,
  suiAmount: bigint = SEED_SUI_AMOUNT,
): Promise<string> {
  console.log(`Initialising AMM pool (RWD + ${suiAmount} MIST SUI)…`)
  const tx = new Transaction()
  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiAmount)])
  const [lpCoin] = tx.moveCall({
    target: `${packageId}::amm_pool::init_pool`,
    typeArguments: [
      `${packageId}::reward_coin::REWARD_COIN`,
      '0x2::sui::SUI',
    ],
    arguments: [tx.object(rwdCoinId), suiCoin],
  })
  tx.transferObjects([lpCoin], adminAddress)

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showObjectChanges: true, showEffects: true },
  })
  await client.waitForTransaction({ digest: result.digest })

  for (const change of result.objectChanges ?? []) {
    if (change.type === 'created' && change.objectType.includes('amm_pool::Pool')) {
      console.log(`  poolId: ${change.objectId}`)
      return change.objectId
    }
  }
  throw new Error('AMM Pool object not found in transaction result')
}

/**
 * Read on-chain pool reserves. Used by `init.test.ts` to verify the pool is live.
 */
export async function queryPoolReserves(
  client: SuiClient,
  poolId: string,
): Promise<PoolReserves> {
  const obj = await client.getObject({ id: poolId, options: { showContent: true } })
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new Error(`Pool object ${poolId} not found or not a Move object`)
  }
  // Balance<T> is stored as { fields: { value: "12345" } } in the RPC JSON
  const f = obj.data.content.fields as Record<string, { fields: { value: string } }>
  const reserveA = BigInt(f.reserve_a.fields.value)
  const reserveB = BigInt(f.reserve_b.fields.value)
  return { reserveA, reserveB }
}

/**
 * Persist deployed object IDs into `.env.shared` (merges with existing values).
 */
export function writeEnvShared(updates: Record<string, string>): void {
  const envPath = resolve(__dirname, '../../.env.shared')
  mergeEnvFile(envPath, updates)
  console.log(`\nWritten to .env.shared:`)
  for (const [k, v] of Object.entries(updates)) {
    console.log(`  ${k}=${v}`)
  }
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

async function main() {
  const network = (process.env.SUI_NETWORK ?? 'testnet') as 'testnet' | 'devnet' | 'localnet'
  const adminPrivKey = requireEnv('SUI_ADMIN_PRIVATE_KEY')
  const adminAddress = requireEnv('SUI_ADMIN_ADDRESS')

  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(adminPrivKey, 'hex'))
  const client = new SuiClient({ url: getFullnodeUrl(network) })

  // 1. Deploy
  const { packageId, treasuryId, sbtRegistryId } = await deployPackage(
    client,
    keypair,
    adminAddress,
  )

  // 2. Mint seed RWD
  const rwdCoinId = await mintSeedRwd(client, keypair, packageId, treasuryId, adminAddress)

  // 3. Initialise AMM pool
  const poolId = await initAmmPool(client, keypair, packageId, rwdCoinId, adminAddress)

  // 4. Persist IDs
  writeEnvShared({
    SUI_PACKAGE_ID: packageId,
    RWD_TREASURY_CAP_ID: treasuryId,
    AMM_POOL_ID: poolId,
    SBT_REGISTRY_ID: sbtRegistryId,
  })

  // 5. Verify
  const reserves = await queryPoolReserves(client, poolId)
  console.log(`\nPool reserves verified:`)
  console.log(`  reserve_a (RWD): ${reserves.reserveA}`)
  console.log(`  reserve_b (SUI): ${reserves.reserveB}`)
  console.log('\nDeployment complete! ✓')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
