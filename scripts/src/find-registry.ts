import { SuiClient } from '@mysten/sui/client'

async function main() {
  const packageId = '0x7d3f9a03479d4130ce9895ce4410ed405e5440a45b33ed28d094936183029b82'
  const client = new SuiClient({ url: 'https://fullnode.devnet.sui.io:443' })

  console.log(`Searching for PassRegistry of package: ${packageId}...`)
  // Get all objects created by this package or look up the publish transaction
  // Let's query by package type using a general search if possible, or querying objects.
  // Wait, we can get the transaction block that published this package, but since we know the admin address:
  const adminAddress = '0x0b459e39bd7553e28c5641ab90ba8b015e4cdf153877791e0222e11695348a87'
  
  const txs = await client.queryTransactionBlocks({
    filter: {
      InputObject: packageId
    },
    options: {
      showObjectChanges: true
    },
    limit: 10
  })

  console.log(`Found ${txs.data.length} transactions associated with package.`)
  for (const tx of txs.data) {
    for (const change of tx.objectChanges ?? []) {
      if (change.type === 'created' && change.objectType.includes('::survey_pass::PassRegistry')) {
        console.log(`SUCCESS! Found PassRegistry ID: ${change.objectId}`)
        return
      }
    }
  }

  // Fallback: search transactions sent by admin
  const adminTxs = await client.queryTransactionBlocks({
    filter: {
      FromAddress: adminAddress
    },
    options: {
      showObjectChanges: true
    },
    limit: 50
  })

  for (const tx of adminTxs.data) {
    for (const change of tx.objectChanges ?? []) {
      if (change.type === 'created' && change.objectType.includes('::survey_pass::PassRegistry')) {
        console.log(`SUCCESS! Found PassRegistry ID from Admin TX: ${change.objectId}`)
        return
      }
    }
  }

  console.log('Could not find PassRegistry ID automatically.')
}

main().catch(console.error)
