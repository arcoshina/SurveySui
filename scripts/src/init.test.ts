import { describe, it, expect } from 'vitest'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { queryPoolReserves } from './init.js'

const isIntegration = !!process.env.INTEGRATION

describe.skipIf(!isIntegration)(
  'init — AMM pool deployment (integration — requires testnet + AMM_POOL_ID)',
  () => {
    it('test_pool_reserves_both_nonzero', async () => {
      const poolId = process.env.AMM_POOL_ID
      if (!poolId) throw new Error('AMM_POOL_ID env var is not set')

      const network = (process.env.SUI_NETWORK ?? 'testnet') as
        | 'testnet'
        | 'devnet'
        | 'localnet'
      const client = new SuiClient({ url: getFullnodeUrl(network) })

      const { reserveA, reserveB } = await queryPoolReserves(client, poolId)

      expect(reserveA).toBeGreaterThan(0n)
      expect(reserveB).toBeGreaterThan(0n)
    }, 30_000)
  },
)
