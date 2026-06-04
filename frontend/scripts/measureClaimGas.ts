/**
 * 量測 survey_vault::claim 在不同 encrypted_answers 大小下的 gas（dry run）。
 * 情境：答案明文 1KB / 5KB / 10KB 直接上鏈，以及改存 Walrus（鏈上只放 blob id）。
 *
 * 流程：dev0 真實建立 vault + 鑄 pass（2 筆 devnet 交易），claim 一律只 dry-run。
 * 執行：cd frontend && ../node_modules/.bin/tsx --env-file=../.env scripts/measureClaimGas.ts
 */
import { SuiClient } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'
import { buildCreateSurveyPtb, estimateFundCostV2 } from '../src/lib/ptb'
import { buildMintPassPtb } from '../src/lib/ptb'
import { buildClaimPtb } from '../src/lib/sponsoredTx'
import { deriveCreatorKeyPair, buildCreatorPubKey, encryptAnswers, bytesToBase64url } from '../src/lib/crypto'
import { webcrypto } from 'node:crypto'

const client = new SuiClient({ url: process.env.SUI_RPC_URL! })
const PKG = process.env.SUI_PACKAGE_ID!

function env(k: string): string {
  const v = process.env[k]
  if (!v) throw new Error(`missing env ${k}`)
  return v
}

const dev0 = Ed25519Keypair.deriveKeypair(env('DEV_MNEMONIC'), `m/44'/784'/0'/0'/0'`)
const ADDR = dev0.getPublicKey().toSuiAddress()

let issuerPriv = env('SURVEY_PASS_ISSUER_PRIV')
issuerPriv = issuerPriv.startsWith('0x') ? issuerPriv.slice(2) : issuerPriv
const issuerKp = Ed25519Keypair.fromSecretKey(new Uint8Array(Buffer.from(issuerPriv, 'hex')).slice(0, 32))

const TicketPayload = bcs.struct('TicketPayload', {
  owner: bcs.Address,
  source: bcs.u8(),
  nullifiers: bcs.vector(bcs.vector(bcs.u8())),
  commitment: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
})

function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex')
}

async function exec(tx: Transaction, label: string) {
  tx.setGasBudget(1_000_000_000n)
  const res = await client.signAndExecuteTransaction({
    signer: dev0,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  })
  if (res.effects?.status.status !== 'success') {
    throw new Error(`${label} failed: ${JSON.stringify(res.effects?.status)}`)
  }
  return res
}

function fmt(n: bigint | string): string {
  return (Number(n) / 1e9).toFixed(6)
}

async function main() {
  console.log('creator/respondent:', ADDR)

  // ── creator hybrid key pair（隨機簽章模擬錢包簽名）──
  const fakeSig = new Uint8Array(64)
  webcrypto.getRandomValues(fakeSig)
  const kp = await deriveCreatorKeyPair(fakeSig)
  const creatorPubKey = buildCreatorPubKey(kp)
  console.log('creator_pub_key length:', creatorPubKey.length, 'bytes')

  // ── 1. 建立 vault + survey ──
  const pool = await client.getObject({ id: env('AMM_POOL_ID'), options: { showContent: true } })
  const pf: any = (pool.data?.content as any)?.fields
  const totalSuiInvested = BigInt(pf.total_sui_invested ?? pf.totalSuiInvested ?? 0)
  const feeFields: any = pf.fee_config?.fields ?? pf.feeConfig?.fields ?? {}
  const totalFeeBps = BigInt(feeFields.total_fee_bps ?? feeFields.totalFeeBps ?? 30)
  const discountBps = BigInt(feeFields.discount_bps ?? feeFields.discountBps ?? 10000)

  const est = estimateFundCostV2({
    perResponse: 1n,
    maxResponses: 5,
    totalSuiInvested,
    feeConfig: { totalFeeBps, discountBps },
    creatorSsrBalance: 0n,
  })
  const suiToSpend = (est.suiToInvest * 12n) / 10n + 10_000_000n // +20% buffer
  console.log('investing SUI (MIST):', suiToSpend.toString())

  const dummyContent = new Uint8Array(80)
  webcrypto.getRandomValues(dummyContent)
  const createTx = buildCreateSurveyPtb({
    packageId: PKG,
    poolId: env('AMM_POOL_ID'),
    srTreasuryId: env('SR_TREASURY_ID'),
    ssrTreasuryId: env('SSR_TREASURY_ID'),
    registryId: env('SURVEY_REGISTRY_ID'),
    adminTreasury: ADDR,
    perResponse: 1n,
    repeatReward: 0n,
    repeatMaxTimes: 1,
    maxResponses: 5,
    deadlineMs: BigInt(Date.now() + 365 * 24 * 3600 * 1000),
    encryptedContent: dummyContent,
    suiToSpend,
    contentHash: new Uint8Array(32),
    schemaHash: new Uint8Array(32),
    creatorPubKey,
    questions: [],
    minTier: 0,
    offsetIn: 0n,
    creatorSsrCoins: [],
    gasCompensationAmount: 0n,
    storageCompensationAmount: 0n,
  })
  const createRes = await exec(createTx, 'create survey')
  const vaultId = (createRes.objectChanges as any[]).find(
    (c) => c.type === 'created' && String(c.objectType).endsWith('::survey_vault::SurveyVault')
  )?.objectId
  const surveyId = (createRes.objectChanges as any[]).find(
    (c) => c.type === 'created' && String(c.objectType).endsWith('::survey_registry::Survey')
  )?.objectId
  console.log('vaultId:', vaultId)
  console.log('surveyId:', surveyId)

  // ── 2. 鑄 pass（自簽 ticket）──
  const nullifier = new Uint8Array(32)
  webcrypto.getRandomValues(nullifier)
  const commitment = new Uint8Array(32)
  webcrypto.getRandomValues(commitment)
  const expiresAt = BigInt(Date.now() + 365 * 24 * 3600 * 1000)
  const payloadBytes = TicketPayload.serialize({
    owner: ADDR,
    source: 1,
    nullifiers: [Array.from(nullifier)],
    commitment: Array.from(commitment),
    expires_at: expiresAt.toString(),
  }).toBytes()
  const bffSig = await issuerKp.sign(payloadBytes)

  const mintTx = buildMintPassPtb({
    packageId: PKG,
    registryId: env('PASS_REGISTRY_ID'),
    configId: env('ISSUER_CONFIG_ID'),
    owner: ADDR,
    depositPayer: ADDR,
    source: 1,
    nullifiers: [nullifier],
    commitment,
    expiresAt,
    bffSig,
  })
  const mintRes = await exec(mintTx, 'mint pass')
  const passId = (mintRes.objectChanges as any[]).find(
    (c) => c.type === 'created' && String(c.objectType).endsWith('::survey_pass::SurveyPass')
  )?.objectId
  console.log('passId:', passId)

  // ── 3. 四情境 claim dry run ──
  const scenarios: { label: string; answerBytes?: number; walrus?: boolean }[] = [
    { label: '答案 1KB 上鏈', answerBytes: 1024 },
    { label: '答案 5KB 上鏈', answerBytes: 5 * 1024 },
    { label: '答案 10KB 上鏈', answerBytes: 10 * 1024 },
    { label: '存 Walrus（鏈上放 blob id）', walrus: true },
  ]

  const rows: any[] = []
  for (const s of scenarios) {
    let encryptedAnswersHex: string | undefined
    let answerBlobId: string | undefined
    let onChainBytes = 0

    if (s.walrus) {
      // 模擬 Walrus blob id（一般為 ~44-64 字元的 base64url）
      const idBytes = new Uint8Array(43)
      webcrypto.getRandomValues(idBytes)
      answerBlobId = bytesToBase64url(idBytes)
      onChainBytes = new TextEncoder().encode(answerBlobId).length
    } else {
      const plain = 'x'.repeat(s.answerBytes!)
      const blob = await encryptAnswers(plain, creatorPubKey)
      encryptedAnswersHex = bytesToHex(blob)
      onChainBytes = blob.length
    }

    const claimTx = buildClaimPtb({
      packageId: PKG,
      vaultId,
      surveyId,
      passId,
      encryptedAnswers: encryptedAnswersHex,
      answerBlobId,
    })
    claimTx.setSender(ADDR)
    claimTx.setGasBudget(2_000_000_000n)
    const built = await claimTx.build({ client })
    const dry = await client.dryRunTransactionBlock({
      transactionBlock: Buffer.from(built).toString('base64'),
    })
    if (dry.effects.status.status !== 'success') {
      console.log(`[${s.label}] dry-run FAILED:`, dry.effects.status.error)
      continue
    }
    const g = dry.effects.gasUsed
    const comp = BigInt(g.computationCost)
    const stor = BigInt(g.storageCost)
    const reb = BigInt(g.storageRebate)
    const net = comp + stor - reb
    rows.push({
      情境: s.label,
      鏈上答案位元組: onChainBytes,
      computation: fmt(comp),
      storage: fmt(stor),
      storageRebate: fmt(reb),
      'net gas (SUI)': fmt(net),
    })
  }

  console.log('\n=== Claim Gas (dry run) ===')
  console.table(rows)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
