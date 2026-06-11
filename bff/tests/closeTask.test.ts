import { describe, it, expect } from 'vitest'
import { isCloseEligible } from '../src/purge/closeTask.js'
import { buildClosePtb } from '../src/purge/buildClosePtb.js'

const OBJ = (n: number) => `0x${n.toString(16).padStart(64, '0')}`

describe('isCloseEligible', () => {
  const deadline = 1_000_000n

  it('returns true for OPEN vault past deadline', () => {
    expect(isCloseEligible({ status: 0, deadlineMs: deadline }, deadline + 1n)).toBe(true)
  })

  it('returns false when still before deadline', () => {
    expect(isCloseEligible({ status: 0, deadlineMs: deadline }, deadline)).toBe(false)
  })

  it('returns false when vault is already closed', () => {
    expect(isCloseEligible({ status: 1, deadlineMs: deadline }, deadline + 1n)).toBe(false)
  })
})

describe('buildClosePtb', () => {
  it('issues survey_vault::close with vault and clock', () => {
    const tx = buildClosePtb({ packageId: OBJ(1), vaultId: OBJ(4) })
    const data = tx.getData() as { commands: { MoveCall?: { function: string } }[] }
    expect(data.commands.length).toBe(1)
    expect(data.commands[0].MoveCall?.function).toBe('close')
  })
})
