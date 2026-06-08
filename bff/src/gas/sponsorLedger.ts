import type { SuiClient } from '@mysten/sui/client'

// ─────────────────────────────────────────────────────────────────────────────
// Source of truth = on-chain history. We do NOT keep a persistent local ledger
// any more: it used to be incremented eagerly (before dry-run / signing / on-chain
// submission), which inflated the count whenever a sponsorship request was made
// but no transaction ever landed on chain (e.g. Email re-fill that pre-flight
// dry-run rejects, or a user who abandons the wallet prompt).
//
// Instead:
//   • `countOnChainSponsoredTx` is the authority — it counts transactions that
//     actually hit the chain (and thus consumed sponsor gas), INCLUDING ones that
//     failed during Move execution. Transactions rejected only by pre-flight
//     dry-run never land on chain and are therefore never counted.
//   • A short-TTL in-memory cache avoids re-querying the chain on every request.
//   • In-flight reservations (also in-memory, with a short TTL) prevent rapid
//     double-spend within the chain-indexing window, then self-expire so an
//     abandoned request leaves no permanent phantom count.
// ─────────────────────────────────────────────────────────────────────────────

// On-chain count cache TTL: how long a fetched on-chain count is trusted before re-query.
const ONCHAIN_CACHE_TTL_MS = 45_000
// In-flight reservation TTL: covers the window between signing and the tx being indexed.
const RESERVATION_TTL_MS = 120_000

interface OnChainCacheEntry {
  count: number
  fetchedAt: number
}

// normalizedAddr -> cached on-chain count
const onChainCountCache = new Map<string, OnChainCacheEntry>()
// normalizedAddr -> list of reservation creation timestamps (ms epoch). Each entry
// bridges the window between signing a sponsored tx and that tx being indexed on
// chain. It is released either when a fresh on-chain read reflects it (see
// getCachedOnChainCount) or, as a safety net for abandoned requests, once it
// exceeds RESERVATION_TTL_MS.
const pendingReservations = new Map<string, number[]>()

function normalizeAddress(addr: string): string {
  let clean = addr.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}

/** Return live (non-expired) reservations for an address, pruning expired ones (push-ordered: index 0 = oldest). */
function liveReservations(normalizedAddr: string): number[] {
  const now = Date.now()
  const list = pendingReservations.get(normalizedAddr)
  if (!list || list.length === 0) return []
  const live = list.filter((createdAt) => now - createdAt < RESERVATION_TTL_MS)
  if (live.length === 0) {
    pendingReservations.delete(normalizedAddr)
  } else if (live.length !== list.length) {
    pendingReservations.set(normalizedAddr, live)
  }
  return live
}

/** Count live (non-expired) in-flight reservations for an address. */
function pendingCount(normalizedAddr: string): number {
  return liveReservations(normalizedAddr).length
}

/**
 * Release the `n` oldest live reservations for an address. Called when a fresh
 * on-chain read shows that `n` more sponsored txs have landed: those txs are now
 * part of the on-chain count, so the reservations that bridged them must be
 * dropped. Otherwise the same sponsorship would be counted twice (reservation +
 * on-chain) for up to the full RESERVATION_TTL_MS window — which made the
 * displayed quota spike then "recover" as the phantom reservation expired.
 */
function releaseReservations(normalizedAddr: string, n: number): void {
  if (n <= 0) return
  const live = liveReservations(normalizedAddr)
  if (live.length === 0) return
  const remaining = live.slice(n) // index 0 is oldest → drop the n oldest
  if (remaining.length === 0) pendingReservations.delete(normalizedAddr)
  else pendingReservations.set(normalizedAddr, remaining)
}

/**
 * Double-check on-chain RPC history for sponsored transactions to this user.
 * This is the source of truth for how many lifetime sponsorships an address has
 * consumed.
 *
 * NOTE on semantics: we count any transaction that was submitted on chain with
 * our sponsor as gas payer and contains a survey_pass mint/update call —
 * regardless of whether it succeeded or failed (Move abort). A Move-aborted tx is
 * still committed on chain and consumed sponsor gas, so it counts. A tx that only
 * failed pre-flight dry-run never lands on chain and therefore never appears here.
 */
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
  let cursor: any = null
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
        // `showInput` is what populates `transaction.data` (the PTB + gasData).
        // There is NO `showTransaction` option in Sui RPC — passing it (hidden by
        // the old `as any`) was silently ignored, so transaction.data stayed empty,
        // commands resolved to [] and the on-chain count was always 0.
        options: {
          showInput: true,
          showEffects: true,
        },
      })

      for (const txBlock of res.data) {
        // Time-window filter: skip txs older than the configured threshold.
        // `timestampMs` is a top-level field on the RPC response; when it's
        // missing we conservatively count the tx (and warn) rather than risk
        // under-counting the lifetime quota.
        if (minTimestamp > 0) {
          const tsRaw = (txBlock as any).timestampMs
          if (tsRaw == null) {
            console.warn('[SponsorLedger] tx missing timestampMs; counting conservatively')
          } else if (Number(tsRaw) < minTimestamp) {
            continue
          }
        }

        // Check if gas payer was our sponsor address
        const payer = txBlock.transaction?.data?.gasData?.owner
        if (payer && normalizeAddress(payer) === normalizedSponsor) {
          // Verify if it is indeed a survey_pass related call (mint_pass / update_pass_credential).
          // We intentionally do NOT inspect effects.status here: a failed (Move-aborted)
          // sponsored tx still consumed gas on chain and must count.
          // Sui RPC returns programmable-transaction commands under `.transactions`
          // (NOT `.commands`, which is the local SDK builder's field name).
          const commands = (txBlock.transaction?.data?.transaction as any)?.transactions || []
          const hasPassCall = commands.some((cmd: any) => {
            if (cmd.MoveCall) {
              const call = cmd.MoveCall
              const isPassMod = call.module === 'survey_pass'
              const isTargetFn =
                call.function === 'mint_pass' ||
                call.function === 'mint_pass_with_extra_credentials' ||
                call.function === 'update_pass_credential'
              // Package filter: when scoped to a specific package, only count
              // calls into that package so a redeploy (reset-registry) starts the
              // lifetime quota fresh. null = count across all packages (legacy).
              const isTargetPkg =
                normalizedPackage == null ||
                (typeof call.package === 'string' &&
                  normalizeAddress(call.package) === normalizedPackage)
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

/** Fetch the on-chain count for an address, using a short-TTL cache. */
async function getCachedOnChainCount(params: {
  suiClient: SuiClient
  senderAddress: string
  sponsorAddress: string
  packageId?: string | null
  sinceMs?: number
}): Promise<number> {
  const { suiClient, senderAddress, sponsorAddress, packageId, sinceMs } = params
  const normalizedUser = normalizeAddress(senderAddress)
  // Cache key must include the filter conditions, otherwise scopes (current
  // package vs all, different sinceMs) would collide on the same address.
  const cacheKey = `${normalizedUser}|${packageId ?? 'all'}|${sinceMs ?? 0}`

  const cached = onChainCountCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < ONCHAIN_CACHE_TTL_MS) {
    return cached.count
  }

  const count = await countOnChainSponsoredTx({
    suiClient,
    senderAddress: normalizedUser,
    sponsorAddress,
    packageId,
    sinceMs,
  })
  // A fresh read that shows more sponsored txs than the previous snapshot means
  // those txs have now been indexed on chain; release an equal number of in-flight
  // reservations so they are not double-counted on top of the on-chain total.
  // (First read has no baseline → nothing to release.)
  if (cached && count > cached.count) {
    releaseReservations(normalizedUser, count - cached.count)
  }
  onChainCountCache.set(cacheKey, { count, fetchedAt: Date.now() })
  return count
}

/**
 * Read-only check of whether the address has remaining sponsor quota.
 * The effective count = on-chain truth + in-flight reservations. Does NOT mutate
 * any persistent state — call `reserveSponsor` only after the sponsor signature
 * has been produced.
 */
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
  const effective = onChain + pendingCount(normalizedUser)

  return { allowed: effective < maxLimit, count: effective }
}

/**
 * Record an in-flight reservation for an address. Call this only after the
 * sponsor signature has been produced (i.e. we are optimistic the user will
 * broadcast). The reservation auto-expires after RESERVATION_TTL_MS, by which
 * time a genuinely broadcast tx will be reflected in the on-chain count.
 */
export function reserveSponsor(senderAddress: string): void {
  const normalizedUser = normalizeAddress(senderAddress)
  const list = pendingReservations.get(normalizedUser) ?? []
  list.push(Date.now()) // store creation time; expiry derived via RESERVATION_TTL_MS
  pendingReservations.set(normalizedUser, list)
}

/**
 * Gets the current sponsor count for an address: on-chain truth plus any
 * in-flight reservations, so the displayed quota reflects both settled and
 * in-progress sponsorships.
 */
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
  return onChain + pendingCount(normalizedUser)
}

/** Test-only: clear all in-memory sponsor state (on-chain cache + reservations). */
export function __resetSponsorState(): void {
  onChainCountCache.clear()
  pendingReservations.clear()
}
