import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { bcs } from '@mysten/sui/bcs'
import { createMultisigSponsorSigner, keypairFromHex, InMemoryCoinLockStore } from '@surveysui/gas-station-core'
import { registerGasRoutes, __useInMemoryPassReservationsForTests } from '../src/gas/handler.js'
import { __resetGasConfigCache, getGasConfig } from '../src/gas/gasConfig.js'
import { __resetSponsorState } from '../src/gas/sponsorLedger.js'
import { __resetPlatformSponsorLedger, getPlatformSponsorCount } from '../src/gas/platformSponsorLedger.js'
import { tryReserveVaultGasSlot, __resetVaultGasLedger } from '../src/gas/vaultGasLedger.js'
import * as sponsorAuth from '../src/gas/sponsorAuth.js'
import { signTicket } from '../src/auth/ticket.js'
import { setupFakeD1 } from './helpers/fakeD1.js'

const ISSUER_CONFIG_ID = '0x000000000000000000000000000000000000000000000000000000000000000b'
const VOID_NFT_ID = '0x000000000000000000000000000000000000000000000000000000000000000d'
/** Matches mock dry-run gasUsed: net 1_400_000 → ceil(110%) = 1_540_000 */
const MOCK_MIN_ESCAPE_CLAWBACK = 1_540_000n

function unifiedClaimArgs(
  tx: Transaction,
  opts: {
    vaultId: string
    surveyId: string
    passId?: string
    voidNftId?: string
    usePass?: boolean
    useNft?: boolean
    issuerConfigId?: string
    authKind?: number
    encryptedAnswers?: number[] | null
    answerBlobId?: number[] | null
  }
) {
  const usePass = opts.usePass ?? !!opts.passId
  const useNft = opts.useNft ?? false
  return [
    tx.object(opts.vaultId),
    tx.object(opts.surveyId),
    tx.pure.u8(opts.authKind ?? 0),
    tx.pure.bool(usePass),
    tx.object(opts.passId ?? '0x000000000000000000000000000000000000000000000000000000000000000e'),
    tx.pure.bool(useNft),
    tx.object(opts.voidNftId ?? VOID_NFT_ID),
    tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([]).toBytes()),
    tx.object(opts.issuerConfigId ?? ISSUER_CONFIG_ID),
    tx.pure.vector('u8', []),
    tx.pure.vector('u8', []),
    tx.pure.u64(0),
    tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(opts.encryptedAnswers ?? null).toBytes()),
    tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(opts.answerBlobId ?? null).toBytes()),
    tx.object('0x6'),
  ]
}

describe('BFF Gas Sponsor for SurveyPass Tests', () => {
  let server: any
  let mockSuiClient: any

  const devIssuerPriv = '0101010101010101010101010101010101010101010101010101010101010101'
  const sponsorPriv2 = '0202020202020202020202020202020202020202020202020202020202020202'
  const sponsorPriv3 = '0303030303030303030303030303030303030303030303030303030303030303'
  const packageId = '0xec7cddee76702e0209aabad0c56a8a4c14583d0eaafda3ed52ddd962b216d9fd'
  const userPriv = '0404040404040404040404040404040404040404040404040404040404040404'
  let userKeypair: Ed25519Keypair
  let userAddress: string
  const registryId = '0x000000000000000000000000000000000000000000000000000000000000000a'

  // Hono app.request 配接成 Fastify-like inject（可指定 app，支援第二個 server2）
  async function inject(opts: { method: string; url: string; payload?: unknown }, app: Hono = server) {
    const res = await app.request(opts.url, {
      method: opts.method,
      headers: opts.payload !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opts.payload !== undefined ? JSON.stringify(opts.payload) : undefined,
    })
    const payload = await res.text()
    return { statusCode: res.status, payload, json: () => JSON.parse(payload) }
  }

  async function gasSponsorPayload(txBytes: string) {
    return { txBytes, senderAddress: userAddress }
  }

  // 走完整單簽流程:/sponsor 取得代付 bytes → 使用者簽交易(同意憑證)→ /execute 扣額度並廣播。
  async function sponsorThenExecute(txBytes: string) {
    const sponsorRes = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })
    if (sponsorRes.statusCode !== 200) return sponsorRes
    const { sponsoredTxBytes, sponsorSignature } = JSON.parse(sponsorRes.payload)
    const { signature: userSignature } = await userKeypair.signTransaction(
      new Uint8Array(Buffer.from(sponsoredTxBytes, 'base64'))
    )
    return inject({
      method: 'POST',
      url: '/api/gas/execute',
      payload: { sponsoredTxBytes, userSignature, sponsorSignature },
    })
  }
  const configId = '0x000000000000000000000000000000000000000000000000000000000000000b'

  const coldPubkey3 = Buffer.from(
    keypairFromHex(sponsorPriv3).getPublicKey().toRawBytes()
  ).toString('hex')
  const sponsorAddress = createMultisigSponsorSigner(
    devIssuerPriv,
    sponsorPriv2,
    coldPubkey3,
    2
  ).getSponsorAddress()

  const sponsorCoinBalance = '500000000'

  beforeEach(async () => {
    process.env.SURVEY_PASS_ISSUER_PRIV = devIssuerPriv
    process.env.GAS_SPONSOR_PRIV_1 = devIssuerPriv
    process.env.GAS_SPONSOR_PRIV_2 = sponsorPriv2
    process.env.GAS_SPONSOR_PUBKEY_3 = coldPubkey3
    process.env.SUI_PACKAGE_ID = packageId
    // 放寬 HTTP/錢包速率限制（本套件測審查/額度/簽章邏輯，非限流）。
    process.env.GAS_SPONSOR_RATE_LIMIT_MAX = '100000'
    process.env.GAS_SPONSOR_RATE_LIMIT_MAX_PER_WALLET = '100000'
    delete process.env.GAS_STATION_MODE
    delete process.env.GAS_STATION_URL
    delete process.env.GAS_STATION_SHARED_SECRET
    __resetGasConfigCache()

    userKeypair = keypairFromHex(userPriv)
    userAddress = userKeypair.toSuiAddress()
    __resetSponsorState()
    __resetVaultGasLedger()
    __useInMemoryPassReservationsForTests()
    await setupFakeD1()
    await __resetPlatformSponsorLedger()

    server = new Hono()

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
            typeParameters: [{ abilities: ['key'] }],
            parameters: [
              { MutableReference: { Struct: { address: packageId, module: 'survey_vault', name: 'SurveyVault', typeArguments: [] } } },
              { Reference: { Struct: { address: packageId, module: 'survey_registry', name: 'Survey', typeArguments: [] } } },
              'U8',
              'Bool',
              { Reference: { Struct: { address: packageId, module: 'survey_pass', name: 'SurveyPass', typeArguments: [] } } },
              'Bool',
              { Reference: { TypeParameter: 0 } },
              { Vector: { Vector: 'U8' } },
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
      executeTransactionBlock: vi.fn().mockResolvedValue({
        digest: 'mock_exec_digest',
        effects: { status: { status: 'success' } },
      }),
    }

    registerGasRoutes(server, { suiClient: mockSuiClient as any, packageId })
  })

  afterEach(async () => {
    __resetSponsorState()
    await __resetPlatformSponsorLedger()
    __resetGasConfigCache()
    delete process.env.GAS_SPONSOR_RATE_LIMIT_MAX
    delete process.env.GAS_SPONSOR_RATE_LIMIT_MAX_PER_WALLET
    delete process.env.SURVEY_PASS_ISSUER_PRIV
    delete process.env.GAS_SPONSOR_PRIV_1
    delete process.env.GAS_SPONSOR_PRIV_2
    delete process.env.GAS_SPONSOR_PUBKEY_3
    delete process.env.SUI_PACKAGE_ID
    delete process.env.MAX_PLATFORM_CLAIM_GAS_MIST
    delete process.env.MIN_PLATFORM_SPONSOR_TIER
    delete process.env.PLATFORM_CLAIM_SPONSOR_ENABLED
    delete process.env.GAS_STATION_MODE
    delete process.env.GAS_STATION_URL
    delete process.env.GAS_STATION_SHARED_SECRET
    vi.restoreAllMocks()
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
        tx.pure.u64(MOCK_MIN_ESCAPE_CLAWBACK.toString()),
        tx.pure.vector('u8', Array.from(new Uint8Array(64))), // INVALID bffSig
        tx.object('0x6'), // Clock
      ],
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
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
      expiresAtMs,
      MOCK_MIN_ESCAPE_CLAWBACK
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
          tx.pure.u64(ticket.escape_clawback_mist),
          tx.pure.vector('u8', Array.from(hexToBytes(ticket.bff_sig))),
          tx.object('0x6'),
        ],
      })
      tx.setSender(userAddress)
      return tx
    }

    const txBytes = Buffer.from(await buildValidTx().build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    // 額度在 /execute 階段(使用者交易簽章驗過後)原子預留。
    // Request 1 & 2: should broadcast (200)
    const response1 = await sponsorThenExecute(txBytes)
    expect(response1.statusCode).toBe(200)
    expect(JSON.parse(response1.payload)).toHaveProperty('digest')

    const response2 = await sponsorThenExecute(txBytes)
    expect(response2.statusCode).toBe(200)

    // Request 3: 終生額度用罄 → 403(在 /sponsor 唯讀檢查或 /execute 原子預留任一處擋下)
    const response3 = await sponsorThenExecute(txBytes)
    expect(response3.statusCode).toBe(403)
    expect(JSON.parse(response3.payload).error).toBe('PLATFORM_SPONSOR_LIMIT_REACHED')
  })

  it('/execute rejects a forged user signature and never consumes quota (sniping guard)', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 31
    const ticket = await signTicket(userAddress, 2, [nullifier], new Uint8Array(0), Date.now() + 1_000_000, MOCK_MIN_ESCAPE_CLAWBACK)
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object(registryId),
        tx.object(configId),
        tx.pure.address(userAddress),
        tx.pure.address(sponsorAddress),
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64(ticket.expires_at),
        tx.pure.u64(ticket.escape_clawback_mist),
        tx.pure.vector('u8', Array.from(hexToBytes(ticket.bff_sig))),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    const sponsorRes = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })
    expect(sponsorRes.statusCode).toBe(200)
    const { sponsoredTxBytes, sponsorSignature } = JSON.parse(sponsorRes.payload)

    // 攻擊者用「別把錢包」對同一筆代付交易簽名,冒充 userAddress 的同意。
    const attacker = (await import('@mysten/sui/keypairs/ed25519')).Ed25519Keypair.fromSecretKey(
      new Uint8Array(Buffer.from('05'.repeat(32), 'hex')).slice(0, 32)
    )
    const { signature: forgedSig } = await attacker.signTransaction(
      new Uint8Array(Buffer.from(sponsoredTxBytes, 'base64'))
    )

    const execRes = await inject({
      method: 'POST',
      url: '/api/gas/execute',
      payload: { sponsoredTxBytes, userSignature: forgedSig, sponsorSignature },
    })
    expect(execRes.statusCode).toBe(401)
    expect(JSON.parse(execRes.payload).error).toBe('invalid_user_signature')
    expect(mockSuiClient.executeTransactionBlock).not.toHaveBeenCalled()

    // 受害者額度未被消耗:後續用真實簽章仍可成功。
    const okRes = await sponsorThenExecute(txBytes)
    expect(okRes.statusCode).toBe(200)
  })

  it('/execute refuses to broadcast bytes this sponsor did not sign', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 32
    const ticket = await signTicket(userAddress, 2, [nullifier], new Uint8Array(0), Date.now() + 1_000_000, MOCK_MIN_ESCAPE_CLAWBACK)
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object(registryId),
        tx.object(configId),
        tx.pure.address(userAddress),
        tx.pure.address(sponsorAddress),
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64(ticket.expires_at),
        tx.pure.u64(ticket.escape_clawback_mist),
        tx.pure.vector('u8', Array.from(hexToBytes(ticket.bff_sig))),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')
    const sponsorRes = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: { txBytes, senderAddress: userAddress },
    })
    const { sponsoredTxBytes } = JSON.parse(sponsorRes.payload)
    const { signature: userSignature } = await userKeypair.signTransaction(
      new Uint8Array(Buffer.from(sponsoredTxBytes, 'base64'))
    )
    // 偽造的 sponsor 簽章(非本服務金鑰)→ 後端拒絕廣播。
    const fakeSponsor = (await import('@mysten/sui/keypairs/ed25519')).Ed25519Keypair.fromSecretKey(
      new Uint8Array(Buffer.from('06'.repeat(32), 'hex')).slice(0, 32)
    )
    const { signature: fakeSponsorSig } = await fakeSponsor.signTransaction(
      new Uint8Array(Buffer.from(sponsoredTxBytes, 'base64'))
    )
    const execRes = await inject({
      method: 'POST',
      url: '/api/gas/execute',
      payload: { sponsoredTxBytes, userSignature, sponsorSignature: fakeSponsorSig },
    })
    expect(execRes.statusCode).toBe(400)
    expect(JSON.parse(execRes.payload).error).toBe('invalid_sponsor_signature')
    expect(mockSuiClient.executeTransactionBlock).not.toHaveBeenCalled()
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
        tx.pure.u64('0'),
        tx.pure.vector('u8', Array.from(hexToBytes(ticket.bff_sig))),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    const txBytes = Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')

    const res = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload).error).toBe('invalid_deposit_payer')
  })

  async function buildBatchMintExtraTx(opts?: { invalidExtraSig?: boolean }) {
    const googleNull = new Uint8Array(32)
    googleNull[0] = 20
    const emailNull = new Uint8Array(32)
    emailNull[0] = 21

    const googleTicket = await signTicket(
      userAddress,
      6,
      [googleNull],
      new Uint8Array(0),
      Date.now() + 1_000_000,
      MOCK_MIN_ESCAPE_CLAWBACK
    )
    const emailTicket = await signTicket(userAddress, 2, [emailNull], new Uint8Array(0), Date.now() + 1_000_000, 0n)

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
        tx.pure.u64(googleTicket.escape_clawback_mist),
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

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
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

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
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
    const ticket1 = await signTicket(
      userAddress,
      6,
      [null1],
      new Uint8Array(0),
      Date.now() + 1_000_000,
      MOCK_MIN_ESCAPE_CLAWBACK
    )
    const ticket2 = await signTicket(userAddress, 2, [null2], new Uint8Array(0), Date.now() + 1_000_000, 1n)

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
          tx.pure.u64(ticket.escape_clawback_mist),
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

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).error).toBe('invalid_ticket_signature')
  })

  it('should report count 0 / remaining 2 when there is no on-chain history', async () => {
    const res = await inject({
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

    const res = await inject({
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

    const res = await inject({
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
    const ticket = await signTicket(
      userAddress,
      2,
      [nullifier],
      new Uint8Array(0),
      Date.now() + 1000000,
      MOCK_MIN_ESCAPE_CLAWBACK
    )

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
          tx.pure.u64(ticket.escape_clawback_mist),
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
    const dryRunFailure = {
      effects: { status: { status: 'failure', error: 'MoveAbort(...)' } },
    }
    // Pipeline may retry dry-run once (SPONSOR_COIN_DRY_RUN_MAX_RETRIES default = 1)
    mockSuiClient.dryRunTransactionBlock
      .mockResolvedValueOnce(dryRunFailure)
      .mockResolvedValueOnce(dryRunFailure)
    const failRes = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })
    expect(failRes.statusCode).toBe(422)

    // 2. A subsequent valid request (dry-run succeeds again per beforeEach mock)
    //    must still be allowed — the rejected one left no phantom count.
    const okRes = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
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
      typeArguments: [`${packageId}::claim_sentinel::VoidNft`],
      arguments: unifiedClaimArgs(tx, {
        vaultId: vaultObjectId,
        surveyId: surveyObjectId,
        passId: passObjectId,
      }),
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
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
      typeArguments: [`${packageId}::claim_sentinel::VoidNft`],
      arguments: unifiedClaimArgs(tx, {
        vaultId: vaultObjectId,
        surveyId: surveyObjectId,
        passId: passObjectId,
        encryptedAnswers: oversized,
      }),
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
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
      typeArguments: [`${packageId}::claim_sentinel::VoidNft`],
      arguments: unifiedClaimArgs(tx, {
        vaultId: vaultObjectId,
        surveyId: surveyObjectId,
        passId: passObjectId,
        encryptedAnswers: [1, 2, 3],
      }),
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    expect(response.statusCode).toBe(422)
    expect(JSON.parse(response.payload).error).toBe('gas_exceeds_compensation')
  })

  it('should reject platform claim when wallet pass is email-only (tier check)', async () => {
    process.env.PLATFORM_CLAIM_SPONSOR_ENABLED = 'true'
    process.env.MIN_PLATFORM_SPONSOR_TIER = '1'
    __resetGasConfigCache()

    const tierPassId = '0x000000000000000000000000000000000000000000000000000000000000000c'
    mockSuiClient.getObject.mockImplementation(async ({ id }: { id: string }) => {
      if (id === tierPassId) {
        return {
          data: {
            objectId: id,
            type: `${packageId}::survey_pass::SurveyPass`,
            content: {
              dataType: 'moveObject',
              fields: { credential_sources: [2], owner: userAddress },
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
              gas_balance: '0',
              gas_compensation_amount: '5000000',
              storage_compensation_amount: '0',
              max_inline_answer_bytes: '6144',
            },
          },
        },
      }
    })

    const tx = new Transaction()
    const vaultObjectId = '0x0000000000000000000000000000000000000000000000000000000000000008'
    const surveyObjectId = '0x0000000000000000000000000000000000000000000000000000000000000009'
    const passObjectId = tierPassId

    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [`${packageId}::claim_sentinel::VoidNft`],
      arguments: unifiedClaimArgs(tx, {
        vaultId: vaultObjectId,
        surveyId: surveyObjectId,
        passId: passObjectId,
      }),
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toBe('PLATFORM_SPONSOR_TIER_INSUFFICIENT')
  })

  // H2 回歸：platform tier 檢查須驗證 pass 由 sender 持有，不得借用他人高 tier pass。
  const buildPlatformClaimTxBytes = async (passId: string) => {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [`${packageId}::claim_sentinel::VoidNft`],
      arguments: unifiedClaimArgs(tx, {
        vaultId: '0x0000000000000000000000000000000000000000000000000000000000000008',
        surveyId: '0x0000000000000000000000000000000000000000000000000000000000000009',
        passId,
      }),
    })
    tx.setSender(userAddress)
    return Buffer.from(await tx.build({ client: mockSuiClient, onlyTransactionKind: true })).toString('base64')
  }

  // 池為空的 vault mock（觸發平台代付 fallback），其餘物件走預設。
  const mockPlatformPassObject = (passId: string, fields: Record<string, unknown>, type?: string) => {
    mockSuiClient.getObject.mockImplementation(async ({ id }: { id: string }) => {
      if (id === passId) {
        return {
          data: {
            objectId: id,
            type: type ?? `${packageId}::survey_pass::SurveyPass`,
            content: { dataType: 'moveObject', fields },
          },
        }
      }
      return {
        data: {
          objectId: id,
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
      }
    })
  }

  it('rejects platform claim when passId points to a high-tier pass owned by someone else (H2)', async () => {
    process.env.PLATFORM_CLAIM_SPONSOR_ENABLED = 'true'
    process.env.MIN_PLATFORM_SPONSOR_TIER = '2'
    __resetGasConfigCache()

    const borrowedPassId = '0x000000000000000000000000000000000000000000000000000000000000000c'
    const otherOwner = '0x00000000000000000000000000000000000000000000000000000000000000ff'
    // 攻擊者錢包 (userAddress) 把 passId 指向他人持有、具 World ID (tier 2) 的高 tier pass。
    mockPlatformPassObject(borrowedPassId, { credential_sources: [5], owner: otherOwner })

    const txBytes = await buildPlatformClaimTxBytes(borrowedPassId)
    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toBe('PLATFORM_SPONSOR_TIER_INSUFFICIENT')
    expect(mockSuiClient.executeTransactionBlock).not.toHaveBeenCalled()
  })

  it('rejects platform claim when passId points to a non-SurveyPass object (H2 type check)', async () => {
    process.env.PLATFORM_CLAIM_SPONSOR_ENABLED = 'true'
    process.env.MIN_PLATFORM_SPONSOR_TIER = '1'
    __resetGasConfigCache()

    const fakePassId = '0x000000000000000000000000000000000000000000000000000000000000000c'
    // owner 正確、tier 足夠，但物件型別不是 SurveyPass（偽造剛好帶 credential_sources 欄位的物件）。
    mockPlatformPassObject(
      fakePassId,
      { credential_sources: [5], owner: userAddress },
      `${packageId}::evil::FakePass`
    )

    const txBytes = await buildPlatformClaimTxBytes(fakePassId)
    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toBe('PLATFORM_SPONSOR_TIER_INSUFFICIENT')
  })

  it('allows platform claim when sender owns a sufficient-tier pass (H2 happy path)', async () => {
    process.env.PLATFORM_CLAIM_SPONSOR_ENABLED = 'true'
    process.env.MIN_PLATFORM_SPONSOR_TIER = '2'
    __resetGasConfigCache()

    const ownPassId = '0x000000000000000000000000000000000000000000000000000000000000000c'
    mockPlatformPassObject(ownPassId, { credential_sources: [5], owner: userAddress })

    const txBytes = await buildPlatformClaimTxBytes(ownPassId)
    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toHaveProperty('sponsorSignature')
  })

  it('rejects vault-insufficient claim with 409 vault_gas_insufficient when platform fallback disabled (default)', async () => {
    // Default: PLATFORM_CLAIM_SPONSOR_ENABLED unset → false. Vault gas pool empty → 409, no coin locked.
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

    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [`${packageId}::claim_sentinel::VoidNft`],
      arguments: unifiedClaimArgs(tx, {
        vaultId: '0x0000000000000000000000000000000000000000000000000000000000000008',
        surveyId: '0x0000000000000000000000000000000000000000000000000000000000000009',
        passId: '0x000000000000000000000000000000000000000000000000000000000000000c',
      }),
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    expect(response.statusCode).toBe(409)
    expect(JSON.parse(response.payload).error).toBe('vault_gas_insufficient')
    // Rejected before the pipeline → no gas coin acquired/locked.
    expect(mockSuiClient.dryRunTransactionBlock).not.toHaveBeenCalled()
  })

  it('/execute releases the spent gas coin lock after broadcast (local mode)', async () => {
    const spyQueue = InMemoryCoinLockStore.fromGasConfig(getGasConfig())
    const invalidateSpy = vi.spyOn(spyQueue, 'invalidateCoin')
    const server2 = new Hono()
    registerGasRoutes(server2, { suiClient: mockSuiClient as any, packageId, coinQueue: spyQueue })

    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [`${packageId}::claim_sentinel::VoidNft`],
      arguments: unifiedClaimArgs(tx, {
        vaultId: '0x0000000000000000000000000000000000000000000000000000000000000008',
        surveyId: '0x0000000000000000000000000000000000000000000000000000000000000009',
        passId: '0x000000000000000000000000000000000000000000000000000000000000000c',
      }),
    })
    tx.setSender(userAddress)
    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const sponsorRes = await inject(
      { method: 'POST', url: '/api/gas/sponsor', payload: { txBytes, senderAddress: userAddress } },
      server2
    )
    expect(sponsorRes.statusCode).toBe(200)
    const { sponsoredTxBytes, sponsorSignature } = JSON.parse(sponsorRes.payload)
    const { signature: userSignature } = await userKeypair.signTransaction(
      new Uint8Array(Buffer.from(sponsoredTxBytes, 'base64'))
    )
    const execRes = await inject(
      { method: 'POST', url: '/api/gas/execute', payload: { sponsoredTxBytes, userSignature, sponsorSignature } },
      server2
    )

    expect(execRes.statusCode).toBe(200)
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('should reject PTB mixing survey_pass and survey_vault::claim', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 42
    const ticket = await signTicket(
      userAddress,
      2,
      [nullifier],
      new Uint8Array(0),
      Date.now() + 1_000_000,
      MOCK_MIN_ESCAPE_CLAWBACK
    )

    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object(registryId),
        tx.object(configId),
        tx.pure.address(userAddress),
        tx.pure.address(sponsorAddress),
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64(ticket.expires_at),
        tx.pure.u64(ticket.escape_clawback_mist),
        tx.pure.vector('u8', hexToBytes(ticket.bff_sig)),
        tx.object('0x6'),
      ],
    })
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [`${packageId}::claim_sentinel::VoidNft`],
      arguments: unifiedClaimArgs(tx, {
        vaultId: '0x0000000000000000000000000000000000000000000000000000000000000008',
        surveyId: '0x0000000000000000000000000000000000000000000000000000000000000009',
        passId: '0x000000000000000000000000000000000000000000000000000000000000000c',
      }),
    })
    tx.setSender(userAddress)

    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).error).toBe('invalid_transaction_commands')
  })

  it('forwards sponsor requests to gas station with HMAC headers when GAS_STATION_MODE=do', async () => {
    process.env.GAS_STATION_MODE = 'do'
    process.env.GAS_STATION_URL = 'https://gas-station.test'
    process.env.GAS_STATION_SHARED_SECRET = 'test-shared-secret'

    const nullifier = new Uint8Array(32)
    nullifier[0] = 7
    const ticket = await signTicket(
      userAddress,
      2,
      [nullifier],
      new Uint8Array(0),
      Date.now() + 1_000_000,
      MOCK_MIN_ESCAPE_CLAWBACK
    )

    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_pass::mint_pass`,
      arguments: [
        tx.object(registryId),
        tx.object(configId),
        tx.pure.address(userAddress),
        tx.pure.address(sponsorAddress),
        tx.pure.u8(2),
        tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([[...nullifier]]).toBytes()),
        tx.pure.vector('u8', []),
        tx.pure.u64(ticket.expires_at),
        tx.pure.u64(ticket.escape_clawback_mist),
        tx.pure.vector('u8', hexToBytes(ticket.bff_sig)),
        tx.object('0x6'),
      ],
    })
    tx.setSender(userAddress)
    const txBytes = Buffer.from(
      await tx.build({ client: mockSuiClient, onlyTransactionKind: true })
    ).toString('base64')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          sponsoredTxBytes: 'c3BvbnNvcmVk',
          sponsorSignature: 'sig',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const response = await inject({
      method: 'POST',
      url: '/api/gas/sponsor',
      payload: await gasSponsorPayload(txBytes),
    })

    expect(response.statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(init?.headers).toMatchObject({
      'content-type': 'application/json',
    })
    const headers = init?.headers as Record<string, string>
    expect(headers['x-gas-station-timestamp']).toBeTruthy()
    expect(headers['x-gas-station-nonce']).toBeTruthy()
    expect(headers['x-gas-station-signature']).toBeTruthy()
    expect(JSON.parse(response.payload)).toEqual({
      sponsoredTxBytes: 'c3BvbnNvcmVk',
      sponsorSignature: 'sig',
    })
  })

  // ---- M5: vault 補償額度預留鎖（分類於 /execute 原子決定，杜絕併發漏計）----

  const M5_VAULT_ID = '0x0000000000000000000000000000000000000000000000000000000000000008'

  function buildClaimTxBytes() {
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_vault::claim`,
      typeArguments: [`${packageId}::claim_sentinel::VoidNft`],
      arguments: unifiedClaimArgs(tx, {
        vaultId: M5_VAULT_ID,
        surveyId: '0x0000000000000000000000000000000000000000000000000000000000000009',
        passId: '0x000000000000000000000000000000000000000000000000000000000000000c',
      }),
    })
    tx.setSender(userAddress)
    return tx.build({ client: mockSuiClient, onlyTransactionKind: true }).then(
      (b) => Buffer.from(b).toString('base64')
    )
  }

  function mockVault(gasBalance: string, gasCompensationAmount: string) {
    mockSuiClient.getObject.mockResolvedValue({
      data: {
        objectId: M5_VAULT_ID,
        content: {
          dataType: 'moveObject',
          fields: {
            gas_balance: gasBalance,
            gas_compensation_amount: gasCompensationAmount,
            storage_compensation_amount: '0',
            max_inline_answer_bytes: '6144',
          },
        },
      },
    })
  }

  it('M5: vault-funded claim does not consume platform daily quota', async () => {
    // 預設 vault（gas_balance 100M / compensation 5M = 20 槽）→ vault 代付。
    const res = await sponsorThenExecute(await buildClaimTxBytes())
    expect(res.statusCode).toBe(200)
    expect(await getPlatformSponsorCount(userAddress)).toBe(0)
  })

  it('M5: overflow claim (vault slots exhausted by in-flight) is classified platform and counted', async () => {
    // vault 僅 1 槽（gas_balance == compensation）；/sponsor 仍判 vault 代付並簽出。
    mockVault('5000000', '5000000')
    // 模擬另一筆併發 claim 已佔走唯一的 vault 槽。
    expect(await tryReserveVaultGasSlot(M5_VAULT_ID, 1)).toBe(true)

    const res = await sponsorThenExecute(await buildClaimTxBytes())
    expect(res.statusCode).toBe(200)
    // 該筆溢出 → 平台代付 → 計入平台每日額度（race 不漏計）。
    expect(await getPlatformSponsorCount(userAddress)).toBe(1)
  })

  it('M5: platform overflow whose signed budget exceeds platform cap is rejected (422)', async () => {
    // 平台單筆上限壓在 dry-run 淨 gas(1.4M) 之下；簽出的 vault 寬預算必定超標。
    process.env.MAX_PLATFORM_CLAIM_GAS_MIST = '1000000'
    __resetGasConfigCache()
    // vault 1 槽且 compensation 夠大讓 /sponsor 以 vault 寬預算簽出。
    mockVault('50000000', '50000000')
    expect(await tryReserveVaultGasSlot(M5_VAULT_ID, 1)).toBe(true)

    const res = await sponsorThenExecute(await buildClaimTxBytes())
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.payload).error).toBe('gas_exceeds_compensation')
    // 被斷言擋下：不廣播、不計平台額度。
    expect(mockSuiClient.executeTransactionBlock).not.toHaveBeenCalled()
    expect(await getPlatformSponsorCount(userAddress)).toBe(0)
  })

  it('M3: platform overflow whose signed budget is unparseable (null) is rejected fail-closed (422)', async () => {
    // budget 解析為 null（欄位缺失/非數值）時無法確認上限 → fail-closed 一律拒絕。
    mockVault('50000000', '50000000')
    expect(await tryReserveVaultGasSlot(M5_VAULT_ID, 1)).toBe(true)
    const spy = vi.spyOn(sponsorAuth, 'gasBudgetFromTransactionData').mockReturnValue(null)
    try {
      const res = await sponsorThenExecute(await buildClaimTxBytes())
      expect(res.statusCode).toBe(422)
      expect(JSON.parse(res.payload).error).toBe('gas_exceeds_compensation')
      // 不廣播、不計平台額度。
      expect(mockSuiClient.executeTransactionBlock).not.toHaveBeenCalled()
      expect(await getPlatformSponsorCount(userAddress)).toBe(0)
    } finally {
      spy.mockRestore()
    }
  })
})


