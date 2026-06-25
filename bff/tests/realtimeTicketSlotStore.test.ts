import { describe, it, expect } from 'vitest'
import { InMemoryRealtimeTicketSlotStore } from '../src/pass/stores/realtimeTicketSlotStore.js'

const WALLET = '0x00000000000000000000000000000000000000000000000000000000000000a1'
const OTHER_WALLET = '0x00000000000000000000000000000000000000000000000000000000000000a2'
const VAULT = '0x00000000000000000000000000000000000000000000000000000000000000b1'
const OTHER_VAULT = '0x00000000000000000000000000000000000000000000000000000000000000b2'

describe('InMemoryRealtimeTicketSlotStore.tryReserve', () => {
  it('reserves once then refuses the concurrent duplicate (M5 超賣防護)', async () => {
    const store = new InMemoryRealtimeTicketSlotStore()
    const now = 1_000_000
    const expiresAt = now + 300_000
    // 第一筆成功預留。
    expect(await store.tryReserve(WALLET, VAULT, now, expiresAt, now)).toBe(true)
    // 同 (wallet, vault) 在 live 期間第二次 → 拒絕（杜絕同錢包重複取票）。
    expect(await store.tryReserve(WALLET, VAULT, now, expiresAt, now)).toBe(false)
  })

  it('isolates reservations per wallet and per vault', async () => {
    const store = new InMemoryRealtimeTicketSlotStore()
    const now = 1_000_000
    const expiresAt = now + 300_000
    expect(await store.tryReserve(WALLET, VAULT, now, expiresAt, now)).toBe(true)
    // 不同錢包不受影響。
    expect(await store.tryReserve(OTHER_WALLET, VAULT, now, expiresAt, now)).toBe(true)
    // 同錢包不同問卷不受影響。
    expect(await store.tryReserve(WALLET, OTHER_VAULT, now, expiresAt, now)).toBe(true)
  })

  it('release frees the slot for immediate re-reservation', async () => {
    const store = new InMemoryRealtimeTicketSlotStore()
    const now = 1_000_000
    const expiresAt = now + 300_000
    expect(await store.tryReserve(WALLET, VAULT, now, expiresAt, now)).toBe(true)
    expect(await store.tryReserve(WALLET, VAULT, now, expiresAt, now)).toBe(false)
    // 簽票失敗釋放後可立即重試。
    await store.release(WALLET, VAULT)
    expect(await store.tryReserve(WALLET, VAULT, now, expiresAt, now)).toBe(true)
  })

  it('reclaims an expired slot on a later reserve', async () => {
    const store = new InMemoryRealtimeTicketSlotStore()
    const t0 = 1_000_000
    const expiresAt = t0 + 300_000
    expect(await store.tryReserve(WALLET, VAULT, t0, expiresAt, t0)).toBe(true)
    // 仍在 TTL 內 → 滿。
    expect(await store.tryReserve(WALLET, VAULT, expiresAt - 1, expiresAt, expiresAt - 1)).toBe(false)
    // 既有 slot 過期後 → 可回收再預留。
    expect(await store.tryReserve(WALLET, VAULT, expiresAt + 1, expiresAt + 300_000, expiresAt + 1)).toBe(true)
  })

  it('treats expiresAt boundary as expired (expires_at <= now)', async () => {
    const store = new InMemoryRealtimeTicketSlotStore()
    const t0 = 1_000_000
    const expiresAt = t0 + 300_000
    expect(await store.tryReserve(WALLET, VAULT, t0, expiresAt, t0)).toBe(true)
    // now === expiresAt 視為已過期，可回收。
    expect(await store.tryReserve(WALLET, VAULT, expiresAt, expiresAt + 300_000, expiresAt)).toBe(true)
  })
})
