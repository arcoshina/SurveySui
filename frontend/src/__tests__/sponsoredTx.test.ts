import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SuiClient } from '@mysten/sui/client'
import { buildClaimPtb, dryRunAndSponsorTx, executeSponsoredTx } from '../lib/sponsoredTx'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Sponsored Transactions Utility — T2.2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const pkgId = '0x0000000000000000000000000000000000000000000000000000000000000001'
  const vaultId = '0x0000000000000000000000000000000000000000000000000000000000000002'
  const passId = '0x0000000000000000000000000000000000000000000000000000000000000003'

  describe('buildClaimPtb', () => {
    it('should build a transaction block with correct move call details', () => {
      const tx = buildClaimPtb({
        packageId: pkgId,
        vaultId: vaultId,
        passId: passId,
        encryptedAnswers: '112233',
      })

      const data = tx.getData()
      expect(data.commands).toHaveLength(1)
      const command = data.commands[0]
      expect(command.$kind).toBe('MoveCall')
      if (command.$kind === 'MoveCall') {
        expect(command.MoveCall.function).toBe('claim')
        expect(command.MoveCall.package).toBe(pkgId)
        expect(command.MoveCall.module).toBe('survey_vault')
      }
    })
  })

  describe('dryRunAndSponsorTx', () => {
    const mockClient = {} as unknown as SuiClient

    it('should throw DRY_RUN_REJECTED error when backend returns 422', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ error: 'dry_run_failed', message: 'Vault is closed' }),
      })

      // Use mocked Transaction so we don't try to build a real one with empty client
      const tx = {
        setSender: vi.fn(),
        build: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      } as unknown as any

      await expect(
        dryRunAndSponsorTx({
          tx,
          senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000004',
          client: mockClient,
        })
      ).rejects.toThrow('DRY_RUN_REJECTED: Vault is closed')
    })

    it('should return sponsored tx bytes and signature when backend returns 200', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          sponsoredTxBytes: 'dGVzdGJ5dGVz',
          sponsorSignature: 'sponsorsig123',
        }),
      })

      const tx = {
        setSender: vi.fn(),
        build: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      } as unknown as any

      const result = await dryRunAndSponsorTx({
        tx,
        senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000004',
        client: mockClient,
      })

      expect(result.sponsoredTxBytes).toBe('dGVzdGJ5dGVz')
      expect(result.sponsorSignature).toBe('sponsorsig123')
    })
  })

  describe('executeSponsoredTx', () => {
    it('should execute transaction block with user and sponsor signatures', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ digest: 'tx_digest_xyz' })
      const client = {
        executeTransactionBlock: mockExecute,
      } as unknown as SuiClient

      const result = await executeSponsoredTx({
        client,
        sponsoredTxBytes: 'dGVzdGJ5dGVz',
        userSignature: 'user_sig',
        sponsorSignature: 'sponsor_sig',
      })

      expect(result.digest).toBe('tx_digest_xyz')
      expect(mockExecute).toHaveBeenCalledWith({
        transactionBlock: 'dGVzdGJ5dGVz',
        signature: ['user_sig', 'sponsor_sig'],
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      })
    })
  })
})
