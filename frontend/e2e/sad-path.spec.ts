import { test, expect } from '@playwright/test'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// ── Environment & Keys ─────────────────────────────────────────────────────────

const envPath = path.resolve(__dirname, '../../.env')
const env: Record<string, string> = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
}

const SUI_NETWORK = env.SUI_NETWORK || 'devnet'
const rpcUrl = getFullnodeUrl(SUI_NETWORK as any)
const client = new SuiClient({ url: rpcUrl })

function loadKeypair(privKey: string): Ed25519Keypair {
  if (privKey.startsWith('suiprivkey')) {
    return Ed25519Keypair.fromSecretKey(privKey)
  }
  return Ed25519Keypair.fromSecretKey(Buffer.from(privKey, 'hex'))
}

const creatorKeypair = loadKeypair(env.SUI_ADMIN_PRIVATE_KEY || '')
const creatorAddress = env.SUI_ADMIN_ADDRESS || creatorKeypair.toSuiAddress()

// Fresh ephemeral keypair with 0 SUI — represents the sad-path respondent
const respondentKeypair = new Ed25519Keypair()
const respondentAddress = respondentKeypair.toSuiAddress()

console.log(`[E2E Sad-Path] Network: ${SUI_NETWORK}`)
console.log(`[E2E Sad-Path] Creator: ${creatorAddress}`)
console.log(`[E2E Sad-Path] Respondent: ${respondentAddress}`)

// ── Shared Route + Wallet Setup ────────────────────────────────────────────────

// Mirrors the beforeEach in lifecycle.spec.ts so both test files are self-contained.
async function setupMockWalletAndRoutes(page: any) {
  page.on('console', (msg: any) => {
    console.log(`[Browser] ${msg.type()}: ${msg.text()}`)
  })

  await page.addInitScript(
    ({ creatorAddr, respondentAddr }: { creatorAddr: string; respondentAddr: string }) => {
      const creatorAccount = {
        address: creatorAddr,
        publicKey: new Uint8Array(32),
        chains: ['sui:devnet'],
        features: ['sui:signTransaction', 'sui:signAndExecuteTransaction', 'sui:signPersonalMessage'],
      }
      const respondentAccount = {
        address: respondentAddr,
        publicKey: new Uint8Array(32),
        chains: ['sui:devnet'],
        features: ['sui:signTransaction', 'sui:signAndExecuteTransaction', 'sui:signPersonalMessage'],
      }

      const savedAccountType =
        window.sessionStorage.getItem('mockWalletActiveAccountType') || 'creator'
      window['mockWalletActiveAccount'] =
        savedAccountType === 'creator' ? creatorAccount : respondentAccount
      window['mockWalletListeners'] = []

      window['switchMockAccount'] = (accountType: 'creator' | 'respondent') => {
        const account = accountType === 'creator' ? creatorAccount : respondentAccount
        window['mockWalletActiveAccount'] = account
        window.sessionStorage.setItem('mockWalletActiveAccountType', accountType)
        console.log(`[MockWallet] Switched to: ${account.address}`)
        for (const listener of window['mockWalletListeners']) {
          listener({ accounts: [account] })
        }
      }

      const mockWallet = {
        version: '1.0.0',
        name: 'Mock Test Standard Wallet',
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzAwN2FmZiIvPjwvc3ZnPg==',
        chains: ['sui:devnet'],
        features: {
          'standard:connect': {
            version: '1.0.0',
            connect: async () => ({ accounts: [window['mockWalletActiveAccount']] }),
          },
          'standard:disconnect': { version: '1.0.0', disconnect: async () => {} },
          'standard:events': {
            version: '1.0.0',
            on: (event: string, listener: any) => {
              if (event === 'change') window['mockWalletListeners'].push(listener)
              return () => {
                window['mockWalletListeners'] = window['mockWalletListeners'].filter(
                  (l: any) => l !== listener
                )
              }
            },
          },
          'sui:signPersonalMessage': {
            version: '1.0.0',
            signPersonalMessage: async ({ message }: { message: Uint8Array }) => {
              const messageB64 = btoa(String.fromCharCode(...message))
              const res = await fetch('/__mock_wallet/sign-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageB64, address: window['mockWalletActiveAccount'].address }),
              })
              if (!res.ok) throw new Error('Mock sign message failed')
              const data = await res.json()
              return { signature: data.signature, bytes: messageB64 }
            },
          },
          'sui:signTransaction': {
            version: '1.0.0',
            signTransaction: async ({ transaction }: { transaction: any }) => {
              const sdk = window['suiSdkForTesting']
              if (!sdk) throw new Error('suiSdkForTesting not found')
              let txObject
              if (typeof transaction.toJSON === 'function') {
                txObject = sdk.Transaction.from(await transaction.toJSON())
              } else if (typeof transaction.build === 'function') {
                txObject = transaction
              } else {
                txObject = sdk.Transaction.from(await transaction.serialize())
              }
              const testClient = new sdk.SuiClient({ url: 'https://fullnode.devnet.sui.io:443' })
              txObject.setSender(window['mockWalletActiveAccount'].address)
              const txBytes = await txObject.build({ client: testClient })
              const txB64 = btoa(String.fromCharCode(...txBytes))
              const res = await fetch('/__mock_wallet/sign-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txBytes: txB64, address: window['mockWalletActiveAccount'].address }),
              })
              if (!res.ok) throw new Error('Mock sign transaction failed')
              const data = await res.json()
              return { bytes: txB64, transactionBlockBytes: txB64, signature: data.signature }
            },
          },
          'sui:signAndExecuteTransaction': {
            version: '1.0.0',
            signAndExecuteTransaction: async ({ transaction, options }: { transaction: any; options?: any }) => {
              const sdk = window['suiSdkForTesting']
              if (!sdk) throw new Error('suiSdkForTesting not found')
              let txObject
              if (typeof transaction.toJSON === 'function') {
                txObject = sdk.Transaction.from(await transaction.toJSON())
              } else if (typeof transaction.build === 'function') {
                txObject = transaction
              } else {
                txObject = sdk.Transaction.from(await transaction.serialize())
              }
              const testClient = new sdk.SuiClient({ url: 'https://fullnode.devnet.sui.io:443' })
              txObject.setSender(window['mockWalletActiveAccount'].address)
              const txBytes = await txObject.build({ client: testClient })
              const txB64 = btoa(String.fromCharCode(...txBytes))
              const res = await fetch('/__mock_wallet/sign-and-execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  txBytes: txB64,
                  address: window['mockWalletActiveAccount'].address,
                  options,
                }),
              })
              if (!res.ok) {
                const errText = await res.text()
                throw new Error(`Mock sign & execute failed: ${errText}`)
              }
              const data = await res.json()
              window['mockLastExecutedTransactionResult'] = data
              return data
            },
          },
        },
        accounts: [creatorAccount, respondentAccount],
      }

      const registerMockWallet = () => {
        try {
          let wallets = window.navigator.wallets
          if (!wallets) {
            wallets = []
            try {
              Object.defineProperty(window.navigator, 'wallets', {
                value: wallets,
                writable: true,
                configurable: true,
              })
            } catch {
              ;(window.navigator as any).wallets = wallets
            }
          }
          if (typeof wallets.push === 'function') {
            wallets.push(({ register }: any) => register(mockWallet))
          }
        } catch (e) {
          console.error('navigator.wallets push failed', e)
        }
        try {
          window.dispatchEvent(
            new CustomEvent('wallet-standard:register-wallet', {
              detail: {
                register: (cb: any) => cb(mockWallet),
              },
            })
          )
        } catch (e) {
          console.error('wallet-standard:register-wallet dispatch failed', e)
        }
      }

      registerMockWallet()
      window.addEventListener('DOMContentLoaded', registerMockWallet)
      window.addEventListener('wallet-standard:app-ready', (event: any) => {
        if (event.detail && typeof event.detail.register === 'function') {
          try { event.detail.register(mockWallet) } catch { registerMockWallet() }
        } else {
          registerMockWallet()
        }
      })
      let count = 0
      const iv = setInterval(() => {
        registerMockWallet()
        if (++count >= 15) clearInterval(iv)
      }, 150)
    },
    { creatorAddr: creatorAddress, respondentAddr: respondentAddress }
  )

  // Sign message route
  await page.route('**/__mock_wallet/sign-message', async (route: any) => {
    const { messageB64, address } = route.request().postDataJSON()
    const kp = address === creatorAddress ? creatorKeypair : respondentKeypair
    const msgBytes = Buffer.from(messageB64, 'base64')
    const sig = await kp.signPersonalMessage(msgBytes)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signature: sig.signature }),
    })
  })

  // Sign transaction route
  await page.route('**/__mock_wallet/sign-transaction', async (route: any) => {
    const { txBytes, address } = route.request().postDataJSON()
    const kp = address === creatorAddress ? creatorKeypair : respondentKeypair
    const rawTxBytes = Buffer.from(txBytes, 'base64')
    const sig = await kp.signTransaction(rawTxBytes)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signature: sig.signature }),
    })
  })

  // Sign & execute route
  await page.route('**/__mock_wallet/sign-and-execute', async (route: any) => {
    const { txBytes, address, options } = route.request().postDataJSON()
    const kp = address === creatorAddress ? creatorKeypair : respondentKeypair
    const rawTxBytes = Buffer.from(txBytes, 'base64')
    try {
      const result = await client.signAndExecuteTransaction({
        transaction: rawTxBytes,
        signer: kp,
        options: { showEffects: true, showObjectChanges: true, showEvents: true, ...(options || {}) },
      })
      await client.waitForTransaction({ digest: result.digest })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      })
    } catch (err: any) {
      console.error('[MockWallet] sign-and-execute error:', err)
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: err.message || 'Execution error',
      })
    }
  })

  // Pass issuance route (same as lifecycle.spec.ts)
  await page.route('**/api/pass/issue', async (route: any) => {
    const { userAddress, email } = route.request().postDataJSON()
    try {
      const packageId = env.SUI_PACKAGE_ID
      const registryId = env.PASS_REGISTRY_ID
      if (!packageId || !registryId) {
        throw new Error('SUI_PACKAGE_ID or PASS_REGISTRY_ID missing in E2E .env')
      }
      const emailHash = crypto.createHash('sha256').update(email).digest()
      const tx = new Transaction()
      tx.setSender(creatorAddress)
      const TTL_180D = 180n * 24n * 60n * 60n * 1000n
      tx.moveCall({
        target: `${packageId}::survey_pass::issue`,
        arguments: [
          tx.object(registryId),
          tx.pure.vector('u8', Array.from(emailHash)),
          tx.pure.u64(TTL_180D),
          tx.object('0x6'),
        ],
      })
      const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: creatorKeypair,
        options: { showObjectChanges: true },
      })
      await client.waitForTransaction({ digest: result.digest })
      let passObjectId = ''
      for (const change of result.objectChanges ?? []) {
        if (change.type === 'created' && change.objectType.includes('::survey_pass::SurveyPass')) {
          passObjectId = change.objectId
          break
        }
      }
      if (!passObjectId) throw new Error('SurveyPass object not created in transaction effects')
      console.log(`[E2E PassIssuer] Issued SurveyPass ${passObjectId} for ${email} → ${userAddress}`)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          txDigest: result.digest,
          passObjectId,
          subHash: emailHash.toString('hex'),
        }),
      })
    } catch (err: any) {
      console.error('[E2E PassIssuer] Issue error:', err)
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'issue_failed', message: err.message }),
      })
    }
  })

  // Gas station / sponsor route (dry-run gating)
  await page.route('**/api/gas/sponsor', async (route: any) => {
    const { txBytes, senderAddress } = route.request().postDataJSON()
    try {
      const tx = Transaction.fromKind(Buffer.from(txBytes, 'base64'))
      tx.setSender(senderAddress)
      tx.setGasOwner(creatorAddress)
      const sponsoredTxBytes = await tx.build({ client })
      const dryRun = await client.dryRunTransactionBlock({ transactionBlock: sponsoredTxBytes })
      if (dryRun.effects.status.status === 'failure') {
        console.warn('[E2E GasStation] Dry run rejected:', dryRun.effects.status.error)
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'dry_run_failed', message: dryRun.effects.status.error }),
        })
        return
      }
      const signature = await creatorKeypair.signTransaction(sponsoredTxBytes)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sponsoredTxBytes: Buffer.from(sponsoredTxBytes).toString('base64'),
          sponsorSignature: signature.signature,
        }),
      })
    } catch (err: any) {
      console.error('[E2E GasStation] Sponsor error:', err)
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'sponsor_failed', message: err.message }),
      })
    }
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Create a survey draft and fund it on-chain. Returns {vaultId, keyHash}. */
async function createAndFundSurvey(
  page: any,
  markdown: string
): Promise<{ vaultId: string; keyHash: string }> {
  console.log('[Helper] Creating survey draft…')
  await page.goto('/create')
  await page.locator('textarea#content').fill(markdown)
  await page.getByRole('button', { name: '下一步：前往注資 →' }).click()
  await expect(page).toHaveURL(/\/fund\/.+/)

  console.log('[Helper] Connecting creator wallet and funding…')
  await page.getByRole('button', { name: 'Connect Wallet' }).click()
  await page.getByText('Mock Test Standard Wallet').click()
  await expect(page.getByText(creatorAddress.slice(0, 6))).toBeVisible()
  await expect(page.locator('[aria-label="platform-fee"]')).not.toContainText('計算中')
  await expect(page.locator('[aria-label="estimated-sui-cost"]')).not.toContainText('計算中')
  await page.getByRole('button', { name: '一鍵注資' }).click()
  await expect(page).toHaveURL(/\/dashboard\/.+/, { timeout: 30000 })

  const url = page.url()
  const match = url.match(/\/dashboard\/([^#?]+)/)
  if (!match) throw new Error(`Could not extract vaultId from url: ${url}`)
  const vaultId = match[1]
  const hashIndex = url.indexOf('#')
  const keyHash = hashIndex !== -1 ? url.substring(hashIndex) : ''
  console.log(`[Helper] Vault created: ${vaultId}`)
  return { vaultId, keyHash }
}

/**
 * Navigate to the survey, issue a SurveyPass for the given email, fill the first
 * radio option, and submit. Expects the "提交成功！" screen to appear.
 * Assumes the mock wallet is already switched to the respondent account.
 */
async function doSuccessfulRespondentSubmission(
  page: any,
  vaultId: string,
  keyHash: string,
  email: string
): Promise<void> {
  console.log(`[Helper] Respondent submitting survey with email: ${email}`)
  await page.goto(`/s/${vaultId}${keyHash}`)

  const connectBtn = page.getByRole('button', { name: 'Connect Wallet' })
  if (await connectBtn.isVisible()) {
    await connectBtn.click()
    await page.getByText('Mock Test Standard Wallet').click()
  }

  // Answer the first radio option in the survey
  await page.locator('input[type="radio"]').first().check()
  await page.getByRole('button', { name: '預覽答案' }).click()

  // If no pass yet, go through the need_pass flow
  const needPassHeading = page.getByText('首次填答，請先領取通行證')
  if (await needPassHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator('input[type="email"]').fill(email)
    const passPromise = page.waitForResponse('**/api/pass/issue')
    await page.getByRole('button', { name: '確認免費領取' }).click()
    await passPromise

    // Wait for survey to reload and then preview again
    await expect(page.locator('input[type="radio"]').first()).toBeVisible({ timeout: 10000 })
    await page.locator('input[type="radio"]').first().check()
    await page.getByRole('button', { name: '預覽答案' }).click()
  }

  await expect(page.getByText('確認您的答案')).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: '確認提交' }).click()
  await expect(page.getByText('提交成功！')).toBeVisible({ timeout: 30000 })
  console.log('[Helper] Submission succeeded.')
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

test.describe('SurveySui E2E Sad Paths (Real Devnet Chain)', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockWalletAndRoutes(page)
  })

  // ── T6.2 Sad-path #1 ──────────────────────────────────────────────────────
  test('test_duplicate_response_rejected_by_dry_run', async ({ page }) => {
    // Survey with generous quota so quota itself won't interfere
    const surveyMarkdown = `---
title: "Sad Path Duplicate Test Survey"
perResponse: 1
maxResponses: 5
deadline: "2030-12-31T23:59:59Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "最喜歡的功能？"
    required: true
    options:
      - Move 語言
      - Object model
      - 低 Gas
---
請選擇您最喜歡的 Sui 特性。
`
    // ── 1. Creator creates and funds vault ────────────────────────────────
    const { vaultId, keyHash } = await createAndFundSurvey(page, surveyMarkdown)

    // ── 2. Switch to respondent and submit ONCE (happy path) ──────────────
    console.log('[Step 2] Switching to respondent for first (valid) submission…')
    await page.evaluate(() => { window['switchMockAccount']('respondent') })

    const firstEmail = `dup_respondent_${Date.now()}@example.com`
    await doSuccessfulRespondentSubmission(page, vaultId, keyHash, firstEmail)

    // ── 3. Attempt a SECOND submission with the same sub_hash ──────────────
    // sessionStorage still contains survey_pass_id and survey_sub_hash from step 2,
    // so SurveyPage will skip the need_pass screen and go straight to review.
    console.log('[Step 3] Attempting duplicate submission (should be rejected by dry run)…')
    // Force a full reload — SPA "same path + same hash" goto is a no-op and
    // would leave SurveyPage stuck in the "success" phase from step 2.
    await page.goto('about:blank')
    await page.goto(`/s/${vaultId}${keyHash}`)

    // Answer the question (fresh page load means answers state is reset)
    await expect(page.locator('input[type="radio"]').first()).toBeVisible({ timeout: 10000 })
    await page.locator('input[type="radio"]').first().check()

    // Click "預覽答案" — pass is still in sessionStorage so we jump to review
    await page.getByRole('button', { name: '預覽答案' }).click()
    await expect(page.getByText('確認您的答案')).toBeVisible({ timeout: 10000 })

    // Submit — the gas station will dry-run on-chain and get an abort because
    // sub_hash was already recorded in the vault's claimed_hashes table.
    await page.getByRole('button', { name: '確認提交' }).click()

    // ── 4. Verify error is shown (not paid by respondent because dry run failed)
    console.log('[Step 4] Verifying rejection is surfaced to the user…')
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20000 })
    const alertText = await page.locator('[role="alert"]').textContent()
    console.log(`[Step 4] Alert shown: "${alertText}"`)
    expect(alertText).toContain('DRY_RUN_REJECTED')

    // Confirm we stayed on the review screen (user did NOT pay gas)
    await expect(page.getByText('確認您的答案')).toBeVisible()
    console.log('[test_duplicate_response_rejected_by_dry_run] PASSED')
  })

  // ── T6.2 Sad-path #2 ──────────────────────────────────────────────────────
  test('test_quota_exceeded_rejected', async ({ page }) => {
    // Survey with maxResponses: 1 so a single claim fills it up
    const surveyMarkdown = `---
title: "Sad Path Quota Test Survey"
perResponse: 1
maxResponses: 1
deadline: "2030-12-31T23:59:59Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "最喜歡的功能？"
    required: true
    options:
      - Move 語言
      - Object model
      - 低 Gas
---
請選擇您最喜歡的 Sui 特性。
`
    // ── 1. Creator creates and funds vault (maxResponses: 1) ───────────────
    const { vaultId, keyHash } = await createAndFundSurvey(page, surveyMarkdown)

    // ── 2. Switch to respondent and fill the vault completely ──────────────
    console.log('[Step 2] Filling vault to capacity (maxResponses=1)…')
    await page.evaluate(() => { window['switchMockAccount']('respondent') })

    const firstEmail = `quota_respondent1_${Date.now()}@example.com`
    await doSuccessfulRespondentSubmission(page, vaultId, keyHash, firstEmail)

    // Vault is now full (claimed_count == max_responses == 1).

    // ── 3. Clear sessionStorage and navigate back as "new" respondent ──────
    // We simulate a second respondent by clearing the cached pass data and
    // issuing a brand-new SurveyPass with a different email, which produces a
    // different sub_hash. The contract will still reject the claim because
    // claimed_count >= max_responses.
    console.log('[Step 3] Clearing pass cache to simulate second respondent…')
    await page.evaluate(() => {
      sessionStorage.removeItem('survey_pass_id')
      sessionStorage.removeItem('survey_sub_hash')
    })

    // Force a full reload — SPA "same path + same hash" goto is a no-op and
    // would leave SurveyPage stuck in the "success" phase from step 2.
    await page.goto('about:blank')
    await page.goto(`/s/${vaultId}${keyHash}`)

    const connectBtn = page.getByRole('button', { name: 'Connect Wallet' })
    if (await connectBtn.isVisible()) {
      await connectBtn.click()
      await page.getByText('Mock Test Standard Wallet').click()
    }

    // Answer the question
    await expect(page.locator('input[type="radio"]').first()).toBeVisible({ timeout: 10000 })
    await page.locator('input[type="radio"]').first().check()
    await page.getByRole('button', { name: '預覽答案' }).click()

    // need_pass flow: issue a new pass with a fresh email → different sub_hash
    console.log('[Step 3] Issuing new pass with fresh email for second respondent…')
    await expect(page.getByText('首次填答，請先領取通行證')).toBeVisible({ timeout: 10000 })
    const secondEmail = `quota_respondent2_${Date.now()}@example.com`
    await page.locator('input[type="email"]').fill(secondEmail)
    const passPromise = page.waitForResponse('**/api/pass/issue')
    await page.getByRole('button', { name: '確認免費領取' }).click()
    await passPromise

    // Re-answer after pass issuance and navigate to review
    await expect(page.locator('input[type="radio"]').first()).toBeVisible({ timeout: 10000 })
    await page.locator('input[type="radio"]').first().check()
    await page.getByRole('button', { name: '預覽答案' }).click()
    await expect(page.getByText('確認您的答案')).toBeVisible({ timeout: 10000 })

    // ── 4. Attempt submission to a full vault ─────────────────────────────
    console.log('[Step 4] Attempting submission to full vault (should be rejected)…')
    await page.getByRole('button', { name: '確認提交' }).click()

    // ── 5. Verify rejection is shown in the UI ────────────────────────────
    console.log('[Step 5] Verifying quota-exceeded rejection is surfaced to user…')
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20000 })
    const alertText = await page.locator('[role="alert"]').textContent()
    console.log(`[Step 5] Alert shown: "${alertText}"`)
    expect(alertText).toContain('DRY_RUN_REJECTED')

    // Confirm we stayed on the review screen (user did NOT pay gas)
    await expect(page.getByText('確認您的答案')).toBeVisible()
    console.log('[test_quota_exceeded_rejected] PASSED')
  })
})
