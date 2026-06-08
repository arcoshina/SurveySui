import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import { parseStructTag } from '@mysten/sui/utils'

/** Walrus testnet system object (see @mysten/walrus TESTNET_WALRUS_PACKAGE_CONFIG). */
const DEFAULT_WALRUS_SYSTEM_OBJECT_ID =
  '0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af'

/** Testnet Walrus epoch length (1 day). Mainnet uses ~14 days. */
const WALRUS_EPOCH_MS = 86_400_000

const BYTES_PER_STORAGE_UNIT = 1024 * 1024

const WALRUS_STORAGE_EPOCHS = Number(import.meta.env.VITE_WALRUS_STORAGE_EPOCHS ?? '5') || 5

const MAX_EPOCHS_AHEAD_DEFAULT = 53

function walrusSystemObjectId(): string {
  return (import.meta.env.VITE_WALRUS_SYSTEM_OBJECT_ID as string | undefined) || DEFAULT_WALRUS_SYSTEM_OBJECT_ID
}

function fieldsOf(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== 'object') return null
  const c = content as { dataType?: string; fields?: Record<string, unknown> }
  if (c.dataType !== 'moveObject' || !c.fields) return null
  return c.fields
}

function nestedFields(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { fields?: Record<string, unknown> }
  return v.fields ?? null
}

function readU64(value: unknown): bigint {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return BigInt(value)
  }
  return 0n
}

function readU32(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return 0
}

async function getWalrusPackageId(client: SuiClient): Promise<string> {
  const systemId = walrusSystemObjectId()
  const res = await client.getObject({ id: systemId, options: { showType: true } })
  const type = res.data?.type
  if (!type) throw new Error('Walrus system object not found')
  return parseStructTag(type).address
}

async function getWalCoinType(client: SuiClient, packageId: string): Promise<string> {
  return `${packageId}::wal::WAL`
}

interface WalrusSystemState {
  epoch: number
  storagePricePerUnit: bigint
  nShards: number
  maxEpochsAhead: number
}

async function loadWalrusSystemState(client: SuiClient): Promise<WalrusSystemState> {
  const systemId = walrusSystemObjectId()
  const systemObj = await client.getObject({ id: systemId, options: { showContent: true } })
  const systemFields = fieldsOf(systemObj.data?.content)
  if (!systemFields) throw new Error('Walrus system state unavailable')

  const version = readU32(systemFields.version)
  const dynamic = await client.getDynamicFieldObject({
    parentId: systemId,
    name: { type: 'u64', value: version },
  })
  const innerObjectId = dynamic.data?.objectId
  if (!innerObjectId) throw new Error('Walrus system inner state unavailable')
  const innerObj = await client.getObject({ id: innerObjectId, options: { showContent: true } })
  const innerFields = fieldsOf(innerObj.data?.content)
  if (!innerFields) throw new Error('Walrus system inner state unavailable')

  const committee = nestedFields(innerFields.committee)
  const futureAccounting = nestedFields(innerFields.future_accounting)

  return {
    epoch: readU32(innerFields.epoch),
    storagePricePerUnit: readU64(innerFields.storage_price_per_unit_size),
    nShards: readU32(committee?.size),
    maxEpochsAhead: readU32(futureAccounting?.max_epochs_ahead) || MAX_EPOCHS_AHEAD_DEFAULT,
  }
}

interface WalrusBlobStorage {
  encodedSize: number
  endEpoch: number
}

async function loadWalrusBlobStorage(
  client: SuiClient,
  blobObjectId: string
): Promise<WalrusBlobStorage> {
  const blobObj = await client.getObject({ id: blobObjectId, options: { showContent: true } })
  const blobFields = fieldsOf(blobObj.data?.content)
  if (!blobFields) throw new Error('Walrus blob object not found')

  const storage = nestedFields(blobFields.storage)
  if (!storage) throw new Error('Walrus blob storage metadata missing')

  return {
    encodedSize: readU32(storage.storage_size),
    endEpoch: readU32(storage.end_epoch),
  }
}

function storageUnitsFromSize(sizeBytes: number): number {
  return Math.ceil(sizeBytes / BYTES_PER_STORAGE_UNIT)
}

function computeExtendStorageCost(encodedSize: number, epochs: number, pricePerUnit: bigint): bigint {
  const units = storageUnitsFromSize(encodedSize)
  return BigInt(units) * pricePerUnit * BigInt(epochs)
}

/**
 * Estimate how many Walrus epochs to extend so blob coverage reaches `targetMs`.
 */
export function computeWalrusExtendEpochs(params: {
  blobEndEpoch: number
  currentWalrusEpoch: number
  targetMs: number
  nowMs?: number
  maxEpochsAhead: number
}): number {
  const now = params.nowMs ?? Date.now()
  const epochsUntilTarget = Math.ceil(Math.max(0, params.targetMs - now) / WALRUS_EPOCH_MS)
  const targetEndEpoch = params.currentWalrusEpoch + epochsUntilTarget
  const raw = targetEndEpoch - params.blobEndEpoch
  if (raw <= 0) return 0

  const remainingHeadroom =
    params.maxEpochsAhead - Math.max(0, params.blobEndEpoch - params.currentWalrusEpoch)
  return Math.min(raw, remainingHeadroom, WALRUS_STORAGE_EPOCHS)
}

export interface BuildExtendWalrusBlobTxParams {
  blobObjectId: string
  /** Walrus epochs to add; when omitted, extends toward `coverageTargetMs`. */
  epochs?: number
  /** Wall-clock target (e.g. deadline + purge grace). Used when `epochs` is omitted. */
  coverageTargetMs?: number
  sender: string
}

export interface ExtendWalrusBlobEstimate {
  epochs: number
  storageCostWal: bigint
  walCoinType: string
}

export async function estimateExtendWalrusBlob(
  client: SuiClient,
  params: Pick<BuildExtendWalrusBlobTxParams, 'blobObjectId' | 'epochs' | 'coverageTargetMs'>
): Promise<ExtendWalrusBlobEstimate> {
  const [system, blob, packageId] = await Promise.all([
    loadWalrusSystemState(client),
    loadWalrusBlobStorage(client, params.blobObjectId),
    getWalrusPackageId(client),
  ])
  const walCoinType = await getWalCoinType(client, packageId)

  let epochs = params.epochs ?? 0
  if (!epochs && params.coverageTargetMs) {
    epochs = computeWalrusExtendEpochs({
      blobEndEpoch: blob.endEpoch,
      currentWalrusEpoch: system.epoch,
      targetMs: params.coverageTargetMs,
      maxEpochsAhead: system.maxEpochsAhead,
    })
  }
  if (!epochs) {
    epochs = WALRUS_STORAGE_EPOCHS
  }

  const storageCostWal = computeExtendStorageCost(
    blob.encodedSize,
    epochs,
    system.storagePricePerUnit
  )

  return { epochs, storageCostWal, walCoinType }
}

/**
 * Build a transaction that extends a Walrus blob with WAL paid by `sender`.
 */
export async function buildExtendWalrusBlobTx(
  client: SuiClient,
  params: BuildExtendWalrusBlobTxParams
): Promise<Transaction> {
  const estimate = await estimateExtendWalrusBlob(client, params)
  if (estimate.epochs <= 0) {
    throw new Error('walrus_extend_not_needed')
  }

  const packageId = await getWalrusPackageId(client)
  const systemId = walrusSystemObjectId()

  const coins = await client.getCoins({
    owner: params.sender,
    coinType: estimate.walCoinType,
  })
  if (!coins.data.length) {
    throw new Error('walrus_extend_no_wal')
  }

  const sorted = [...coins.data].sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
  const total = sorted.reduce((sum, c) => sum + BigInt(c.balance), 0n)
  if (total < estimate.storageCostWal) {
    throw new Error('walrus_extend_insufficient_wal')
  }

  const tx = new Transaction()
  const primary = tx.object(sorted[0].coinObjectId)
  let payer = primary

  if (sorted.length > 1 && BigInt(sorted[0].balance) < estimate.storageCostWal) {
    tx.mergeCoins(
      primary,
      sorted.slice(1).map((c) => tx.object(c.coinObjectId))
    )
  }

  const [payment] = tx.splitCoins(payer, [tx.pure.u64(estimate.storageCostWal.toString())])

  tx.moveCall({
    target: `${packageId}::system::extend_blob`,
    arguments: [
      tx.object(systemId),
      tx.object(params.blobObjectId),
      tx.pure.u32(estimate.epochs),
      payment,
    ],
  })

  tx.moveCall({
    target: '0x2::coin::destroy_zero',
    typeArguments: [estimate.walCoinType],
    arguments: [payment],
  })

  return tx
}
