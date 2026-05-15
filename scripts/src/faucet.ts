import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'

export type Network = 'testnet' | 'devnet' | 'localnet'

export async function requestFaucet(address: string, network: Network = 'testnet'): Promise<void> {
  const host = getFaucetHost(network)
  const result = await requestSuiFromFaucetV2({ host, recipient: address })
  if (typeof result.status === 'object' && 'Failure' in result.status) {
    throw new Error(`Faucet request failed: ${result.status.Failure.internal}`)
  }
}

export async function getSuiBalance(address: string, network: Network = 'testnet'): Promise<bigint> {
  const client = new SuiClient({ url: getFullnodeUrl(network) })
  const balance = await client.getBalance({ owner: address })
  return BigInt(balance.totalBalance)
}
