import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'
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

interface Cred {
  nullifier: string // hex
  source: number
}

/**
 * 解析要註銷的憑證清單。一個失控帳號（如一個 gmail）會橫跨多 source
 * （Google OAuth 的 sub nullifier【6】＋ email nullifier【2】），故救援端須「列舉」
 * 失控帳號的全部 nullifier，一次批次傳入。
 *
 * 形式一（批次，推薦）：--creds "<hex>:<source>,<hex>:<source>,..."
 * 形式二（單一，相容）：--nullifier <hex> --source <u8>
 */
function parseCreds(params: Record<string, string | boolean>): Cred[] {
  if (typeof params.creds === 'string') {
    return params.creds
      .split(',')
      .map((pair) => pair.trim())
      .filter((pair) => pair.length > 0)
      .map((pair) => {
        const [nh, s] = pair.split(':')
        if (!nh || s === undefined) {
          throw new Error(`Invalid --creds entry "${pair}". Expected "<hex>:<source>".`)
        }
        return { nullifier: nh.trim().replace(/^0x/, ''), source: parseInt(s.trim(), 10) }
      })
  }
  if (typeof params.nullifier === 'string' && typeof params.source === 'string') {
    return [{ nullifier: params.nullifier.replace(/^0x/, ''), source: parseInt(params.source, 10) }]
  }
  return []
}

async function main() {
  const params = parseArgs()

  const unrevoke = !!params.unrevoke
  const offlineOnly = !!params['offline-only']
  const passId = params.pass as string
  const reason = (params.reason as string) || 'Admin rescue revocation'

  const creds = parseCreds(params)

  if (creds.length === 0) {
    console.error('Error: provide --creds "<hex>:<source>,..." or --nullifier <hex> --source <u8>.')
    printUsage()
    process.exit(1)
  }
  if (creds.some((c) => !Number.isInteger(c.source))) {
    console.error('Error: every credential needs a valid integer source.')
    printUsage()
    process.exit(1)
  }

  // 鏈上批次註銷需要 Pass 物件；offline-only / unrevoke 僅同步 BFF。
  if (!unrevoke && !offlineOnly && !passId) {
    console.error('Error: --pass <PASS_OBJECT_ID> is required for on-chain revocation (or use --offline-only).')
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

  // ── Step 1: Execute on-chain batch revocation if needed ──
  if (!offlineOnly && !unrevoke && passId) {
    const adminPrivKey = requireEnv('SUI_ADMIN_PRIVATE_KEY')
    const keypair = adminPrivKey.startsWith('suiprivkey')
      ? Ed25519Keypair.fromSecretKey(adminPrivKey)
      : Ed25519Keypair.fromSecretKey(Buffer.from(adminPrivKey, 'hex'))

    const nullifierBytes = creds.map((c) => Array.from(Buffer.from(c.nullifier, 'hex')))

    console.log(`[Chain] Sending admin_revoke_credential (batch of ${creds.length} nullifier(s))...`)
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::admin_revoke_credential`,
      arguments: [
        tx.object(passId),
        tx.object(issuerConfigId),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(nullifierBytes).toBytes()),
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

  // ── Step 2: Sync with BFF Off-chain DB（per (nullifier, source)）──
  const action = unrevoke ? 'unrevoke' : 'revoke'
  console.log(`[BFF] Sending sync request (${action}) to BFF at ${bffUrl}...`)

  for (const { nullifier: nh, source } of creds) {
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
      console.log(`[BFF] Successfully updated BFF for nullifier ${nh} (source ${source}):`, data.message)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[BFF] Error syncing with BFF for nullifier ${nh}: ${message}`)
      process.exit(1)
    }
  }

  console.log('[OK] All operations completed successfully.')
}

function printUsage() {
  console.log(`
Usage（一個失控帳號可橫跨多 source，請列舉其全部 nullifier）:
  # 批次撤銷（Pass 仍存在）：鏈上批次 + BFF 同步
  npx tsx scripts/src/admin_rescue.ts --pass <PASS_OBJECT_ID> --creds "<hex>:<source>,<hex>:<source>" [--reason <REASON>]

  # 單一憑證（相容寫法）
  npx tsx scripts/src/admin_rescue.ts --pass <PASS_OBJECT_ID> --nullifier <HEX> --source <SOURCE_U8> [--reason <REASON>]

  # Pass 已刪除，僅同步 BFF 黑名單
  npx tsx scripts/src/admin_rescue.ts --offline-only --creds "<hex>:<source>,..." [--reason <REASON>]

  # 解除撤銷（僅同步 BFF）
  npx tsx scripts/src/admin_rescue.ts --unrevoke --creds "<hex>:<source>,..."
  `)
}

main().catch((err) => {
  console.error('[CLI ERROR]', err)
  process.exit(1)
})
