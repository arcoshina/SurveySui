import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { bcs } from '@mysten/sui/bcs'
import { registerGasRoutes } from '../src/gas/handler.js'
import { __resetGasConfigCache } from '../src/gas/gasConfig.js'
import { __resetSponsorState } from '../src/gas/sponsorLedger.js'
import { __resetPlatformSponsorLedger } from '../src/gas/platformSponsorLedger.js'
import { signTicket } from '../src/auth/ticket.js'
import { initializeDb } from '../src/security/db.js'

describe('BFF Gas Sponsor for SurveyPass Tests', () => {
  let server: any
  let mockSuiClient: any

  const devIssuerPriv = '0101010101010101010101010101010101010101010101010101010101010101'
  const packageId = '0xec7cddee76702e0209aabad0c56a8a4c14583d0eaafda3ed52ddd962b216d9fd'
  const userAddress = '0x0000000000000000000000000000000000000000000000000000000000000003'
  const registryId = '0x000000000000000000000000000000000000000000000000000000000000000a'
  const configId = '0x000000000000000000000000000000000000000000000000000000000000000b'

  // Sponsor address derived from the dev issuer key (mirrors handler logic).
  const sponsorAddress = Ed25519Keypair.fromSecretKey(
    new Uint8Array(Buffer.from(devIssuerPriv, 'hex')).slice(0, 32)
  )
    .getPublicKey()
    .toSuiAddress()

  const sponsorCoinBalance = '500000000'

  beforeEach(async () => {
    process.env.SURVEY_PASS_ISSUER_PRIV = devIssuerPriv
    process.env.SUI_PACKAGE_ID = packageId
    delete process.env.GAS_STATION_MODE
    delete process.env.GAS_STATION_URL
    __resetGasConfigCache()

    __resetSponsorState()
    initializeDb()
    await __resetPlatformSponsorLedger()

    server = Fastify()
    await server.register(cors, { origin: true })

    mockSuiClient = {
      queryTransactionBlocks: vi.fn().mockResolvedValue({ data: [], hasNextPage: false }),
      getReferenceGasPrice: vi.fn().mockResolvedValue('1000'),
      getCoins: vi.fn().mockResolvedValue({
        data: [1, 2, 3, 4, 5].map((i) => ({
          coinObjectId: `0x${i.toString(16).padStart(64, '0')}`,
          version: '1',
          digest: '11111111111111111111111111111111',
          balance: sponsorCoinBalance,
        })),
        hasNextPage: false,
      }),
      getOwnedObjects: vi.fn().mockResolvedValue({ data: [] }),
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
      getNormalizedMoveFunction: vi.fn().mockImplementation(async ({ module, function: func }) => {
        if (module === 'survey_pass' && (func === 'mint_pass' || func === 'mint_pass_with_extra_credentials')) {
          const mintParams = [
            { MutableReference: { Struct: { address: packageId, module: 'survey_pass', name: 'NullifierRegistry', typeArguments: [] } } },
            { Reference: { Struct: { address: packageId, module: 'survey_pass', name: 'IssuerConfig', typeArguments: [] } } },
            'Address',
            'Address',
            'U8',
            { Vector: 'U8' },
            { Vector: 'U8' },
            'U64',
            { Vector: 'U8' },
          ]
          if (func === 'mint_pass_with_extra_credentials') {
            mintParams.push(
              { Vector: 'U8' },
              { Vector: { Vector: { Vector: 'U8' } } },
              { Vector: { Vector: 'U8' } },
              { Vector: 'U64' },
              { Vector: { Vector: 'U8' } }
            )
          }
          mintParams.push(
            { Reference: { Struct: { address: '0x2', module: 'clock', name: 'Clock', typeArguments: [] } } },
            { MutableReference: { Struct: { address: '0x2', module: 'tx_context', name: 'TxContext', typeArguments: [] } } }
          )
          return {
            visibility: 'Public',
            isEntry: false,
            typeParameters: [],
            parameters: mintParams,
            return_: [],
          }
        }
        if (module === 'survey_pass' && func === 'update_pass_credential') {
          return {
            visibility: 'Public',
            isEntry: false,
            typeParameters: [],
            parameters: [
              { MutableReference: { Struct: { address: packageId, module: 'survey_pass', name: 'SurveyPass', typeArguments: [] } } },
              { MutableReference: { Struct: { address: packageId, module: 'survey_pass', name: 'NullifierRegistry', typeArguments: [] } } },
              { Reference: { Struct: { address: packageId, module: 'survey_pass', name: 'IssuerConfig', typeArguments: [] } } },
              'U8',
              { Vector: 'U8' },
              { Vector: 'U8' },
              'U64',
              { Vector: 'U8' },
              { Reference: { Struct: { address: '0x2', module: 'clock', name: 'Clock', typeArguments: [] } } },
              { MutableReference: { Struct: { address: '0x2', module: 'tx_context', name: 'TxContext', typeArguments: [] } } },
            ],
            return_: [],
          }
        }
        if (module === 'survey_vault' && func === 'claim') {
          return {
            visibility: 'Public',
            isEntry: false,
            typeParameters: [],
            parameters: [
              { MutableReference: { Struct: { address: packageId, module: 'survey_vault', name: 'SurveyVault', typeArguments: [] } } },
              { Reference: { Struct: { address: packageId, module: 'survey_registry', name: 'Survey', typeArguments: [] } } },
              { Reference: { Struct: { address: packageId, module: 'survey_pass', name: 'SurveyPass', typeArguments: [] } } },
              { Struct: { address: '0x1', module: 'option', name: 'Option', typeArguments: [{ Vector: 'U8' }] } },
              { Struct: { address: '0x1', module: 'option', name: 'Option', typeArguments: [{ Vector: 'U8' }] } },
              { Reference: { Struct: { address: '0x2', module: 'clock', name: 'Clock', typeArguments: [] } } },
              { MutableReference: { Struct: { address: '0x2', module: 'tx_context', name: 'TxContext', typeArguments: [] } } }
            ],
            return_: []
          }
        }
        if (module === 'survey_vault' && func === 'claim_with_ticket') {
          return {
            visibility: 'Public',
            isEntry: false,
            typeParameters: [],
            parameters: [
              { MutableReference: { Struct: { address: packageId, module: 'survey_vault', name: 'SurveyVault', typeArguments: [] } } },
              { Reference: { Struct: { address: packageId, module: 'survey_pass', name: 'IssuerConfig', typeArguments: [] } } },
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
        if (module === 'survey_vault' && func === 'claim_with_nft_marking') {
          return {
            visibility: 'Public',
            isEntry: false,
            typeParameters: [{ abilities: ['key'] }],
            parameters: [
              { MutableReference: { Struct: { address: packageId, module: 'survey_vault', name: 'SurveyVault', typeArguments: [] } } },
              { Reference: { TypeParameter: 0 } },
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
          isEntry: false,
          typeParameters: [],
          parameters: Array(10).fill('Struct'),
          return_: []
        }
      }),
      multiGetObjects: vi.fn().mockImplementation(async ({ ids }: { ids: string[] }) => {
        return ids.map(id => {
          let type = `${packageId}::survey_pass::NullifierRegistry`
          let owner: any = { Shared: { initial_shared_version: '1' } }
          if (id === configId) {
            type = `${packageId}::survey_pass::IssuerConfig`
            owner = { AddressOwner: '0x0000000000000000000000000000000000000000000000000000000000000003' }
          } else if (id === '0x6' || id === '0x0000000000000000000000000000000000000000000000000000000000000006') {
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
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0x0000000000000000000000000000000000000000000000000000000000000008',
          content: {
            dataType: 'moveObject',
            fields: {
              gas_balance: '100000000',
              gas_compensation_amount: '5000000',
              storage_compensation_amount: '0',
              max_inline_answer_bytes: '6144',
            },
          },
        },
      }),
    }

    registerGasRoutes(server, { suiClient: mockSuiClient as any, packageId })
  })

  afterEach(async () => {
    await server.close()
    __resetSponsorState()
    await __resetPlatformSponsorLedger()
    __resetGasConfigCache()
    delete process.env.SURVEY_PASS_ISSUER_PRIV
    delete process.env.SUI_PACKAGE_ID
    delete process.env.MAX_PLATFORM_CLAIM_GAS_MIST
    delete process.env.MIN_PLATFORM_SPONSOR_TIER
  })

  // Helper: build a queryTransactionBlocks result page with N sponsored pass txs.
  function sponsoredTxPage(count: number, status: 'success' | 'failure' = 'success') {
    const data = Array.from({ length: count }, () => ({
      digest: '11111111111111111111111111111111',
      transaction: {
        data: {
          gasData: { owner: sponsorAddress },
          transaction: {
            // Matches real Sui RPC shape: commands live under `transactions`.
            transactions: [{ MoveCall: { module: 'survey_pass', function: 'mint_pass', package: packageId } }],
          },
        },
      },
      effects: { status: { status } },
    }))
    return { data, hasNextPage: false, nextCursor: null }
  }

  function hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
    const bytes = new Uint8Array(cleanHex.length / 2)
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16)
    }
    return bytes
  }

  it('should reject mint_pass if ticket signature is invalid', async () => {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object(registryId),
        tx.object(configId),
        tx.pure.address(userAddress),
        tx.pure.address(sponsorAddress), // deposit_payer（代付鑄造須 == sponsor）
        tx.pure.u8(2), // source
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...new Uint8Array(32)]]).toBytes()), // nullifiers vector<vector<u8>>
        tx.pure.vector('u8', []), // commitment
        tx.pure.u64('9999999999999'), // expires_at
        tx.pure.vector('u8', Array.from(new Uint8Array(64))), // INVALID bffSig
        tx.object('0x6'), // Clock
      ],
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: {
        txBytes,
        senderAddress: userAddress,
      },
    })

    console.log('REJECT TEST PAYLOAD:', response.payload)
    expect(response.statusCode).toBe(400)
    const data = JSON.parse(response.payload)
    expect(data.error).toBe('invalid_ticket_signature')
  })

  it('should accept valid mint_pass and enforce 2-time lifetime limit', async () => {
    // 1. Generate a valid ticket signature using the Dev Issuer Key
    const nullifier = new Uint8Array(32)
    nullifier[0] = 9
    const expiresAtMs = Date.now() + 1000000

    const ticket = await signTicket(
      userAddress,
      2, // SRC_EMAIL
      [nullifier], // nullifiers array（1-element for Email OTP）
      new Uint8Array(0),
      expiresAtMs
    )

    const buildValidTx = () => {
      const tx = new Transaction()
      tx.moveCall({
        target: `${packageId}::survey_pass::mint_pass`,
        arguments: [
          tx.object(registryId),
          tx.object(configId),
          tx.pure.address(userAddress),
          tx.pure.address(sponsorAddress), // deposit_payer
          tx.pure.u8(2),
          tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()), // vector<vector<u8>>
          tx.pure.vector('u8', []),
          tx.pure.u64(ticket.expires_at),
          tx.pure.vector('u8', Array.from(hexToBytes(ticket.bff_sig))),
          tx.object('0x6'),
        ],
      })
      tx.setSender(userAddress)
      return tx
    }

    const txBytes = Buffer.from(await buildValidTx().build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    // Request 1: should succeed (200)
    const response1 = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })
    console.log('ACCEPT TEST PAYLOAD:', response1.payload)
    expect(response1.statusCode).toBe(200)
    expect(JSON.parse(response1.payload)).toHaveProperty('sponsorSignature')

    // Request 2: should succeed (200)
    const response2 = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })
    expect(response2.statusCode).toBe(200)

    // Request 3: should fail with 403 PLATFORM_SPONSOR_LIMIT_REACHED
    const response3 = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })
    expect(response3.statusCode).toBe(403)
    expect(JSON.parse(response3.payload).error).toBe('PLATFORM_SPONSOR_LIMIT_REACHED')
  })

  it('should reject sponsored mint_pass whose deposit_payer is not the sponsor', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 11
    const ticket = await signTicket(userAddress, 2, [nullifier], new Uint8Array(0), Date.now() + 1000000)

    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object(registryId),
        tx.object(configId),
        tx.pure.address(userAddress),
        tx.pure.address(userAddress), // ⚠️ deposit_payer = 使用者自己（試圖事後自刪盜取返還）
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64(ticket.expires_at),
        tx.pure.vector('u8', Array.from(hexToBytes(ticket.bff_sig))),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    const res = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload).error).toBe('invalid_deposit_payer')
  })

  async function buildBatchMintExtraTx(opts?: { invalidExtraSig?: boolean }) {
    const googleNull = new Uint8Array(32)
    googleNull[0] = 20
    const emailNull = new Uint8Array(32)
    emailNull[0] = 21

    const googleTicket = await signTicket(userAddress, 6, [googleNull], new Uint8Array(0), Date.now() + 1_000_000)
    const emailTicket = await signTicket(userAddress, 2, [emailNull], new Uint8Array(0), Date.now() + 1_000_000)

    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass_with_extra_credentials`,
      arguments: [
        tx.object(registryId),
        tx.object(configId),
        tx.pure.address(userAddress),
        tx.pure.address(sponsorAddress),
        tx.pure.u8(6), // SRC_SOCIAL_GOOGLE
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...googleNull]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64(googleTicket.expires_at),
        tx.pure.vector('u8', Array.from(hexToBytes(googleTicket.bff_sig))),
        tx.pure(bcs.vector(bcs.u8()).serialize([2]).toBytes()), // SRC_EMAIL
        tx.pure(
          bcs
            .vector(bcs.vector(bcs.vector(bcs.u8())))
            .serialize([[Array.from(emailNull)]])
            .toBytes()
        ),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[]]).toBytes()),
        tx.pure(bcs.vector(bcs.u64()).serialize([emailTicket.expires_at]).toBytes()),
        tx.pure(
          bcs
            .vector(bcs.vector(bcs.u8()))
            .serialize([
              opts?.invalidExtraSig
                ? Array.from(new Uint8Array(64))
                : Array.from(hexToBytes(emailTicket.bff_sig)),
            ])
            .toBytes()
        ),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    return tx
  }

  it('should accept mint_pass_with_extra_credentials when all tickets are valid', async () => {
    const txBytes = Buffer.from(
      await buildBatchMintExtraTx().then((tx) => tx.build({ client: mockSuiClient, onlyTransactionKind: true }))
    ).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toHaveProperty('sponsorSignature')
  })

  it('should reject mint_pass_with_extra_credentials when an extra ticket signature is invalid', async () => {
    const txBytes = Buffer.from(
      await buildBatchMintExtraTx({ invalidExtraSig: true }).then((tx) =>
        tx.build({ client: mockSuiClient, onlyTransactionKind: true })
      )
    ).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).error).toBe('invalid_ticket_signature')
  })

  it('should reject dual update_pass_credential when the second ticket signature is invalid', async () => {
    const passObjectId = '0x000000000000000000000000000000000000000000000000000000000000000c'
    const null1 = new Uint8Array(32)
    null1[0] = 30
    const null2 = new Uint8Array(32)
    null2[0] = 31
    const ticket1 = await signTicket(userAddress, 6, [null1], new Uint8Array(0), Date.now() + 1_000_000)
    const ticket2 = await signTicket(userAddress, 2, [null2], new Uint8Array(0), Date.now() + 1_000_000)

    const tx = new Transaction()
    const passObj = tx.object(passObjectId)
    for (const [ticket, nullifier, invalid] of [
      [ticket1, null1, false],
      [ticket2, null2, true],
    ] as const) {
      tx.moveCall({
        target: `${packageId}::survey_pass::update_pass_credential`,
        arguments: [
          passObj,
          tx.object(registryId),
          tx.object(configId),
          tx.pure.u8(ticket.source),
          tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
          tx.pure.vector('u8', []),
          tx.pure.u64(ticket.expires_at),
          tx.pure.vector(
            'u8',
            invalid ? Array.from(new Uint8Array(64)) : Array.from(hexToBytes(ticket.bff_sig))
          ),
          tx.object('0x6'),
        ],
      })
    }
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).error).toBe('invalid_ticket_signature')
  })

  it('should report count 0 / remaining 2 when there is no on-chain history', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/gas/sponsor-count?address=${userAddress}`,
    })
    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.payload)
    expect(data.count).toBe(0)
    expect(data.maxLimit).toBe(2)
    expect(data.remaining).toBe(2)
  })

  it('should derive sponsor count from on-chain history', async () => {
    // One sponsored pass tx already landed on chain → count 1, remaining 1
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(sponsoredTxPage(1))

    const res = await server.inject({
      method: 'GET',
      url: `/api/gas/sponsor-count?address=${userAddress}`,
    })
    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.payload)
    expect(data.count).toBe(1)
    expect(data.maxLimit).toBe(2)
    expect(data.remaining).toBe(1)
  })

  it('should count an on-chain tx that failed during Move execution', async () => {
    // A sponsored pass tx that aborted on chain still consumed gas → must count.
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(sponsoredTxPage(1, 'failure'))

    const res = await server.inject({
      method: 'GET',
      url: `/api/gas/sponsor-count?address=${userAddress}`,
    })
    expect(res.statusCode).toBe(200)
    const data = JSON.parse(res.payload)
    expect(data.count).toBe(1)
    expect(data.remaining).toBe(1)
  })

  it('should NOT consume quota when the pre-flight dry-run rejects the tx', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 7
    const ticket = await signTicket(userAddress, 2, [nullifier], new Uint8Array(0), Date.now() + 1000000)

    const buildTx = () => {
      const tx = new Transaction()
      tx.moveCall({
        target: `${packageId}::survey_pass::mint_pass`,
        arguments: [
          tx.object(registryId),
          tx.object(configId),
          tx.pure.address(userAddress),
          tx.pure.address(sponsorAddress), // deposit_payer
          tx.pure.u8(2),
          tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
          tx.pure.vector('u8', []),
          tx.pure.u64(ticket.expires_at),
          tx.pure.vector('u8', Array.from(hexToBytes(ticket.bff_sig))),
          tx.object('0x6'),
        ],
      })
      tx.setSender(userAddress)
      return tx
    }
    const txBytes = Buffer.from(
      await buildTx().build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    // 1. Dry-run rejects → 422, and quota must NOT be consumed
    mockSuiClient.dryRunTransactionBlock.mockResolvedValueOnce({
      effects: { status: { status: 'failure', error: 'MoveAbort(...)' } },
    })
    const failRes = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })
    expect(failRes.statusCode).toBe(422)

    // 2. A subsequent valid request (dry-run succeeds again per beforeEach mock)
    //    must still be allowed — the rejected one left no phantom count.
    const okRes = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })
    expect(okRes.statusCode).toBe(200)
    expect(JSON.parse(okRes.payload)).toHaveProperty('sponsorSignature')
  })

  it('should accept valid claim transaction', async () => {
    const tx = new Transaction()
    const vaultObjectId = '0x0000000000000000000000000000000000000000000000000000000000000008'
    const surveyObjectId = '0x0000000000000000000000000000000000000000000000000000000000000009'
    const passObjectId = '0x000000000000000000000000000000000000000000000000000000000000000c'

    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      arguments: [
        tx.object(vaultObjectId),
        tx.object(surveyObjectId),
        tx.object(passObjectId),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()), // encrypted_answers
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()), // answer_blob_id
        tx.object('0x6'), // Clock
      ],
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toHaveProperty('sponsorSignature')
  })

  it('should accept valid claim_with_ticket transaction', async () => {
    const tx = new Transaction()
    const vaultObjectId = '0x0000000000000000000000000000000000000000000000000000000000000008'
    const issuerConfigObjectId = '0x000000000000000000000000000000000000000000000000000000000000000b'

    tx.moveCall({
      target: `${packageId}::survey_vault::claim_with_ticket`,
      arguments: [
        tx.object(vaultObjectId),
        tx.object(issuerConfigObjectId),
        tx.pure.vector('u8', Array.from(new Uint8Array(64))), // ticket_sig
        tx.pure.vector('u8', Array.from(new Uint8Array(32))), // ephemeral_nullifier
        tx.pure.u64('9999999999999'), // expires_at
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()), // encrypted_answers
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()), // answer_blob_id
        tx.object('0x6'), // Clock
      ],
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toHaveProperty('sponsorSignature')
  })

  it('should accept valid claim_with_nft_marking transaction', async () => {
    const tx = new Transaction()
    const vaultObjectId = '0x0000000000000000000000000000000000000000000000000000000000000008'
    const nftObjectId = '0x000000000000000000000000000000000000000000000000000000000000000d'

    tx.moveCall({
      target: `${packageId}::survey_vault::claim_with_nft_marking`,
      typeArguments: ['0x2::devnet_nft::DevNetNFT'],
      arguments: [
        tx.object(vaultObjectId),
        tx.object(nftObjectId),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()), // encrypted_answers
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()), // answer_blob_id
        tx.object('0x6'), // Clock
      ],
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toHaveProperty('sponsorSignature')
  })

  it('should reject claim with inline answers exceeding vault max_inline_answer_bytes', async () => {
    const tx = new Transaction()
    const vaultObjectId = '0x0000000000000000000000000000000000000000000000000000000000000008'
    const surveyObjectId = '0x0000000000000000000000000000000000000000000000000000000000000009'
    const passObjectId = '0x000000000000000000000000000000000000000000000000000000000000000c'
    const oversized = Array.from(new Uint8Array(7000))

    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      arguments: [
        tx.object(vaultObjectId),
        tx.object(surveyObjectId),
        tx.object(passObjectId),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(oversized).toBytes()),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).error).toBe('inline_answer_too_large')
  })

  it('should reject claim when dry-run gas exceeds vault compensation', async () => {
    mockSuiClient.dryRunTransactionBlock.mockResolvedValue({
      effects: {
        status: { status: 'success' },
        gasUsed: {
          computationCost: '20000000',
          storageCost: '10000000',
          storageRebate: '0',
        },
      },
    })

    const tx = new Transaction()
    const vaultObjectId = '0x0000000000000000000000000000000000000000000000000000000000000008'
    const surveyObjectId = '0x0000000000000000000000000000000000000000000000000000000000000009'
    const passObjectId = '0x000000000000000000000000000000000000000000000000000000000000000c'

    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      arguments: [
        tx.object(vaultObjectId),
        tx.object(surveyObjectId),
        tx.object(passObjectId),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize([1, 2, 3]).toBytes()),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })

    expect(response.statusCode).toBe(422)
    expect(JSON.parse(response.payload).error).toBe('gas_exceeds_compensation')
  })

  it('should reject platform claim_with_ticket when wallet pass is email-only (tier bypass fix)', async () => {
    process.env.MIN_PLATFORM_SPONSOR_TIER = '1'
    __resetGasConfigCache()

    mockSuiClient.getObject.mockResolvedValue({
      data: {
        objectId: '0x0000000000000000000000000000000000000000000000000000000000000008',
        content: {
          dataType: 'moveObject',
          fields: {
            gas_balance: '0',
            gas_compensation_amount: '5000000',
            storage_compensation_amount: '0',
            max_inline_answer_bytes: '6144',
          },
        },
      },
    })

    mockSuiClient.getOwnedObjects.mockResolvedValue({
      data: [
        {
          data: {
            content: {
              dataType: 'moveObject',
              fields: { credential_sources: [2] },
            },
          },
        },
      ],
    })

    const tx = new Transaction()
    const vaultObjectId = '0x0000000000000000000000000000000000000000000000000000000000000008'
    const issuerConfigObjectId = '0x000000000000000000000000000000000000000000000000000000000000000b'

    tx.moveCall({
      target: `${packageId}::survey_vault::claim_with_ticket`,
      arguments: [
        tx.object(vaultObjectId),
        tx.object(issuerConfigObjectId),
        tx.pure.vector('u8', Array.from(new Uint8Array(64))),
        tx.pure.vector('u8', Array.from(new Uint8Array(32))),
        tx.pure.u64('9999999999999'),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await server.inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toBe('PLATFORM_SPONSOR_TIER_INSUFFICIENT')
  })
})


