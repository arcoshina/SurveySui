import { SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { SbtChainClient, SbtIssueResult } from './chain-client.js'

export class SuiSbtChainClient implements SbtChainClient {
  private readonly client: SuiClient
  private readonly keypair: Ed25519Keypair
  private readonly adminAddress: string
  private readonly packageId: string
  private readonly registryId: string

  constructor() {
    const rpcUrl = process.env.SUI_RPC_URL || 'https://fullnode.devnet.sui.io:443'
    this.client = new SuiClient({ url: rpcUrl })

    const adminPrivKey = process.env.SUI_ADMIN_PRIVATE_KEY
    const adminAddr = process.env.SUI_ADMIN_ADDRESS
    const pkgId = process.env.SUI_PACKAGE_ID
    const regId = process.env.PASS_REGISTRY_ID

    if (!adminPrivKey || !adminAddr || !pkgId || !regId) {
      throw new Error('[SuiSbtChainClient] Missing environment configuration variables')
    }

    this.keypair = adminPrivKey.startsWith('suiprivkey')
      ? Ed25519Keypair.fromSecretKey(adminPrivKey)
      : Ed25519Keypair.fromSecretKey(Buffer.from(adminPrivKey, 'hex'))
    
    this.adminAddress = adminAddr
    this.packageId = pkgId
    this.registryId = regId
  }

  async issue(params: {
    suiAddress: string
    subHash: string
    ttlMs: number
  }): Promise<SbtIssueResult> {
    console.log(`[SbtChainClient] Issuing SurveyPass for subHash: ${params.subHash}`)
    const tx = new Transaction()
    tx.setSender(this.adminAddress)

    const subHashBytes = Array.from(Buffer.from(params.subHash, 'hex'))

    tx.moveCall({
      target: `${this.packageId}::survey_pass::issue`,
      arguments: [
        tx.object(this.registryId),
        tx.pure.vector('u8', subHashBytes),
        tx.pure.u64(params.ttlMs),
        tx.object('0x6'), // clock
      ],
    })

    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: { showObjectChanges: true },
    })

    await this.client.waitForTransaction({ digest: result.digest })

    let passObjectId = ''
    for (const change of result.objectChanges ?? []) {
      if (change.type === 'created' && change.objectType.includes('::survey_pass::SurveyPass')) {
        passObjectId = change.objectId
        break
      }
    }

    if (!passObjectId) {
      throw new Error(`SurveyPass object not found in transaction objectChanges for ${result.digest}`)
    }

    // Query on-chain serial
    const serial = await this.querySerial(passObjectId)
    console.log(`[SbtChainClient] Issued SurveyPass ID: ${passObjectId}, Serial: ${serial}`)
    return { objectId: passObjectId, serial }
  }

  async reissue(params: {
    oldObjectId: string
    suiAddress: string
    subHash: string
    ttlMs: number
  }): Promise<SbtIssueResult> {
    console.log(`[SbtChainClient] Reissuing SurveyPass for old ID: ${params.oldObjectId}`)
    const tx = new Transaction()
    tx.setSender(this.adminAddress)

    tx.moveCall({
      target: `${this.packageId}::survey_pass::reissue`,
      arguments: [
        tx.object(this.registryId),
        tx.object(params.oldObjectId),
        tx.pure.u64(params.ttlMs),
        tx.object('0x6'), // clock
      ],
    })

    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: { showObjectChanges: true },
    })

    await this.client.waitForTransaction({ digest: result.digest })

    let passObjectId = ''
    for (const change of result.objectChanges ?? []) {
      if (change.type === 'created' && change.objectType.includes('::survey_pass::SurveyPass')) {
        passObjectId = change.objectId
        break
      }
    }

    if (!passObjectId) {
      throw new Error(`SurveyPass object not found in reissue transaction objectChanges for ${result.digest}`)
    }

    const serial = await this.querySerial(passObjectId)
    console.log(`[SbtChainClient] Reissued SurveyPass ID: ${passObjectId}, Serial: ${serial}`)
    return { objectId: passObjectId, serial }
  }

  async revoke(params: { objectId: string }): Promise<void> {
    console.log(`[SbtChainClient] Revoking SurveyPass ID: ${params.objectId}`)
    const tx = new Transaction()
    tx.setSender(this.adminAddress)

    tx.moveCall({
      target: `${this.packageId}::survey_pass::revoke`,
      arguments: [
        tx.object(this.registryId),
        tx.object(params.objectId),
      ],
    })

    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: { showEffects: true },
    })

    await this.client.waitForTransaction({ digest: result.digest })
    console.log(`[SbtChainClient] Revoked SurveyPass ID: ${params.objectId} successfully`)
  }

  private async querySerial(objectId: string): Promise<bigint> {
    const obj = await this.client.getObject({
      id: objectId,
      options: { showContent: true },
    })
    if (obj.data?.content?.dataType !== 'moveObject') {
      throw new Error(`Object ${objectId} is not a Move object`)
    }
    const fields = obj.data.content.fields as Record<string, unknown>
    return BigInt(fields.serial as string | number)
  }
}
