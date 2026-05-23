import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { bcs } from '@mysten/sui/bcs'
import { createHash } from 'node:crypto'

// 1. 定義 TicketPayload BCS 結構
const TicketPayload = bcs.struct('TicketPayload', {
  owner: bcs.Address,
  source: bcs.u8(),
  nullifier_hash: bcs.vector(bcs.u8()),
  commitment: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
})

// 2. 生成固定的 Keypair 以保證測試向量一致
const privateKeyBytes = new Uint8Array(32).fill(1)
const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes)

const pubKey = keypair.getPublicKey().toRawBytes()

console.log('=== BFF Keypair Config ===')
console.log('Public Key (hex):', Buffer.from(pubKey).toString('hex'))
console.log('Public Key (Move vector format):', `vector[${pubKey.join(', ')}]`)
console.log('Private Key (hex):', Buffer.from(privateKeyBytes).toString('hex'))
console.log()

// 3. 計算 nullifier hash 的輔助函數
function computeNullifierHash(email: string, salt: string): Uint8Array {
  const input = Buffer.concat([
    Buffer.from('email'),
    Buffer.from(email.toLowerCase().trim()),
    Buffer.from(salt),
  ])
  return new Uint8Array(createHash('sha256').update(input).digest())
}

const SECRET_SALT = 'test_salt_123456'
console.log('BFF Secret Salt:', SECRET_SALT)
console.log()

// 定義測試變數
const ALICE = '0xa11ce00000000000000000000000000000000000000000000000000000000000'
const BOB = '0xb0b000000000000000000000000000000000000000000000000000000000000'

const ALICE_EMAIL = 'alice@surveysui.com'
const BOB_EMAIL = 'bob@surveysui.com'

const alice_nullifier = computeNullifierHash(ALICE_EMAIL, SECRET_SALT)
const bob_nullifier = computeNullifierHash(BOB_EMAIL, SECRET_SALT)

// 4. 產生 Alice 的有效 Ticket 簽名 (expires_at = 99999999999999)
const alice_expires_at = 99999999999999n
const alicePayloadBytes = TicketPayload.serialize({
  owner: ALICE,
  source: 2, // SRC_EMAIL
  nullifier_hash: Array.from(alice_nullifier),
  commitment: [],
  expires_at: alice_expires_at.toString(),
}).toBytes()
const aliceSig = await keypair.sign(alicePayloadBytes)

console.log('=== Alice Valid Ticket (Expires: 99999999999999) ===')
console.log('Nullifier Hash (hex):', Buffer.from(alice_nullifier).toString('hex'))
console.log('Nullifier Hash (Move):', `vector[${alice_nullifier.join(', ')}]`)
console.log('Expires At:', alice_expires_at.toString())
console.log('Signature (hex):', Buffer.from(aliceSig).toString('hex'))
console.log('Signature (Move):', `vector[${aliceSig.join(', ')}]`)
console.log()

// 5. 產生 Alice 的過期 Ticket 簽名 (expires_at = 1)
const alice_expired_expires_at = 1n
const aliceExpiredPayloadBytes = TicketPayload.serialize({
  owner: ALICE,
  source: 2,
  nullifier_hash: Array.from(alice_nullifier),
  commitment: [],
  expires_at: alice_expired_expires_at.toString(),
}).toBytes()
const aliceExpiredSig = await keypair.sign(aliceExpiredPayloadBytes)

console.log('=== Alice Expired Ticket (Expires: 1) ===')
console.log('Signature (hex):', Buffer.from(aliceExpiredSig).toString('hex'))
console.log('Signature (Move):', `vector[${aliceExpiredSig.join(', ')}]`)
console.log()

// 6. 產生 Bob 的有效 Ticket 簽名 (expires_at = 99999999999999)
const bob_expires_at = 99999999999999n
const bobPayloadBytes = TicketPayload.serialize({
  owner: BOB,
  source: 2, // SRC_EMAIL
  nullifier_hash: Array.from(bob_nullifier),
  commitment: [],
  expires_at: bob_expires_at.toString(),
}).toBytes()
const bobSig = await keypair.sign(bobPayloadBytes)

console.log('=== Bob Valid Ticket ===')
console.log('Nullifier Hash (hex):', Buffer.from(bob_nullifier).toString('hex'))
console.log('Nullifier Hash (Move):', `vector[${bob_nullifier.join(', ')}]`)
console.log('Signature (hex):', Buffer.from(bobSig).toString('hex'))
console.log('Signature (Move):', `vector[${bobSig.join(', ')}]`)
console.log()
