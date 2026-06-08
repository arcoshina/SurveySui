import { SuiClient } from '@mysten/sui/client'
import {
  checkAndMergeCoins,
  createSponsorSignerFromEnv,
  loadGasConfig,
  runSponsorPipeline,
  type SponsorPipelineContext,
  type SponsorSigner,
} from '@surveysui/gas-station-core'
import { toGasConfigEnv, toSponsorSignerEnv, type GasStationEnv } from './env.js'
import { DurableObjectCoinLockStore } from './durableObjectCoinLockStore.js'
import { ensureD1Schema } from './d1Stores.js'

export interface SponsorRequestBody {
  txBytes: string
  senderAddress: string
  requestId?: string
  pipelineContext: SponsorPipelineContext
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

    if (request.method !== 'POST' || url.pathname !== '/sponsor') {
      return new Response('Not found', { status: 404 })
    }

    const body = (await request.json()) as SponsorRequestBody
    return new Promise<Response>((resolve) => {
      this.pending.push({ body, resolve })
      this.metrics.queueDepth = this.pending.length
      void this.drainQueue()
    })
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

    const gasConfig = loadGasConfig(toGasConfigEnv(this.env))
    const sponsorAddress = signer.getSponsorAddress()
    const suiClient = new SuiClient({ url: this.env.SUI_RPC_URL })

    const outcome = await runSponsorPipeline({
      txBytes: body.txBytes,
      senderAddress: body.senderAddress,
      suiClient,
      signer,
      sponsorAddress,
      coinStore: this.coinStore,
      gasConfig,
      context: body.pipelineContext,
      requestId: body.requestId,
    })

    this.metrics.lastOutcome = outcome.metrics.outcome
    this.metrics.lockedCoinCount = this.coinStore.getLockedCoinIds().size

    if (!outcome.ok) {
      console.log(
        JSON.stringify({
          event: 'gas_sponsor',
          requestId: body.requestId,
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
        requestId: body.requestId,
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
