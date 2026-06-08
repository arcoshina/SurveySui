import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { netGasFromEffects, resolveGasBudget } from './gasMath.js'
import type { GasConfig } from './gasConfig.js'
import type {
  CoinLockStore,
  SponsorPipelineContext,
  SponsorPipelineMetrics,
  SponsorPipelineOutcome,
} from './types.js'

export interface RunSponsorPipelineParams {
  txBytes: string
  senderAddress: string
  suiClient: SuiClient
  keypair: Ed25519Keypair
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

export async function runSponsorPipeline(
  params: RunSponsorPipelineParams
): Promise<SponsorPipelineOutcome> {
  const {
    txBytes,
    senderAddress,
    suiClient,
    keypair,
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

  let gasBudgetMist = gasConfig.gasBudgetCapMist
  let acquiredCoin: Awaited<ReturnType<CoinLockStore['acquire']>> | undefined

  try {
    try {
      acquiredCoin = await coinStore.acquire(suiClient, sponsorAddress, gasBudgetMist)
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

    try {
      tx.setGasPayment([
        {
          objectId: acquiredCoin.coinObjectId,
          version: acquiredCoin.version,
          digest: acquiredCoin.digest,
        },
      ])
      tx.setGasBudget(Number(gasBudgetMist))

      let sponsoredTxBytes = await tx.build({ client: suiClient })

      const dryRunStart = Date.now()
      let dryRun = await suiClient.dryRunTransactionBlock({
        transactionBlock: Buffer.from(sponsoredTxBytes).toString('base64'),
      })

      if (dryRun.effects.status.status === 'failure') {
        return {
          ok: false,
          status: 422,
          error: 'dry_run_failed',
          message: dryRun.effects.status.error ?? 'Dry run failed',
          metrics: emptyMetrics({
            queueWaitMs,
            dryRunMs: Date.now() - dryRunStart,
            coinObjectId: acquiredCoin.coinObjectId,
            outcome: 'dry_run_failed',
          }),
        }
      }

      const netGas = netGasFromEffects(dryRun.effects.gasUsed)
      const claimGasCompensationAmount = context.claimGasCompensationAmount
        ? BigInt(context.claimGasCompensationAmount)
        : null
      const claimStorageCompensationAmount = context.claimStorageCompensationAmount
        ? BigInt(context.claimStorageCompensationAmount)
        : null

      if (!context.isPassSponsor) {
        if (context.isPlatformSponsor) {
          if (netGas > gasConfig.maxPlatformClaimGasMist) {
            return {
              ok: false,
              status: 422,
              error: 'gas_exceeds_compensation',
              message: `Estimated gas ${netGas} exceeds platform claim cap ${gasConfig.maxPlatformClaimGasMist}`,
              metrics: emptyMetrics({
                queueWaitMs,
                dryRunMs: Date.now() - dryRunStart,
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
            return {
              ok: false,
              status: 422,
              error: 'gas_exceeds_compensation',
              message: `Estimated netGas+buffer ${required} exceeds vault compensation ${compensation}`,
              metrics: emptyMetrics({
                queueWaitMs,
                dryRunMs: Date.now() - dryRunStart,
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
        tx.setGasBudget(Number(gasBudgetMist))
        sponsoredTxBytes = await tx.build({ client: suiClient })
        dryRun = await suiClient.dryRunTransactionBlock({
          transactionBlock: Buffer.from(sponsoredTxBytes).toString('base64'),
        })
        if (dryRun.effects.status.status === 'failure') {
          return {
            ok: false,
            status: 422,
            error: 'dry_run_failed',
            message: dryRun.effects.status.error ?? 'Dry run failed after budget refine',
            metrics: emptyMetrics({
              queueWaitMs,
              dryRunMs: Date.now() - dryRunStart,
              coinObjectId: acquiredCoin.coinObjectId,
              outcome: 'dry_run_failed',
            }),
          }
        }
      }

      const signatureResult = await keypair.signTransaction(sponsoredTxBytes)
      const dryRunMs = Date.now() - dryRunStart

      if (context.isPlatformSponsor && onPlatformSponsorSigned) {
        await onPlatformSponsorSigned()
      }
      if (context.isPassSponsor && onPassSponsorSigned) {
        onPassSponsorSigned()
      }

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
    } finally {
      if (acquiredCoin) {
        coinStore.release(acquiredCoin.coinObjectId)
      }
    }
  } catch (err: unknown) {
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
