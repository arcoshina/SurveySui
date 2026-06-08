import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Ed25519SignerBackend } from '@surveysui/gas-station-core'
import { checkAndMergeCoins } from '../src/gas/coinMergeTask.js'

describe('BFF Coin Merge Task Tests', () => {
  let mockSuiClient: any
  let sponsorSigner: Ed25519SignerBackend

  beforeEach(() => {
    // 32 bytes hex key
    const privHex = '0101010101010101010101010101010101010101010101010101010101010101'
    const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(Buffer.from(privHex, 'hex')))
    sponsorSigner = new Ed25519SignerBackend(keypair)

    mockSuiClient = {
      getCoins: vi.fn(),
      signAndExecuteTransaction: vi.fn().mockResolvedValue({ digest: 'tx_digest_mock' }),
      getReferenceGasPrice: vi.fn().mockResolvedValue('1000'),
    }
  })

  // 1. 當小額 Coin 數量達到或超過 triggerCount 時，應觸發合併交易
  it('should trigger coin merging when small coin count is equal to or greater than triggerCount', async () => {
    // 模擬 60 個小額 Coin (每個餘額 0.05 SUI = 50,000,000 MIST)
    // 加上 1 個較大的 Coin (用來付 Gas, 1 SUI = 1,000,000,000 MIST)
    const mockCoins = [
      {
        coinObjectId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        version: '1',
        digest: '11111111111111111111111111111111',
        balance: '1000000000',
      },
    ]

    for (let i = 0; i < 60; i++) {
      const hexId = (i + 2).toString(16).padStart(64, '0')
      mockCoins.push({
        coinObjectId: `0x${hexId}`,
        version: '1',
        digest: '11111111111111111111111111111111',
        balance: '50000000',
      })
    }

    mockSuiClient.getCoins.mockResolvedValue({
      data: mockCoins,
      hasNextPage: false,
    })

    const result = await checkAndMergeCoins({
      suiClient: mockSuiClient,
      sponsorSigner,
      thresholdMist: 100_000_000n, // 0.1 SUI
      triggerCount: 50,
    })

    expect(result).toBe(true) // 預期執行了合併並返回 true
    expect(mockSuiClient.signAndExecuteTransaction).toHaveBeenCalled()
  })

  it('should not merge locked gas coins', async () => {
    const mockCoins = [
      {
        coinObjectId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        version: '1',
        digest: '11111111111111111111111111111111',
        balance: '1000000000',
      },
    ]

    for (let i = 0; i < 60; i++) {
      const hexId = (i + 2).toString(16).padStart(64, '0')
      mockCoins.push({
        coinObjectId: `0x${hexId}`,
        version: '1',
        digest: '11111111111111111111111111111111',
        balance: '50000000',
      })
    }

    mockSuiClient.getCoins.mockResolvedValue({
      data: mockCoins,
      hasNextPage: false,
    })

    const locked = new Set(['0x0000000000000000000000000000000000000000000000000000000000000001'])

    const result = await checkAndMergeCoins({
      suiClient: mockSuiClient,
      sponsorSigner,
      thresholdMist: 100_000_000n,
      triggerCount: 50,
      lockedCoinIds: locked,
    })

    expect(result).toBe(true)
    const txArg = mockSuiClient.signAndExecuteTransaction.mock.calls[0][0].transaction
    const gasPayment = txArg.blockData.gasConfig.payment
    expect(gasPayment[0].objectId).not.toBe(
      '0x0000000000000000000000000000000000000000000000000000000000000001'
    )
  })

  // 2. 當小額 Coin 數量不足時，不應觸發合併
  it('should not trigger coin merging when small coin count is less than triggerCount', async () => {
    // 模擬 10 個小額 Coin 加上 1 個 Gas Coin
    const mockCoins = [
      {
        coinObjectId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        version: '1',
        digest: '11111111111111111111111111111111',
        balance: '1000000000',
      },
    ]

    for (let i = 0; i < 10; i++) {
      const hexId = (i + 2).toString(16).padStart(64, '0')
      mockCoins.push({
        coinObjectId: `0x${hexId}`,
        version: '1',
        digest: '11111111111111111111111111111111',
        balance: '50000000',
      })
    }

    mockSuiClient.getCoins.mockResolvedValue({
      data: mockCoins,
      hasNextPage: false,
    })

    const result = await checkAndMergeCoins({
      suiClient: mockSuiClient,
      sponsorSigner,
      thresholdMist: 100_000_000n, // 0.1 SUI
      triggerCount: 50,
    })

    expect(result).toBe(false) // 預期沒有執行合併並返回 false
    expect(mockSuiClient.signAndExecuteTransaction).not.toHaveBeenCalled()
  })
})
