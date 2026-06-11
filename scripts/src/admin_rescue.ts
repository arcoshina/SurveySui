import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireEnv } from './env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load root env variables
try {
  const rootEnvPath = resolve(__dirname, '../../.env')
  if (existsSync(rootEnvPath)) {
    const envLines = readFileSync(rootEnvPath, 'utf8').split('\n')
    for (const line of envLines) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/)
      if (match) {
        const key = match[1].trim()
        let val = match[2].trim()
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
} catch (e) {
  console.warn('Failed to load root .env file:', e)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const params: Record<string, string | boolean> = {}
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        params[key] = args[i + 1]
        i++
      } else {
        params[key] = true
      }
    }
  }
  return params
}

async function main() {
  const params = parseArgs()
  
  const unrevoke = !!params.unrevoke
  const offlineOnly = !!params['offline-only']
  const passId = params.pass as string
  const sourceStr = params.source as string
  const nullifierHex = params.nullifier as string
  const reason = (params.reason as string) || 'Admin rescue revocation'

  if (!sourceStr) {
    console.error('Error: --source <u8> is required.')
    printUsage()
    process.exit(1)
  }
  const source = parseInt(sourceStr, 10)

  if (!unrevoke && !offlineOnly && !passId) {
    console.error('Error: Either --pass <PASS_OBJECT_ID> or --offline-only must be specified.')
    printUsage()
    process.exit(1)
  }

  if (offlineOnly && !nullifierHex) {
    console.error('Error: --nullifier <HEX> is required when running in offline-only mode.')
    printUsage()
    process.exit(1)
  }

  if (unrevoke && !nullifierHex) {
    console.error('Error: --nullifier <HEX> is required for unrevoking.')
    printUsage()
    process.exit(1)
  }

  // Load Env Configuration
  const network = (process.env.SUI_NETWORK ?? 'testnet') as 'testnet' | 'devnet' | 'localnet'
  const packageId = requireEnv('SUI_PACKAGE_ID')
  const issuerConfigId = requireEnv('ISSUER_CONFIG_ID')
  const adminSecret = requireEnv('ADMIN_SECRET')
  const bffUrl = process.env.VITE_BFF_URL || process.env.BFF_URL || 'http://localhost:3100'

  const client = new SuiClient({ url: getFullnodeUrl(network) })
  
  let finalNullifiers: string[] = []
  if (nullifierHex) {
    finalNullifiers = [nullifierHex]
  }

  // ── Step 1: Execute on-chain transaction if needed ──
  if (!offlineOnly && !unrevoke && passId) {
    console.log(`[Chain] Querying SurveyPass ${passId}...`)
    // Query Pass's credential nullifiers from dynamic fields before executing transaction
    try {
      const dfResponse = await client.getDynamicFieldObject({
        parentId: passId,
        name: {
          type: `${packageId}::survey_pass::CredentialKey`,
          value: { source }
        }
      })
      
      if (dfResponse.data && dfResponse.data.content && dfResponse.data.content.dataType === 'moveObject') {
        const fields = dfResponse.data.content.fields as any
        const slot = fields.value?.fields
        if (slot && Array.isArray(slot.nullifiers)) {
          // Nullifiers are returned as byte arrays. Convert them to hex strings.
          finalNullifiers = slot.nullifiers.map((n: any) => {
            const bytes = Array.isArray(n) ? n : (n.fields?.vec ?? [])
            return Buffer.from(bytes).toString('hex')
          })
          console.log(`[Chain] Successfully retrieved ${finalNullifiers.length} nullifier(s) from contract slot.`)
        }
      }
    } catch (err: any) {
      console.warn(`[Chain] Warning: Could not fetch nullifiers from contract slot (perhaps slot doesn't exist). ${err.message}`)
    }

    if (finalNullifiers.length === 0) {
      console.error('Error: Could not retrieve nullifier from chain, and no --nullifier argument was provided.')
      process.exit(1)
    }

    const adminPrivKey = requireEnv('SUI_ADMIN_PRIVATE_KEY')
    const keypair = adminPrivKey.startsWith('suiprivkey')
      ? Ed25519Keypair.fromSecretKey(adminPrivKey)
      : Ed25519Keypair.fromSecretKey(Buffer.from(adminPrivKey, 'hex'))
    
    console.log(`[Chain] Sending admin_revoke_credential transaction for source ${source}...`)
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::admin_revoke_credential`,
      arguments: [
        tx.object(passId),
        tx.object(issuerConfigId),
        tx.pure.u8(source),
      ],
    })

    const txResponse = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: { showEffects: true }
    })
    
    await client.waitForTransaction({ digest: txResponse.digest })
    if (txResponse.effects?.status.status === 'failure') {
      console.error(`[Chain] Transaction failed: ${txResponse.effects.status.error}`)
      process.exit(1)
    }
    console.log(`[Chain] Transaction successful! Digest: ${txResponse.digest}`)
  }

  // ── Step 2: Sync with BFF Off-chain DB ──
  const action = unrevoke ? 'unrevoke' : 'revoke'
  console.log(`[BFF] Sending sync request (${action}) to BFF at ${bffUrl}...`)
  
  for (const nh of finalNullifiers) {
    const endpoint = `${bffUrl}/api/admin/revocation/${action}`
    const payload = unrevoke 
      ? { nullifier: nh, source }
      : { nullifier: nh, source, passId, reason }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminSecret}`
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || 'HTTP Error')
      }
      console.log(`[BFF] Successfully updated BFF for nullifier ${nh}:`, data.message)
    } catch (err: any) {
      console.error(`[BFF] Error syncing with BFF for nullifier ${nh}: ${err.message}`)
      process.exit(1)
    }
  }

  console.log('[OK] All operations completed successfully.')
}

function printUsage() {
  console.log(`
Usage:
  # Revoke a source when Pass still exists (Chain transaction + BFF sync)
  npx tsx scripts/src/admin_rescue.ts --pass <PASS_OBJECT_ID> --source <SOURCE_U8> [--reason <REASON>]
  
  # Revoke a source when Pass has been deleted (BFF sync only)
  npx tsx scripts/src/admin_rescue.ts --nullifier <HEX> --source <SOURCE_U8> --offline-only [--reason <REASON>]
  
  # Unrevoke a source (BFF sync only)
  npx tsx scripts/src/admin_rescue.ts --unrevoke --nullifier <HEX> --source <SOURCE_U8>
  `)
}

main().catch((err) => {
  console.error('[CLI ERROR]', err)
  process.exit(1)
})
