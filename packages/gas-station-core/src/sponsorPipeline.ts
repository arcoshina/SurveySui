import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import type { SponsorSigner } from './signerBackend.js'
import { netGasFromEffects, upfrontGasFromEffects, resolveGasBudget } from './gasMath.js'
import { validatePassEscapeClawbackAfterDryRun } from './passEscapeClawbackValidation.js'
import type { GasConfig } from './gasConfig.js'
import type {
  AcquiredGasCoin,
  CoinLockStore,
  SponsorPipelineContext,
  SponsorPipelineMetrics,
  SponsorPipelineOutcome,
} from './types.js'

export interface RunSponsorPipelineParams {
  txBytes: string
  senderAddress: string
  suiClient: SuiClient
  signer: SponsorSigner
  sponsorAddress: string
  coinStore: CoinLockStore
  gasConfig: GasConfig
  context: SponsorPipelineContext
  requestId?: string
  onPlatformSponsorSigned?: () => Promise<void>
  onPassSponsorSigned?: () => void
}

function emptyMetrics(partial: Partial<SponsorPipelineMetrics> = {}): SponsorPipelineMetrics {
  return {
    queueWaitMs: 0,
    dryRunMs: 0,
    outcome: 'error',
    ...partial,
  }
}

function releaseAcquiredCoin(coinStore: CoinLockStore, acquiredCoin: AcquiredGasCoin | undefined): void {
  if (acquiredCoin) {
    coinStore.release(acquiredCoin.coinObjectId)
  }
}

type DryRunEffects = Awaited<ReturnType<SuiClient['dryRunTransactionBlock']>>

async function dryRunOrRetry(
  params: RunSponsorPipelineParams,
  acquiredCoin: AcquiredGasCoin,
  queueWaitMs: number,
  buildAndDryRun: (
    coin: AcquiredGasCoin
  ) => Promise<{ sponsoredTxBytes: Uint8Array; dryRun: DryRunEffects; dryRunMs: number }>
): Promise<
  | { ok: true; sponsoredTxBytes: Uint8Array; dryRun: DryRunEffects; dryRunMs: number; acquiredCoin: AcquiredGasCoin }
  | { ok: false; outcome: SponsorPipelineOutcome }
> {
  const { coinStore, suiClient, sponsorAddress, gasConfig } = params
  const maxRetries = gasConfig.sponsorCoinDryRunMaxRetries
  let currentCoin = acquiredCoin

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { sponsoredTxBytes, dryRun, dryRunMs } = await buildAndDryRun(currentCoin)
    if (dryRun.effects.status.status !== 'failure') {
      return { ok: true, sponsoredTxBytes, dryRun, dryRunMs, acquiredCoin: currentCoin }
    }

    const message = dryRun.effects.status.error ?? 'Dry run failed'
    if (attempt < maxRetries) {
      coinStore.invalidateCoin(currentCoin.coinObjectId)
      try {
        currentCoin = await coinStore.acquire(suiClient, sponsorAddress, gasConfig.gasBudgetCapMist)
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'sponsor_coin_unavailable') {
          return {
            ok: false,
            outcome: {
              ok: false,
              status: 503,
              error: 'sponsor_coin_unavailable',
              message: 'No sponsor gas coin available; try again shortly',
              metrics: emptyMetrics({
                queueWaitMs,
                dryRunMs,
                outcome: 'sponsor_coin_unavailable',
              }),
            },
          }
        }
        throw err
      }
      continue
    }

    releaseAcquiredCoin(coinStore, currentCoin)
    return {
      ok: false,
      outcome: {
        ok: false,
        status: 422,
        error: 'dry_run_failed',
        message,
        metrics: emptyMetrics({
          queueWaitMs,
          dryRunMs,
          coinObjectId: currentCoin.coinObjectId,
          outcome: 'dry_run_failed',
        }),
      },
    }
  }

  throw new Error('dryRunOrRetry: unreachable')
}

export async function runSponsorPipeline(
  params: RunSponsorPipelineParams
): Promise<SponsorPipelineOutcome> {
  const {
    txBytes,
    senderAddress,
    suiClient,
    signer,
    sponsorAddress,
    coinStore,
    gasConfig,
    context,
    onPlatformSponsorSigned,
    onPassSponsorSigned,
  } = params

  const queueStart = Date.now()
  const tx = Transaction.fromKind(Buffer.from(txBytes, 'base64'))
  tx.setSender(senderAddress)
  tx.setGasOwner(sponsorAddress)

  let acquiredCoin: AcquiredGasCoin | undefined
  try {
    try {
      acquiredCoin = await coinStore.acquire(suiClient, sponsorAddress, gasConfig.gasBudgetCapMist)
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'sponsor_coin_unavailable') {
        return {
          ok: false,
          status: 503,
          error: 'sponsor_coin_unavailable',
          message: 'No sponsor gas coin available; try again shortly',
          metrics: emptyMetrics({
            queueWaitMs: Date.now() - queueStart,
            outcome: 'sponsor_coin_unavailable',
          }),
        }
      }
      throw err
    }

    const queueWaitMs = Date.now() - queueStart
    let gasBudgetMist = gasConfig.gasBudgetCapMist
    let activeCoin = acquiredCoin

    const dryRunResult = await dryRunOrRetry(params, activeCoin, queueWaitMs, async (coin) => {
      tx.setGasPayment([
        {
          objectId: coin.coinObjectId,
          version: coin.version,
          digest: coin.digest,
        },
      ])
      tx.setGasBudget(Number(gasBudgetMist))
      const dryRunStart = Date.now()
      const sponsoredTxBytes = await tx.build({ client: suiClient })
      const dryRun = await suiClient.dryRunTransactionBlock({
        transactionBlock: Buffer.from(sponsoredTxBytes).toString('base64'),
      })
      return { sponsoredTxBytes, dryRun, dryRunMs: Date.now() - dryRunStart }
    })

    if (!dryRunResult.ok) {
      return dryRunResult.outcome
    }

    activeCoin = dryRunResult.acquiredCoin
    acquiredCoin = activeCoin
    let { sponsoredTxBytes, dryRun, dryRunMs } = dryRunResult

    const netGas = netGasFromEffects(dryRun.effects.gasUsed)
    if (context.isPassSponsor) {
      const clawbackCheck = validatePassEscapeClawbackAfterDryRun({
        txBytes,
        sponsorAddress,
        gasUsed: dryRun.effects.gasUsed,
      })
      if (!clawbackCheck.ok) {
        releaseAcquiredCoin(coinStore, acquiredCoin)
        return {
          ok: false,
          status: clawbackCheck.status,
          error: clawbackCheck.error,
          message: clawbackCheck.message,
          metrics: emptyMetrics({
            queueWaitMs,
            dryRunMs,
            coinObjectId: acquiredCoin.coinObjectId,
            outcome: 'escape_clawback_rejected',
          }),
        }
      }
    }
    const upfrontGas = upfrontGasFromEffects(dryRun.effects.gasUsed)
    const claimGasCompensationAmount = context.claimGasCompensationAmount
      ? BigInt(context.claimGasCompensationAmount)
      : null
    const claimStorageCompensationAmount = context.claimStorageCompensationAmount
      ? BigInt(context.claimStorageCompensationAmount)
      : null

    if (!context.isPassSponsor) {
      if (context.isPlatformSponsor) {
        const platformBudgetFloor = upfrontGas + gasConfig.gasBudgetBufferMist
        if (platformBudgetFloor > gasConfig.maxPlatformClaimGasMist) {
          releaseAcquiredCoin(coinStore, acquiredCoin)
          return {
            ok: false,
            status: 422,
            error: 'gas_exceeds_compensation',
            message: `Estimated upfront gas+buffer ${platformBudgetFloor} exceeds platform claim cap ${gasConfig.maxPlatformClaimGasMist}`,
            metrics: emptyMetrics({
              queueWaitMs,
              dryRunMs,
              coinObjectId: acquiredCoin.coinObjectId,
              outcome: 'gas_exceeds_compensation',
            }),
          }
        }
        if (netGas > gasConfig.maxPlatformClaimGasMist) {
          releaseAcquiredCoin(coinStore, acquiredCoin)
          return {
            ok: false,
            status: 422,
            error: 'gas_exceeds_compensation',
            message: `Estimated gas ${netGas} exceeds platform claim cap ${gasConfig.maxPlatformClaimGasMist}`,
            metrics: emptyMetrics({
              queueWaitMs,
              dryRunMs,
              coinObjectId: acquiredCoin.coinObjectId,
              outcome: 'gas_exceeds_compensation',
            }),
          }
        }
      } else if (claimGasCompensationAmount !== null) {
        const compensation =
          claimGasCompensationAmount +
          (context.claimHasBlob && claimStorageCompensationAmount !== null
            ? claimStorageCompensationAmount
            : 0n)
        const required = netGas + gasConfig.gasBudgetBufferMist
        if (required > compensation) {
          releaseAcquiredCoin(coinStore, acquiredCoin)
          return {
            ok: false,
            status: 422,
            error: 'gas_exceeds_compensation',
            message: `Estimated netGas+buffer ${required} exceeds vault compensation ${compensation}`,
            metrics: emptyMetrics({
              queueWaitMs,
              dryRunMs,
              coinObjectId: acquiredCoin.coinObjectId,
              outcome: 'gas_exceeds_compensation',
            }),
          }
        }
      }
    }

    const refinedBudget = resolveGasBudget(
      netGas,
      gasConfig.gasBudgetCapMist,
      gasConfig.gasBudgetBufferMist
    )
    if (refinedBudget < gasBudgetMist) {
      gasBudgetMist = refinedBudget
      const refineResult = await dryRunOrRetry(params, activeCoin, queueWaitMs, async (coin) => {
        tx.setGasPayment([
          {
            objectId: coin.coinObjectId,
            version: coin.version,
            digest: coin.digest,
          },
        ])
        tx.setGasBudget(Number(gasBudgetMist))
        const dryRunStart = Date.now()
        const bytes = await tx.build({ client: suiClient })
        const refinedDryRun = await suiClient.dryRunTransactionBlock({
          transactionBlock: Buffer.from(bytes).toString('base64'),
        })
        return { sponsoredTxBytes: bytes, dryRun: refinedDryRun, dryRunMs: Date.now() - dryRunStart }
      })

      if (!refineResult.ok) {
        return refineResult.outcome
      }

      activeCoin = refineResult.acquiredCoin
      acquiredCoin = activeCoin
      sponsoredTxBytes = refineResult.sponsoredTxBytes
      dryRun = refineResult.dryRun
      dryRunMs = refineResult.dryRunMs
    }

    const signatureResult = await signer.signTransaction(sponsoredTxBytes)
    if (context.isPlatformSponsor && onPlatformSponsorSigned) {
      await onPlatformSponsorSigned()
    }
    if (context.isPassSponsor && onPassSponsorSigned) {
      onPassSponsorSigned()
    }

    // Success: keep coin locked until TTL expires (F70).
    return {
      ok: true,
      result: {
        sponsoredTxBytes: Buffer.from(sponsoredTxBytes).toString('base64'),
        sponsorSignature: signatureResult.signature,
      },
      metrics: {
        queueWaitMs,
        dryRunMs,
        coinObjectId: acquiredCoin.coinObjectId,
        outcome: 'success',
      },
    }
  } catch (err: unknown) {
    releaseAcquiredCoin(coinStore, acquiredCoin)
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      status: 500,
      error: 'sponsor_failed',
      message,
      metrics: emptyMetrics({ queueWaitMs: Date.now() - queueStart }),
    }
  }
}
