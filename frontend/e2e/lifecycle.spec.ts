import { test, expect } from '@playwright/test'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// ── Environment & Keys ─────────────────────────────────────────────────────────

// Parse root .env
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

// Creator keypair (from SUI_ADMIN_PRIVATE_KEY)
const creatorKeypair = loadKeypair(env.SUI_ADMIN_PRIVATE_KEY || '')
const creatorAddress = env.SUI_ADMIN_ADDRESS || creatorKeypair.toSuiAddress()

// Respondent keypair (fresh ephemeral keypair with 0 SUI)
const respondentKeypair = new Ed25519Keypair()
const respondentAddress = respondentKeypair.toSuiAddress()

console.log(`[E2E Setup] Network: ${SUI_NETWORK}`)
console.log(`[E2E Setup] Creator: ${creatorAddress}`)
console.log(`[E2E Setup] Respondent: ${respondentAddress}`)

// ── E2E Test Suite ────────────────────────────────────────────────────────────

test.describe('SurveySui E2E Happy Path Lifecycle (Real Devnet Chain)', () => {
  
  test.beforeEach(async ({ page }) => {
    // Forward browser console logs to Node.js console for E2E debugging
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`)
    })

    // 1. Inject the headless Mock Wallet Standard
    await page.addInitScript(
      ({ creatorAddr, respondentAddr }) => {
        const creatorAccount = {
          address: creatorAddr,
          publicKey: new Uint8Array(32), // dummy for UI
          chains: ['sui:devnet'],
          features: ['sui:signTransaction', 'sui:signAndExecuteTransaction', 'sui:signPersonalMessage'],
        }

        const respondentAccount = {
          address: respondentAddr,
          publicKey: new Uint8Array(32), // dummy for UI
          chains: ['sui:devnet'],
          features: ['sui:signTransaction', 'sui:signAndExecuteTransaction', 'sui:signPersonalMessage'],
        }

        // Set initial active account from sessionStorage to survive page reloads
        const savedAccountType = window.sessionStorage.getItem('mockWalletActiveAccountType') || 'creator'
        window['mockWalletActiveAccount'] = savedAccountType === 'creator' ? creatorAccount : respondentAccount
        window['mockWalletListeners'] = []

        window['switchMockAccount'] = (accountType: 'creator' | 'respondent') => {
          const account = accountType === 'creator' ? creatorAccount : respondentAccount
          window['mockWalletActiveAccount'] = account
          window.sessionStorage.setItem('mockWalletActiveAccountType', accountType)
          console.log(`[MockWallet] Switched active account to: ${account.address}`)
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
            'standard:disconnect': {
              version: '1.0.0',
              disconnect: async () => {},
            },
            'standard:events': {
              version: '1.0.0',
              on: (event: string, listener: any) => {
                if (event === 'change') {
                  window['mockWalletListeners'].push(listener)
                }
                return () => {
                  window['mockWalletListeners'] = window['mockWalletListeners'].filter((l) => l !== listener)
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
                  body: JSON.stringify({
                    messageB64,
                    address: window['mockWalletActiveAccount'].address,
                  }),
                })
                if (!res.ok) throw new Error('Mock sign message failed')
                const data = await res.json()
                return {
                  signature: data.signature,
                  bytes: messageB64,
                }
              },
            },
            'sui:signTransaction': {
              version: '1.0.0',
              signTransaction: async ({ transaction }: { transaction: any }) => {
                const sdk = window['suiSdkForTesting']
                if (!sdk) throw new Error('suiSdkForTesting not found on window')
                
                let txObject
                if (typeof transaction.toJSON === 'function') {
                  const txJson = await transaction.toJSON()
                  txObject = sdk.Transaction.from(txJson)
                } else if (typeof transaction.build === 'function') {
                  txObject = transaction
                } else if (typeof transaction.serialize === 'function') {
                  const serialized = await transaction.serialize()
                  txObject = sdk.Transaction.from(serialized)
                } else {
                  throw new Error('Unsupported transaction format passed to mock wallet')
                }

                const testClient = new sdk.SuiClient({ url: 'https://fullnode.devnet.sui.io:443' })
                txObject.setSender(window['mockWalletActiveAccount'].address)
                const txBytes = await txObject.build({ client: testClient })
                const txB64 = btoa(String.fromCharCode(...txBytes))

                const res = await fetch('/__mock_wallet/sign-transaction', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    txBytes: txB64,
                    address: window['mockWalletActiveAccount'].address,
                  }),
                })
                if (!res.ok) throw new Error('Mock sign transaction failed')
                const data = await res.json()
                return {
                  bytes: txB64,
                  transactionBlockBytes: txB64,
                  signature: data.signature,
                }
              },
            },
            'sui:signAndExecuteTransaction': {
              version: '1.0.0',
              signAndExecuteTransaction: async ({ transaction, options }: { transaction: any; options?: any }) => {
                const sdk = window['suiSdkForTesting']
                if (!sdk) throw new Error('suiSdkForTesting not found on window')
                
                let txObject
                if (typeof transaction.toJSON === 'function') {
                  const txJson = await transaction.toJSON()
                  txObject = sdk.Transaction.from(txJson)
                } else if (typeof transaction.build === 'function') {
                  txObject = transaction
                } else if (typeof transaction.serialize === 'function') {
                  const serialized = await transaction.serialize()
                  txObject = sdk.Transaction.from(serialized)
                } else {
                  throw new Error('Unsupported transaction format passed to mock wallet')
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

        // Register wallet robustly across multiple discovery methods & times
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
              } catch (e) {
                ;(window.navigator as any).wallets = wallets
              }
            }
            if (typeof wallets.push === 'function') {
              wallets.push(({ register }: any) => {
                register(mockWallet)
              })
            }
          } catch (e) {
            console.error('navigator.wallets push failed', e)
          }

          try {
            window.dispatchEvent(
              new CustomEvent('wallet-standard:register-wallet', {
                detail: {
                  register: (registerCallback: any) => {
                    registerCallback(mockWallet)
                  },
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
          console.log('[Browser E2E] Received wallet-standard:app-ready!')
          if (event.detail && typeof event.detail.register === 'function') {
            try {
              event.detail.register(mockWallet)
              console.log('[Browser E2E] Registered mock wallet via app-ready event detail!')
            } catch (err) {
              console.error('[Browser E2E] app-ready register callback failed:', err)
            }
          } else {
            registerMockWallet()
          }
        })
        let registerCount = 0
        const registerInterval = setInterval(() => {
          registerMockWallet()
          if (++registerCount >= 15) clearInterval(registerInterval)
        }, 150)
      },
      { creatorAddr: creatorAddress, respondentAddr: respondentAddress }
    )

    // 2. Intercept mock wallet API endpoints for cryptographic signing
    await page.route('**/__mock_wallet/sign-message', async (route) => {
      const body = route.request().postDataJSON()
      const { messageB64, address } = body
      const kp = address === creatorAddress ? creatorKeypair : respondentKeypair

      const msgBytes = Buffer.from(messageB64, 'base64')
      // Sign message (personal message prefix is handled by signPersonalMessage in SDK)
      const sig = await kp.signPersonalMessage(msgBytes)
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signature: sig.signature }),
      })
    })

    await page.route('**/__mock_wallet/sign-transaction', async (route) => {
      const body = route.request().postDataJSON()
      const { txBytes, address } = body
      const kp = address === creatorAddress ? creatorKeypair : respondentKeypair

      const rawTxBytes = Buffer.from(txBytes, 'base64')
      const sig = await kp.signTransaction(rawTxBytes)
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signature: sig.signature }),
      })
    })

    await page.route('**/__mock_wallet/sign-and-execute', async (route) => {
      const body = route.request().postDataJSON()
      const { txBytes, address, options } = body
      const kp = address === creatorAddress ? creatorKeypair : respondentKeypair

      const rawTxBytes = Buffer.from(txBytes, 'base64')
      
      try {
        const result = await client.signAndExecuteTransaction({
          transaction: rawTxBytes,
          signer: kp,
          options: {
            showEffects: true,
            showObjectChanges: true,
            showEvents: true,
            ...(options || {}),
          },
        })
        await client.waitForTransaction({ digest: result.digest })
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(result),
        })
      } catch (err: any) {
        console.error('[MockWallet] Sign and execute error:', err)
        await route.fulfill({
          status: 500,
          contentType: 'text/plain',
          body: err.message || 'Execution error',
        })
      }
    })

    // 3. Intercept `/api/pass/issue` API using the real SUI_ADMIN key
    await page.route('**/api/pass/issue', async (route) => {
      const body = route.request().postDataJSON()
      const { userAddress, email } = body

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
            tx.object('0x6'), // clock
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

        if (!passObjectId) {
          throw new Error('SurveyPass object not created in transaction effects')
        }

        console.log(`[E2E PassIssuer] Issued SurveyPass ${passObjectId} for ${email}`)

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

    // 4. Intercept `/api/gas/sponsor` to perform native Dry Run & Sponsor
    await page.route('**/api/gas/sponsor', async (route) => {
      const body = route.request().postDataJSON()
      const { txBytes, senderAddress } = body

      try {
        const tx = Transaction.fromKind(Buffer.from(txBytes, 'base64'))
        tx.setSender(senderAddress)
        tx.setGasOwner(creatorAddress) // Creator sponsors respondent's gas

        const sponsoredTxBytes = await tx.build({ client })

        // Dry Run simulation to block bad transactions
        const dryRun = await client.dryRunTransactionBlock({ transactionBlock: sponsoredTxBytes })
        if (dryRun.effects.status.status === 'failure') {
          console.warn('[E2E GasStation] Dry run simulation rejected transaction:', dryRun.effects.status.error)
          await route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'dry_run_failed', message: dryRun.effects.status.error }),
          })
          return
        }

        // Sign as sponsor
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
  })

  test('test_full_flow_a_to_c_real_chain', async ({ page }) => {
    // ── Step 1: Creator Creates a Survey Draft ───────────────────────────────
    
    console.log('[E2E Step 1] Creator creates a markdown survey draft…')
    await page.goto('/create')
    
    // Set survey YAML frontmatter & markdown questions
    const surveyMarkdown = `---
title: "Sui Overflow E2E Developer Survey"
perResponse: 1
maxResponses: 2
deadline: "2030-12-31T23:59:59Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "您最喜歡 Sui 的哪個特性？"
    required: true
    options:
      - Move 語言
      - Object model
      - 低 gas
---
在最受歡迎的 Move 語言生態中，您最喜歡的特性是什麼？
`
    await page.locator('textarea#content').fill(surveyMarkdown)
    
    // Click submit draft
    await page.getByRole('button', { name: '下一步：前往注資 →' }).click()
    
    // Verify redirection to /fund/:id
    await expect(page).toHaveURL(/\/fund\/.+/)
    console.log('[E2E Step 1] Survey draft created successfully!')

    // ── Step 2: Creator Funds the Survey Vault (atomic swap + register) ──────
    
    console.log('[E2E Step 2] Creator funds the survey vault…')
    
    // Click Connect Wallet
    await page.getByRole('button', { name: 'Connect Wallet' }).click()
    // Select our Mock Test Standard Wallet
    await page.getByText('Mock Test Standard Wallet').click()
    
    // Verify wallet connected address is visible in UI
    await expect(page.getByText(creatorAddress.slice(0, 6))).toBeVisible()

    // Wait for the cost estimation to resolve
    await expect(page.locator('[aria-label="platform-fee"]')).not.toContainText('計算中')
    await expect(page.locator('[aria-label="estimated-sui-cost"]')).not.toContainText('計算中')

    // Click fund
    await page.getByRole('button', { name: '一鍵注資' }).click()

    // Wait for E2E signature, atomic execution, and redirect to dashboard.
    // Devnet indexer can be slow returning events/objectChanges; extend timeout to
    // accommodate the FundPage retry loop (up to ~5 polls × 1s each).
    await expect(page).toHaveURL(/\/dashboard\/.+/, { timeout: 30000 })
    console.log('[E2E Step 2] Survey successfully funded and registered on-chain!')

    // Extract vaultId and keyHash from URL
    const url = page.url()
    const match = url.match(/\/dashboard\/([^#?]+)/)
    if (!match) throw new Error(`Could not extract vaultId from url: ${url}`)
    const vaultId = match[1]
    const hashIndex = url.indexOf('#')
    const keyHash = hashIndex !== -1 ? url.substring(hashIndex) : ''
    console.log(`[E2E Step 2] Deployed Vault ID: ${vaultId}, Key Hash: ${keyHash}`)

    // ── Step 3: Switch Wallet to Zero-Balance Respondent ───────────────────
    
    console.log('[E2E Step 3] Switching account to 0 SUI Respondent…')
    await page.evaluate(() => {
      window['switchMockAccount']('respondent')
    })
    console.log('[E2E Step 3] Switched!')

    // ── Step 4: Respondent Fills & Submits the Survey (Zero-Gas Sponsored) ──
    
    console.log('[E2E Step 4] Respondent opens the survey filling page…')
    await page.goto(`/s/${vaultId}${keyHash}`)
    
    // Connect Respondent wallet
    const connectBtn = page.getByRole('button', { name: 'Connect Wallet' })
    if (await connectBtn.isVisible()) {
      await connectBtn.click()
      await page.getByText('Mock Test Standard Wallet').click()
    } else {
      console.log('[E2E Step 4] Wallet already connected automatically!')
    }
    
    // Select the first option (Move 語言)
    console.log('[E2E Step 4] Answering survey questions…')
    await page.getByLabel('Move 語言').check()

    // Navigate to preview, which triggers the need_pass passport claiming step
    await page.getByRole('button', { name: '預覽答案' }).click()

    // Since Respondent has 0 SUI and no passport, the passport claiming step is shown
    console.log('[E2E Step 4] Passport claiming step shown. Entering email…')
    await expect(page.getByText('首次填答，請先領取通行證')).toBeVisible()
    
    // Fill email (use dynamic email to prevent duplicate registration aborts on real devnet chain)
    const uniqueEmail = `respondent_${Date.now()}@example.com`
    await page.locator('input[type="email"]').fill(uniqueEmail)
    // Claim pass (Intercepted and issued real on-chain pass, wait for response to resolve)
    const passPromise = page.waitForResponse('**/api/pass/issue')
    await page.getByRole('button', { name: '確認免費領取' }).click()
    await passPromise

    // Wait for pass to be issued and transition back to survey filling phase
    console.log('[E2E Step 4] Passport issued! Filling survey previewing again…')
    await expect(page.getByText('Sui Overflow E2E Developer Survey')).toBeVisible()

    // Navigate to preview again now that we have the passport
    await page.getByRole('button', { name: '預覽答案' }).click()
    await expect(page.getByText('確認您的答案')).toBeVisible()

    // Submit answer (Intercepted, dry-run simulated, and sponsored)
    await page.getByRole('button', { name: '確認提交' }).click()

    // Wait for submission success screen
    await expect(page.getByText('提交成功！')).toBeVisible({ timeout: 30000 })
    console.log('[E2E Step 4] Response submitted successfully via sponsored transaction!')

    // ── Step 5: Respondent Redeems the staked SurveySuiReward Receipt ────────
    
    // Transfer 0.5 SUI from Creator to Respondent for redemption gas
    console.log('[E2E Step 5] Creator transfers SUI to Respondent for redemption gas…')
    const gasTx = new Transaction()
    const [coin] = gasTx.splitCoins(gasTx.gas, [500000000]) // 0.5 SUI (500,000,000 MIST)
    gasTx.transferObjects([coin], respondentAddress)
    gasTx.setSender(creatorAddress)
    
    const txResult = await client.signAndExecuteTransaction({
      signer: creatorKeypair,
      transaction: gasTx,
    })
    await client.waitForTransaction({ digest: txResult.digest })
    console.log(`[E2E Step 5] SUI successfully transferred! TX digest: ${txResult.digest}`)
    
    console.log('[E2E Step 5] Respondent redeems receipt for SSR coin…')
    await page.goto('/redeem')
    
    // Refresh lists and look for the sSSR staked coin
    await expect(page.locator('h1')).toContainText('兌換 SurveySuiReward')
    
    // Verify that 1.0000 sSSR is present
    await expect(page.getByText('1.0000')).toBeVisible()
    
    // Click redeem
    await page.getByRole('button', { name: '兌換' }).click()

    // Verify redemption success status
    await expect(page.getByRole('status')).toContainText('兌換成功！')
    console.log('[E2E Step 5] sSSR successfully redeemed for SSR coin!')

    // ── Step 6: Creator Dashboard Updates ────────────────────────────────────
    
    console.log('[E2E Step 6] Verification: switching back to Creator to view dashboard…')
    await page.evaluate(() => {
      window['switchMockAccount']('creator')
    })

    // DashboardPage only fetches SurveyClaimed events on mount, so we reload the page
    // in a polling loop until the Devnet indexer has propagated the event. This is more
    // robust than a fixed sleep — indexer latency on devnet is highly variable.
    console.log('[E2E Step 6] Polling dashboard for response-count to reach 1 (indexer lag)…')
    await expect(async () => {
      await page.goto(`/dashboard/${vaultId}`)
      await expect(page.locator('[aria-label="response-count"]')).toContainText('1', {
        timeout: 5000,
      })
    }).toPass({ timeout: 60000, intervals: [3000] })
    console.log('[E2E Step 6] Dashboard verified! E2E happy-path completes perfectly!')
  })
})
