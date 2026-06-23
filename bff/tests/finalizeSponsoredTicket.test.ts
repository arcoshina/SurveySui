import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import {
  createMultisigSponsorSigner,
  keypairFromHex,
  verifyPassTicketSignature,
} from '@surveysui/gas-station-core'
import {
  finalizeSponsoredPassTickets,
  applySignedPlaceholders,
} from '../src/pass/finalizeSponsoredTicket.js'
import { signTicket } from '../src/auth/ticket.js'

function readMintInput(tx: Transaction, argIndex: number): { Pure: { bytes: string } } {
  const call = tx.getData().commands[0].MoveCall!
  const arg = call.arguments[argIndex] as { $kind: string; Input: number }
  return tx.getData().inputs[arg.Input] as { Pure: { bytes: string } }
}

// 解析 mint_pass PTB 中 escape_clawback（arg index 8）的 u64 值。
function readMintClawback(tx: Transaction): bigint {
  const input = readMintInput(tx, 8)
  return BigInt(bcs.u64().parse(new Uint8Array(Buffer.from(input.Pure.bytes, 'base64'))))
}

// 解析 mint_pass PTB 中 bff_sig（arg index 9）的 vector<u8>。
function readMintSig(tx: Transaction): number[] {
  const input = readMintInput(tx, 9)
  return Array.from(bcs.vector(bcs.u8()).parse(new Uint8Array(Buffer.from(input.Pure.bytes, 'base64'))))
}

describe('finalizeSponsoredPassTickets', () => {
  const devIssuerPriv = '0101010101010101010101010101010101010101010101010101010101010101'
  const sponsorPriv2 = '0202020202020202020202020202020202020202020202020202020202020202'
  const sponsorPriv3 = '0303030303030303030303030303030303030303030303030303030303030303'
  const packageId = '0xec7cddee76702e0209aabad0c56a8a4c14583d0eaafda3ed52ddd962b216d9fd'
  const userPriv = '0404040404040404040404040404040404040404040404040404040404040404'

  let userAddress: string
  let sponsorAddress: string
  let mockSuiClient: {
    getNormalizedMoveFunction: ReturnType<typeof vi.fn>
    dryRunTransactionBlock: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    process.env.SURVEY_PASS_ISSUER_PRIV = devIssuerPriv
    process.env.GAS_SPONSOR_PRIV_1 = devIssuerPriv
    process.env.GAS_SPONSOR_PRIV_2 = sponsorPriv2
    process.env.GAS_SPONSOR_PUBKEY_3 = Buffer.from(
      keypairFromHex(sponsorPriv3).getPublicKey().toRawBytes()
    ).toString('hex')

    userAddress = Ed25519Keypair.fromSecretKey(
      new Uint8Array(Buffer.from(userPriv, 'hex')).slice(0, 32)
    ).getPublicKey().toSuiAddress()

    sponsorAddress = createMultisigSponsorSigner(
      devIssuerPriv,
      sponsorPriv2,
      Buffer.from(keypairFromHex(sponsorPriv3).getPublicKey().toRawBytes()).toString('hex'),
      2
    ).getSponsorAddress()

    mockSuiClient = {
      getReferenceGasPrice: vi.fn().mockResolvedValue('1000'),
      getCoins: vi.fn().mockResolvedValue({
        data: [
          {
            coinObjectId: '0x0000000000000000000000000000000000000000000000000000000000000001',
            version: '1',
            digest: '11111111111111111111111111111111',
            balance: '500000000',
          },
        ],
        hasNextPage: false,
      }),
      getNormalizedMoveFunction: vi.fn().mockImplementation(async ({ module: _module, function: _func }) => {
        const mintParams = [
          'Address',
          'Address',
          'Address',
          'Address',
          'U8',
          { Vector: 'U8' },
          { Vector: 'U8' },
          'U64',
          'U64',
          { Vector: 'U8' },
          'Address',
        ]
        return {
          visibility: 'Public',
          isEntry: false,
          typeParameters: [],
          parameters: mintParams,
          return_: [],
        }
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
    }
  })

  afterEach(() => {
    delete process.env.SURVEY_PASS_ISSUER_PRIV
    delete process.env.GAS_SPONSOR_PRIV_1
    delete process.env.GAS_SPONSOR_PRIV_2
    delete process.env.GAS_SPONSOR_PUBKEY_3
  })

  it('dry-runs sponsored mint and re-signs ticket with ceil(netGas * 110%) clawback', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 9
    const placeholder = await signTicket(userAddress, 2, [nullifier], new Uint8Array(0), Date.now() + 1_000_000, 0n)

    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000a'),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000b'),
        tx.pure.address(userAddress),
        tx.pure.address(sponsorAddress),
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64(placeholder.expires_at),
        tx.pure.u64('0'),
        tx.pure.vector('u8', Buffer.from(placeholder.bff_sig, 'hex')),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient as any, onlyTransactionKind: true })
    ).toString('base64')

    const { tickets } = await finalizeSponsoredPassTickets({
      suiClient: mockSuiClient as any,
      txBytes,
      senderAddress: userAddress,
    })

    expect(tickets).toHaveLength(1)
    expect(tickets[0].escape_clawback_mist).toBe('1540000')
    expect(tickets[0].bff_sig).not.toBe(placeholder.bff_sig)
  })

  // H1 回歸：偽造身分 ticket（source=5 Orb、自選 nullifier、亂簽的 bff_sig）送進 finalize
  // 必須在「原始簽章驗證閘門」被擋下，不得回傳任何合法重簽。
  it('rejects forged-identity ticket (H1): invalid origin bff_sig', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 42
    const forgedSig = new Uint8Array(64) // 非發行者簽章

    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000a'),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000b'),
        tx.pure.address(userAddress),
        tx.pure.address(sponsorAddress),
        tx.pure.u8(5), // 自稱 World ID Orb，最高信任層級
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64((Date.now() + 1_000_000).toString()),
        tx.pure.u64('0'),
        tx.pure.vector('u8', Array.from(forgedSig)),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient as any, onlyTransactionKind: true })
    ).toString('base64')

    await expect(
      finalizeSponsoredPassTickets({
        suiClient: mockSuiClient as any,
        txBytes,
        senderAddress: userAddress,
      })
    ).rejects.toMatchObject({ statusCode: 400 })
    // 偽造票不得觸發 dry-run（閘門在量 gas 前即擋下）
    expect(mockSuiClient.dryRunTransactionBlock).not.toHaveBeenCalled()
  })

  // H1 相關：合法票（簽給 userAddress）卻配上不同的 senderAddress，owner 不符 → 擋下。
  it('rejects ticket reuse under a different sender (owner mismatch)', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 11
    const legit = await signTicket(userAddress, 2, [nullifier], new Uint8Array(0), Date.now() + 1_000_000, 0n)
    const otherAddress = Ed25519Keypair.fromSecretKey(
      new Uint8Array(Buffer.from(sponsorPriv2, 'hex')).slice(0, 32)
    ).getPublicKey().toSuiAddress()

    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000a'),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000b'),
        tx.pure.address(otherAddress),
        tx.pure.address(sponsorAddress),
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64(legit.expires_at),
        tx.pure.u64('0'),
        tx.pure.vector('u8', Buffer.from(legit.bff_sig, 'hex')),
        tx.object('0x6'),
      ],
    })
    tx.setSender(otherAddress)
    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient as any, onlyTransactionKind: true })
    ).toString('base64')

    await expect(
      finalizeSponsoredPassTickets({
        suiClient: mockSuiClient as any,
        txBytes,
        senderAddress: otherAddress,
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  // 回歸測試（不依賴 mock dry-run）：placeholder 必須同時 (a) 真正寫入 clawback=1，
  // (b) 換上「對 clawback=1 重簽」的 bff_sig。缺 (a) → 合約 abort 13；缺 (b) → abort 1。
  // @mysten/sui 的 getData() 為唯讀快照，舊寫法靜默失效，故直接驗證寫入結果與驗章。
  it('applySignedPlaceholders 代付 mint：clawback=1 且 bff_sig 對 clawback=1 驗章通過', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 9
    const expiresAt = 9999999999999n
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000a'),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000b'),
        tx.pure.address(userAddress),
        tx.pure.address(sponsorAddress), // deposit_payer = sponsor → 代付
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64(expiresAt.toString()),
        tx.pure.u64('0'), // 原始 ticket clawback = 0
        tx.pure.vector('u8', [1, 2, 3]), // 原始 bff_sig（對 clawback=0 簽，此處僅佔位）
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    const kind = await tx.build({ client: mockSuiClient as any, onlyTransactionKind: true })

    const fromKind = Transaction.fromKind(Buffer.from(kind))
    const applied = await applySignedPlaceholders(fromKind, sponsorAddress, userAddress)

    // (a) clawback 真正寫成 1
    expect(readMintClawback(applied)).toBe(1n)

    // (b) bff_sig 已換成對 clawback=1 重簽，且以 issuer 公鑰驗章通過
    const issuerKeypair = Ed25519Keypair.fromSecretKey(
      new Uint8Array(Buffer.from(devIssuerPriv, 'hex')).slice(0, 32)
    )
    const verifyRes = await verifyPassTicketSignature(issuerKeypair, userAddress, {
      source: 2,
      nullifiers: [Array.from(nullifier)],
      commitment: [],
      expiresAt,
      escapeClawbackMist: 1n,
      bffSig: readMintSig(applied),
    })
    expect(verifyRes.ok).toBe(true)
  })

  it('applySignedPlaceholders 自付 mint：clawback 維持 0、bff_sig 不變', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 7
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000a'),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000b'),
        tx.pure.address(userAddress),
        tx.pure.address(userAddress), // deposit_payer = owner → 自付
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64('9999999999999'),
        tx.pure.u64('0'),
        tx.pure.vector('u8', [1, 2, 3]),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    const kind = await tx.build({ client: mockSuiClient as any, onlyTransactionKind: true })

    const fromKind = Transaction.fromKind(Buffer.from(kind))
    const applied = await applySignedPlaceholders(fromKind, sponsorAddress, userAddress)

    expect(readMintClawback(applied)).toBe(0n)
    expect(readMintSig(applied)).toEqual([1, 2, 3])
  })
})
