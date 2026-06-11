import { describe, it, expect, afterEach } from 'vitest'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import {
  applyCreatorRebateShare,
  computeRebateSurplus,
  netGasFromEffects,
  resolveGasBudget,
} from '../src/gas/gasMath.js'
import { buildPurgePtb } from '../src/purge/buildPurgePtb.js'
import {
  isRebateRefundEnabled,
  resolveRebateTransferDecision,
} from '../src/purge/rebateRefund.js'

const privHex = '0101010101010101010101010101010101010101010101010101010101010101'
const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(Buffer.from(privHex, 'hex')))
const sponsorAddress = keypair.getPublicKey().toSuiAddress()
const creatorAddress =
  '0x2222222222222222222222222222222222222222222222222222222222222222'

const OBJ = (n: number) => `0x${n.toString(16).padStart(64, '0')}`

const PURGE_IDS = {
  packageId: OBJ(1),
  registryId: OBJ(2),
  protocolConfigId: OBJ(5),
  surveyId: OBJ(3),
  vaultId: OBJ(4),
}

describe('gasMath', () => {
  it('netGasFromEffects is negative when rebate exceeds costs', () => {
    const net = netGasFromEffects({
      computationCost: '1000000',
      storageCost: '500000',
      storageRebate: '50000000',
    })
    expect(net).toBe(-48_500_000n)
  })

  it('computeRebateSurplus deducts buffer from negative net gas', () => {
    expect(computeRebateSurplus(-50_000_000n, 2_000_000n)).toBe(48_000_000n)
    expect(computeRebateSurplus(1_000_000n, 2_000_000n)).toBe(0n)
  })

  it('resolveGasBudget caps at max', () => {
    expect(resolveGasBudget(10_000_000n, 50_000_000n, 2_000_000n)).toBe(12_000_000n)
    expect(resolveGasBudget(60_000_000n, 50_000_000n, 2_000_000n)).toBe(50_000_000n)
  })

  it('applyCreatorRebateShare floors creator share in bps', () => {
    expect(applyCreatorRebateShare(48_000_000n, 5000)).toBe(24_000_000n)
    expect(applyCreatorRebateShare(48_000_000n, 10_000)).toBe(48_000_000n)
    expect(applyCreatorRebateShare(0n, 5000)).toBe(0n)
  })
})

describe('buildPurgePtb', () => {
  it('includes transfer when creator and amount are set', () => {
    const tx = buildPurgePtb({
      ...PURGE_IDS,
      creator: creatorAddress,
      transferAmount: 5_000_000n,
    })
    const data = tx.getData() as { commands: unknown[] }
    expect(data.commands.length).toBeGreaterThan(1)
  })
})

describe('resolveRebateTransferDecision', () => {
  const buffer = 2_000_000n
  const minTransfer = 1_000_000n
  const bigRebateNetGas = -50_000_000n

  it('skips when creator is the sponsor', () => {
    const d = resolveRebateTransferDecision({
      refundEnabled: true,
      creator: sponsorAddress,
      sponsorAddress,
      estimateNetGas: bigRebateNetGas,
      buffer,
      minTransfer,
    })
    expect(d.shouldTransfer).toBe(false)
    expect(d.transferAmount).toBe(0n)
  })

  it('transfers 50% surplus to creator on happy path', () => {
    const d = resolveRebateTransferDecision({
      refundEnabled: true,
      creator: creatorAddress,
      sponsorAddress,
      estimateNetGas: bigRebateNetGas,
      buffer,
      minTransfer,
      creatorShareBps: 5000,
    })
    expect(d.shouldTransfer).toBe(true)
    expect(d.grossSurplus).toBe(48_000_000n)
    expect(d.transferAmount).toBe(24_000_000n)
    expect(d.platformFee).toBe(24_000_000n)
    expect(d.creator).toBe(creatorAddress)
  })

  it('transfers when 50% share equals minimum', () => {
    const d = resolveRebateTransferDecision({
      refundEnabled: true,
      creator: creatorAddress,
      sponsorAddress,
      estimateNetGas: -4_000_000n,
      buffer,
      minTransfer,
      creatorShareBps: 5000,
    })
    expect(d.grossSurplus).toBe(2_000_000n)
    expect(d.shouldTransfer).toBe(true)
    expect(d.transferAmount).toBe(1_000_000n)
    expect(d.platformFee).toBe(1_000_000n)
  })

  it('skips when 50% share is below minimum', () => {
    const d = resolveRebateTransferDecision({
      refundEnabled: true,
      creator: creatorAddress,
      sponsorAddress,
      estimateNetGas: -3_500_000n,
      buffer,
      minTransfer,
      creatorShareBps: 5000,
    })
    expect(d.grossSurplus).toBe(1_500_000n)
    expect(d.shouldTransfer).toBe(false)
    expect(d.transferAmount).toBe(0n)
  })

  it('skips when surplus below minimum', () => {
    const d = resolveRebateTransferDecision({
      refundEnabled: true,
      creator: creatorAddress,
      sponsorAddress,
      estimateNetGas: -2_500_000n,
      buffer,
      minTransfer,
    })
    expect(d.shouldTransfer).toBe(false)
  })

  it('skips when refund disabled', () => {
    const d = resolveRebateTransferDecision({
      refundEnabled: false,
      creator: creatorAddress,
      sponsorAddress,
      estimateNetGas: bigRebateNetGas,
      buffer,
      minTransfer,
    })
    expect(d.shouldTransfer).toBe(false)
  })
})

describe('isRebateRefundEnabled', () => {
  const envBackup = { ...process.env }

  afterEach(() => {
    process.env = envBackup
  })

  it('defaults to true when unset', () => {
    delete process.env.PURGE_REBATE_REFUND_ENABLED
    expect(isRebateRefundEnabled()).toBe(true)
  })

  it('respects false', () => {
    process.env.PURGE_REBATE_REFUND_ENABLED = 'false'
    expect(isRebateRefundEnabled()).toBe(false)
  })
})
