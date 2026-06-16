import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { createMultisigSponsorSigner, keypairFromHex } from '@surveysui/gas-station-core'
import { buildApp } from '../app.js'
import { buildDeleteAuthMessage } from './handler.js'
import { setupFakeD1 } from '../../tests/helpers/fakeD1.js'

const PKG = '0x' + 'ab'.repeat(32)
const REGISTRY = '0x' + '11'.repeat(32)
const CONFIG = '0x' + '22'.repeat(32)
const PASS_ID = '0x' + '33'.repeat(32)
// 32-byte 私鑰（ticket issuer + multisig K1）
const SPONSOR_PRIV = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20'
const SPONSOR_PRIV_2 = '0202020202020202020202020202020202020202020202020202020202020202'
const SPONSOR_PRIV_3 = '0303030303030303030303030303030303030303030303030303030303030303'

function sponsorAddress(): string {
  const coldPub = Buffer.from(keypairFromHex(SPONSOR_PRIV_3).getPublicKey().toRawBytes()).toString('hex')
  return createMultisigSponsorSigner(SPONSOR_PRIV, SPONSOR_PRIV_2, coldPub, 2).getSponsorAddress()
}

function makeSuiClientMock(passFields: { owner: string; deposit_payer: string }) {
  return {
    getObject: vi.fn(async () => ({
      data: {
        type: `${PKG}::survey_pass::SurveyPass`,
        content: { fields: passFields },
      },
    })),
    signAndExecuteTransaction: vi.fn(async () => ({
      digest: '0xDIGEST',
      effects: { status: { status: 'success' } },
    })),
  } as any
}

function makeApp(suiClient: any) {
  return buildApp({ suiClient, packageId: PKG })
}

async function signDelete(ownerKp: Ed25519Keypair, passId: string, ts: number) {
  const msg = new TextEncoder().encode(buildDeleteAuthMessage(passId, ts))
  const { signature } = await ownerKp.signPersonalMessage(msg)
  return signature
}

async function post(app: ReturnType<typeof buildApp>, url: string, payload: unknown) {
  return app.request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

describe('/api/pass/delete — 後端代執行刪除（代付 Pass）', () => {
  beforeAll(() => {
    process.env.SUI_PACKAGE_ID = PKG
    process.env.PASS_REGISTRY_ID = REGISTRY
    process.env.ISSUER_CONFIG_ID = CONFIG
    process.env.SURVEY_PASS_ISSUER_PRIV = SPONSOR_PRIV
    process.env.GAS_SPONSOR_PRIV_1 = SPONSOR_PRIV
    process.env.GAS_SPONSOR_PRIV_2 = SPONSOR_PRIV_2
    process.env.GAS_SPONSOR_PUBKEY_3 = Buffer.from(
      keypairFromHex(SPONSOR_PRIV_3).getPublicKey().toRawBytes()
    ).toString('hex')
  })

  let ownerKp: Ed25519Keypair
  beforeEach(async () => {
    await setupFakeD1()
    ownerKp = new Ed25519Keypair()
  })

  it('缺參數 → 400', async () => {
    const app = makeApp(makeSuiClientMock({ owner: '0x0', deposit_payer: sponsorAddress() }))
    const res = await post(app, '/api/pass/delete', { passId: PASS_ID })
    expect(res.status).toBe(400)
  })

  it('owner 合法簽名 + deposit_payer==sponsor → 200 並回傳 digest，且以 admin 簽署執行', async () => {
    const owner = ownerKp.getPublicKey().toSuiAddress()
    const sui = makeSuiClientMock({ owner, deposit_payer: sponsorAddress() })
    const app = makeApp(sui)
    const ts = Date.now()
    const signature = await signDelete(ownerKp, PASS_ID, ts)

    const res = await post(app, '/api/pass/delete', { passId: PASS_ID, signedTimestamp: ts, signature })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ digest: '0xDIGEST' })
    expect(sui.signAndExecuteTransaction).toHaveBeenCalledOnce()
  })

  it('非代付 Pass（deposit_payer != sponsor）→ 400 not_sponsor_funded', async () => {
    const owner = ownerKp.getPublicKey().toSuiAddress()
    const sui = makeSuiClientMock({ owner, deposit_payer: '0x' + '99'.repeat(32) })
    const app = makeApp(sui)
    const ts = Date.now()
    const signature = await signDelete(ownerKp, PASS_ID, ts)

    const res = await post(app, '/api/pass/delete', { passId: PASS_ID, signedTimestamp: ts, signature })

    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('not_sponsor_funded')
    expect(sui.signAndExecuteTransaction).not.toHaveBeenCalled()
  })

  it('簽名非 owner 所簽 → 401 invalid_signature', async () => {
    const owner = ownerKp.getPublicKey().toSuiAddress()
    const sui = makeSuiClientMock({ owner, deposit_payer: sponsorAddress() })
    const app = makeApp(sui)
    const ts = Date.now()
    // 用另一把金鑰簽（冒充者）
    const attacker = new Ed25519Keypair()
    const signature = await signDelete(attacker, PASS_ID, ts)

    const res = await post(app, '/api/pass/delete', { passId: PASS_ID, signedTimestamp: ts, signature })

    expect(res.status).toBe(401)
    expect(sui.signAndExecuteTransaction).not.toHaveBeenCalled()
  })

  it('授權過期（時間戳過舊）→ 400 authorization_expired', async () => {
    const owner = ownerKp.getPublicKey().toSuiAddress()
    const sui = makeSuiClientMock({ owner, deposit_payer: sponsorAddress() })
    const app = makeApp(sui)
    const ts = Date.now() - 10 * 60_000 // 10 分鐘前
    const signature = await signDelete(ownerKp, PASS_ID, ts)

    const res = await post(app, '/api/pass/delete', { passId: PASS_ID, signedTimestamp: ts, signature })

    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('authorization_expired')
  })
})
