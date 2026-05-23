import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { SuiClient } from '@mysten/sui/client'

interface GasSponsorRequestBody {
  txBytes: string // base64 encoded transaction kind
  senderAddress: string
}

export function registerGasRoutes(app: FastifyInstance, deps: { suiClient: SuiClient }): void {
  app.post(
    '/api/gas/sponsor',
    async (req: FastifyRequest<{ Body: GasSponsorRequestBody }>, reply: FastifyReply) => {
      const { txBytes, senderAddress } = req.body
      if (!txBytes || !senderAddress) {
        return reply.status(400).send({ error: 'Missing txBytes or senderAddress' })
      }

      try {
        const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
        if (!privKeyHex) {
          throw new Error('SURVEY_PASS_ISSUER_PRIV is not set')
        }

        const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
        const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
        const keypairBytes = privateKeyBytes.slice(0, 32)
        const keypair = Ed25519Keypair.fromSecretKey(keypairBytes)
        const sponsorAddress = keypair.getPublicKey().toSuiAddress()

        // 1. Reconstruct transaction from transaction kind
        const tx = Transaction.fromKind(Buffer.from(txBytes, 'base64'))
        tx.setSender(senderAddress)
        tx.setGasOwner(sponsorAddress)

        // 2. Query available SUI gas coins owned by sponsor
        const coinsRes = await deps.suiClient.getCoins({
          owner: sponsorAddress,
          coinType: '0x2::sui::SUI',
          limit: 10,
        })

        if (coinsRes.data.length === 0) {
          throw new Error(`Sponsor (${sponsorAddress}) has no SUI coins to pay for gas`)
        }

        // We use the first coin for simplicity, or select the one with enough balance
        const gasCoin = coinsRes.data[0]
        tx.setGasPayment([
          {
            objectId: gasCoin.coinObjectId,
            version: gasCoin.version,
            digest: gasCoin.digest,
          },
        ])

        // 3. Set a gas budget (10M MIST is usually plenty for simple claim / mint calls, which is 0.01 SUI)
        tx.setGasBudget(10_000_000)

        // 4. Build the full transaction block bytes
        const sponsoredTxBytes = await tx.build({ client: deps.suiClient })

        // 5. Dry run pre-flight check to prevent spamming
        const dryRun = await deps.suiClient.dryRunTransactionBlock({
          transactionBlock: Buffer.from(sponsoredTxBytes).toString('base64'),
        })

        if (dryRun.effects.status.status === 'failure') {
          req.log.warn(
            `[GasStation] Dry run simulation rejected transaction: ${dryRun.effects.status.error}`
          )
          return reply.status(422).send({
            error: 'dry_run_failed',
            message: dryRun.effects.status.error,
          })
        }

        // 6. Sign as sponsor
        const signatureResult = await keypair.signTransaction(sponsoredTxBytes)

        return {
          sponsoredTxBytes: Buffer.from(sponsoredTxBytes).toString('base64'),
          sponsorSignature: signatureResult.signature,
        }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: 'sponsor_failed', message: err.message })
      }
    }
  )
}
