import { describe, it, expect } from 'vitest'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { requestFaucet, getSuiBalance } from './faucet.js'

const isIntegration = !!process.env.INTEGRATION

describe.skipIf(!isIntegration)('faucet (integration — requires testnet)', () => {
  it('test_faucet_returns_sui_to_address', async () => {
    const keypair = new Ed25519Keypair()
    const address = keypair.toSuiAddress()

    await requestFaucet(address, 'testnet')

    const balance = await getSuiBalance(address, 'testnet')
    expect(balance).toBeGreaterThan(0n)
  }, 60_000)
})
