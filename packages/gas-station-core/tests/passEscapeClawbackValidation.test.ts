import { describe, it, expect, vi } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'
import { validatePassEscapeClawbackAfterDryRun } from '../src/passEscapeClawbackValidation.js'

const packageId = '0xec7cddee76702e0209aabad0c56a8a4c14583d0eaafda3ed52ddd962b216d9fd'
const sponsorAddress = '0x' + '22'.repeat(32)
const userAddress = '0x' + '11'.repeat(32)

// computation 1_000_000 + storage 500_000 - rebate 100_000 = 1_400_000 net gas。
// 110% = 1_540_000。修法後下限取 100%(netGas)，故 1_400_000~1_540_000 之間皆應通過。
const gasUsed = { computationCost: '1000000', storageCost: '500000', storageRebate: '100000' }

const mockClient = {
  getNormalizedMoveFunction: vi.fn().mockResolvedValue({
    visibility: 'Public',
    isEntry: false,
    typeParameters: [],
    parameters: [
      'Address', 'Address', 'Address', 'Address', 'U8',
      { Vector: 'U8' }, { Vector: 'U8' }, 'U64', 'U64', { Vector: 'U8' }, 'Address',
    ],
    return_: [],
  }),
}

async function buildSponsoredMintTxBytes(clawbackMist: bigint, depositPayer = sponsorAddress): Promise<string> {
  const nullifier = new Uint8Array(32)
  nullifier[0] = 9
  const tx = new Transaction()
  tx.moveCall({
    target: `${packageId}::survey_pass::mint_pass`,
    arguments: [
      tx.object('0x' + '0a'.repeat(32)),
      tx.object('0x' + '0b'.repeat(32)),
      tx.pure.address(userAddress),
      tx.pure.address(depositPayer),
      tx.pure.u8(2),
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
      tx.pure.vector('u8', []),
      tx.pure.u64('9999999999999'),
      tx.pure.u64(clawbackMist.toString()),
      tx.pure.vector('u8', [1, 2, 3]),
      tx.object('0x6'),
    ],
  })
  tx.setSender(userAddress)
  return Buffer.from(await tx.build({ client: mockClient as any, onlyTransactionKind: true })).toString('base64')
}

describe('validatePassEscapeClawbackAfterDryRun', () => {
  it('接受 clawback == 實際淨 gas（100%，舊 110% 門檻會誤拒）', async () => {
    const txBytes = await buildSponsoredMintTxBytes(1_400_000n)
    const res = validatePassEscapeClawbackAfterDryRun({ txBytes, sponsorAddress, gasUsed })
    expect(res.ok).toBe(true)
  })

  it('接受 clawback == 110%（finalize 實際簽入值）', async () => {
    const txBytes = await buildSponsoredMintTxBytes(1_540_000n)
    const res = validatePassEscapeClawbackAfterDryRun({ txBytes, sponsorAddress, gasUsed })
    expect(res.ok).toBe(true)
  })

  it('拒絕 clawback < 實際淨 gas', async () => {
    const txBytes = await buildSponsoredMintTxBytes(1_399_999n)
    const res = validatePassEscapeClawbackAfterDryRun({ txBytes, sponsorAddress, gasUsed })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('escape_clawback_too_low')
  })

  it('拒絕代付 mint 的 clawback = 0', async () => {
    const txBytes = await buildSponsoredMintTxBytes(0n)
    const res = validatePassEscapeClawbackAfterDryRun({ txBytes, sponsorAddress, gasUsed })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('invalid_escape_clawback')
  })
})
