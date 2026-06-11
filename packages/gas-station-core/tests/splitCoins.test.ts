import { describe, it, expect, vi } from 'vitest'
import { checkAndSplitCoins } from '../src/index.js'

const UNIT = 150_000_000n
const ELIGIBLE_MIN = 100_000_000n
const COIN_BIG = '0x' + '0b'.repeat(32)
const COIN_FREE = '0x' + '0f'.repeat(32)
const COIN_LOCKED = '0x' + '1c'.repeat(32)

function makeCoin(id: string, balance: bigint) {
  return { coinObjectId: id, version: '1', digest: 'd', balance: balance.toString() }
}

function makeClient(coins: ReturnType<typeof makeCoin>[]) {
  return {
    getCoins: vi.fn().mockResolvedValue({ data: coins, hasNextPage: false }),
    signAndExecuteTransaction: vi.fn().mockResolvedValue({ digest: '0xdigest' }),
  }
}

function makeSigner() {
  return {
    getSponsorAddress: () => '0x' + 'ab'.repeat(32),
    signTransaction: vi.fn(),
    asTransactionSigner: () => ({
      getPublicKey: () => ({ toSuiAddress: () => '0x' + 'ab'.repeat(32) }),
      signTransaction: vi.fn(),
    }),
  }
}

describe('checkAndSplitCoins', () => {
  it('does nothing when pool is at target', async () => {
    const coins = Array.from({ length: 3 }, (_, i) => makeCoin('0x' + `0${i + 1}`.repeat(32), UNIT))
    const client = makeClient(coins)
    const result = await checkAndSplitCoins({
      suiClient: client as any,
      sponsorSigner: makeSigner() as any,
      targetCount: 3,
      unitMist: UNIT,
      eligibleMinMist: ELIGIBLE_MIN,
    })
    expect(result).toBe(false)
    expect(client.signAndExecuteTransaction).not.toHaveBeenCalled()
  })

  it('splits the deficit from the largest unlocked coin', async () => {
    const client = makeClient([makeCoin(COIN_BIG, 10_000_000_000n)])
    const result = await checkAndSplitCoins({
      suiClient: client as any,
      sponsorSigner: makeSigner() as any,
      targetCount: 5,
      unitMist: UNIT,
      eligibleMinMist: ELIGIBLE_MIN,
    })
    expect(result).toBe(true)
    expect(client.signAndExecuteTransaction).toHaveBeenCalledTimes(1)
    const tx = client.signAndExecuteTransaction.mock.calls[0][0].transaction
    const commands = tx.getData().commands
    // 1 eligible coin exists, deficit = 4
    expect(commands[0].$kind).toBe('SplitCoins')
    expect(commands[0].SplitCoins.amounts).toHaveLength(4)
    expect(commands[1].$kind).toBe('TransferObjects')
  })

  it('caps splits at what the source coin can afford with reserve', async () => {
    // 1 SUI: reserve 2×unit (0.3) + budget 0.1 leaves 0.6 → 4 splits of 0.15
    const client = makeClient([makeCoin(COIN_BIG, 1_000_000_000n)])
    const result = await checkAndSplitCoins({
      suiClient: client as any,
      sponsorSigner: makeSigner() as any,
      targetCount: 50,
      unitMist: UNIT,
      eligibleMinMist: ELIGIBLE_MIN,
    })
    expect(result).toBe(true)
    const tx = client.signAndExecuteTransaction.mock.calls[0][0].transaction
    expect(tx.getData().commands[0].SplitCoins.amounts).toHaveLength(4)
  })

  it('skips locked coins when picking the source', async () => {
    const client = makeClient([
      makeCoin(COIN_LOCKED, 10_000_000_000n),
      makeCoin(COIN_FREE, 5_000_000_000n),
    ])
    const result = await checkAndSplitCoins({
      suiClient: client as any,
      sponsorSigner: makeSigner() as any,
      targetCount: 5,
      unitMist: UNIT,
      eligibleMinMist: ELIGIBLE_MIN,
      lockedCoinIds: new Set([COIN_LOCKED]),
    })
    expect(result).toBe(true)
    const tx = client.signAndExecuteTransaction.mock.calls[0][0].transaction
    expect(tx.getData().gasData.payment?.[0]?.objectId).toBe(COIN_FREE)
  })

  it('returns false when no unlocked coin can fund a split', async () => {
    const client = makeClient([makeCoin(COIN_FREE, UNIT)])
    const result = await checkAndSplitCoins({
      suiClient: client as any,
      sponsorSigner: makeSigner() as any,
      targetCount: 5,
      unitMist: UNIT,
      eligibleMinMist: ELIGIBLE_MIN,
    })
    expect(result).toBe(false)
    expect(client.signAndExecuteTransaction).not.toHaveBeenCalled()
  })
})
