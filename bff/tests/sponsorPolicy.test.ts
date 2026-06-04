import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveCountScope } from '../src/gas/sponsorPolicy.js'

describe('resolveCountScope', () => {
  const PKG = '0xpkgcurrent'

  beforeEach(() => {
    process.env.SUI_PACKAGE_ID = PKG
    delete process.env.SPONSOR_COUNT_SCOPE
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.SUI_PACKAGE_ID
    delete process.env.SPONSOR_COUNT_SCOPE
    vi.restoreAllMocks()
  })

  it('defaults to current package when unset', () => {
    const scope = resolveCountScope()
    expect(scope).toEqual({ packageId: PKG, sinceMs: 0, passMax: 2 })
  })

  it('"all" disables package and time filtering', () => {
    const scope = resolveCountScope('all')
    expect(scope).toEqual({ packageId: null, sinceMs: 0, passMax: 2 })
  })

  it('epoch-ms string sets sinceMs and keeps current package', () => {
    const scope = resolveCountScope('1717000000000')
    expect(scope).toEqual({ packageId: PKG, sinceMs: 1717000000000, passMax: 2 })
  })

  it('ISO date string is parsed into sinceMs', () => {
    const scope = resolveCountScope('2026-05-30T00:00:00Z')
    expect(scope.packageId).toBe(PKG)
    expect(scope.sinceMs).toBe(Date.parse('2026-05-30T00:00:00Z'))
  })

  it('unrecognised value falls back to default (never "all")', () => {
    const scope = resolveCountScope('garbage')
    expect(scope).toEqual({ packageId: PKG, sinceMs: 0, passMax: 2 })
  })

  it('policy file overrides fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sponsor-policy-'))
    const file = join(dir, 'policy.json')
    writeFileSync(file, JSON.stringify({ packageScope: 'all', sinceMs: 42, passMax: 5 }))
    try {
      const scope = resolveCountScope(file)
      expect(scope).toEqual({ packageId: null, sinceMs: 42, passMax: 5 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('missing policy file falls back to default', () => {
    const scope = resolveCountScope('./does-not-exist-policy.json')
    expect(scope).toEqual({ packageId: PKG, sinceMs: 0, passMax: 2 })
  })
})
