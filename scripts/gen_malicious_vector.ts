import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { bcs } from '@mysten/sui/bcs'
import { createHash } from 'node:crypto'

const TicketPayload = bcs.struct('TicketPayload', {
  owner: bcs.Address,
  source: bcs.u8(),
  nullifier_hash: bcs.vector(bcs.u8()),
  commitment: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
})

const privateKeyBytes = new Uint8Array(32).fill(1)
const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes)

const pubKey = keypair.getPublicKey().toRawBytes()

const SECRET_SALT = 'test_salt_123456'

const ALICE = '0xa11ce00000000000000000000000000000000000000000000000000000000000'
const BOB = '0xb0b000000000000000000000000000000000000000000000000000000000000'

const ALICE_EMAIL = 'alice@surveysui.com'
const alice_nullifier = computeNullifierHash(ALICE_EMAIL, SECRET_SALT)

function computeNullifierHash(email: string, salt: string): Uint8Array {
  const input = Buffer.concat([
    Buffer.from('email'),
    Buffer.from(email.toLowerCase().trim()),
    Buffer.from(salt),
  ])
  return new Uint8Array(createHash('sha256').update(input).digest())
}

// 產生 Bob 的有效 Ticket 簽章，但是使用 Alice 的 nullifier
const bob_expires_at = 99999999999999n
const bobMaliciousPayloadBytes = TicketPayload.serialize({
  owner: BOB,
  source: 2,
  nullifier_hash: Array.from(alice_nullifier),
  commitment: [],
  expires_at: bob_expires_at.toString(),
}).toBytes()
const bobMaliciousSig = await keypair.sign(bobMaliciousPayloadBytes)

console.log('=== Bob Malicious Ticket (Bob owner, Alice nullifier) ===')
console.log('Signature (Move):', `vector[${bobMaliciousSig.join(', ')}]`)
