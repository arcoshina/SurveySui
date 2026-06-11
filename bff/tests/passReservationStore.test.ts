import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryPassReservationStore } from '../src/gas/stores/passReservationStore.js'

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
