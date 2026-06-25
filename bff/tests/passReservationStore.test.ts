import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryPassReservationStore } from '../src/gas/stores/passReservationStore.js'
import { SqlitePassReservationStore } from '../src/gas/stores/sqlitePassReservationStore.js'
import { RESERVATION_TTL_MS } from '../src/gas/stores/passReservationStore.js'
import { setupFakeD1 } from './helpers/fakeD1.js'

describe('InMemoryPassReservationStore.releaseOldest', () => {
  const sender = '0x1'
  const sponsor = '0xabc'
  let store: InMemoryPassReservationStore

  beforeEach(() => {
    store = new InMemoryPassReservationStore()
  })

  it('createdAt 碰撞時 n=1 只刪一筆', async () => {
    const now = 1_000_000
    await store.add(sender, sponsor, now)
    await store.add(sender, sponsor, now)

    await store.releaseOldest(sender, sponsor, 1, now)

    expect(await store.countLive(sender, sponsor, now)).toBe(1)
  })

  it('不誤刪其他 sender 的同時間戳紀錄', async () => {
    const now = 1_000_000
    const otherSender = '0x2'
    await store.add(sender, sponsor, now)
    await store.add(otherSender, sponsor, now)

    await store.releaseOldest(sender, sponsor, 1, now)

    expect(await store.countLive(sender, sponsor, now)).toBe(0)
    expect(await store.countLive(otherSender, sponsor, now)).toBe(1)
  })

  it('刪除最舊的 n 筆', async () => {
    const now = 1_000_000
    await store.add(sender, sponsor, now)
    await store.add(sender, sponsor, now + 1)
    await store.add(sender, sponsor, now + 2)

    await store.releaseOldest(sender, sponsor, 2, now + 2)

    expect(await store.countLive(sender, sponsor, now + 2)).toBe(1)
  })
})

// §4：D1 版的「單句條件 INSERT」原子預留（取代 BEGIN IMMEDIATE）。
// 以 Fake D1（libsql :memory:，真 SQLite）驗證硬上限與計數正確。
describe('SqlitePassReservationStore.tryReserveIfUnderLimit (D1 atomic)', () => {
  const sender = '0x1'
  const sponsor = '0xabc'
  let store: SqlitePassReservationStore

  beforeEach(async () => {
    await setupFakeD1()
    store = new SqlitePassReservationStore()
  })

  it('onChainBaseline=0、maxLimit=2：可預留兩次，第三次拒絕', async () => {
    const now = 1_000_000
    expect(await store.tryReserveIfUnderLimit(sender, sponsor, 0, 2, now)).toBe(true)
    expect(await store.tryReserveIfUnderLimit(sender, sponsor, 0, 2, now)).toBe(true)
    expect(await store.tryReserveIfUnderLimit(sender, sponsor, 0, 2, now)).toBe(false)
    expect(await store.countLive(sender, sponsor, now)).toBe(2)
  })

  it('鏈上 baseline 已達上限：立即拒絕、不插入', async () => {
    const now = 1_000_000
    expect(await store.tryReserveIfUnderLimit(sender, sponsor, 2, 2, now)).toBe(false)
    expect(await store.countLive(sender, sponsor, now)).toBe(0)
  })

  it('baseline + pending 合計把關', async () => {
    const now = 1_000_000
    // baseline=1、maxLimit=2 → 只能再預留 1 筆
    expect(await store.tryReserveIfUnderLimit(sender, sponsor, 1, 2, now)).toBe(true)
    expect(await store.tryReserveIfUnderLimit(sender, sponsor, 1, 2, now)).toBe(false)
  })

  it('releaseOldest 釋放後可再預留', async () => {
    const now = 1_000_000
    await store.tryReserveIfUnderLimit(sender, sponsor, 0, 1, now)
    expect(await store.tryReserveIfUnderLimit(sender, sponsor, 0, 1, now)).toBe(false)
    await store.releaseOldest(sender, sponsor, 1, now)
    expect(await store.tryReserveIfUnderLimit(sender, sponsor, 0, 1, now)).toBe(true)
  })

  it('過期預留不計入（created_at > now - TTL 過濾）', async () => {
    const t0 = 1_000_000
    await store.tryReserveIfUnderLimit(sender, sponsor, 0, 1, t0)
    // 前進超過 TTL：舊預留視為過期，額度應回復
    const later = t0 + RESERVATION_TTL_MS + 1
    expect(await store.countLive(sender, sponsor, later)).toBe(0)
    expect(await store.tryReserveIfUnderLimit(sender, sponsor, 0, 1, later)).toBe(true)
  })

  it('不同 sender 互不干擾', async () => {
    const now = 1_000_000
    await store.tryReserveIfUnderLimit('0xAAA', sponsor, 0, 1, now)
    expect(await store.tryReserveIfUnderLimit('0xBBB', sponsor, 0, 1, now)).toBe(true)
  })
})
