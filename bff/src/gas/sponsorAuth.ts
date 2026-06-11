import { Transaction } from '@mysten/sui/transactions'
import { verifyTransactionSignature } from '@mysten/sui/verify'
import { SuiGraphQLClient } from '@mysten/sui/graphql'
import { normalizeAddress } from '@surveysui/gas-station-core'

// zkLogin signatures are verified against a GraphQL endpoint; the SDK default is
// mainnet, which rejects every devnet/testnet zkLogin wallet. Pin it to our network.
let zkLoginGraphQLClient: SuiGraphQLClient | null = null
export function getZkLoginGraphQLClient(): SuiGraphQLClient {
  if (!zkLoginGraphQLClient) {
    const network = process.env.SUI_NETWORK ?? 'devnet'
    const url = process.env.SUI_GRAPHQL_URL ?? `https://graphql.${network}.sui.io/graphql`
    zkLoginGraphQLClient = new SuiGraphQLClient({ url })
  }
  return zkLoginGraphQLClient
}

/** Read the sender address from full TransactionData (base64). Returns null if absent. */
export function senderFromTransactionData(sponsoredTxBytes: string): string | null {
  const tx = Transaction.from(Buffer.from(sponsoredTxBytes, 'base64'))
  const data = tx.getData() as { sender?: string }
  return data.sender ?? null
}

/** Read the gas owner (sponsor) address from full TransactionData (base64). */
export function gasOwnerFromTransactionData(sponsoredTxBytes: string): string | null {
  const tx = Transaction.from(Buffer.from(sponsoredTxBytes, 'base64'))
  const data = tx.getData() as { gasData?: { owner?: string } }
  return data.gasData?.owner ?? null
}

/**
 * Verify a transaction signature over full TransactionData bytes (base64),
 * binding it to the expected signer. zkLogin signatures are checked against the
 * network-pinned GraphQL endpoint. Returns true iff valid and address-bound.
 */
export async function verifyTxSignatureBy(
  sponsoredTxBytes: string,
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  try {
    await verifyTransactionSignature(Buffer.from(sponsoredTxBytes, 'base64'), signature, {
      address: expectedAddress,
      client: getZkLoginGraphQLClient(),
    })
    return true
  } catch {
    return false
  }
}

/** When tx kind bytes include an explicit sender, it must match the authenticated wallet. */
export function assertTxSenderMatches(txBytes: string, senderAddress: string): void {
  const tx = Transaction.fromKind(Buffer.from(txBytes, 'base64'))
  const data = tx.getData() as { sender?: string }
  if (!data.sender) return
  if (normalizeAddress(data.sender) !== normalizeAddress(senderAddress)) {
    throw new Error('tx_sender_mismatch')
  }
}
