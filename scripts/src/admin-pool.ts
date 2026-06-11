/**
 * Admin operations for canonical AMM pool (trusted-admin monetary policy).
 *
 * Usage (repo root):
 *   pnpm admin:pool status
 *   pnpm admin:pool withdraw-sui 1000000000
 *   pnpm admin:pool burn-pair 1000000
 *   pnpm admin:pool inflate-cycle 1000000000
 *   pnpm admin:pool withdraw-sui 1000000000 --dry-run
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Transaction } from '@mysten/sui/transactions'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { requireEnv } from './env.js'
import { queryPoolState } from './init.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

const SSR_BASE_PER_UNIT = 1_000_000n
const INITIAL_SSR_PER_SUI = 1000n
const BOOTSTRAP_DIVISOR = 1000n

function loadRootEnv(): void {
  const envPath = resolve(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = val
  }
}

function adminKeypair(): Ed25519Keypair {
  const adminPrivKey = requireEnv('SUI_ADMIN_PRIVATE_KEY')
  return adminPrivKey.startsWith('suiprivkey')
    ? Ed25519Keypair.fromSecretKey(adminPrivKey)
    : Ed25519Keypair.fromSecretKey(Buffer.from(adminPrivKey, 'hex'))
}

function computeSsrOut(suiIn: bigint, suiReserve: bigint, srReserve: bigint): bigint {
  if (suiIn <= 0n) return 0n
  if (suiReserve === 0n || srReserve === 0n) {
    return (suiIn * INITIAL_SSR_PER_SUI) / BOOTSTRAP_DIVISOR
  }
  return (suiIn * srReserve) / suiReserve
}

async function pickSsrCoin(
  client: SuiClient,
  owner: string,
  packageId: string,
  amount: bigint,
): Promise<string> {
  const coinType = `${packageId}::stacked_survey_reward::STACKED_SURVEY_REWARD`
  const { data } = await client.getCoins({ owner, coinType })
  const coin = data.find((c) => BigInt(c.balance) >= amount)
  if (!coin) {
    throw new Error(`Insufficient SSR balance: need ${amount} base, wallet has ${data.length} coin(s)`)
  }
  return coin.coinObjectId
}

async function cmdStatus(client: SuiClient, poolId: string, packageId: string): Promise<void> {
  const state = await queryPoolState(client, poolId)
  const oneSui = 1_000_000_000n
  const marginalSsrBase = computeSsrOut(oneSui, state.suiReserve, state.srReserve)
  const humanSsrPerSui = Number(marginalSsrBase) / Number(SSR_BASE_PER_UNIT)

  console.log('Canonical pool status')
  console.log(`  pool_id:              ${poolId}`)
  console.log(`  sui_reserve (MIST):   ${state.suiReserve}`)
  console.log(`  sr_reserve (base):    ${state.srReserve}`)
  console.log(`  spot MIST/SSR_base:   ${state.spotMistPerSsrBase}`)
  console.log(`  marginal SSR/SUI:     ${humanSsrPerSui.toFixed(3)}`)
  console.log(`  package:              ${packageId}`)
}

async function cmdWithdrawSui(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  poolId: string,
  amount: bigint,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] admin_withdraw_sui amount=${amount}`)
    return
  }
  const tx = new Transaction()
  const [coin] = tx.moveCall({
    target: `${packageId}::amm_pool::admin_withdraw_sui`,
    arguments: [tx.object(poolId), tx.pure.u64(amount)],
  })
  tx.transferObjects([coin], keypair.getPublicKey().toSuiAddress())
  const result = await client.signAndExecuteTransaction({ transaction: tx, signer: keypair })
  await client.waitForTransaction({ digest: result.digest })
  console.log(`withdraw-sui ok digest=${result.digest}`)
}

async function cmdBurnPair(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  poolId: string,
  srTreasuryId: string,
  ssrTreasuryId: string,
  amount: bigint,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] admin_burn_pair ssr_base=${amount}`)
    return
  }
  const owner = keypair.getPublicKey().toSuiAddress()
  const coinId = await pickSsrCoin(client, owner, packageId, amount)
  const tx = new Transaction()
  const [ssrCoin] = tx.splitCoins(tx.object(coinId), [tx.pure.u64(amount)])
  tx.moveCall({
    target: `${packageId}::amm_pool::admin_burn_pair`,
    arguments: [
      tx.object(poolId),
      tx.object(srTreasuryId),
      tx.object(ssrTreasuryId),
      ssrCoin,
    ],
  })
  const result = await client.signAndExecuteTransaction({ transaction: tx, signer: keypair })
  await client.waitForTransaction({ digest: result.digest })
  console.log(`burn-pair ok digest=${result.digest}`)
}

async function cmdInflateCycle(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  poolId: string,
  protocolConfigId: string,
  srTreasuryId: string,
  ssrTreasuryId: string,
  suiAmount: bigint,
  dryRun: boolean,
): Promise<void> {
  const state = await queryPoolState(client, poolId)
  const expectedSsr = computeSsrOut(suiAmount, state.suiReserve, state.srReserve)
  const minSsrOut = expectedSsr > 0n ? expectedSsr - 1n : 1n

  if (dryRun) {
    console.log(`[dry-run] inflate-cycle sui=${suiAmount} expected_ssr_base=${expectedSsr}`)
    return
  }

  const tx = new Transaction()
  const [suiIn] = tx.splitCoins(tx.gas, [tx.pure.u64(suiAmount)])
  const [ssrCoin] = tx.moveCall({
    target: `${packageId}::amm_pool::invest_and_mint`,
    arguments: [
      tx.object(poolId),
      tx.object(protocolConfigId),
      tx.object(srTreasuryId),
      tx.object(ssrTreasuryId),
      suiIn,
      tx.pure.u64(minSsrOut),
    ],
  })
  tx.transferObjects([ssrCoin], keypair.getPublicKey().toSuiAddress())
  const [withdrawn] = tx.moveCall({
    target: `${packageId}::amm_pool::admin_withdraw_sui`,
    arguments: [tx.object(poolId), tx.pure.u64(suiAmount)],
  })
  tx.transferObjects([withdrawn], keypair.getPublicKey().toSuiAddress())

  const result = await client.signAndExecuteTransaction({ transaction: tx, signer: keypair })
  await client.waitForTransaction({ digest: result.digest })
  console.log(`inflate-cycle ok digest=${result.digest} minted_ssr_base≈${expectedSsr}`)
}

async function main(): Promise<void> {
  loadRootEnv()
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const cmdArgs = args.filter((a) => a !== '--dry-run')
  const [command, amountArg] = cmdArgs

  if (!command || command === 'help' || command === '--help') {
    console.log('Commands: status | withdraw-sui <mist> | burn-pair <ssr-base> | inflate-cycle <mist>')
    process.exit(0)
  }

  const network = (process.env.SUI_NETWORK ?? 'devnet') as 'testnet' | 'devnet' | 'localnet'
  const packageId = requireEnv('SUI_PACKAGE_ID')
  const poolId = requireEnv('AMM_POOL_ID')
  const protocolConfigId = requireEnv('PROTOCOL_CONFIG_ID')
  const srTreasuryId = requireEnv('SR_TREASURY_ID')
  const ssrTreasuryId = requireEnv('SSR_TREASURY_ID')

  const client = new SuiClient({ url: getFullnodeUrl(network) })
  const keypair = adminKeypair()

  switch (command) {
    case 'status':
      await cmdStatus(client, poolId, packageId)
      break
    case 'withdraw-sui': {
      const amount = BigInt(amountArg ?? '')
      if (amount <= 0n) throw new Error('withdraw-sui requires positive MIST amount')
      await cmdWithdrawSui(client, keypair, packageId, poolId, amount, dryRun)
      break
    }
    case 'burn-pair': {
      const amount = BigInt(amountArg ?? '')
      if (amount <= 0n) throw new Error('burn-pair requires positive SSR base amount')
      await cmdBurnPair(
        client,
        keypair,
        packageId,
        poolId,
        srTreasuryId,
        ssrTreasuryId,
        amount,
        dryRun,
      )
      break
    }
    case 'inflate-cycle': {
      const amount = BigInt(amountArg ?? '')
      if (amount <= 0n) throw new Error('inflate-cycle requires positive MIST amount')
      await cmdInflateCycle(
        client,
        keypair,
        packageId,
        poolId,
        protocolConfigId,
        srTreasuryId,
        ssrTreasuryId,
        amount,
        dryRun,
      )
      break
    }
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
