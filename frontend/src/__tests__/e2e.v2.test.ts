// @vitest-environment node
/**
 * S0.2 V1 contract drift 對齊 — 手動 / pre-demo e2e 測試
 *
 * 執行方式: E2E_ENABLED=1 pnpm -F frontend test e2e.v2
 *
 * 依賴（前兩條測試需要，第三條 CI 驗證永遠執行）：
 *   - Devnet 上已部署合約（.env 有 SUI_PACKAGE_ID 等 ID）
 *   - BFF 在本機跑起來（BFF_URL 預設 http://localhost:3100）
 *   - SUI_ADMIN_PRIVATE_KEY：有 Devnet SUI 的 keypair（用於簽 TX）
 *   - PASS_REGISTRY_ID：鏈上 PassRegistry 物件 ID
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 環境載入 ───────────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '../../../.env')
  const env: Record<string, string> = {}
  if (!existsSync(envPath)) return env
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()
    if (!(key in process.env)) env[key] = val
  }
  return env
}

const fileEnv = loadEnv()
const env = { ...fileEnv, ...process.env }

const E2E_ENABLED = env.E2E_ENABLED === '1' || env.E2E_ENABLED === 'true'
const PACKAGE_ID = env.SUI_PACKAGE_ID ?? ''
const PASS_REGISTRY_ID = env.PASS_REGISTRY_ID ?? ''
const AMM_POOL_ID = env.AMM_POOL_ID ?? ''
const SSR_TREASURY_ID = env.SSR_TREASURY_ID ?? ''
const SSSR_TREASURY_ID = env.SSSR_TREASURY_ID ?? ''
const SURVEY_REGISTRY_ID = env.SURVEY_REGISTRY_ID ?? ''
const ADMIN_PRIVATE_KEY = env.SUI_ADMIN_PRIVATE_KEY ?? ''
const BFF_URL = env.BFF_URL ?? 'http://localhost:3100'
const rpcUrl = env.SUI_RPC_URL ?? getFullnodeUrl('devnet')

const REQUIRED_VARS = [
  PACKAGE_ID,
  PASS_REGISTRY_ID,
  AMM_POOL_ID,
  SSR_TREASURY_ID,
  SSSR_TREASURY_ID,
  SURVEY_REGISTRY_ID,
  ADMIN_PRIVATE_KEY,
]
const VARS_CONFIGURED = REQUIRED_VARS.every(Boolean)

// ── 工具 ───────────────────────────────────────────────────────────────────────

function loadKeypair(privKey: string): Ed25519Keypair {
  if (privKey.startsWith('suiprivkey')) return Ed25519Keypair.fromSecretKey(privKey)
  return Ed25519Keypair.fromSecretKey(Buffer.from(privKey, 'hex'))
}

// sSSR base units per human unit（9 decimals）
const SSSR_BASE_PER_UNIT = 1_000_000_000n

// ── test_e2e_harness_boots_against_devnet / test_e2e_happy_path_no_mock ────────

describe.skipIf(!E2E_ENABLED)('S0.2 e2e harness（需 E2E_ENABLED=1）', () => {
  let client: SuiClient
  let adminKeypair: Ed25519Keypair
  let adminAddress: string

  beforeAll(() => {
    if (!VARS_CONFIGURED) return
    client = new SuiClient({ url: rpcUrl })
    adminKeypair = loadKeypair(ADMIN_PRIVATE_KEY)
    adminAddress = adminKeypair.toSuiAddress()
  })

  it('test_e2e_harness_boots_against_devnet', async () => {
    expect(VARS_CONFIGURED, '所有必要 env 變數必須設定（見 .env.example）').toBe(true)

    // 1. Devnet SuiClient 可連線
    const sysState = await client.getLatestSuiSystemState()
    expect(Number(sysState.epoch)).toBeGreaterThan(0)

    // 2. 合約 package 可讀取
    const pkg = await client.getObject({ id: PACKAGE_ID, options: { showType: true } })
    expect(pkg.error).toBeUndefined()
    expect(pkg.data).toBeTruthy()

    // 3. BFF /health 回 { status: 'ok' }
    const healthRes = await fetch(`${BFF_URL}/health`)
    expect(healthRes.ok, `BFF /health 應回 2xx，實際: ${healthRes.status}`).toBe(true)
    const health = await healthRes.json() as Record<string, unknown>
    expect(health.status).toBe('ok')

    // 4. BFF /stats/:vaultId schema 驗證（使用假 vault ID，預期 502 或 200，不應崩潰）
    const statsRes = await fetch(`${BFF_URL}/stats/0x0000000000000000000000000000000000000000000000000000000000000001`)
    expect([200, 502].includes(statsRes.status), `BFF /stats 應回 200 或 502，實際: ${statsRes.status}`).toBe(true)
    const stats = await statsRes.json() as Record<string, unknown>
    // 驗證 schema 結構正確（無論成功或 RPC 錯誤，格式必須一致）
    if (statsRes.status === 200) {
      expect(typeof stats.vaultId).toBe('string')
      expect(typeof stats.total_responses).toBe('number')
      expect(Array.isArray(stats.events)).toBe(true)
    } else {
      expect(typeof stats.error).toBe('string')
    }
  })

  it('test_e2e_happy_path_no_mock', async () => {
    expect(VARS_CONFIGURED, '所有必要 env 變數必須設定').toBe(true)

    // ── Phase 1: 發起者建立問卷（直接執行 PTB，不經 BFF）──────────────────────

    const perResponseHuman = 1n  // 1 sSSR / 份
    const maxResponses = 2
    const deadlineMs = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 年後

    // 讀 Pool 目前狀態以計算 AMM 曲線
    const poolObj = await client.getObject({ id: AMM_POOL_ID, options: { showContent: true } })
    const poolFields = (poolObj.data?.content as { fields: Record<string, string> } | undefined)?.fields
    const totalSuiInvested = BigInt(poolFields?.total_sui_invested ?? '0')

    const BONDING_DECAY = 1_000_000_000_000n
    const INITIAL_SSSR_PER_SUI = 1000n

    // 計算所需 sSSR 和 SUI
    const netSssrBase = perResponseHuman * BigInt(maxResponses) * SSSR_BASE_PER_UNIT
    const grossSssrBase = (netSssrBase * 10_000n + 9_970n - 1n) / 9_970n
    const denom = BONDING_DECAY * INITIAL_SSSR_PER_SUI
    const numer = grossSssrBase * (BONDING_DECAY + totalSuiInvested)
    const suiToInvest = (numer + denom - 1n) / denom
    const suiWithSlippage = (suiToInvest * 102n) / 100n  // +2% slippage

    // 問卷內容（純文字，不加密）
    const uniqueTitle = `E2E No-Mock Test ${Date.now()}`
    const contentMd = `---\ntitle: "${uniqueTitle}"\nperResponse: 1\nmaxResponses: 2\ndeadline: "2030-01-01T00:00:00Z"\nquestions:\n  - id: q1\n    type: SINGLE_CHOICE\n    prompt: "測試題"\n    required: true\n    options:\n      - A\n      - B\n---\nE2E no-mock 測試問卷`
    const contentBytes = new TextEncoder().encode(contentMd)

    const createTx = new Transaction()
    const [suiCoin] = createTx.splitCoins(createTx.gas, [createTx.pure.u64(suiWithSlippage)])
    const [sssrCoin] = createTx.moveCall({
      target: `${PACKAGE_ID}::amm_pool::invest_and_mint`,
      arguments: [
        createTx.object(AMM_POOL_ID),
        createTx.object(SSR_TREASURY_ID),
        createTx.object(SSSR_TREASURY_ID),
        suiCoin,
      ],
    })
    const [vault] = createTx.moveCall({
      target: `${PACKAGE_ID}::survey_vault::create`,
      arguments: [
        sssrCoin,
        createTx.pure.u64(perResponseHuman * SSSR_BASE_PER_UNIT),
        createTx.pure.u64(maxResponses),
        createTx.pure.u64(deadlineMs),
        createTx.pure.address(adminAddress),
      ],
    })
    const [vaultIdValue] = createTx.moveCall({
      target: `${PACKAGE_ID}::survey_vault::id_of`,
      arguments: [vault],
    })
    createTx.moveCall({
      target: `${PACKAGE_ID}::survey_registry::register`,
      arguments: [
        createTx.object(SURVEY_REGISTRY_ID),
        vaultIdValue,
        createTx.pure.vector('u8', Array.from(contentBytes)),
        createTx.object('0x6'),
      ],
    })
    createTx.moveCall({
      target: `${PACKAGE_ID}::survey_vault::share_vault`,
      arguments: [vault],
    })

    const createResult = await client.signAndExecuteTransaction({
      transaction: createTx,
      signer: adminKeypair,
      options: { showObjectChanges: true, showEvents: true, showEffects: true },
    })
    await client.waitForTransaction({ digest: createResult.digest })

    expect(
      createResult.effects?.status?.status,
      `發起問卷 PTB 失敗: ${JSON.stringify(createResult.effects?.status)}`,
    ).toBe('success')

    // 從事件抓 vault_id
    const registeredEvent = createResult.events?.find(
      (e: Record<string, unknown>) =>
        typeof e.type === 'string' && e.type.includes('::survey_registry::SurveyRegistered'),
    )
    const vaultId = (registeredEvent?.parsedJson as Record<string, string> | undefined)?.vault_id
    expect(vaultId, 'SurveyRegistered 事件必須包含 vault_id').toBeTruthy()

    // ── Phase 2: 直接簽發 SurveyPass（不經 BFF，不用 admin TX key 在 BFF）─────

    const emailHash = crypto
      .createHash('sha256')
      .update(`e2e-nomock-${Date.now()}@test.com`)
      .digest()
    const TTL_180D = 180n * 24n * 60n * 60n * 1000n

    const passTx = new Transaction()
    passTx.moveCall({
      target: `${PACKAGE_ID}::survey_pass::issue`,
      arguments: [
        passTx.object(PASS_REGISTRY_ID),
        passTx.pure.vector('u8', Array.from(emailHash)),
        passTx.pure.u64(TTL_180D),
        passTx.object('0x6'),
      ],
    })

    const passResult = await client.signAndExecuteTransaction({
      transaction: passTx,
      signer: adminKeypair,
      options: { showObjectChanges: true, showEffects: true },
    })
    await client.waitForTransaction({ digest: passResult.digest })

    expect(passResult.effects?.status?.status, '簽發 SurveyPass 失敗').toBe('success')

    const passChange = passResult.objectChanges?.find(
      (c: Record<string, unknown>) =>
        c.type === 'created' &&
        typeof c.objectType === 'string' &&
        c.objectType.includes('::survey_pass::SurveyPass'),
    )
    const passObjectId = (passChange as Record<string, string> | undefined)?.objectId
    expect(passObjectId, 'SurveyPass 物件必須建立').toBeTruthy()

    const subHashHex = Buffer.from(emailHash).toString('hex')

    // ── Phase 3: 受訪者填答（同帳號簡化測試，不走 gas sponsorship）─────────────

    const encryptedAnswers = Buffer.from(JSON.stringify({ q1: 'A' })).toString('hex')

    const claimTx = new Transaction()
    claimTx.moveCall({
      target: `${PACKAGE_ID}::survey_vault::claim`,
      arguments: [
        claimTx.object(vaultId!),
        claimTx.object(passObjectId!),
        claimTx.pure.vector(
          'u8',
          Array.from(Buffer.from(subHashHex.replace(/(.{2})/g, '$1 ').trim().split(' ').map((b) => parseInt(b, 16)))),
        ),
        claimTx.pure.vector('u8', Array.from(Buffer.from(encryptedAnswers, 'hex'))),
        claimTx.object('0x6'),
      ],
    })

    const claimResult = await client.signAndExecuteTransaction({
      transaction: claimTx,
      signer: adminKeypair,
      options: { showObjectChanges: true, showEffects: true },
    })
    await client.waitForTransaction({ digest: claimResult.digest })

    expect(claimResult.effects?.status?.status, '填答 claim 失敗').toBe('success')

    // 找到領取的 sSSR coin
    const sssrChange = claimResult.objectChanges?.find(
      (c: Record<string, unknown>) =>
        c.type === 'created' &&
        typeof c.objectType === 'string' &&
        c.objectType.includes('::coin::Coin<') &&
        c.objectType.includes('staked_survey_reward'),
    )
    const sssrCoinId = (sssrChange as Record<string, string> | undefined)?.objectId

    // ── Phase 4: 受訪者 redeem sSSR → SSR ────────────────────────────────────

    if (sssrCoinId) {
      const redeemTx = new Transaction()
      const [ssrCoin] = redeemTx.moveCall({
        target: `${PACKAGE_ID}::amm_pool::redeem`,
        arguments: [
          redeemTx.object(AMM_POOL_ID),
          redeemTx.object(SSSR_TREASURY_ID),
          redeemTx.object(sssrCoinId),
        ],
      })
      redeemTx.transferObjects([ssrCoin], redeemTx.pure.address(adminAddress))

      const redeemResult = await client.signAndExecuteTransaction({
        transaction: redeemTx,
        signer: adminKeypair,
        options: { showEffects: true },
      })
      await client.waitForTransaction({ digest: redeemResult.digest })

      expect(redeemResult.effects?.status?.status, 'Redeem 失敗').toBe('success')
    }

    // 驗證 BFF stats 能讀到該 vault 的回覆事件
    const statsRes = await fetch(`${BFF_URL}/stats/${vaultId}`)
    expect(statsRes.ok).toBe(true)
    const stats = await statsRes.json() as Record<string, unknown>
    expect(stats.vaultId).toBe(vaultId)
    expect(typeof stats.total_responses).toBe('number')
  }, 120_000)
})

// ── test_ci_e2e_runs_nightly（永遠執行，驗證 CI 設定）────────────────────────────

describe('S0.2 CI 設定驗證', () => {
  it('test_ci_e2e_runs_nightly', () => {
    const ciPath = resolve(__dirname, '../../../.github/workflows/ci.yml')
    expect(existsSync(ciPath), 'CI workflow 檔案必須存在').toBe(true)

    const ciContent = readFileSync(ciPath, 'utf8')

    // CI 必須有 nightly schedule（不應只在 push/PR 跑 e2e）
    expect(ciContent, 'ci.yml 必須包含 schedule: 區段').toContain('schedule:')
    expect(ciContent, 'ci.yml 必須有 cron 設定').toContain('cron:')

    // nightly e2e job 必須存在，且只在 schedule trigger 跑
    expect(ciContent, 'ci.yml 必須有 e2e-nightly job').toContain('e2e-nightly')
  })
})
