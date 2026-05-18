import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Transaction } from '@mysten/sui/transactions'

import { buildApp } from '../src/app.js'
import { SbtService } from '../src/sbt/sbt-service.js'
import { NoOpSbtChainClient } from '../src/sbt/noop-chain-client.js'
import { SurveyService } from '../src/survey/survey-service.js'
import { NoOpSurveyChainClient } from '../src/survey/noop-chain-client.js'

// Mock admin-key module
vi.mock('../src/admin-key.js', () => ({
  loadAndVerifyAdminKey: () => ({
    keypair: {
      signTransaction: async () => ({ signature: 'mock_sponsor_sig_xyz' }),
    },
    address: '0x0000000000000000000000000000000000000000000000000000000000000001',
  }),
}))

const mockDryRun = vi.fn()
const mockGetCoins = vi.fn()
const mockSignAndExecute = vi.fn()
const mockWaitForTx = vi.fn()
const mockGetReferenceGasPrice = vi.fn().mockResolvedValue(1000n)

// Mock SuiClient
vi.mock('@mysten/sui/client', () => {
  return {
    SuiClient: vi.fn().mockImplementation(() => ({
      dryRunTransactionBlock: mockDryRun,
      getCoins: mockGetCoins,
      signAndExecuteTransaction: mockSignAndExecute,
      waitForTransaction: mockWaitForTx,
      getReferenceGasPrice: mockGetReferenceGasPrice,
    })),
  }
})

async function buildTestApp(): Promise<FastifyInstance> {
  // Set required process env variables
  process.env.SUI_PACKAGE_ID = '0x0000000000000000000000000000000000000000000000000000000000000001'
  process.env.PASS_REGISTRY_ID = '0x0000000000000000000000000000000000000000000000000000000000000002'

  return await buildApp({
    verifier: { verify: async () => ({ sub: 'sub', iss: 'iss', aud: 'aud', suiAddress: '0xuser' }) },
    googleClientId: 'google-client-id',
    googleRedirectUri: 'google-redirect-uri',
    sbtService: new SbtService(new NoOpSbtChainClient()),
    surveyService: new SurveyService(new NoOpSurveyChainClient()),
    adminSecret: 'admin-secret',
    logger: false,
  })
}

describe('Gas Route Endpoints — T2.3', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildTestApp()
  })

  afterAll(async () => {
    if (app) await app.close()
  })

  describe('POST /api/gas/sponsor', () => {
    it('should sponsor transaction and return 200 when dry-run simulation succeeds', async () => {
      // Mock getCoins to return a SUI coin with >0.05 SUI balance
      mockGetCoins.mockResolvedValue({
        data: [{
          coinObjectId: '0x0000000000000000000000000000000000000000000000000000000000000005',
          version: '1',
          digest: 'By57K239VdK1L3YdM3D9tZ9vQZpW3yTqJpS9n2t12c4A',
          balance: '100000000', // 0.1 SUI
        }],
      })

      // Mock dry-run to return success
      mockDryRun.mockResolvedValue({
        effects: {
          status: {
            status: 'success',
          },
        },
      })

      // Build a minimal transaction
      const tx = new Transaction()
      tx.moveCall({
        target: '0x1::test::hello',
        arguments: [],
      })
      const txBytes = await tx.build({ onlyTransactionKind: true })
      const txBase64 = Buffer.from(txBytes).toString('base64')

      const res = await app.inject({
        method: 'POST',
        url: '/api/gas/sponsor',
        payload: {
          txBytes: txBase64,
          senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000009',
        },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.sponsoredTxBytes).toBeDefined()
      expect(body.sponsorSignature).toBe('mock_sponsor_sig_xyz')
    })

    it('should reject sponsorship with 422 when dry-run simulation fails (MoveAbort/Duplication)', async () => {
      mockGetCoins.mockResolvedValue({
        data: [{
          coinObjectId: '0x0000000000000000000000000000000000000000000000000000000000000005',
          version: '1',
          digest: 'By57K239VdK1L3YdM3D9tZ9vQZpW3yTqJpS9n2t12c4A',
          balance: '100000000',
        }],
      })

      // Mock dry-run to return failure (e.g. Duplicate claim)
      mockDryRun.mockResolvedValue({
        effects: {
          status: {
            status: 'failure',
            error: 'MoveAbort(EAlreadyClaimed)',
          },
        },
      })

      const tx = new Transaction()
      tx.moveCall({
        target: '0x1::test::hello',
        arguments: [],
      })
      const txBytes = await tx.build({ onlyTransactionKind: true })
      const txBase64 = Buffer.from(txBytes).toString('base64')

      const res = await app.inject({
        method: 'POST',
        url: '/api/gas/sponsor',
        payload: {
          txBytes: txBase64,
          senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000009',
        },
      })

      expect(res.statusCode).toBe(422)
      const body = res.json()
      expect(body.error).toBe('dry_run_failed')
      expect(body.message).toBe('MoveAbort(EAlreadyClaimed)')
    })
  })

  describe('POST /api/pass/issue', () => {
    it('should issue SurveyPass and return 201 with object details', async () => {
      mockSignAndExecute.mockResolvedValue({
        digest: 'tx_issue_digest',
        objectChanges: [{
          type: 'created',
          objectType: '0x1::survey_pass::SurveyPass',
          objectId: '0x0000000000000000000000000000000000000000000000000000000000000007',
        }],
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/pass/issue',
        payload: {
          userAddress: '0x0000000000000000000000000000000000000000000000000000000000000009',
          email: 'respondent@example.com',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.txDigest).toBe('tx_issue_digest')
      expect(body.passObjectId).toBe('0x0000000000000000000000000000000000000000000000000000000000000007')
      expect(body.subHash).toBeDefined()
    })
  })
})
