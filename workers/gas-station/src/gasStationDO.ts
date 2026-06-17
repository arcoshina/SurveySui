import { SuiClient } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import {
  checkAndMergeCoins,
  createSponsorSignerFromEnv,
  keypairFromHex,
  loadGasConfig,
  runSponsorPipeline,
  validateSponsorTransaction,
  verifyGasStationSignature,
  type SponsorSigner,
} from '@surveysui/gas-station-core'
import { toGasConfigEnv, toSponsorSignerEnv, type GasStationEnv } from './env.js'
import { DurableObjectCoinLockStore } from './durableObjectCoinLockStore.js'
import { ensureD1Schema } from './d1Stores.js'

export interface SponsorRequestBody {
  txBytes: string
  senderAddress: string
}

type DoMetrics = {
  queueDepth: number
  lockedCoinCount: number
  unlockedCoinCount: number
  lastOutcome?: string
}

export class GasStationDO implements DurableObject {
  private processing = false
  private pending: Array<{
    body: SponsorRequestBody
    resolve: (res: Response) => void
  }> = []
  private coinStore: DurableObjectCoinLockStore
  private metrics: DoMetrics = { queueDepth: 0, lockedCoinCount: 0, unlockedCoinCount: 0 }

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: GasStationEnv
  ) {
    const gasConfig = loadGasConfig(toGasConfigEnv(this.env))
    this.coinStore = new DurableObjectCoinLockStore(
      this.state.storage,
      gasConfig.coinQueueLockTtlMs,
      gasConfig.coinQueueAcquireRetries,
      gasConfig.coinInventoryRefreshMs
    )
    void this.state.blockConcurrencyWhile(async () => {
      await this.coinStore.load()
      if (this.env.DB) await ensureD1Schema(this.env.DB)
      const gasConfig = loadGasConfig(toGasConfigEnv(this.env))
      const intervalMs = gasConfig.coinMergeIntervalMs
      const existing = await this.state.storage.get<number>('nextMergeAlarm')
      if (!existing) {
        await this.state.storage.setAlarm(Date.now() + intervalMs)
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json(await this.health())
    }

    if (request.method === 'POST' && url.pathname === '/release') {
      const rawBody = await request.text()
      const authError = this.verifyRequestAuth(request, rawBody)
      if (authError) {
        return Response.json({ error: 'unauthorized', message: authError }, { status: 401 })
      }
      let releaseBody: { coinObjectIds?: string[] }
      try {
        releaseBody = JSON.parse(rawBody) as { coinObjectIds?: string[] }
      } catch {
        return Response.json({ error: 'invalid_json', message: 'Malformed JSON body' }, { status: 400 })
      }
      // Spent coins: drop the lock + cache directly (not via the sponsor queue).
      // Racing with acquire is benign — worst case the next acquire re-fetches inventory.
      const ids = Array.isArray(releaseBody.coinObjectIds) ? releaseBody.coinObjectIds : []
      for (const id of ids) {
        if (typeof id === 'string') this.coinStore.invalidateCoin(id)
      }
      this.metrics.lockedCoinCount = this.coinStore.getLockedCoinIds().size
      return Response.json({ released: ids.length })
    }

    if (request.method !== 'POST' || url.pathname !== '/sponsor') {
      return new Response('Not found', { status: 404 })
    }

    const rawBody = await request.text()
    const authError = this.verifyRequestAuth(request, rawBody)
    if (authError) {
      return Response.json({ error: 'unauthorized', message: authError }, { status: 401 })
    }

    let body: SponsorRequestBody
    try {
      body = JSON.parse(rawBody) as SponsorRequestBody
    } catch {
      return Response.json({ error: 'invalid_json', message: 'Malformed JSON body' }, { status: 400 })
    }

    return new Promise<Response>((resolve) => {
      this.pending.push({ body, resolve })
      this.metrics.queueDepth = this.pending.length
      void this.drainQueue()
    })
  }

  private verifyRequestAuth(request: Request, rawBody: string): string | null {
    const secret = this.env.GAS_STATION_SHARED_SECRET?.trim()
    if (!secret) {
      return 'GAS_STATION_SHARED_SECRET is not configured'
    }
    const timestamp = request.headers.get('x-gas-station-timestamp')
    const signature = request.headers.get('x-gas-station-signature')
    if (!timestamp || !signature) {
      return 'Missing HMAC headers'
    }
    if (!verifyGasStationSignature(secret, timestamp, rawBody, signature)) {
      return 'Invalid or expired HMAC signature'
    }
    return null
  }

  async alarm(): Promise<void> {
    const signer = this.loadSponsorSigner()
    if (!signer) return

    const gasConfig = loadGasConfig(toGasConfigEnv(this.env))
    const suiClient = new SuiClient({ url: this.env.SUI_RPC_URL })

    await checkAndMergeCoins({
      suiClient,
      sponsorSigner: signer,
      thresholdMist: gasConfig.coinMergeThresholdMist,
      triggerCount: gasConfig.coinMergeTriggerCount,
      lockedCoinIds: this.coinStore.getLockedCoinIds(),
    })

    await this.state.storage.setAlarm(Date.now() + gasConfig.coinMergeIntervalMs)
  }

  private loadSponsorSigner(): SponsorSigner | null {
    return createSponsorSignerFromEnv(toSponsorSignerEnv(this.env))
  }

  private loadTicketIssuerKeypair(): Ed25519Keypair | null {
    const privKeyHex = this.env.SURVEY_PASS_ISSUER_PRIV?.trim()
    if (!privKeyHex) return null
    return keypairFromHex(privKeyHex)
  }

  private async drainQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true

    while (this.pending.length > 0) {
      const item = this.pending.shift()!
      this.metrics.queueDepth = this.pending.length
      try {
        const response = await this.handleSponsor(item.body)
        item.resolve(response)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        item.resolve(
          Response.json({ error: 'sponsor_failed', message }, { status: 500 })
        )
      }
    }

    this.processing = false
  }

  private async handleSponsor(body: SponsorRequestBody): Promise<Response> {
    const signer = this.loadSponsorSigner()
    if (!signer) {
      return Response.json({ error: 'no_key', message: 'Sponsor key not configured' }, { status: 503 })
    }

    const packageId = this.env.SUI_PACKAGE_ID?.trim()
    if (!packageId) {
      return Response.json(
        { error: 'misconfigured', message: 'SUI_PACKAGE_ID is not configured' },
        { status: 503 }
      )
    }

    const ticketIssuerKeypair = this.loadTicketIssuerKeypair()
    if (!ticketIssuerKeypair) {
      return Response.json(
        { error: 'misconfigured', message: 'SURVEY_PASS_ISSUER_PRIV is not configured' },
        { status: 503 }
      )
    }

    const gasConfig = loadGasConfig(toGasConfigEnv(this.env))
    const sponsorAddress = signer.getSponsorAddress()
    const suiClient = new SuiClient({ url: this.env.SUI_RPC_URL })

    const validation = await validateSponsorTransaction({
      txBytes: body.txBytes,
      senderAddress: body.senderAddress,
      packageId,
      sponsorAddress,
      suiClient,
      ticketIssuerKeypair,
      options: {
        enforcePassLimit: false,
        enforcePlatformQuota: false,
        enforcePlatformTier: false,
        platformClaimEnabled: gasConfig.platformClaimSponsorEnabled,
      },
    })
    if (!validation.ok) {
      return Response.json(
        { error: validation.error, message: validation.message },
        { status: validation.status }
      )
    }

    const outcome = await runSponsorPipeline({
      txBytes: body.txBytes,
      senderAddress: body.senderAddress,
      suiClient,
      signer,
      sponsorAddress,
      coinStore: this.coinStore,
      gasConfig,
      context: validation.pipelineContext,
    })

    this.metrics.lastOutcome = outcome.metrics.outcome
    this.metrics.lockedCoinCount = this.coinStore.getLockedCoinIds().size

    if (!outcome.ok) {
      console.log(
        JSON.stringify({
          event: 'gas_sponsor',
          sender: body.senderAddress,
          outcome: outcome.metrics.outcome,
          queueWaitMs: outcome.metrics.queueWaitMs,
          dryRunMs: outcome.metrics.dryRunMs,
          coinObjectId: outcome.metrics.coinObjectId,
        })
      )
      return Response.json(
        { error: outcome.error, message: outcome.message },
        { status: outcome.status }
      )
    }

    console.log(
      JSON.stringify({
        event: 'gas_sponsor',
        sender: body.senderAddress,
        outcome: 'success',
        queueWaitMs: outcome.metrics.queueWaitMs,
        dryRunMs: outcome.metrics.dryRunMs,
        coinObjectId: outcome.metrics.coinObjectId,
      })
    )

    return Response.json(outcome.result)
  }

  private async health() {
    const signer = this.loadSponsorSigner()
    if (!signer) {
      return { available: false, reason: 'no_key', queueDepth: this.metrics.queueDepth }
    }

    const sponsorAddress = signer.getSponsorAddress()
    const suiClient = new SuiClient({ url: this.env.SUI_RPC_URL })
    const gasConfig = loadGasConfig(toGasConfigEnv(this.env))

    try {
      const coins = await suiClient.getCoins({
        owner: sponsorAddress,
        coinType: '0x2::sui::SUI',
      })
      const locked = this.coinStore.getLockedCoinIds()
      const minBalance = gasConfig.gasBudgetCapMist
      const unlocked = coins.data.filter(
        (c) => !locked.has(c.coinObjectId) && BigInt(c.balance) >= minBalance
      )

      this.metrics.lockedCoinCount = locked.size
      this.metrics.unlockedCoinCount = unlocked.length

      return {
        available: unlocked.length > 0,
        sponsorAddress,
        unlockedCoinCount: unlocked.length,
        lockedCoinCount: locked.size,
        queueDepth: this.metrics.queueDepth,
        lastOutcome: this.metrics.lastOutcome,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { available: false, reason: message, queueDepth: this.metrics.queueDepth }
    }
  }
}
