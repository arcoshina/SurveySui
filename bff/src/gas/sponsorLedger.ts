import type { SuiClient } from '@mysten/sui/client'
import {
  getPassReservationStore,
  RESERVATION_TTL_MS,
  __resetPassReservationStore,
  InMemoryPassReservationStore,
  setPassReservationStoreForTests,
} from './stores/passReservationStore.js'
import {
  getPassSponsorOnchainCacheStore,
  __resetPassSponsorOnchainCacheStore,
  InMemoryPassSponsorOnchainCacheStore,
  setPassSponsorOnchainCacheStoreForTests,
} from './stores/passSponsorOnchainCacheStore.js'
import { normalizeAddress } from '@surveysui/gas-station-core'

export { RESERVATION_TTL_MS }

const ONCHAIN_CACHE_TTL_MS = 45_000

/** Serializes atomic reserve per sender+sponsor (in-memory store; SQLite uses BEGIN IMMEDIATE). */
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

async function pendingCount(normalizedUser: string, sponsorAddress: string): Promise<number> {
  return getPassReservationStore().countLive(normalizedUser, sponsorAddress)
}

export async function countOnChainSponsoredTx(params: {
  suiClient: SuiClient
  senderAddress: string
  sponsorAddress: string
  packageId?: string | null
  sinceMs?: number
}): Promise<number> {
  const { suiClient, senderAddress, sponsorAddress, packageId, sinceMs } = params
  const normalizedSender = normalizeAddress(senderAddress)
  const normalizedSponsor = normalizeAddress(sponsorAddress)
  const normalizedPackage = packageId ? normalizeAddress(packageId) : null
  const minTimestamp = sinceMs && sinceMs > 0 ? sinceMs : 0

  let count = 0
  let hasNextPage = true
  let cursor: string | null | undefined = null
  let pagesPolled = 0

  console.log(`[SponsorLedger] Querying chain for sender: ${normalizedSender}, sponsor: ${normalizedSponsor}`)

  try {
    while (hasNextPage && pagesPolled < 5) {
      const res = await suiClient.queryTransactionBlocks({
        filter: {
          FromAddress: normalizedSender,
        },
        cursor,
        limit: 50,
        options: {
          showInput: true,
          showEffects: true,
        },
      })

      for (const txBlock of res.data) {
        if (minTimestamp > 0) {
          const tsRaw = (txBlock as { timestampMs?: string | number }).timestampMs
          if (tsRaw == null) {
            console.warn('[SponsorLedger] tx missing timestampMs; counting conservatively')
          } else if (Number(tsRaw) < minTimestamp) {
            continue
          }
        }

        const payer = txBlock.transaction?.data?.gasData?.owner
        if (payer && normalizeAddress(payer) === normalizedSponsor) {
          const commands = (txBlock.transaction?.data?.transaction as { transactions?: unknown[] })
            ?.transactions || []
          const hasPassCall = commands.some((cmd: unknown) => {
            const moveCall = (cmd as { MoveCall?: { module?: string; function?: string; package?: string } })
              .MoveCall
            if (moveCall) {
              const isPassMod = moveCall.module === 'survey_pass'
              const isTargetFn =
                moveCall.function === 'mint_pass' ||
                moveCall.function === 'mint_pass_with_extra_credentials' ||
                moveCall.function === 'update_pass_credential'
              const isTargetPkg =
                normalizedPackage == null ||
                (typeof moveCall.package === 'string' &&
                  normalizeAddress(moveCall.package) === normalizedPackage)
              return isPassMod && isTargetFn && isTargetPkg
            }
            return false
          })

          if (hasPassCall) {
            count++
          }
        }
      }

      hasNextPage = res.hasNextPage
      cursor = res.nextCursor
      pagesPolled++
    }
  } catch (error) {
    console.error('[SponsorLedger] Failed to query on-chain transaction history', error)
  }

  console.log(`[SponsorLedger] On-chain check completed. Found ${count} sponsored transactions.`)
  return count
}

async function getCachedOnChainCount(params: {
  suiClient: SuiClient
  senderAddress: string
  sponsorAddress: string
  packageId?: string | null
  sinceMs?: number
}): Promise<number> {
  const { suiClient, senderAddress, sponsorAddress, packageId, sinceMs } = params
  const normalizedUser = normalizeAddress(senderAddress)
  const cacheKey = {
    senderAddress: normalizedUser,
    sponsorAddress,
    packageId,
    sinceMs,
  }

  const cached = await getPassSponsorOnchainCacheStore().get(cacheKey)
  const now = Date.now()
  if (cached && now - cached.fetchedAt < ONCHAIN_CACHE_TTL_MS) {
    return cached.count
  }

  const count = await countOnChainSponsoredTx({
    suiClient,
    senderAddress: normalizedUser,
    sponsorAddress,
    packageId,
    sinceMs,
  })

  if (cached && count > cached.count) {
    const delta = count - cached.count
    const livePending = await pendingCount(normalizedUser, sponsorAddress)
    const releaseN = Math.min(delta, livePending)
    if (releaseN > 0) {
      await getPassReservationStore().releaseOldest(normalizedUser, sponsorAddress, releaseN)
    }
  }
  await getPassSponsorOnchainCacheStore().upsert(cacheKey, count, now)
  return count
}

export async function checkSponsorLimit(params: {
  suiClient: SuiClient
  senderAddress: string
  sponsorAddress: string
  maxLimit: number
  packageId?: string | null
  sinceMs?: number
}): Promise<{ allowed: boolean; count: number }> {
  const { suiClient, senderAddress, sponsorAddress, maxLimit, packageId, sinceMs } = params
  const normalizedUser = normalizeAddress(senderAddress)

  const onChain = await getCachedOnChainCount({
    suiClient,
    senderAddress,
    sponsorAddress,
    packageId,
    sinceMs,
  })
  const pending = await pendingCount(normalizedUser, sponsorAddress)
  const effective = onChain + pending

  return { allowed: effective < maxLimit, count: effective }
}

export async function reserveSponsor(senderAddress: string, sponsorAddress: string): Promise<void> {
  await getPassReservationStore().pruneExpired()
  await getPassReservationStore().add(senderAddress, sponsorAddress)
}

/** Atomically checks pass sponsor quota (on-chain + pending) and reserves one slot if allowed. */
export async function tryReserveSponsorLimit(params: {
  suiClient: SuiClient
  senderAddress: string
  sponsorAddress: string
  maxLimit: number
  packageId?: string | null
  sinceMs?: number
}): Promise<{ allowed: boolean; count: number }> {
  const { suiClient, senderAddress, sponsorAddress, maxLimit, packageId, sinceMs } = params
  const normalizedUser = normalizeAddress(senderAddress)

  const onChain = await getCachedOnChainCount({
    suiClient,
    senderAddress,
    sponsorAddress,
    packageId,
    sinceMs,
  })

  const lockKey = `${normalizedUser}|${normalizeAddress(sponsorAddress)}`
  const reserved = await withReserveLock(lockKey, () =>
    getPassReservationStore().tryReserveIfUnderLimit(
      senderAddress,
      sponsorAddress,
      onChain,
      maxLimit
    )
  )

  const pending = await pendingCount(normalizedUser, sponsorAddress)
  const effective = onChain + pending
  return { allowed: reserved, count: effective }
}

export async function releasePassReservation(
  senderAddress: string,
  sponsorAddress: string,
  n = 1
): Promise<void> {
  await getPassReservationStore().releaseOldest(senderAddress, sponsorAddress, n)
}

export async function getSponsorCount(params: {
  suiClient: SuiClient
  senderAddress: string
  sponsorAddress: string
  packageId?: string | null
  sinceMs?: number
}): Promise<number> {
  const { suiClient, senderAddress, sponsorAddress, packageId, sinceMs } = params
  const normalizedUser = normalizeAddress(senderAddress)

  const onChain = await getCachedOnChainCount({
    suiClient,
    senderAddress,
    sponsorAddress,
    packageId,
    sinceMs,
  })
  const pending = await pendingCount(normalizedUser, sponsorAddress)
  return onChain + pending
}

/** Clears in-process locks and reservations; keeps persisted on-chain cache (simulates process restart). */
export function __resetSponsorProcessState(): void {
  reserveLocks.clear()
  __resetPassReservationStore()
}

export function __resetSponsorState(): void {
  reserveLocks.clear()
  __resetPassReservationStore()
  __resetPassSponsorOnchainCacheStore()
}

export function __useInMemoryPassReservationsForTests(): InMemoryPassReservationStore {
  const memory = new InMemoryPassReservationStore()
  setPassReservationStoreForTests(memory)
  return memory
}

export function __useInMemoryPassSponsorOnchainCacheForTests(): InMemoryPassSponsorOnchainCacheStore {
  const memory = new InMemoryPassSponsorOnchainCacheStore()
  setPassSponsorOnchainCacheStoreForTests(memory)
  return memory
}
