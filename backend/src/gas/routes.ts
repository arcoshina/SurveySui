import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { loadAndVerifyAdminKey } from '../admin-key.js'

const SponsorBodySchema = z.object({
  txBytes: z.string().min(1),
  senderAddress: z.string().min(1),
})

const IssuePassBodySchema = z.object({
  userAddress: z.string().min(1),
  email: z.string().email(),
})

export function registerGasRoutes(app: FastifyInstance): void {
  const rpcUrl = process.env.SUI_RPC_URL || 'https://fullnode.devnet.sui.io:443'
  const client = new SuiClient({ url: rpcUrl })

  app.post('/api/gas/sponsor', async (req, reply) => {
    const parsed = SponsorBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.format() })
    }

    const { txBytes, senderAddress } = parsed.data

    try {
      const { keypair, address: sponsorAddress } = loadAndVerifyAdminKey()

      // 1. Restore Transaction
      let tx: Transaction
      try {
        tx = Transaction.from(txBytes)
      } catch {
        tx = Transaction.fromKind(txBytes)
      }

      // 2. Set sender & sponsor gas
      tx.setSender(senderAddress)
      tx.setGasOwner(sponsorAddress)

      // 3. Find a SUI coin with sufficient balance owned by sponsor
      const coins = await client.getCoins({
        owner: sponsorAddress,
        coinType: '0x2::sui::SUI',
      })
      
      // Find a coin with at least 50,000,000 MIST (0.05 SUI)
      const gasCoin = coins.data.find(c => BigInt(c.balance) >= 50_000_000n)
      if (!gasCoin) {
        return reply.code(500).send({
          error: 'insufficient_sponsor_funds',
          message: 'Sponsor has no SUI coin with >= 0.05 SUI on ' + rpcUrl,
        })
      }

      tx.setGasPayment([{
        objectId: gasCoin.coinObjectId,
        version: gasCoin.version,
        digest: gasCoin.digest,
      }])
      tx.setGasBudget(50_000_000n) // 0.05 SUI

      // 4. Build the sponsored transaction block
      const sponsoredTxBytes = await tx.build({ client })

      // 5. Dry Run simulation before signing
      const dryRunResult = await client.dryRunTransactionBlock({
        transactionBlock: sponsoredTxBytes,
      })

      if (dryRunResult.effects.status.status === 'failure') {
        console.warn(`[Sponsor] Dry run simulation failed: ${dryRunResult.effects.status.error}`)
        return reply.code(422).send({
          error: 'dry_run_failed',
          message: dryRunResult.effects.status.error,
        })
      }

      // 6. Sign transaction block
      const sponsorSig = await keypair.signTransaction(sponsoredTxBytes)

      console.log(`[Sponsor] Successfully sponsored transaction for ${senderAddress}`)
      return reply.code(200).send({
        sponsoredTxBytes: Buffer.from(sponsoredTxBytes).toString('base64'),
        sponsorSignature: sponsorSig.signature,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Sponsor] Sponsorship error: ${msg}`)
      return reply.code(500).send({ error: 'sponsor_failed', message: msg })
    }
  })

  app.post('/api/pass/issue', async (req, reply) => {
    const parsed = IssuePassBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.format() })
    }

    const { userAddress, email } = parsed.data

    try {
      const { keypair, address: adminAddress } = loadAndVerifyAdminKey()

      const packageId = process.env.SUI_PACKAGE_ID
      const registryId = process.env.PASS_REGISTRY_ID
      if (!packageId || !registryId) {
        return reply.code(500).send({
          error: 'missing_env_config',
          message: 'SUI_PACKAGE_ID or PASS_REGISTRY_ID not configured',
        })
      }

      const crypto = await import('node:crypto')
      const emailHash = crypto.createHash('sha256').update(email).digest()

      // Build transaction to call `survey_pass::issue`
      const tx = new Transaction()
      tx.setSender(adminAddress)

      const TTL_180D = 180 * 24 * 60 * 60 * 1000 // 180 days
      tx.moveCall({
        target: `${packageId}::survey_pass::issue`,
        arguments: [
          tx.object(registryId),
          tx.pure.vector('u8', Array.from(emailHash)),
          tx.pure.u64(TTL_180D),
          tx.object('0x6'), // clock
        ],
      })

      // Execute transaction using the admin keypair
      const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showObjectChanges: true },
      })

      await client.waitForTransaction({ digest: result.digest })

      // Find the created SurveyPass object ID from objectChanges
      let passObjectId = ''
      for (const change of result.objectChanges ?? []) {
        if (change.type === 'created' && change.objectType.includes('::survey_pass::SurveyPass')) {
          passObjectId = change.objectId
          break
        }
      }

      if (!passObjectId) {
        return reply.code(500).send({
          error: 'issue_failed',
          message: 'SurveyPass object not found in transaction results',
        })
      }

      console.log(`[PassIssue] Successfully issued SurveyPass ${passObjectId} for ${email}`)
      return reply.code(201).send({
        txDigest: result.digest,
        passObjectId,
        subHash: Buffer.from(emailHash).toString('hex'),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[PassIssue] Issue error: ${msg}`)
      return reply.code(500).send({ error: 'issue_failed', message: msg })
    }
  })
}
