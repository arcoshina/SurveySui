import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'

const PKG = '0x0000000000000000000000000000000000000000000000000000000000000007'
const ISSUER_CONFIG_ID = '0x000000000000000000000000000000000000000000000000000000000000000a'
const VOID_NFT_ID = '0x000000000000000000000000000000000000000000000000000000000000000c'
const VOID_NFT_TYPE = `${PKG}::claim_sentinel::VoidNft`

function unifiedClaimArgs(
  tx: Transaction,
  vaultId: string,
  surveyId: string,
  passId: string
) {
  return [
    tx.object(vaultId),
    tx.object(surveyId),
    tx.pure.u8(0),
    tx.pure.bool(true),
    tx.object(passId),
    tx.pure.bool(false),
    tx.object(VOID_NFT_ID),
    tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([]).toBytes()),
    tx.object(ISSUER_CONFIG_ID),
    tx.pure.vector('u8', []),
    tx.pure.vector('u8', []),
    tx.pure.u64(0),
    tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
    tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
    tx.object('0x6'),
  ]
}
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { createMultisigSponsorSigner, keypairFromHex } from '@surveysui/gas-station-core'
import { registerGasRoutes, __resetDynamicGasCache, __useInMemoryPassReservationsForTests } from '../src/gas/handler.js'
import { __resetSponsorState } from '../src/gas/sponsorLedger.js'
import { __resetGasConfigCache } from '../src/gas/gasConfig.js'
import { __resetPlatformSponsorLedger } from '../src/gas/platformSponsorLedger.js'
import { initializeDb } from '../src/security/db.js'

describe('BFF Gas Sponsor Endpoint Tests', () => {
  let server: any
  let mockSuiClient: any

  const devIssuerPriv = '0101010101010101010101010101010101010101010101010101010101010101'
  const sponsorPriv2 = '0202020202020202020202020202020202020202020202020202020202020202'
  const sponsorPriv3 = '0303030303030303030303030303030303030303030303030303030303030303'
  const coldPubkey3 = Buffer.from(
    keypairFromHex(sponsorPriv3).getPublicKey().toRawBytes()
  ).toString('hex')
  const userPriv = '0404040404040404040404040404040404040404040404040404040404040404'
  let userKeypair: Ed25519Keypair
  let userAddress: string

  async function gasSponsorPayload(txBytes: string) {
    return { txBytes, senderAddress: userAddress }
  }

  // 完整單簽流程:/sponsor → 使用者簽交易 → /execute(額度在此扣)。
  async function sponsorThenExecute(txBytes: string) {
    const sponsorRes = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })
    if (sponsorRes.statusCode !== 200) return sponsorRes
    const { sponsoredTxBytes, sponsorSignature } = JSON.parse(sponsorRes.payload)
    const { signature: userSignature } = await userKeypair.signTransaction(
      new Uint8Array(Buffer.from(sponsoredTxBytes, 'base64'))
    )
    return server.inject({
      method: 'POST',
      url: '/api/gas/execute',
      payload: { sponsoredTxBytes, userSignature, sponsorSignature },
    })
  }

  beforeEach(async () => {
    process.env.SURVEY_PASS_ISSUER_PRIV = devIssuerPriv
    process.env.GAS_SPONSOR_PRIV_1 = devIssuerPriv
    process.env.GAS_SPONSOR_PRIV_2 = sponsorPriv2
    process.env.GAS_SPONSOR_PUBKEY_3 = coldPubkey3
    process.env.SUI_PACKAGE_ID = '0x0000000000000000000000000000000000000000000000000000000000000007'
    delete process.env.GAS_STATION_MODE
    delete process.env.GAS_STATION_URL
    __resetGasConfigCache()
    userKeypair = keypairFromHex(userPriv)
    userAddress = userKeypair.toSuiAddress()
    __resetSponsorState()
    __useInMemoryPassReservationsForTests()

    initializeDb()
    await __resetPlatformSponsorLedger()

    server = Fastify()
    await server.register(cors, { origin: true })

    // Mock SuiClient
    mockSuiClient = {
      getBalance: vi.fn().mockResolvedValue({ totalBalance: '500000000' }),
      getReferenceGasPrice: vi.fn().mockResolvedValue('1000'),
      getCoins: vi.fn().mockResolvedValue({
        data: [1, 2, 3, 4, 5].map((i) => ({
          coinObjectId: `0x${i.toString(16).padStart(64, '0')}`,
          version: '1',
          digest: '11111111111111111111111111111111',
          balance: '500000000',
        })),
        hasNextPage: false,
      }),
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              content: {
                dataType: 'moveObject',
                fields: { credential_sources: [6] },
              },
            },
          },
        ],
      }),
      dryRunTransactionBlock: vi.fn().mockResolvedValue({
        effects: {
          status: { status: 'success' },
          gasUsed: {
            computationCost: '1000000',
            storageCost: '500000',
            storageRebate: '100000',
          },
        },
      }),
      executeTransactionBlock: vi.fn().mockResolvedValue({
        digest: 'mock_exec_digest',
        effects: { status: { status: 'success' } },
      }),
      queryTransactionBlocks: vi.fn().mockResolvedValue({ data: [] }),
      // 預設模擬物件詳情
      getObject: vi.fn().mockImplementation(async ({ id }: { id: string }) => {
        if (id === '0x000000000000000000000000000000000000000000000000000000000000000a') {
          return {
            data: {
              objectId: id,
              content: {
                dataType: 'moveObject',
                fields: {
                  credential_sources: [6], // Google 登入
                },
              },
            },
          }
        }
        return {
          data: {
            objectId: id,
            content: {
              dataType: 'moveObject',
              fields: {
                gas_balance: '100000000', // 100M MIST (0.1 SUI)
                gas_compensation_amount: '5000000', // 5M MIST
                max_inline_answer_bytes: '6144',
              },
            },
          },
        }
      }),
      getNormalizedMoveFunction: vi.fn().mockImplementation(async ({ function: func }) => {
        if (func === 'claim') {
          return {
            visibility: 'Public',
            isEntry: false,
            typeParameters: [{ abilities: ['key'] }],
            parameters: [
              { MutableReference: { Struct: { address: PKG, module: 'survey_vault', name: 'SurveyVault', typeArguments: [] } } },
              { Reference: { Struct: { address: PKG, module: 'survey_registry', name: 'Survey', typeArguments: [] } } },
              'U8',
              'Bool',
              { Reference: { Struct: { address: PKG, module: 'survey_pass', name: 'SurveyPass', typeArguments: [] } } },
              'Bool',
              { Reference: { TypeParameter: 0 } },
              { Vector: { Vector: 'U8' } },
              { Reference: { Struct: { address: PKG, module: 'survey_pass', name: 'IssuerConfig', typeArguments: [] } } },
              { Vector: 'U8' },
              { Vector: 'U8' },
              'U64',
              { Struct: { address: '0x1', module: 'option', name: 'Option', typeArguments: [{ Vector: 'U8' }] } },
              { Struct: { address: '0x1', module: 'option', name: 'Option', typeArguments: [{ Vector: 'U8' }] } },
              { Reference: { Struct: { address: '0x2', module: 'clock', name: 'Clock', typeArguments: [] } } },
              { MutableReference: { Struct: { address: '0x2', module: 'tx_context', name: 'TxContext', typeArguments: [] } } }
            ],
            return_: []
          }
        }
        return {
          visibility: 'Public',
          isEntry: true,
          typeParameters: [],
          parameters: [
            { Reference: { Struct: { address: '0x0000000000000000000000000000000000000000000000000000000000000007', module: 'survey_pass', name: 'SurveyPass', typeArguments: [] } } },
            { MutableReference: { Struct: { address: '0x0000000000000000000000000000000000000000000000000000000000000002', module: 'tx_context', name: 'TxContext', typeArguments: [] } } }
          ],
          return_: []
        }
      }),
      multiGetObjects: vi.fn().mockImplementation(async ({ ids }: { ids: string[] }) => {
        return ids.map(id => {
          let type = '0x0000000000000000000000000000000000000000000000000000000000000007::survey_vault::SurveyVault'
          let owner: any = { Shared: { initial_shared_version: '1' } }
          if (id === '0x0000000000000000000000000000000000000000000000000000000000000009') {
            type = `${PKG}::survey_registry::Survey`
            owner = { Shared: { initial_shared_version: '1' } }
          } else if (id === '0x000000000000000000000000000000000000000000000000000000000000000a') {
            type = `${PKG}::survey_pass::SurveyPass`
            owner = { AddressOwner: '0x0000000000000000000000000000000000000000000000000000000000000003' }
          } else if (id === '0x0000000000000000000000000000000000000000000000000000000000000006' || id === '0x6') {
            type = '0x2::clock::Clock'
            owner = 'Shared'
          }
          return {
            data: {
              objectId: id,
              version: '1',
              digest: '11111111111111111111111111111111',
              type,
              owner
            }
          }
        })
      })
    }

    registerGasRoutes(server, { suiClient: mockSuiClient as any, packageId: '0x0000000000000000000000000000000000000000000000000000000000000007' })
  })

  afterEach(async () => {
    await server.close()
    __resetGasConfigCache()
    delete process.env.SURVEY_PASS_ISSUER_PRIV
    delete process.env.GAS_SPONSOR_PRIV_1
    delete process.env.GAS_SPONSOR_PRIV_2
    delete process.env.GAS_SPONSOR_PUBKEY_3
    delete process.env.MIN_PLATFORM_SPONSOR_TIER
    delete process.env.SUI_PACKAGE_ID
  })

  // 1. 審查：只允許 claim 呼叫
  it('should reject transactions that contain commands other than survey_vault::claim', async () => {
    const tx = new Transaction()
    // 構建一個非法的 MoveCall
    tx.moveCall({
      target: '0x0000000000000000000000000000000000000000000000000000000000000007::survey_pass::delete_pass',
      arguments: [
        tx.object('0x0000000000000000000000000000000000000000000000000000000000000009')
      ],
    })
    tx.setSender(userAddress)
    
    // 傳入 mockSuiClient 作為 build 參數
    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    // 目前 BFF 尚未實作審查，預期會通過 (500 或 200)，但在 Red 階段我們期望它被 reject (回傳 400)
    expect(response.statusCode).toBe(400)
    const data = JSON.parse(response.payload)
    expect(data.error).toBe('invalid_transaction_commands')
  })

  // 2. 限流：當金庫 Gas 不足時，限制同一錢包每日平台墊付最多 3 次
  it('should restrict daily platform sponsorships to 3 times per wallet when first-layer gas is insufficient', async () => {
    // 模擬金庫 Gas 餘額不足 (例如為 0)，同時保留 Pass 的憑證欄位
    mockSuiClient.getObject.mockImplementation(async ({ id }: { id: string }) => {
      if (id === '0x000000000000000000000000000000000000000000000000000000000000000a') {
        return {
          data: {
            objectId: id,
            content: {
              dataType: 'moveObject',
              fields: {
                credential_sources: [6], // Google
              },
            },
          },
        }
      }
      return {
        data: {
          objectId: '0x0000000000000000000000000000000000000000000000000000000000000008',
          content: {
            dataType: 'moveObject',
            fields: {
              gas_balance: '0',
              gas_compensation_amount: '5000000',
              max_inline_answer_bytes: '6144',
            },
          },
        },
      }
    })

    const tx = new Transaction()
    tx.moveCall({
      target: `${PKG}::survey_vault::claim`,
      typeArguments: [VOID_NFT_TYPE],
      arguments: unifiedClaimArgs(
        tx,
        '0x0000000000000000000000000000000000000000000000000000000000000008',
        '0x0000000000000000000000000000000000000000000000000000000000000009',
        '0x000000000000000000000000000000000000000000000000000000000000000a'
      ),
    })
    tx.setSender(userAddress)
    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    // 平台日額度在 /execute 階段(使用者交易簽章驗過後)遞增。前 3 次應成功廣播。
    for (let i = 0; i < 3; i++) {
      const response = await sponsorThenExecute(txBytes)
      expect(response.statusCode).toBe(200)
    }

    // 第 4 次:日額度用罄 → 403 / PLATFORM_SPONSOR_LIMIT_REACHED(/sponsor 唯讀檢查或 /execute 遞增任一處擋)
    const response4 = await sponsorThenExecute(txBytes)
    expect(response4.statusCode).toBe(403)
    const errData = JSON.parse(response4.payload)
    expect(errData.error).toBe('PLATFORM_SPONSOR_LIMIT_REACHED')
  })

  describe('Dynamic Gas Compensation Calculation', () => {
    beforeEach(() => {
      __resetDynamicGasCache()
      __resetGasConfigCache()
      delete process.env.MIN_GAS_COMPENSATION_AMOUNT
      delete process.env.GAS_COMPENSATION_AMOUNT
      delete process.env.GAS_BUDGET_CAP_MIST
    })

    it('should fallback to default minimum of 0.1 SUI (100000000 MIST) when no on-chain txs found', async () => {
      mockSuiClient.queryTransactionBlocks = vi.fn().mockResolvedValue({ data: [] })

      const response = await server.inject({
        method: 'GET',
        url: '/api/gas/health',
      })
      expect(response.statusCode).toBe(200)
      const resData = JSON.parse(response.payload)
      expect(resData.gasCompensationAmount).toBe('100000000')
    })

    it('should use MIN_GAS_COMPENSATION_AMOUNT from env if set and on-chain txs are missing or have low gas', async () => {
      process.env.MIN_GAS_COMPENSATION_AMOUNT = '8000000'
      process.env.GAS_BUDGET_CAP_MIST = '8000000'
      __resetGasConfigCache()
      mockSuiClient.queryTransactionBlocks = vi.fn().mockResolvedValue({ data: [] })
      
      const response = await server.inject({
        method: 'GET',
        url: '/api/gas/health',
      })
      expect(response.statusCode).toBe(200)
      const resData = JSON.parse(response.payload)
      expect(resData.gasCompensationAmount).toBe('8000000')
    })

    it('should support underscores and commas in env values', async () => {
      process.env.MIN_GAS_COMPENSATION_AMOUNT = '8_500_000'
      process.env.GAS_BUDGET_CAP_MIST = '8_500_000'
      __resetGasConfigCache()
      mockSuiClient.queryTransactionBlocks = vi.fn().mockResolvedValue({ data: [] })
      
      const response = await server.inject({
        method: 'GET',
        url: '/api/gas/health',
      })
      expect(response.statusCode).toBe(200)
      const resData = JSON.parse(response.payload)
      expect(resData.gasCompensationAmount).toBe('8500000')
    })

    it('should calculate dynamic compensation based on successful recent transactions', async () => {
      process.env.MIN_GAS_COMPENSATION_AMOUNT = '3000000'
      process.env.GAS_BUDGET_CAP_MIST = '3000000'
      __resetGasConfigCache()
      // Mock successful claim transactions with varying gas costs
      // Transaction 1: net gas = 4000000 + 1000000 - 500000 = 4500000 MIST
      // Transaction 2: net gas = 5000000 + 2000000 - 1000000 = 6000000 MIST (max)
      // Transaction 3 (failed): net gas = 9000000 (should be ignored)
      mockSuiClient.queryTransactionBlocks = vi.fn().mockResolvedValue({
        data: [
          {
            effects: {
              status: { status: 'success' },
              gasUsed: {
                computationCost: '4000000',
                storageCost: '1000000',
                storageRebate: '500000',
              },
            },
          },
          {
            effects: {
              status: { status: 'success' },
              gasUsed: {
                computationCost: '5000000',
                storageCost: '2000000',
                storageRebate: '1000000',
              },
            },
          },
          {
            effects: {
              status: { status: 'failure' },
              gasUsed: {
                computationCost: '8000000',
                storageCost: '2000000',
                storageRebate: '1000000',
              },
            },
          },
        ],
      })

      const response = await server.inject({
        method: 'GET',
        url: '/api/gas/health',
      })
      expect(response.statusCode).toBe(200)
      const resData = JSON.parse(response.payload)
      expect(resData.gasCompensationAmount).toBe('6000000')
    })

    it('should cache calculated dynamic gas and not call RPC repeatedly within cache window', async () => {
      process.env.MIN_GAS_COMPENSATION_AMOUNT = '3000000'
      process.env.GAS_BUDGET_CAP_MIST = '3000000'
      __resetGasConfigCache()
      mockSuiClient.queryTransactionBlocks = vi.fn().mockResolvedValue({
        data: [
          {
            effects: {
              status: { status: 'success' },
              gasUsed: {
                computationCost: '6000000',
                storageCost: '0',
                storageRebate: '0',
              },
            },
          },
        ],
      })

      // First call
      const response1 = await server.inject({
        method: 'GET',
        url: '/api/gas/health',
      })
      expect(JSON.parse(response1.payload).gasCompensationAmount).toBe('6000000')
      expect(mockSuiClient.queryTransactionBlocks).toHaveBeenCalledTimes(1)

      // Second call should hit cache and not invoke queryTransactionBlocks again
      const response2 = await server.inject({
        method: 'GET',
        url: '/api/gas/health',
      })
      expect(JSON.parse(response2.payload).gasCompensationAmount).toBe('6000000')
      expect(mockSuiClient.queryTransactionBlocks).toHaveBeenCalledTimes(1)
    })
  })
})
