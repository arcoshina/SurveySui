import {
  getVaultGasReservationStore,
  __resetVaultGasReservationStore,
} from './stores/vaultGasReservationStore.js'

/**
 * vault 補償槽的「在途預留」記帳，與 pass 預留同模式：原子預留疊在鏈上即時槽數之上，
 * 杜絕併發 claim 全判 vault 代付卻把餘額抽乾、導致溢出交易漏計平台額度的競態。
 */

/** 序列化每個 vault 的原子預留（保護 in-memory store；D1/SQLite 由單句寫入序列化保證）。 */
const reserveLocks = new Map<string, Promise<void>>()

async function withReserveLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const tail = reserveLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  reserveLocks.set(
    key,
    tail.then(() => gate)
  )
  await tail
  try {
    return await fn()
  } finally {
    release()
    if (reserveLocks.get(key) === gate) {
      reserveLocks.delete(key)
    }
  }
}

/**
 * 計算 vault 當下可用補償槽數 = floor(gas_balance / gas_compensation_amount)。
 * gas_balance 已含鏈上已扣款；併發在途由預留 store 疊加把關。
 */
export function availableVaultGasSlots(gasBalance: bigint, gasCompensationAmount: bigint): number {
  if (gasCompensationAmount <= 0n) return 0
  const slots = gasBalance / gasCompensationAmount
  return slots > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(slots)
}

/**
 * 原子嘗試預留一個 vault 補償槽。回 true → 該筆走 vault 代付；
 * 回 false → vault 預算（鏈上 + 在途）已滿，該筆走平台代付。
 */
export async function tryReserveVaultGasSlot(
  vaultId: string,
  availableSlots: number
): Promise<boolean> {
  return withReserveLock(vaultId, () =>
    getVaultGasReservationStore().tryReserveSlot(vaultId, availableSlots)
  )
}

/** 廣播確認（或失敗回滾）後釋放在途預留。 */
export async function releaseVaultGasSlot(vaultId: string, n = 1): Promise<void> {
  await getVaultGasReservationStore().release(vaultId, n)
}

export function __resetVaultGasLedger(): void {
  reserveLocks.clear()
  __resetVaultGasReservationStore()
}
