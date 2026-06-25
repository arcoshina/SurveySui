/**
 * R0/P1 CertiK finding matrix — on-chain smoke on Sui Devnet.
 *
 * Usage (repo root):
 *   pnpm certik:smoke:devnet
 *
 * Writes JSON to docs/CertiK/certik-smoke-results.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { requireEnv } from './env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

// Load root .env (same as init.ts)
const envPath = resolve(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = val
  }
}

export interface SmokeResult {
  finding: string
  scenario: string
  expected: string
  actual: string
  digest?: string
  moveTestRef?: string
}

const SSR_TYPE = (pkg: string) => `${pkg}::stacked_survey_reward::STACKED_SURVEY_REWARD`
const VOID_NFT_TYPE = (pkg: string) => `${pkg}::claim_sentinel::VoidNft`
const DEVNET_NFT_TYPE = '0x2::devnet_nft::DevNetNFT'
const SMOKE_ATTACKER_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

/** Matches init.ts default `min_gas_compensation_mist` (F73). */
const DEFAULT_MIN_GAS_COMP_MIST = 100_000_000

/** Matches contract `DEFAULT_PURGE_GRACE_MS` (92 days); set once at create_empty, immutable. */
const DEFAULT_PURGE_GRACE_MS = 92 * 24 * 60 * 60 * 1000

/** `create_empty` vault with gas deposit meeting protocol floor + required_gas (F73). */
function moveCallCreateEmptyVault(
  tx: Transaction,
  opts: {
    packageId: string
    protocolConfigId: string
    adminTreasury: string
    sponsorAddress: string
    deadlineMs: number
    maxResponses?: number
    allowedNftType: number[] | null
    minGasCompMist?: number
  }
) {
  const minGas = opts.minGasCompMist ?? DEFAULT_MIN_GAS_COMP_MIST
  const maxResponses = opts.maxResponses ?? 1
  const requiredGas = maxResponses * minGas
  const [gasCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(requiredGas)])
  return tx.moveCall({
    target: `${opts.packageId}::survey_vault::create_empty`,
    arguments: [
      tx.pure.u64(1),
      tx.pure.u64(0),
      tx.pure.u64(1),
      tx.pure.u64(maxResponses),
      tx.pure.u64(opts.deadlineMs),
      tx.pure.address(opts.adminTreasury),
      gasCoin,
      tx.pure.address(opts.sponsorAddress),
      tx.pure.u64(minGas),
      tx.pure.u64(0),
      tx.pure.u64(0),
      tx.pure.u64(DEFAULT_PURGE_GRACE_MS),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(opts.allowedNftType).toBytes()),
      tx.object(opts.protocolConfigId),
      tx.object('0x6'),
    ],
  })
}

function graphqlUrl(network: 'devnet' | 'testnet'): string {
  return network === 'devnet'
    ? 'https://graphql.devnet.sui.io/graphql'
    : 'https://graphql.testnet.sui.io/graphql'
}

async function queryObjectsByType(
  network: 'devnet' | 'testnet',
  structType: string
): Promise<string[]> {
  const query = `
    query ObjectsByType($type: String!) {
      objects(filter: { type: $type }, first: 50) {
        nodes { address }
      }
    }
  `
  const res = await fetch(graphqlUrl(network), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { type: structType } }),
  })
  const json = (await res.json()) as {
    data?: { objects?: { nodes?: { address: string }[] } }
    errors?: unknown[]
  }
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`)
  }
  return (json.data?.objects?.nodes ?? []).map((n) => n.address)
}

async function ensureDevnetGas(
  client: SuiClient,
  address: string,
  minMist = 300_000_000n,
  fatal = false
): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const coins = await client.getCoins({ owner: address })
    const total = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n)
    if (total >= minMist) return true
    try {
      await requestSuiFromFaucetV2({
        host: getFaucetHost('devnet'),
        recipient: address,
      })
    } catch (err) {
      console.warn(`Faucet request failed for ${address}:`, err)
    }
    await new Promise((r) => setTimeout(r, 8000))
  }
  if (fatal) throw new Error(`Insufficient devnet gas for ${address}`)
  console.warn(`Low gas for ${address}; continuing`)
  return false
}

function keypairFromEnv(name: string): Ed25519Keypair {
  const raw = requireEnv(name)
  return raw.startsWith('suiprivkey')
    ? Ed25519Keypair.fromSecretKey(raw)
    : Ed25519Keypair.fromSecretKey(Buffer.from(raw.replace(/^0x/, ''), 'hex'))
}

function smokeMnemonic(): string {
  return process.env.DEV_MNEMONIC ?? SMOKE_ATTACKER_MNEMONIC
}

function attackerKeypair(): Ed25519Keypair {
  return Ed25519Keypair.deriveKeypair(smokeMnemonic(), "m/44'/784'/1'/0'/0'")
}

function responder2Keypair(): Ed25519Keypair {
  return Ed25519Keypair.deriveKeypair(smokeMnemonic(), "m/44'/784'/1'/0'/1'")
}

async function queryStructId(
  network: 'devnet' | 'testnet',
  structType: string
): Promise<string> {
  const ids = await queryObjectsByType(network, structType)
  if (!ids.length) throw new Error(`Object not found for type ${structType}`)
  return ids[0]
}

async function findClaimPassSentinel(
  client: SuiClient,
  network: 'devnet' | 'testnet',
  packageId: string
): Promise<string> {
  const t = `${packageId}::survey_pass::SurveyPass`
  const ids = await queryObjectsByType(network, t)
  for (const id of ids) {
    const obj = await client.getObject({ id, options: { showContent: true } })
    const fields = (obj.data?.content as { fields?: Record<string, unknown> })?.fields
    // Shared padding pass from survey_pass::init (owner=@0x0, status=REVOKED).
    const owner = String(fields?.owner ?? '')
    const isZeroAddr =
      owner === '0x0' ||
      owner === '0x0000000000000000000000000000000000000000000000000000000000000000'
    if (fields && isZeroAddr) {
      return id
    }
  }
  throw new Error('Claim pass sentinel not found')
}

const TicketPayload = bcs.struct('TicketPayload', {
  owner: bcs.Address,
  source: bcs.u8(),
  nullifiers: bcs.vector(bcs.vector(bcs.u8())),
  commitment: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
  escape_clawback_mist: bcs.u64(),
})

/** BFF email source — minimal credential for attribute-survey pass placeholder (F34). */
const SRC_EMAIL = 2

async function signSmokeTicket(
  owner: string,
  nullifierSeed: number
): Promise<{ bff_sig: string; expires_at: string; nullifiers: Uint8Array[] }> {
  const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
  if (!privKeyHex) {
    throw new Error('SURVEY_PASS_ISSUER_PRIV is required to mint smoke SurveyPass on devnet')
  }
  const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
  const keypair = Ed25519Keypair.fromSecretKey(
    new Uint8Array(Buffer.from(privKeyClean, 'hex').slice(0, 32))
  )
  const nullifier = new Uint8Array(32)
  nullifier[0] = nullifierSeed & 0xff
  nullifier[1] = (nullifierSeed >> 8) & 0xff
  const expiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000
  const expires_at = BigInt(expiresAtMs).toString()
  const payloadBytes = TicketPayload.serialize({
    owner,
    source: SRC_EMAIL,
    nullifiers: [Array.from(nullifier)],
    commitment: [],
    expires_at,
    escape_clawback_mist: '0',
  }).toBytes()
  const signatureBytes = await keypair.sign(payloadBytes)
  return {
    bff_sig: Buffer.from(signatureBytes).toString('hex'),
    expires_at,
    nullifiers: [nullifier],
  }
}

async function findPassForOwner(
  client: SuiClient,
  network: 'devnet' | 'testnet',
  packageId: string,
  owner: string
): Promise<string | null> {
  const ownerNorm = owner.toLowerCase()
  const ids = await queryObjectsByType(network, `${packageId}::survey_pass::SurveyPass`)
  for (const id of ids) {
    const obj = await client.getObject({ id, options: { showContent: true } })
    const fields = (obj.data?.content as { fields?: Record<string, string> })?.fields
    const passOwner = String(fields?.owner ?? '').toLowerCase()
    const isZero =
      passOwner === '0x0' ||
      passOwner === '0x0000000000000000000000000000000000000000000000000000000000000000'
    if (!isZero && passOwner === ownerNorm) {
      return id
    }
  }
  return null
}

async function getOrMintSmokePass(opts: {
  client: SuiClient
  network: 'devnet' | 'testnet'
  packageId: string
  passRegistryId: string
  issuerConfigId: string
  signer: Ed25519Keypair
  nullifierSeed: number
}): Promise<string> {
  const owner = opts.signer.getPublicKey().toSuiAddress()
  const existing = await findPassForOwner(opts.client, opts.network, opts.packageId, owner)
  if (existing) return existing

  await ensureDevnetGas(opts.client, owner, 100_000_000n)
  const ticket = await signSmokeTicket(owner, opts.nullifierSeed)
  const tx = new Transaction()
  tx.moveCall({
    target: `${opts.packageId}::survey_pass::mint_pass`,
    arguments: [
      tx.object(opts.passRegistryId),
      tx.object(opts.issuerConfigId),
      tx.pure.address(owner),
      tx.pure.address(owner),
      tx.pure.u8(SRC_EMAIL),
      tx.pure(
        bcs
          .vector(bcs.vector(bcs.u8()))
          .serialize(ticket.nullifiers.map((n) => Array.from(n)))
          .toBytes()
      ),
      tx.pure.vector('u8', []),
      tx.pure.u64(ticket.expires_at),
      tx.pure.u64(0),
      tx.pure.vector('u8', Array.from(Buffer.from(ticket.bff_sig, 'hex'))),
      tx.object('0x6'),
    ],
  })
  const out = await runTx(opts.client, tx, opts.signer)
  if (out.status !== 'success') {
    throw new Error(`mint_pass failed for ${owner}: ${out.error}`)
  }
  const details = await opts.client.getTransactionBlock({
    digest: out.digest,
    options: { showObjectChanges: true },
  })
  for (const ch of details.objectChanges ?? []) {
    if (ch.type === 'created' && ch.objectType.includes('::survey_pass::SurveyPass')) {
      return ch.objectId
    }
  }
  throw new Error(`mint_pass tx ${out.digest} did not create SurveyPass`)
}

type TxOutcome = { digest: string; status: 'success' | 'failure'; error?: string }

async function runTx(
  client: SuiClient,
  tx: Transaction,
  signer: Ed25519Keypair
): Promise<TxOutcome> {
  try {
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      options: { showEffects: true },
    })
    await client.waitForTransaction({ digest: result.digest })
    const status = result.effects?.status?.status === 'success' ? 'success' : 'failure'
    const error =
      status === 'failure'
        ? (result.effects?.status as { error?: string })?.error ?? 'unknown failure'
        : undefined
    return { digest: result.digest, status, error }
  } catch (err: unknown) {
    const e = err as {
      message?: string
      cause?: {
        effects?: {
          transactionDigest?: string
          status?: { error?: string }
          abortError?: { sub_status?: number }
        }
      }
    }
    const digest = e.cause?.effects?.transactionDigest ?? 'dry-run'
    const abort = e.cause?.effects?.abortError?.sub_status
    const error =
      e.cause?.effects?.status?.error ??
      (abort != null ? `MoveAbort sub_status=${abort}` : undefined) ??
      e.message ??
      String(err)
    return { digest, status: 'failure', error }
  }
}

function record(
  results: SmokeResult[],
  row: Omit<SmokeResult, 'actual'> & { actual?: string; outcome: TxOutcome }
) {
  const ok =
    row.expected.startsWith('success')
      ? row.outcome.status === 'success'
      : row.outcome.status === 'failure'
  results.push({
    finding: row.finding,
    scenario: row.scenario,
    expected: row.expected,
    actual: ok
      ? row.outcome.status + (row.outcome.error ? ` (${row.outcome.error})` : '')
      : `UNEXPECTED ${row.outcome.status}: ${row.outcome.error ?? ''}`,
    digest: row.outcome.digest,
    moveTestRef: row.moveTestRef,
  })
}

async function buildSharedSurveyFixture(opts: {
  client: SuiClient
  admin: Ed25519Keypair
  packageId: string
  registryId: string
  poolId: string
  protocolConfigId: string
  srTreasuryId: string
  ssrTreasuryId: string
  adminTreasury: string
  sponsorAddress: string
  allowedNftType: string | null
  allowedNullifiers: string[]
  allowedSources: number[]
  matchThreshold: number
  claimMode: number
  deadlineMs: number
  maxResponses?: number
}): Promise<{ vaultId: string; surveyId: string; digest: string }> {
  await ensureDevnetGas(
    opts.client,
    opts.admin.getPublicKey().toSuiAddress(),
    800_000_000n,
    true
  )
  const tx = new Transaction()
  const now = Date.now()
  const allowedNftOpt = opts.allowedNftType
    ? Array.from(new TextEncoder().encode(opts.allowedNftType))
    : null
  const [vault] = moveCallCreateEmptyVault(tx, {
    packageId: opts.packageId,
    protocolConfigId: opts.protocolConfigId,
    adminTreasury: opts.adminTreasury,
    sponsorAddress: opts.sponsorAddress,
    deadlineMs: opts.deadlineMs,
    maxResponses: opts.maxResponses ?? 1,
    allowedNftType: allowedNftOpt,
  })
  const [suiForMint] = tx.splitCoins(tx.gas, [tx.pure.u64(50_000_000)])
  const [minted] = tx.moveCall({
    target: `${opts.packageId}::amm_pool::invest_and_mint`,
    arguments: [
      tx.object(opts.poolId),
      tx.object(opts.protocolConfigId),
      tx.object(opts.srTreasuryId),
      tx.object(opts.ssrTreasuryId),
      suiForMint,
      tx.pure.u64(1),
    ],
  })
  tx.moveCall({
    target: `${opts.packageId}::survey_vault::merge_balances`,
    arguments: [vault, minted, tx.object(opts.poolId), tx.object(opts.protocolConfigId)],
  })
  tx.moveCall({
    target: `${opts.packageId}::survey_vault::split_fee_to_treasury`,
    arguments: [vault, tx.object(opts.poolId), tx.object(opts.protocolConfigId)],
  })
  const q = tx.moveCall({
    target: `${opts.packageId}::survey_registry::new_question`,
    arguments: [
      tx.pure.vector('u8', Array.from(new TextEncoder().encode('q1'))),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode('text'))),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode('prompt'))),
      tx.pure.vector('vector<u8>', []),
      tx.pure.bool(true),
    ],
  })
  const questions = tx.makeMoveVec({
    type: `${opts.packageId}::survey_registry::Question`,
    elements: [q],
  })
  const nullifierBytes = opts.allowedNullifiers.map((n) =>
    Array.from(new TextEncoder().encode(n))
  )
  tx.moveCall({
    target: `${opts.packageId}::survey_vault::register_survey`,
    arguments: [
      tx.object(opts.registryId),
      vault,
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(`hash-${now}`))),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(Array.from(new TextEncoder().encode('enc'))).toBytes()),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
      tx.pure(bcs.option(bcs.Address).serialize(null).toBytes()),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode('schema'))),
      tx.pure.vector('u8', []),
      questions,
      tx.pure.vector('u8', opts.allowedSources),
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(nullifierBytes).toBytes()),
      tx.pure.u64(opts.matchThreshold),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
      tx.pure(bcs.option(bcs.Address).serialize(null).toBytes()),
      tx.pure.u8(opts.claimMode),
      tx.object('0x6'),
    ],
  })
  tx.moveCall({
    target: `${opts.packageId}::survey_vault::share_vault`,
    arguments: [vault],
  })
  const outcome = await runTx(opts.client, tx, opts.admin)
  if (outcome.status !== 'success') {
    throw new Error(`Fixture failed: ${outcome.error}`)
  }
  const txDetails = await opts.client.getTransactionBlock({
    digest: outcome.digest,
    options: { showObjectChanges: true },
  })
  let vaultId = ''
  let surveyId = ''
  for (const ch of txDetails.objectChanges ?? []) {
    if (ch.type === 'created' && ch.objectType.includes('::survey_vault::SurveyVault')) {
      vaultId = ch.objectId
    }
    if (ch.type === 'created' && ch.objectType.includes('::survey_registry::Survey')) {
      surveyId = ch.objectId
    }
  }
  if (!vaultId || !surveyId) throw new Error('Could not parse fixture object IDs')
  return { vaultId, surveyId, digest: outcome.digest }
}

function unifiedClaimArgs(
  tx: Transaction,
  p: {
    packageId: string
    vaultId: string
    surveyId: string
    issuerConfigId: string
    voidNftId: string
    passSentinelId: string
    authKind: number
    usePass: boolean
    passId: string
    useNft: boolean
    nftId: string
    attributeNullifiers?: string[]
    ticketSig?: number[]
    ephemeralNullifier?: number[]
    ticketExpiresAt?: number
    encryptedAnswers?: number[] | null
  }
) {
  const attr =
    p.attributeNullifiers?.map((n) => Array.from(new TextEncoder().encode(n))) ?? []
  return [
    tx.object(p.vaultId),
    tx.object(p.surveyId),
    tx.pure.u8(p.authKind),
    tx.pure.bool(p.usePass),
    tx.object(p.passId),
    tx.pure.bool(p.useNft),
    tx.object(p.nftId),
    tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(attr).toBytes()),
    tx.object(p.issuerConfigId),
    tx.pure(bcs.vector(bcs.u8()).serialize(p.ticketSig ?? []).toBytes()),
    tx.pure(bcs.vector(bcs.u8()).serialize(p.ephemeralNullifier ?? []).toBytes()),
    tx.pure.u64(p.ticketExpiresAt ?? 0),
    tx.pure(
      bcs
        .option(bcs.vector(bcs.u8()))
        .serialize(
          p.encryptedAnswers === undefined
            ? [1]
            : p.encryptedAnswers === null
              ? null
              : p.encryptedAnswers
        )
        .toBytes()
    ),
    tx.object('0x6'),
  ]
}

async function main() {
  const network = (process.env.SUI_NETWORK ?? 'devnet') as 'devnet' | 'testnet'
  if (network !== 'devnet') {
    throw new Error(`certik-smoke-devnet requires SUI_NETWORK=devnet (got ${network})`)
  }
  const client = new SuiClient({ url: process.env.SUI_RPC_URL ?? getFullnodeUrl('devnet') })
  const admin = keypairFromEnv('SUI_ADMIN_PRIVATE_KEY')
  const attacker = attackerKeypair()
  const responder2 = responder2Keypair()
  const packageId = requireEnv('SUI_PACKAGE_ID')
  const registryId = requireEnv('SURVEY_REGISTRY_ID')
  const poolId = requireEnv('AMM_POOL_ID')
  const protocolConfigId = requireEnv('PROTOCOL_CONFIG_ID')
  const srTreasuryId = requireEnv('SR_TREASURY_ID')
  const ssrTreasuryId = requireEnv('SSR_TREASURY_ID')
  const issuerConfigId = requireEnv('ISSUER_CONFIG_ID')
  const passRegistryId = process.env.NULLIFIER_REGISTRY_ID ?? process.env.PASS_REGISTRY_ID
  if (!passRegistryId) {
    throw new Error('NULLIFIER_REGISTRY_ID or PASS_REGISTRY_ID must be set in .env')
  }
  const adminTreasury = requireEnv('SUI_ADMIN_ADDRESS')
  const sponsorAddress = process.env.GAS_SPONSOR_ADDRESS ?? adminTreasury

  const voidNftId = await queryStructId(network, VOID_NFT_TYPE(packageId))
  const passSentinelId = await findClaimPassSentinel(client, network, packageId)

  await ensureDevnetGas(client, admin.getPublicKey().toSuiAddress(), 300_000_000n, true)

  const results: SmokeResult[] = []
  const deadline = Date.now() + 7 * 24 * 60 * 60 * 1000

  console.log('Package:', packageId)
  console.log('VoidNft:', voidNftId)
  console.log('Pass sentinel:', passSentinelId)

  // ── F64 non-creator register_survey ──
  let f64VaultId = ''
  {
    const tx = new Transaction()
    const [vault] = moveCallCreateEmptyVault(tx, {
      packageId,
      protocolConfigId,
      adminTreasury,
      sponsorAddress,
      deadlineMs: deadline,
      allowedNftType: null,
    })
    const [suiForMint] = tx.splitCoins(tx.gas, [tx.pure.u64(50_000_000)])
    const [minted] = tx.moveCall({
      target: `${packageId}::amm_pool::invest_and_mint`,
      arguments: [
        tx.object(poolId),
        tx.object(protocolConfigId),
        tx.object(srTreasuryId),
        tx.object(ssrTreasuryId),
        suiForMint,
        tx.pure.u64(1),
      ],
    })
    tx.moveCall({
      target: `${packageId}::survey_vault::merge_balances`,
      arguments: [vault, minted, tx.object(poolId), tx.object(protocolConfigId)],
    })
    tx.moveCall({
      target: `${packageId}::survey_vault::split_fee_to_treasury`,
      arguments: [vault, tx.object(poolId), tx.object(protocolConfigId)],
    })
    tx.moveCall({
      target: `${packageId}::survey_vault::share_vault`,
      arguments: [vault],
    })
    const created = await runTx(client, tx, admin)
    if (created.status !== 'success') throw new Error(`F64 setup failed: ${created.error}`)
    const details = await client.getTransactionBlock({
      digest: created.digest,
      options: { showObjectChanges: true },
    })
    for (const ch of details.objectChanges ?? []) {
      if (ch.type === 'created' && ch.objectType.includes('::survey_vault::SurveyVault')) {
        f64VaultId = ch.objectId
      }
    }
  }
  await ensureDevnetGas(client, attacker.getPublicKey().toSuiAddress(), 100_000_000n)
  {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::register_survey`,
      arguments: [
        tx.object(registryId),
        tx.object(f64VaultId),
        tx.pure.vector('u8', [9, 9, 9]),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize([1]).toBytes()),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.pure(bcs.option(bcs.Address).serialize(null).toBytes()),
        tx.pure.vector('u8', [1]),
        tx.pure.vector('u8', []),
        tx.makeMoveVec({ type: `${packageId}::survey_registry::Question`, elements: [] }),
        tx.pure.vector('u8', [2]),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([]).toBytes()),
        tx.pure.u64(0),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.pure(bcs.option(bcs.Address).serialize(null).toBytes()),
        tx.pure.u8(0),
        tx.object('0x6'),
      ],
    })
    record(results, {
      finding: 'F64',
      scenario: 'non-creator register_survey on others vault',
      expected: 'failure (ENotCreator)',
      outcome: await runTx(client, tx, attacker),
      moveTestRef: 'register_survey_non_creator_aborts',
    })
  }

  // ── F33 canonical pool success + F37 double fee ──
  const baseFixture = await buildSharedSurveyFixture({
    client,
    admin,
    packageId,
    registryId,
    poolId,
    protocolConfigId,
    srTreasuryId,
    ssrTreasuryId,
    adminTreasury,
    sponsorAddress,
    allowedNftType: null,
    allowedNullifiers: [],
    allowedSources: [8],
    matchThreshold: 0,
    claimMode: 0,
    deadlineMs: deadline,
    maxResponses: 5,
  })
  results.push({
    finding: 'F33',
    scenario: 'V2 path merge_balances + split_fee + share_vault',
    expected: 'success (canonical pool, fee_paid)',
    actual: 'success',
    digest: baseFixture.digest,
    moveTestRef: 'test_split_fee_on_reward_budget',
  })

  {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::split_fee_to_treasury`,
      arguments: [
        tx.object(baseFixture.vaultId),
        tx.object(poolId),
        tx.object(protocolConfigId),
      ],
    })
    record(results, {
      finding: 'F37',
      scenario: 'second split_fee_to_treasury',
      expected: 'failure (EFeeAlreadyPaid)',
      outcome: await runTx(client, tx, admin),
      moveTestRef: 'fee_paid one-time',
    })
  }

  // ── F33 non-canonical pool (bogus pool id) ──
  {
    const tx = new Transaction()
    const [minted] = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [SSR_TYPE(packageId)],
    })
    tx.moveCall({
      target: `${packageId}::survey_vault::merge_balances`,
      arguments: [
        tx.object(baseFixture.vaultId),
        minted,
        tx.object(registryId), // wrong object as pool
        tx.object(protocolConfigId),
      ],
    })
    record(results, {
      finding: 'F33',
      scenario: 'merge_balances with non-canonical pool',
      expected: 'failure',
      outcome: await runTx(client, tx, admin),
      moveTestRef: 'test_merge_balances_rejects_non_canonical_pool',
    })
  }

  await ensureDevnetGas(client, admin.getPublicKey().toSuiAddress())

  // ── F41 audience miss ──
  const audienceFixture = await buildSharedSurveyFixture({
    client,
    admin,
    packageId,
    registryId,
    poolId,
    protocolConfigId,
    srTreasuryId,
    ssrTreasuryId,
    adminTreasury,
    sponsorAddress,
    allowedNftType: null,
    allowedNullifiers: ['allowed-nullifier-1'],
    allowedSources: [8],
    matchThreshold: 1,
    claimMode: 0,
    deadlineMs: deadline,
  })
  {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [VOID_NFT_TYPE(packageId)],
      arguments: unifiedClaimArgs(tx, {
        packageId,
        vaultId: audienceFixture.vaultId,
        surveyId: audienceFixture.surveyId,
        issuerConfigId,
        voidNftId,
        passSentinelId,
        authKind: 0,
        usePass: false,
        passId: passSentinelId,
        useNft: false,
        nftId: voidNftId,
        attributeNullifiers: ['wrong-nullifier'],
      }),
    })
    record(results, {
      finding: 'F41',
      scenario: 'claim with allowlist miss',
      expected: 'failure (audience)',
      outcome: await runTx(client, tx, admin),
      moveTestRef: 'claim_unified_audience_miss_aborts',
    })
  }

  // ── F30 ticket auth on pass mode ──
  {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [VOID_NFT_TYPE(packageId)],
      arguments: unifiedClaimArgs(tx, {
        packageId,
        vaultId: baseFixture.vaultId,
        surveyId: baseFixture.surveyId,
        issuerConfigId,
        voidNftId,
        passSentinelId,
        authKind: 1,
        usePass: false,
        passId: passSentinelId,
        useNft: false,
        nftId: voidNftId,
      }),
    })
    record(results, {
      finding: 'F30',
      scenario: 'auth_kind=1 on claim_mode=0 vault',
      expected: 'failure',
      outcome: await runTx(client, tx, admin),
      moveTestRef: 'claim_ticket_auth_on_pass_mode_aborts',
    })
  }

  // ── F36 NFT when vault disallows ──
  {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [VOID_NFT_TYPE(packageId)],
      arguments: unifiedClaimArgs(tx, {
        packageId,
        vaultId: baseFixture.vaultId,
        surveyId: baseFixture.surveyId,
        issuerConfigId,
        voidNftId,
        passSentinelId,
        authKind: 0,
        usePass: false,
        passId: passSentinelId,
        useNft: true,
        nftId: voidNftId,
      }),
    })
    record(results, {
      finding: 'F36',
      scenario: 'NFT claim when allowed_nft_type=None',
      expected: 'failure',
      outcome: await runTx(client, tx, admin),
      moveTestRef: 'test_claim_nft_when_vault_disallows_nft_aborts',
    })
  }

  await ensureDevnetGas(client, admin.getPublicKey().toSuiAddress())

  // ── F45 inline answer too large (禁止大型答卷;blob 路線已廢除) ──
  {
    const oversizedInline = Array.from({ length: 7000 }, () => 1) // > 預設 6144 上限
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [VOID_NFT_TYPE(packageId)],
      arguments: unifiedClaimArgs(tx, {
        packageId,
        vaultId: baseFixture.vaultId,
        surveyId: baseFixture.surveyId,
        issuerConfigId,
        voidNftId,
        passSentinelId,
        authKind: 0,
        usePass: false,
        passId: passSentinelId,
        useNft: false,
        nftId: voidNftId,
        encryptedAnswers: oversizedInline,
      }),
    })
    record(results, {
      finding: 'F45',
      scenario: 'inline answer exceeds max_inline_answer_bytes',
      expected: 'failure',
      outcome: await runTx(client, tx, admin),
      moveTestRef: 'test_inline_answer_exceeds_max_bytes_aborts',
    })
  }

  // ── F45 inline within limit + vault limit read ──
  {
    const vaultObj = await client.getObject({
      id: baseFixture.vaultId,
      options: { showContent: true },
    })
    const fields = (vaultObj.data?.content as { fields?: Record<string, string> })?.fields
    const maxInline = Number(fields?.max_inline_answer_bytes ?? 0)
    results.push({
      finding: 'F45/D-4',
      scenario: 'RPC read vault max_inline_answer_bytes',
      expected: 'field present on vault object',
      actual: `max_inline=${maxInline}`,
      digest: baseFixture.digest,
      moveTestRef: 'SurveyPage vaultLimits',
    })
  }

  await ensureDevnetGas(client, attacker.getPublicKey().toSuiAddress())

  const attackerPassId = await getOrMintSmokePass({
    client,
    network,
    packageId,
    passRegistryId,
    issuerConfigId,
    signer: attacker,
    nullifierSeed: 0xa1,
  })

  // ── D-4A happy path: attribute claim with inline answer ──
  {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [VOID_NFT_TYPE(packageId)],
      arguments: unifiedClaimArgs(tx, {
        packageId,
        vaultId: baseFixture.vaultId,
        surveyId: baseFixture.surveyId,
        issuerConfigId,
        voidNftId,
        passSentinelId,
        authKind: 0,
        usePass: true,
        passId: attackerPassId,
        useNft: false,
        nftId: voidNftId,
        attributeNullifiers: [],
        encryptedAnswers: [1, 2, 3],
      }),
    })
    const happy = await runTx(client, tx, attacker)
    record(results, {
      finding: 'D-4A',
      scenario: 'V2 shared vault + inline claim (attributes open survey)',
      expected: 'success',
      outcome: happy,
      moveTestRef: 'buildCreateSurveyPtb + SurveyPage inline path',
    })
  }

  await ensureDevnetGas(client, admin.getPublicKey().toSuiAddress())

  // ── F47-50 allowlist replay: two claims with same attribute nullifier ──
  const replayFixture = await buildSharedSurveyFixture({
    client,
    admin,
    packageId,
    registryId,
    poolId,
    protocolConfigId,
    srTreasuryId,
    ssrTreasuryId,
    adminTreasury,
    sponsorAddress,
    allowedNftType: null,
    allowedNullifiers: ['replay-nullifier'],
    allowedSources: [8],
    matchThreshold: 1,
    claimMode: 0,
    deadlineMs: deadline,
    maxResponses: 5,
  })
  const replayNull = ['replay-nullifier']
  await ensureDevnetGas(client, responder2.getPublicKey().toSuiAddress())
  const replaySigners = [attacker, responder2]
  const replayPassIds: string[] = []
  for (let i = 0; i < replaySigners.length; i++) {
    replayPassIds.push(
      await getOrMintSmokePass({
        client,
        network,
        packageId,
        passRegistryId,
        issuerConfigId,
        signer: replaySigners[i],
        nullifierSeed: 0xb1 + i,
      })
    )
  }
  let firstClaim: TxOutcome | null = null
  let secondClaim: TxOutcome | null = null
  for (let i = 0; i < 2; i++) {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [VOID_NFT_TYPE(packageId)],
      arguments: unifiedClaimArgs(tx, {
        packageId,
        vaultId: replayFixture.vaultId,
        surveyId: replayFixture.surveyId,
        issuerConfigId,
        voidNftId,
        passSentinelId,
        authKind: 0,
        usePass: true,
        passId: replayPassIds[i],
        useNft: false,
        nftId: voidNftId,
        attributeNullifiers: replayNull,
        encryptedAnswers: Array.from(new TextEncoder().encode(`answers-${i}`)),
      }),
    })
    const out = await runTx(client, tx, replaySigners[i])
    if (i === 0) firstClaim = out
    else secondClaim = out
  }
  const replayOk = firstClaim?.status === 'success' && secondClaim?.status === 'success'
  results.push({
    finding: 'F47-F50',
    scenario: 'attribute allowlist replay (two claims, same nullifier)',
    expected: 'both success; nullifier not consumed on-chain',
    actual: replayOk
      ? `claim1=success claim2=success`
      : `claim1=${firstClaim?.status} claim2=${secondClaim?.status}`,
    digest: secondClaim?.digest,
    moveTestRef: 'claim_attribute_nullifier_replay_allowed',
  })

  // ── F49 duplicate submitted nullifiers in one claim ──
  const dupFixture = await buildSharedSurveyFixture({
    client,
    admin,
    packageId,
    registryId,
    poolId,
    protocolConfigId,
    srTreasuryId,
    ssrTreasuryId,
    adminTreasury,
    sponsorAddress,
    allowedNftType: null,
    allowedNullifiers: ['dup-n'],
    allowedSources: [8],
    matchThreshold: 2,
    claimMode: 0,
    deadlineMs: deadline,
  })
  {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [VOID_NFT_TYPE(packageId)],
      arguments: unifiedClaimArgs(tx, {
        packageId,
        vaultId: dupFixture.vaultId,
        surveyId: dupFixture.surveyId,
        issuerConfigId,
        voidNftId,
        passSentinelId,
        authKind: 0,
        usePass: false,
        passId: passSentinelId,
        useNft: false,
        nftId: voidNftId,
        attributeNullifiers: ['dup-n', 'dup-n'],
      }),
    })
    record(results, {
      finding: 'F49',
      scenario: 'duplicate allowlisted nullifier in one claim (threshold=2)',
      expected: 'failure (threshold not met)',
      outcome: await runTx(client, tx, admin),
      moveTestRef: 'claim_duplicate_submitted_does_not_inflate_audience_hits',
    })
  }

  // ── F34 NFT-only survey fixture ──
  const nftFixture = await buildSharedSurveyFixture({
    client,
    admin,
    packageId,
    registryId,
    poolId,
    protocolConfigId,
    srTreasuryId,
    ssrTreasuryId,
    adminTreasury,
    sponsorAddress,
    allowedNftType: DEVNET_NFT_TYPE,
    allowedNullifiers: [],
    allowedSources: [8],
    matchThreshold: 0,
    claimMode: 0,
    deadlineMs: deadline,
  })
  results.push({
    finding: 'F34',
    scenario: 'NFT-only survey created (allowed_nft_type set)',
    expected: 'success (fixture)',
    actual: 'success',
    digest: nftFixture.digest,
    moveTestRef: 'test_claim_nft_only_succeeds (fixture only)',
  })

  // ── Publish digest lookup ──
  const publishDigest = (
    await client.queryTransactionBlocks({
      filter: { ToAddress: admin.getPublicKey().toSuiAddress() },
      limit: 5,
      options: { showInput: true },
    })
  ).data.find((t) =>
    t.transaction?.data.transaction?.kind === 'ProgrammableTransaction' &&
    JSON.stringify(t).includes(packageId.slice(2, 10))
  )?.digest

  const outPath = resolve(ROOT, 'docs/CertiK/certik-smoke-results.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        network: 'devnet',
        packageId,
        protocolConfigId,
        ammPoolId: poolId,
        publishDigest: publishDigest ?? null,
        voidNftId,
        passSentinelId,
        fixtures: { baseFixture, audienceFixture, replayFixture, nftFixture },
        results,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  )

  const failed = results.filter((r) => {
    if (r.finding === 'F45/D-4') return false
    if (r.finding === 'F47-F50') {
      return !r.actual.startsWith('claim1=success claim2=success')
    }
    if (r.actual.startsWith('UNEXPECTED')) return true
    const expectSuccess = r.expected.startsWith('success')
    const gotSuccess = r.actual.startsWith('success')
    return expectSuccess !== gotSuccess
  })

  console.log(`\nWrote ${results.length} rows to ${outPath}`)
  if (failed.length) {
    console.error('Unexpected outcomes:', failed)
    process.exit(1)
  }
  console.log('All smoke expectations matched.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
