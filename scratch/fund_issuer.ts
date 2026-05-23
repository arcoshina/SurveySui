import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import * as fs from 'fs'
import * as path from 'path'

function parseEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {}
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
    }
  }
  return env
}

async function main() {
  const rootEnv = parseEnvFile(path.resolve(process.cwd(), '.env'))
  const bffEnv = parseEnvFile(path.resolve(process.cwd(), 'bff/.env'))

  const adminPrivKey = rootEnv.SUI_ADMIN_PRIVATE_KEY
  if (!adminPrivKey) {
    console.error('SUI_ADMIN_PRIVATE_KEY is not set in root .env')
    return
  }

  const issuerPrivKey = bffEnv.SURVEY_PASS_ISSUER_PRIV || rootEnv.SURVEY_PASS_ISSUER_PRIV
  if (!issuerPrivKey) {
    console.error('SURVEY_PASS_ISSUER_PRIV is not set in bff/.env or root .env')
    return
  }

  const rpcUrl = rootEnv.SUI_RPC_URL || bffEnv.SUI_RPC_URL || getFullnodeUrl('devnet')
  console.log('RPC URL:', rpcUrl)

  const client = new SuiClient({ url: rpcUrl })

  // Get Admin keypair
  const adminKeypair = adminPrivKey.startsWith('suiprivkey')
    ? Ed25519Keypair.fromSecretKey(adminPrivKey)
    : Ed25519Keypair.fromSecretKey(
        Buffer.from(adminPrivKey.startsWith('0x') ? adminPrivKey.slice(2) : adminPrivKey, 'hex')
      )
  const adminAddress = adminKeypair.getPublicKey().toSuiAddress()

  // Get Issuer keypair
  const issuerKeypair = issuerPrivKey.startsWith('suiprivkey')
    ? Ed25519Keypair.fromSecretKey(issuerPrivKey)
    : Ed25519Keypair.fromSecretKey(
        Buffer.from(issuerPrivKey.startsWith('0x') ? issuerPrivKey.slice(2) : issuerPrivKey, 'hex')
      )
  const issuerAddress = issuerKeypair.getPublicKey().toSuiAddress()

  console.log('Admin Address:', adminAddress)
  console.log('Issuer Address:', issuerAddress)

  // Check balances
  const adminBal = await client.getBalance({ owner: adminAddress })
  const issuerBal = await client.getBalance({ owner: issuerAddress })
  console.log(
    `Admin SUI Balance: ${BigInt(adminBal.totalBalance) / 1000000000n} SUI (${adminBal.totalBalance} MIST)`
  )
  console.log(
    `Issuer SUI Balance: ${BigInt(issuerBal.totalBalance) / 1000000000n} SUI (${issuerBal.totalBalance} MIST)`
  )

  const minFunding = 2_000_000_000n // 2 SUI
  const fundAmount = 10_000_000_000n // 10 SUI

  if (BigInt(issuerBal.totalBalance) < minFunding) {
    console.log(
      `Issuer balance is low. Transferring ${fundAmount / 1000000000n} SUI from Admin to Issuer...`
    )
    const tx = new Transaction()
    const [coin] = tx.splitCoins(tx.gas, [fundAmount])
    tx.transferObjects([coin], issuerAddress)

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: adminKeypair,
    })
    console.log('Sent transaction, waiting for effects... Hash:', result.digest)
    const effects = await client.waitForTransaction({ digest: result.digest })
    console.log('Transaction confirmed!')

    const newIssuerBal = await client.getBalance({ owner: issuerAddress })
    console.log(
      `New Issuer SUI Balance: ${BigInt(newIssuerBal.totalBalance) / 1000000000n} SUI (${newIssuerBal.totalBalance} MIST)`
    )
  } else {
    console.log('Issuer has sufficient balance. No funding needed.')
  }
}

main().catch(console.error)
