import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveAccounts, HD_PATHS, type DevAccount } from '../src/devAccounts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('devAccounts', () => {
  it('test_devAccounts_outputs_five_addresses', () => {
    const accounts = deriveAccounts()
    expect(accounts).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      expect(accounts[i].path).toBe(HD_PATHS[i])
      expect(accounts[i].address).toMatch(/^0x[0-9a-f]{64}$/)
    }
  })

  it('test_devAccounts_deterministic_across_runs', () => {
    const first = deriveAccounts()
    const second = deriveAccounts()
    expect(first).toEqual(second)
  })

  it('test_devAccounts_addresses_match_known_fixture', () => {
    const fixturePath = resolve(__dirname, '../fixtures/devAccounts.fixture.json')
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as DevAccount[]
    const accounts = deriveAccounts()
    expect(accounts).toEqual(fixture)
  })
})
