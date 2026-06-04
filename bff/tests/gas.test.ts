import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Transaction } from '@mysten/sui/transactions'
import { registerGasRoutes, __resetDynamicGasCache } from '../src/gas/handler.js'

describe('BFF Gas Sponsor Endpoint Tests', () => {
  let server: any
  let mockSuiClient: any

  beforeEach(async () => {
    process.env.SURVEY_PASS_ISSUER_PRIV =
      '0101010101010101010101010101010101010101010101010101010101010101' // 32 bytes hex
    process.env.SUI_PACKAGE_ID = '0x0000000000000000000000000000000000000000000000000000000000000007'
    
    server = Fastify()
    await server.register(cors, { origin: true })

    // Mock SuiClient
    mockSuiClient = {
      getBalance: vi.fn().mockResolvedValue({ totalBalance: '100000000' }),
      getReferenceGasPrice: vi.fn().mockResolvedValue('1000'),
      getCoins: vi.fn().mockResolvedValue({
        data: [
          {
            coinObjectId: '0x0000000000000000000000000000000000000000000000000000000000000001',
            version: '1',
            digest: '11111111111111111111111111111111',
            balance: '50000000',
          },
        ],
      }),
      dryRunTransactionBlock: vi.fn().mockResolvedValue({
        effects: {
          status: { status: 'success' },
        },
      }),
      // 預設模擬金庫詳情：假設金庫 Gas 餘額足夠 (第一層代付有效)
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0x0000000000000000000000000000000000000000000000000000000000000008',
          content: {
            dataType: 'moveObject',
            fields: {
              gas_balance: '100000000', // 100M MIST (0.1 SUI)
              gas_compensation_amount: '5000000', // 5M MIST
            },
          },
        },
      }),
      getNormalizedMoveFunction: vi.fn().mockImplementation(async ({ function: func }) => {
        if (func === 'claim') {
          return {
            visibility: 'Public',
            isEntry: false,
            typeParameters: [],
            parameters: [
              { MutableReference: { Struct: { address: '0x0000000000000000000000000000000000000000000000000000000000000007', module: 'survey_vault', name: 'SurveyVault', typeArguments: [] } } },
              { Reference: { Struct: { address: '0x0000000000000000000000000000000000000000000000000000000000000007', module: 'survey_pass', name: 'SurveyPass', typeArguments: [] } } },
              { Vector: 'U8' },
              { Reference: { Struct: { address: '0x0000000000000000000000000000000000000000000000000000000000000002', module: 'clock', name: 'Clock', typeArguments: [] } } },
              { MutableReference: { Struct: { address: '0x0000000000000000000000000000000000000000000000000000000000000002', module: 'tx_context', name: 'TxContext', typeArguments: [] } } }
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
            type = '0x0000000000000000000000000000000000000000000000000000000000000007::survey_pass::SurveyPass'
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
    delete process.env.SURVEY_PASS_ISSUER_PRIV
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
    tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000003')
    
    // 傳入 mockSuiClient 作為 build 參數
    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: {
        txBytes,
        senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
      },
    })

    // 目前 BFF 尚未實作審查，預期會通過 (500 或 200)，但在 Red 階段我們期望它被 reject (回傳 400)
    expect(response.statusCode).toBe(400)
    const data = JSON.parse(response.payload)
    expect(data.error).toBe('invalid_transaction_commands')
  })

  // 2. 限流：當金庫 Gas 不足時，限制同一錢包每日平台墊付最多 3 次
  it('should restrict daily platform sponsorships to 3 times per wallet when first-layer gas is insufficient', async () => {
    // 模擬金庫 Gas 餘額不足 (例如為 0)
    mockSuiClient.getObject.mockResolvedValue({
      data: {
        objectId: '0x0000000000000000000000000000000000000000000000000000000000000008',
        content: {
          dataType: 'moveObject',
          fields: {
            gas_balance: '0',
            gas_compensation_amount: '5000000',
          },
        },
      },
    })

    const tx = new Transaction()
    tx.moveCall({
      target: '0x0000000000000000000000000000000000000000000000000000000000000007::survey_vault::claim',
      arguments: [
        tx.object('0x0000000000000000000000000000000000000000000000000000000000000008'), 
        tx.object('0x0000000000000000000000000000000000000000000000000000000000000009'), 
        tx.pure.vector('u8', []), 
        tx.object('0x0000000000000000000000000000000000000000000000000000000000000006')
      ],
    })
    tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000003')
    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    // 前 3 次請求應成功 (目前未實作次數限制會全部成功，但 TDD 目的是在完成實作後第 4 次失敗)
    for (let i = 0; i < 3; i++) {
      const response = await server.inject({
        method: 'POST',
        url: '/api/gas/sponsor',
        payload: { 
          txBytes, 
          senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003' 
        },
      })
      expect(response.statusCode).toBe(200)
    }

    // 第 4 次請求應失敗並回傳 403 / PLATFORM_SPONSOR_LIMIT_REACHED
    const response4 = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { 
        txBytes, 
        senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003' 
      },
    })

    expect(response4.statusCode).toBe(403)
    const errData = JSON.parse(response4.payload)
    expect(errData.error).toBe('PLATFORM_SPONSOR_LIMIT_REACHED')
  })

  describe('Dynamic Gas Compensation Calculation', () => {
    beforeEach(() => {
      __resetDynamicGasCache()
      delete process.env.MIN_GAS_COMPENSATION_AMOUNT
      delete process.env.GAS_COMPENSATION_AMOUNT
    })

    it('should fallback to default minimum of 0.005 SUI (5000000 MIST) when no on-chain txs found', async () => {
      mockSuiClient.queryTransactionBlocks = vi.fn().mockResolvedValue({ data: [] })
      
      const response = await server.inject({
        method: 'GET',
        url: '/api/gas/health',
      })
      expect(response.statusCode).toBe(200)
      const resData = JSON.parse(response.payload)
      expect(resData.gasCompensationAmount).toBe('5000000')
    })

    it('should use MIN_GAS_COMPENSATION_AMOUNT from env if set and on-chain txs are missing or have low gas', async () => {
      process.env.MIN_GAS_COMPENSATION_AMOUNT = '8000000'
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
