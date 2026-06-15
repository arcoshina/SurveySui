import { describe, it, expect, vi } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { bcs } from '@mysten/sui/bcs'
import { createMultisigSponsorSigner, keypairFromHex } from '../src/signerBackend.js'
import { validateSponsorTransaction } from '../src/sponsorTxValidation.js'

const PKG = '0x0000000000000000000000000000000000000000000000000000000000000007'
const ISSUER_PRIV = '0101010101010101010101010101010101010101010101010101010101010101'
const SPONSOR_PRIV2 = '0202020202020202020202020202020202020202020202020202020202020202'
const SPONSOR_PRIV3 = '0303030303030303030303030303030303030303030303030303030303030303'
const USER = '0x0000000000000000000000000000000000000000000000000000000000000003'
const VAULT = '0x0000000000000000000000000000000000000000000000000000000000000008'

function issuerKeypair(): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(new Uint8Array(Buffer.from(ISSUER_PRIV, 'hex')).slice(0, 32))
}

function sponsorAddress(): string {
  const coldPub = Buffer.from(keypairFromHex(SPONSOR_PRIV3).getPublicKey().toRawBytes()).toString('hex')
  return createMultisigSponsorSigner(ISSUER_PRIV, SPONSOR_PRIV2, coldPub, 2).getSponsorAddress()
}

function mockSuiClient(vaultFields: Record<string, string>) {
  return {
    getObject: vi.fn().mockResolvedValue({
      data: {
        content: {
          fields: vaultFields,
        },
      },
    }),
    getNormalizedMoveFunction: vi.fn().mockImplementation(
      async ({ module, function: func }: { module: string; function: string }) => {
        const base = {
          visibility: 'Public' as const,
          isEntry: false,
          typeParameters: [] as string[],
          return_: [] as string[],
        }
        if (module === 'survey_pass' && func === 'update_pass_credential') {
          return {
            ...base,
            parameters: [
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
            ],
          }
        }
        if (module === 'survey_vault' && func === 'claim') {
          return { ...base, parameters: Array(15).fill('Address') }
        }
        return { ...base, parameters: Array(10).fill('Address') }
      }
    ),
  }
}

describe('validateSponsorTransaction', () => {
  it('rejects unauthorized modules', async () => {
    const tx = new Transaction()
    tx.moveCall({
      target: `${PKG}::survey_registry::create_survey`,
      arguments: [],
    })
    tx.setSender(USER)
    const txBytes = Buffer.from(await tx.build({ onlyTransactionKind: true })).toString('base64')

    const result = await validateSponsorTransaction({
      txBytes,
      senderAddress: USER,
      packageId: PKG,
      sponsorAddress: sponsorAddress(),
      suiClient: mockSuiClient({}) as any,
      ticketIssuerKeypair: issuerKeypair(),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('invalid_transaction_commands')
    }
  })

  it('rejects mixed pass and claim commands', async () => {
    const tx = new Transaction()
    tx.moveCall({
      target: `${PKG}::survey_pass::update_pass_credential`,
      arguments: [
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000e'),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000a'),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000b'),
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[1]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64('9999999999999'),
        tx.pure.u64('0'),
        tx.pure.vector('u8', Array.from(new Uint8Array(64))),
        tx.object('0x6'),
      ],
    })
    tx.moveCall({
      target: `${PKG}::survey_vault::claim`,
      arguments: [
        tx.object(VAULT),
        tx.object('0x0000000000000000000000000000000000000000000000000000000000000009'),
        tx.pure.u8(0),
        tx.pure.bool(true),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000c'),
        tx.pure.bool(false),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000d'),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([]).toBytes()),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000b'),
        tx.pure.vector('u8', []),
        tx.pure.vector('u8', []),
        tx.pure.u64(0),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.object('0x6'),
      ],
    })
    tx.setSender(USER)
    const mockClient = mockSuiClient({}) as any
    const txBytes = Buffer.from(
      await tx.build({ client: mockClient, onlyTransactionKind: true })
    ).toString('base64')

    const result = await validateSponsorTransaction({
      txBytes,
      senderAddress: USER,
      packageId: PKG,
      sponsorAddress: sponsorAddress(),
      suiClient: mockClient,
      ticketIssuerKeypair: issuerKeypair(),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/Cannot mix/)
    }
  })

  it('derives isPlatformSponsor from vault gas balance for claim PTB', async () => {
    const tx = new Transaction()
    tx.moveCall({
      target: `${PKG}::survey_vault::claim`,
      arguments: [
        tx.object(VAULT),
        tx.object('0x0000000000000000000000000000000000000000000000000000000000000009'),
        tx.pure.u8(0),
        tx.pure.bool(false),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000c'),
        tx.pure.bool(false),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000d'),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([]).toBytes()),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000b'),
        tx.pure.vector('u8', []),
        tx.pure.vector('u8', []),
        tx.pure.u64(0),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.object('0x6'),
      ],
    })
    tx.setSender(USER)
    const mockClient = mockSuiClient({
      gas_balance: '0',
      gas_compensation_amount: '5000000',
      max_inline_answer_bytes: '6144',
    }) as any
    const txBytes = Buffer.from(
      await tx.build({ client: mockClient, onlyTransactionKind: true })
    ).toString('base64')

    const result = await validateSponsorTransaction({
      txBytes,
      senderAddress: USER,
      packageId: PKG,
      sponsorAddress: sponsorAddress(),
      suiClient: mockClient,
      ticketIssuerKeypair: issuerKeypair(),
      options: { enforcePlatformQuota: false, enforcePlatformTier: false },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.isPlatformSponsor).toBe(true)
      expect(result.pipelineContext.isPassSponsor).toBe(false)
    }
  })

  it('rejects vault-insufficient claim with 409 when platformClaimEnabled is false', async () => {
    const tx = new Transaction()
    tx.moveCall({
      target: `${PKG}::survey_vault::claim`,
      arguments: [
        tx.object(VAULT),
        tx.object('0x0000000000000000000000000000000000000000000000000000000000000009'),
        tx.pure.u8(0),
        tx.pure.bool(false),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000c'),
        tx.pure.bool(false),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000d'),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([]).toBytes()),
        tx.object('0x000000000000000000000000000000000000000000000000000000000000000b'),
        tx.pure.vector('u8', []),
        tx.pure.vector('u8', []),
        tx.pure.u64(0),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.object('0x6'),
      ],
    })
    tx.setSender(USER)
    const mockClient = mockSuiClient({
      gas_balance: '0',
      gas_compensation_amount: '5000000',
      max_inline_answer_bytes: '6144',
    }) as any
    const txBytes = Buffer.from(
      await tx.build({ client: mockClient, onlyTransactionKind: true })
    ).toString('base64')

    const result = await validateSponsorTransaction({
      txBytes,
      senderAddress: USER,
      packageId: PKG,
      sponsorAddress: sponsorAddress(),
      suiClient: mockClient,
      ticketIssuerKeypair: issuerKeypair(),
      options: { platformClaimEnabled: false, enforcePlatformQuota: false, enforcePlatformTier: false },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(409)
      expect(result.error).toBe('vault_gas_insufficient')
    }
  })

})
