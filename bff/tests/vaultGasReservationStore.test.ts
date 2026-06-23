import { describe, it, expect } from 'vitest'
import {
  InMemoryVaultGasReservationStore,
  VAULT_GAS_RESERVATION_TTL_MS,
} from '../src/gas/stores/vaultGasReservationStore.js'
import { availableVaultGasSlots } from '../src/gas/vaultGasLedger.js'

const VAULT = '0x00000000000000000000000000000000000000000000000000000000000000aa'

describe('availableVaultGasSlots', () => {
  it('computes floor(gas_balance / gas_compensation_amount)', () => {
    expect(availableVaultGasSlots(100_000_000n, 5_000_000n)).toBe(20)
    expect(availableVaultGasSlots(5_000_000n, 5_000_000n)).toBe(1)
    expect(availableVaultGasSlots(4_999_999n, 5_000_000n)).toBe(0)
  })

  it('returns 0 when compensation is zero (avoids div-by-zero)', () => {
    expect(availableVaultGasSlots(100_000_000n, 0n)).toBe(0)
  })
})

describe('InMemoryVaultGasReservationStore', () => {
  it('reserves up to availableSlots then refuses the overflow', async () => {
    const store = new InMemoryVaultGasReservationStore()
    expect(await store.tryReserveSlot(VAULT, 2)).toBe(true)
    expect(await store.tryReserveSlot(VAULT, 2)).toBe(true)
    // 第三筆超出 2 槽 → 拒絕（溢出，改走平台代付）。
    expect(await store.tryReserveSlot(VAULT, 2)).toBe(false)
  })

  it('refuses immediately when availableSlots <= 0', async () => {
    const store = new InMemoryVaultGasReservationStore()
    expect(await store.tryReserveSlot(VAULT, 0)).toBe(false)
  })

  it('isolates reservations per vault id', async () => {
    const store = new InMemoryVaultGasReservationStore()
    const other = '0x00000000000000000000000000000000000000000000000000000000000000bb'
    expect(await store.tryReserveSlot(VAULT, 1)).toBe(true)
    expect(await store.tryReserveSlot(VAULT, 1)).toBe(false)
    // 另一個 vault 的槽不受影響。
    expect(await store.tryReserveSlot(other, 1)).toBe(true)
  })

  it('release frees a slot for re-reservation', async () => {
    const store = new InMemoryVaultGasReservationStore()
    expect(await store.tryReserveSlot(VAULT, 1)).toBe(true)
    expect(await store.tryReserveSlot(VAULT, 1)).toBe(false)
    await store.release(VAULT, 1)
    expect(await store.tryReserveSlot(VAULT, 1)).toBe(true)
  })

  it('expired reservations no longer count toward the limit', async () => {
    const store = new InMemoryVaultGasReservationStore()
    const t0 = 1_000_000
    expect(await store.tryReserveSlot(VAULT, 1, t0)).toBe(true)
    // 仍在 TTL 內 → 滿。
    expect(await store.tryReserveSlot(VAULT, 1, t0 + VAULT_GAS_RESERVATION_TTL_MS - 1)).toBe(false)
    // 超過 TTL → 舊預留失效，可再預留。
    expect(await store.tryReserveSlot(VAULT, 1, t0 + VAULT_GAS_RESERVATION_TTL_MS + 1)).toBe(true)
  })
})
