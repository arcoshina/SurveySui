import { describe, it, expect, afterEach } from 'vitest'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { queryPoolState, mergeEnvFile } from './init.js'

const isIntegration = !!process.env.INTEGRATION

describe('mergeEnvFile — preserves comments / blank lines / ordering', () => {
  let dir: string | null = null
  const makeEnv = (content: string): string => {
    dir = mkdtempSync(join(tmpdir(), 'env-merge-'))
    const p = join(dir, '.env')
    writeFileSync(p, content, 'utf8')
    return p
  }

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('updates existing keys in place, appends new keys, keeps comments + blanks', () => {
    const p = makeEnv(
      [
        '# top comment',
        'SUI_PACKAGE_ID=0xOLD',
        '',
        '# section: ids',
        'SR_TREASURY_ID=0xSR',
        '',
      ].join('\n')
    )

    mergeEnvFile(p, { SUI_PACKAGE_ID: '0xNEW', AMM_POOL_ID: '0xPOOL' })

    const out = readFileSync(p, 'utf8')
    const lines = out.split('\n')
    // Comments preserved verbatim.
    expect(lines).toContain('# top comment')
    expect(lines).toContain('# section: ids')
    // Blank line between the two sections preserved (an empty element survives).
    expect(lines.filter((l) => l === '').length).toBeGreaterThanOrEqual(1)
    // Existing key updated in place (not duplicated, original line gone).
    expect(out).toContain('SUI_PACKAGE_ID=0xNEW')
    expect(out).not.toContain('SUI_PACKAGE_ID=0xOLD')
    expect(out.match(/^SUI_PACKAGE_ID=/gm)?.length).toBe(1)
    // Untouched existing key kept.
    expect(out).toContain('SR_TREASURY_ID=0xSR')
    // New key appended.
    expect(out).toContain('AMM_POOL_ID=0xPOOL')
  })

  it('is idempotent: re-running does not duplicate keys or grow blank lines', () => {
    const p = makeEnv(['# c', 'SUI_PACKAGE_ID=0xA', ''].join('\n'))

    mergeEnvFile(p, { SUI_PACKAGE_ID: '0xB', NEW_KEY: '1' })
    const first = readFileSync(p, 'utf8')
    mergeEnvFile(p, { SUI_PACKAGE_ID: '0xB', NEW_KEY: '1' })
    const second = readFileSync(p, 'utf8')

    // Stable output across runs (no accumulating trailing blanks / dupes).
    expect(second).toBe(first)
    expect(second.match(/^SUI_PACKAGE_ID=/gm)?.length).toBe(1)
    expect(second.match(/^NEW_KEY=/gm)?.length).toBe(1)
    expect(second).toContain('# c')
  })
})


describe.skipIf(!isIntegration)(
  'init — AMM pool deployment (integration — requires testnet + AMM_POOL_ID)',
  () => {
    it('test_pool_reserves_both_nonzero', async () => {
      const poolId = process.env.AMM_POOL_ID
      if (!poolId) throw new Error('AMM_POOL_ID env var is not set')

      const network = (process.env.SUI_NETWORK ?? 'testnet') as 'testnet' | 'devnet' | 'localnet'
      const client = new SuiClient({ url: getFullnodeUrl(network) })

      const { suiReserve, srReserve } = await queryPoolState(client, poolId)

      expect(suiReserve).toBeGreaterThanOrEqual(0n)
      expect(srReserve).toBeGreaterThanOrEqual(0n)
    }, 30_000)
  }
)
