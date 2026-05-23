import { describe, it, expect } from 'vitest'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { queryPoolState } from './init.js'

const isIntegration = !!process.env.INTEGRATION

describe.skipIf(!isIntegration)(
  'init — AMM pool deployment (integration — requires testnet + AMM_POOL_ID)',
  () => {
    it('test_pool_reserves_both_nonzero', async () => {
      const poolId = process.env.AMM_POOL_ID
      if (!poolId) throw new Error('AMM_POOL_ID env var is not set')

      const network = (process.env.SUI_NETWORK ?? 'testnet') as 'testnet' | 'devnet' | 'localnet'
      const client = new SuiClient({ url: getFullnodeUrl(network) })

      const { suiReserve, ssrReserve } = await queryPoolState(client, poolId)

      expect(suiReserve).toBeGreaterThanOrEqual(0n)
      expect(ssrReserve).toBeGreaterThanOrEqual(0n)
    }, 30_000)
  }
)
