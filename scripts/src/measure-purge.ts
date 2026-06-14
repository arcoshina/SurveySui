/**
 * MEASUREMENT ONLY — profile how many answer dynamic fields a single
 * `survey_vault::purge` transaction can destroy on a real Sui node.
 *
 * Self-contained: deploys the package to localnet, sets purge_answers_batch huge
 * (so one purge() call deletes everything in a single tx), populates a vault with
 * N answers via the measurement-only `bulk_add_answers_for_measurement` entry,
 * closes it (creator path — no grace wait), then dry-runs `purge` at growing N to
 * find the per-transaction ceiling for two payload sizes (small blob-id vs large
 * inline). Results are written to scripts/measure-purge-results.json.
 *
 * Requires a running localnet:  sui start --with-faucet --force-regenesis
 * Run:  pnpm -C scripts tsx src/measure-purge.ts   (or: npx tsx scripts/src/measure-purge.ts)
 *
 * DO NOT run against a public network. The bulk-add entry is admin-gated and must
 * never be merged to main or published to mainnet.
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet'
import {
  deployPackage,
  finalizeCurrencyRegistration,
  initProtocolAndCanonicalPool,
} from './init.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── tunables ────────────────────────────────────────────────────────────────
const MAX_GAS_BUDGET_MIST = 50_000_000_000n // Sui protocol cap: 50 SUI
const POPULATE_GAS_BUDGET = 49_000_000_000n // budget for bulk-add / create / close
const HUGE_BATCH = 100_000_000n // purge_answers_batch: ensure one call deletes all
const N_CAP = 30_000 // safety ceiling on exploration
const BINARY_TOLERANCE = 25 // stop binary search when hi-lo <= this
const PAYLOADS: { label: string; bytes: number }[] = [
  { label: 'small (blob-id ~100B)', bytes: 100 },
  { label: 'large (inline ~6144B)', bytes: 6144 },
]

// ── infra helpers ─────────────────────────────────────────────────────────────
const DEFAULT_MIN_GAS_COMP_MIST = 100_000_000
const DEFAULT_PURGE_GRACE_MS = 92 * 24 * 60 * 60 * 1000

interface Ctx {
  client: SuiClient
  keypair: Ed25519Keypair
  address: string
  packageId: string
  registryId: string
  configId: string
  poolId: string
  srTreasuryId: string
  ssrTreasuryId: string
}

async function fundUntil(client: SuiClient, address: string, targetMist: bigint): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const coins = await client.getCoins({ owner: address })
    const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n)
    if (total >= targetMist) return
    await requestSuiFromFaucetV2({ host: getFaucetHost('localnet'), recipient: address })
    await new Promise((r) => setTimeout(r, 1200))
  }
}

async function exec(ctx: Ctx, tx: Transaction, budget = POPULATE_GAS_BUDGET) {
  tx.setGasBudget(Number(budget))
  const res = await ctx.client.signAndExecuteTransaction({
    transaction: tx,
    signer: ctx.keypair,
    options: { showEffects: true, showObjectChanges: true },
  })
  await ctx.client.waitForTransaction({ digest: res.digest, timeout: 120_000 })
  if (res.effects?.status.status !== 'success') {
    throw new Error(`tx failed: ${res.effects?.status.error}`)
  }
  return res
}

interface DryRunOutcome {
  ok: boolean
  error?: string
  computationCost: bigint
  storageCost: bigint
  storageRebate: bigint
  upfrontGas: bigint // computation + storage (what the gas budget must cover)
  netGas: bigint
}

async function dryRun(ctx: Ctx, tx: Transaction, budget: bigint): Promise<DryRunOutcome> {
  tx.setSender(ctx.address)
  tx.setGasBudget(Number(budget))
  const bytes = await tx.build({ client: ctx.client })
  const dr = await ctx.client.dryRunTransactionBlock({
    transactionBlock: Buffer.from(bytes).toString('base64'),
  })
  const g = dr.effects.gasUsed
  const computationCost = BigInt(g.computationCost ?? 0)
  const storageCost = BigInt(g.storageCost ?? 0)
  const storageRebate = BigInt(g.storageRebate ?? 0)
  return {
    ok: dr.effects.status.status === 'success',
    error: dr.effects.status.error,
    computationCost,
    storageCost,
    storageRebate,
    upfrontGas: computationCost + storageCost,
    netGas: computationCost + storageCost - storageRebate,
  }
}

// ── PTB builders (mirror scripts/src/certik-smoke-devnet.ts) ────────────────────
function createSurveyTx(ctx: Ctx, maxResponses: number, deadlineMs: number): Transaction {
  const tx = new Transaction()
  const requiredGas = maxResponses * DEFAULT_MIN_GAS_COMP_MIST
  const [gasCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(requiredGas)])
  const [vault] = tx.moveCall({
    target: `${ctx.packageId}::survey_vault::create_empty`,
    arguments: [
      tx.pure.u64(1), tx.pure.u64(0), tx.pure.u64(1), tx.pure.u64(maxResponses),
      tx.pure.u64(deadlineMs), tx.pure.address(ctx.address), gasCoin,
      tx.pure.address(ctx.address), tx.pure.u64(DEFAULT_MIN_GAS_COMP_MIST),
      tx.pure.u64(0), tx.pure.u64(0), tx.pure.u64(DEFAULT_PURGE_GRACE_MS),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
      tx.object(ctx.configId), tx.object('0x6'),
    ],
  })
  const [suiForMint] = tx.splitCoins(tx.gas, [tx.pure.u64(50_000_000)])
  const [minted] = tx.moveCall({
    target: `${ctx.packageId}::amm_pool::invest_and_mint`,
    arguments: [
      tx.object(ctx.poolId), tx.object(ctx.configId), tx.object(ctx.srTreasuryId),
      tx.object(ctx.ssrTreasuryId), suiForMint, tx.pure.u64(1),
    ],
  })
  tx.moveCall({
    target: `${ctx.packageId}::survey_vault::merge_balances`,
    arguments: [vault, minted, tx.object(ctx.poolId), tx.object(ctx.configId)],
  })
  tx.moveCall({
    target: `${ctx.packageId}::survey_vault::split_fee_to_treasury`,
    arguments: [vault, tx.object(ctx.poolId), tx.object(ctx.configId)],
  })
  const q = tx.moveCall({
    target: `${ctx.packageId}::survey_registry::new_question`,
    arguments: [
      tx.pure.vector('u8', Array.from(new TextEncoder().encode('q1'))),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode('text'))),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode('prompt'))),
      tx.pure.vector('vector<u8>', []),
      tx.pure.bool(true),
    ],
  })
  const questions = tx.makeMoveVec({
    type: `${ctx.packageId}::survey_registry::Question`,
    elements: [q],
  })
  tx.moveCall({
    target: `${ctx.packageId}::survey_vault::register_survey`,
    arguments: [
      tx.object(ctx.registryId), vault,
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(`hash-${Date.now()}-${Math.random()}`))),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(Array.from(new TextEncoder().encode('enc'))).toBytes()),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
      tx.pure(bcs.option(bcs.Address).serialize(null).toBytes()),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode('schema'))),
      tx.pure.vector('u8', []),
      questions,
      tx.pure.vector('u8', [0]), // allowed_sources must be non-empty (EEmptyAllowedSources)
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([]).toBytes()),
      tx.pure.u64(0),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
      tx.pure(bcs.option(bcs.Address).serialize(null).toBytes()),
      tx.pure.u8(0),
      tx.object('0x6'),
    ],
  })
  tx.moveCall({ target: `${ctx.packageId}::survey_vault::share_vault`, arguments: [vault] })
  return tx
}

async function createSurvey(ctx: Ctx): Promise<{ vaultId: string; surveyId: string }> {
  const deadlineMs = Date.now() + 7 * 24 * 60 * 60 * 1000
  const res = await exec(ctx, createSurveyTx(ctx, 1, deadlineMs))
  let vaultId = '', surveyId = ''
  for (const ch of res.objectChanges ?? []) {
    if (ch.type === 'created' && ch.objectType.includes('::survey_vault::SurveyVault')) vaultId = ch.objectId
    if (ch.type === 'created' && ch.objectType.includes('::survey_registry::Survey')) surveyId = ch.objectId
  }
  if (!vaultId || !surveyId) throw new Error('could not parse vault/survey IDs')
  return { vaultId, surveyId }
}

async function bulkAdd(ctx: Ctx, vaultId: string, n: number, payloadBytes: number): Promise<void> {
  // Chunk so each populate tx stays well under per-tx object/size limits.
  const chunk = Math.max(1, Math.min(500, Math.floor(1_200_000 / Math.max(payloadBytes, 1))))
  let added = 0
  while (added < n) {
    const c = Math.min(chunk, n - added)
    const tx = new Transaction()
    tx.moveCall({
      target: `${ctx.packageId}::survey_vault::bulk_add_answers_for_measurement`,
      arguments: [tx.object(vaultId), tx.pure.u64(c), tx.pure.u64(payloadBytes), tx.object(ctx.configId)],
    })
    await exec(ctx, tx)
    added += c
  }
}

async function closeVault(ctx: Ctx, vaultId: string): Promise<void> {
  const tx = new Transaction()
  tx.moveCall({ target: `${ctx.packageId}::survey_vault::close`, arguments: [tx.object(vaultId), tx.object('0x6')] })
  await exec(ctx, tx)
}

function purgeTx(ctx: Ctx, surveyId: string, vaultId: string): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${ctx.packageId}::survey_vault::purge`,
    arguments: [
      tx.object(ctx.registryId), tx.object(surveyId), tx.object(vaultId),
      tx.object(ctx.configId), tx.object('0x6'),
    ],
  })
  return tx
}

/** Populate a fresh vault with N answers, close it, dry-run purge. */
async function probe(ctx: Ctx, n: number, payloadBytes: number): Promise<DryRunOutcome> {
  await fundUntil(ctx.client, ctx.address, 400_000_000_000n)
  const { vaultId, surveyId } = await createSurvey(ctx)
  await bulkAdd(ctx, vaultId, n, payloadBytes)
  await closeVault(ctx, vaultId)
  return dryRun(ctx, purgeTx(ctx, surveyId, vaultId), MAX_GAS_BUDGET_MIST)
}

interface CeilingResult {
  payload: string
  payloadBytes: number
  maxSafeN: number
  limiting: string
  atCeiling: DryRunOutcome | null
  firstFailN: number | null
  firstFailError: string | null
}

async function findCeiling(ctx: Ctx, payload: { label: string; bytes: number }): Promise<CeilingResult> {
  console.log(`\n=== payload: ${payload.label} (${payload.bytes}B) ===`)
  let lo = 0 // known-success N
  let hi = 0 // known-fail N (0 = none yet)
  let loOutcome: DryRunOutcome | null = null
  let firstFailError: string | null = null

  // exponential probe upward
  let n = 100
  while (n <= N_CAP) {
    const r = await probe(ctx, n, payload.bytes)
    const gasOk = r.upfrontGas <= MAX_GAS_BUDGET_MIST
    const pass = r.ok && gasOk
    const reason = !r.ok ? r.error : !gasOk ? `gas>${MAX_GAS_BUDGET_MIST} (need ${r.upfrontGas})` : 'ok'
    console.log(`  N=${n}: ${pass ? 'PASS' : 'FAIL'} upfront=${r.upfrontGas} net=${r.netGas} (${reason})`)
    if (pass) {
      lo = n; loOutcome = r; n *= 2
    } else {
      hi = n; firstFailError = reason; break
    }
  }
  if (hi === 0) {
    return { payload: payload.label, payloadBytes: payload.bytes, maxSafeN: lo, limiting: 'reached N_CAP without failure', atCeiling: loOutcome, firstFailN: null, firstFailError: null }
  }

  // binary search between lo (pass) and hi (fail)
  while (hi - lo > BINARY_TOLERANCE) {
    const mid = Math.floor((lo + hi) / 2)
    const r = await probe(ctx, mid, payload.bytes)
    const gasOk = r.upfrontGas <= MAX_GAS_BUDGET_MIST
    const pass = r.ok && gasOk
    const reason = !r.ok ? r.error : !gasOk ? `gas>cap (need ${r.upfrontGas})` : 'ok'
    console.log(`  bisect N=${mid}: ${pass ? 'PASS' : 'FAIL'} upfront=${r.upfrontGas} (${reason})`)
    if (pass) { lo = mid; loOutcome = r } else { hi = mid; firstFailError = reason }
  }

  const limiting = firstFailError?.includes('gas>') ? 'gas budget (50 SUI cap)' : (firstFailError ?? 'unknown')
  return {
    payload: payload.label, payloadBytes: payload.bytes, maxSafeN: lo,
    limiting, atCeiling: loOutcome, firstFailN: hi, firstFailError,
  }
}

/** Real execution sanity check at a given N (not just dry-run). */
async function executePurge(ctx: Ctx, n: number, payloadBytes: number): Promise<string> {
  await fundUntil(ctx.client, ctx.address, 400_000_000_000n)
  const { vaultId, surveyId } = await createSurvey(ctx)
  await bulkAdd(ctx, vaultId, n, payloadBytes)
  await closeVault(ctx, vaultId)
  try {
    await exec(ctx, purgeTx(ctx, surveyId, vaultId), MAX_GAS_BUDGET_MIST)
    const gone = await ctx.client.getObject({ id: vaultId }).then((o) => !o.data).catch(() => true)
    return `executed N=${n}: success, vault destroyed=${gone}`
  } catch (e) {
    return `executed N=${n}: FAILED ${(e as Error).message}`
  }
}

async function main() {
  const client = new SuiClient({ url: getFullnodeUrl('localnet') })
  const keypair = Ed25519Keypair.generate()
  const address = keypair.getPublicKey().toSuiAddress()
  console.log(`Measurement admin/creator: ${address}`)
  await fundUntil(client, address, 600_000_000_000n)

  console.log('Deploying package to localnet…')
  const dep = await deployPackage(client, keypair, address)
  await finalizeCurrencyRegistration(client, keypair, dep.packageId, dep.srCurrency, dep.ssrCurrency)
  const { poolId, protocolConfigId } = await initProtocolAndCanonicalPool(client, keypair, dep.packageId, address)

  const ctx: Ctx = {
    client, keypair, address,
    packageId: dep.packageId,
    registryId: dep.surveyRegistryId,
    configId: protocolConfigId,
    poolId,
    srTreasuryId: dep.srTreasuryId,
    ssrTreasuryId: dep.ssrTreasuryId,
  }

  // Set purge_answers_batch huge so a single purge() deletes everything.
  const batchTx = new Transaction()
  batchTx.moveCall({
    target: `${ctx.packageId}::amm_pool::set_purge_answers_batch`,
    arguments: [batchTx.object(ctx.configId), batchTx.pure.u64(HUGE_BATCH)],
  })
  await exec(ctx, batchTx)
  console.log(`purge_answers_batch set to ${HUGE_BATCH}`)

  const ceilings: CeilingResult[] = []
  for (const p of PAYLOADS) ceilings.push(await findCeiling(ctx, p))

  // Real-execution validation: one safe N and one near-ceiling N for the large payload.
  const large = ceilings.find((c) => c.payloadBytes === 6144)!
  const validations: string[] = []
  if (large.maxSafeN > 0) {
    validations.push(await executePurge(ctx, Math.max(50, Math.floor(large.maxSafeN / 4)), 6144))
    validations.push(await executePurge(ctx, large.maxSafeN, 6144))
  }

  const out = {
    network: 'localnet',
    packageId: ctx.packageId,
    gasBudgetCapMist: MAX_GAS_BUDGET_MIST.toString(),
    purgeAnswersBatch: HUGE_BATCH.toString(),
    timestamp: new Date().toISOString(),
    ceilings: ceilings.map((c) => ({
      ...c,
      atCeiling: c.atCeiling
        ? {
            computationCost: c.atCeiling.computationCost.toString(),
            storageCost: c.atCeiling.storageCost.toString(),
            storageRebate: c.atCeiling.storageRebate.toString(),
            upfrontGas: c.atCeiling.upfrontGas.toString(),
            netGas: c.atCeiling.netGas.toString(),
          }
        : null,
    })),
    validations,
  }
  const outPath = resolve(__dirname, '../measure-purge-results.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))

  console.log('\n================ RESULT ================')
  for (const c of ceilings) {
    console.log(`${c.payload}: max safe N = ${c.maxSafeN} (limiting: ${c.limiting}; first fail @N=${c.firstFailN ?? 'n/a'})`)
  }
  console.log('\nValidations:'); validations.forEach((v) => console.log('  ' + v))
  console.log(`\nWritten: ${outPath}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
