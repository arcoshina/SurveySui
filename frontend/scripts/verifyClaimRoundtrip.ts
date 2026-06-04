/**
 * 鏈上端到端驗證：建立 vault+survey → 鑄 pass → 真實執行一筆 hybrid 加密的 claim →
 * 從鏈上 SurveyClaimed event 抓 encrypted_answers → 用建立者金鑰解密 → 比對原文。
 *
 * 執行：cd frontend && ../node_modules/.bin/tsx --env-file=../.env scripts/verifyClaimRoundtrip.ts
 */
import { SuiClient } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'
import { buildCreateSurveyPtb, estimateFundCostV2, buildMintPassPtb } from '../src/lib/ptb'
import { buildClaimPtb } from '../src/lib/sponsoredTx'
import { deriveCreatorKeyPair, buildCreatorPubKey, encryptAnswers, decryptAnswers } from '../src/lib/crypto'
import { webcrypto } from 'node:crypto'

const client = new SuiClient({ url: process.env.SUI_RPC_URL! })
const PKG = process.env.SUI_PACKAGE_ID!
const env = (k: string) => {
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
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

async function exec(tx: Transaction, label: string) {
  tx.setGasBudget(1_000_000_000n)
  const res = await client.signAndExecuteTransaction({
    signer: dev0,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true, showEvents: true },
  })
  if (res.effects?.status.status !== 'success') throw new Error(`${label}: ${JSON.stringify(res.effects?.status)}`)
  return res
}

async function main() {
  const fakeSig = new Uint8Array(64)
  webcrypto.getRandomValues(fakeSig)
  const kp = await deriveCreatorKeyPair(fakeSig)
  const creatorPubKey = buildCreatorPubKey(kp)

  const pool = await client.getObject({ id: env('AMM_POOL_ID'), options: { showContent: true } })
  const pf: any = (pool.data?.content as any)?.fields
  const est = estimateFundCostV2({
    perResponse: 1n,
    maxResponses: 5,
    totalSuiInvested: BigInt(pf.total_sui_invested ?? 0),
    feeConfig: {
      totalFeeBps: BigInt(pf.fee_config?.fields?.total_fee_bps ?? 30),
      discountBps: BigInt(pf.fee_config?.fields?.discount_bps ?? 10000),
    },
    creatorSsrBalance: 0n,
  })
  const dummyContent = new Uint8Array(80)
  webcrypto.getRandomValues(dummyContent)
  const contentHash = new Uint8Array(32)
  webcrypto.getRandomValues(contentHash) // 隨機避免 registry EDuplicateSurvey
  const createRes = await exec(
    buildCreateSurveyPtb({
      packageId: PKG, poolId: env('AMM_POOL_ID'), srTreasuryId: env('SR_TREASURY_ID'),
      ssrTreasuryId: env('SSR_TREASURY_ID'), registryId: env('SURVEY_REGISTRY_ID'), adminTreasury: ADDR,
      perResponse: 1n, repeatReward: 0n, repeatMaxTimes: 1, maxResponses: 5,
      deadlineMs: BigInt(Date.now() + 365 * 24 * 3600 * 1000), encryptedContent: dummyContent,
      suiToSpend: (est.suiToInvest * 12n) / 10n + 10_000_000n, contentHash,
      schemaHash: new Uint8Array(32), creatorPubKey, questions: [], minTier: 0, offsetIn: 0n,
      creatorSsrCoins: [], gasCompensationAmount: 0n, storageCompensationAmount: 0n,
    }),
    'create'
  )
  const vaultId = (createRes.objectChanges as any[]).find((c) => c.type === 'created' && String(c.objectType).endsWith('::survey_vault::SurveyVault'))?.objectId
  const surveyId = (createRes.objectChanges as any[]).find((c) => c.type === 'created' && String(c.objectType).endsWith('::survey_registry::Survey'))?.objectId

  // 讀回鏈上 creator_pub_key 確認長度
  const sObj = await client.getObject({ id: surveyId, options: { showContent: true } })
  const onChainPub = (sObj.data?.content as any)?.fields?.creator_pub_key
  console.log('on-chain creator_pub_key length:', Array.isArray(onChainPub) ? onChainPub.length : '?', '(expect 1217)')

  const nullifier = new Uint8Array(32); webcrypto.getRandomValues(nullifier)
  const commitment = new Uint8Array(32); webcrypto.getRandomValues(commitment)
  const expiresAt = BigInt(Date.now() + 365 * 24 * 3600 * 1000)
  const bffSig = await issuerKp.sign(
    TicketPayload.serialize({ owner: ADDR, source: 1, nullifiers: [Array.from(nullifier)], commitment: Array.from(commitment), expires_at: expiresAt.toString() }).toBytes()
  )
  const mintRes = await exec(
    buildMintPassPtb({ packageId: PKG, registryId: env('PASS_REGISTRY_ID'), configId: env('ISSUER_CONFIG_ID'), owner: ADDR, depositPayer: ADDR, source: 1, nullifiers: [nullifier], commitment, expiresAt, bffSig }),
    'mint'
  )
  const passId = (mintRes.objectChanges as any[]).find((c) => c.type === 'created' && String(c.objectType).endsWith('::survey_pass::SurveyPass'))?.objectId

  // 真實執行一筆 hybrid 加密的 claim
  const original = JSON.stringify({ q1: 'Excellent', q2: 5, q3: ['a', 'c'], note: '鏈上 round-trip 測試' })
  const blob = await encryptAnswers(original, creatorPubKey)
  const claimRes = await exec(
    buildClaimPtb({ packageId: PKG, vaultId, surveyId, passId, encryptedAnswers: hex(blob) }),
    'claim'
  )
  console.log('claim digest:', claimRes.digest)

  // 從鏈上 event 抓 encrypted_answers 並解密
  const ev = (claimRes.events as any[]).find((e) => String(e.type).endsWith('::survey_vault::SurveyClaimed'))
  const onChainAnswerBytes = new Uint8Array(ev.parsedJson.encrypted_answers)
  console.log('event encrypted_answers length:', onChainAnswerBytes.length, '(== local blob?', onChainAnswerBytes.length === blob.length, ')')
  const decrypted = await decryptAnswers(onChainAnswerBytes, kp)

  console.log('\noriginal :', original)
  console.log('decrypted:', decrypted)
  console.log(decrypted === original ? '\n✅ 鏈上 round-trip 成功：hybrid 加密的答案可從鏈上 event 正確解密' : '\n❌ 不一致')
  if (decrypted !== original) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
