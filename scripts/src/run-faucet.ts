import { requestFaucet, getSuiBalance, type Network } from './faucet.js'

const address = process.argv[2]
const network = (process.argv[3] ?? 'testnet') as Network

if (!address) {
  console.error('Usage: tsx run-faucet.ts <address> [testnet|devnet|localnet]')
  process.exit(1)
}

console.log(`Requesting SUI from ${network} faucet for ${address} ...`)
await requestFaucet(address, network)

const balance = await getSuiBalance(address, network)
console.log(`✓ Done. Balance: ${balance} MIST (${Number(balance) / 1e9} SUI)`)
