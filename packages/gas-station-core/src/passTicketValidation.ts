import { bcs } from '@mysten/sui/bcs'
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

// ticketBase = ticket 欄位群（source..bff_sig）在 moveCall args 中的起始索引。
// 對齊 contracts/sources/survey_pass.move，args 不含自動注入的 TxContext。
// pass(0) registry(1) config(2) | source(3)..bff_sig(8)
const UPDATE_PASS_CREDENTIAL_TICKET_BASE = 3
// registry(0) config(1) owner(2) deposit_payer(3) | source(4)..bff_sig(9)
const MINT_PASS_TICKET_BASE = 4

// mint_pass_with_extra_credentials：primary 同 MINT_PASS_TICKET_BASE，extra 欄位接在 bff_sig(9) 之後。
const EXTRA_SOURCES_INDEX = 10
const EXTRA_NULLIFIERS_INDEX = 11
const EXTRA_COMMITMENTS_INDEX = 12
const EXTRA_EXPIRES_AT_INDEX = 13
const EXTRA_BFF_SIGS_INDEX = 14

export const PassTicketPayload = bcs.struct('TicketPayload', {
  owner: bcs.Address,
  source: bcs.u8(),
  nullifiers: bcs.vector(bcs.vector(bcs.u8())),
  commitment: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
  escape_clawback_mist: bcs.u64(),
})

export type PassTicketFields = {
  source: number
  nullifiers: number[][]
  commitment: number[]
  expiresAt: bigint
  escapeClawbackMist: bigint
  bffSig: number[]
}

function parsePassTicketFromArgs(
  getPureBytes: (arg: unknown) => Uint8Array | null,
  args: unknown[],
  ticketBase: number
): PassTicketFields | null {
  const sourceBytes = getPureBytes(args[ticketBase])
  const nullifierBytes = getPureBytes(args[ticketBase + 1])
  const commitmentBytes = getPureBytes(args[ticketBase + 2])
  const expiresAtBytes = getPureBytes(args[ticketBase + 3])
  const escapeClawbackBytes = getPureBytes(args[ticketBase + 4])
  const bffSigBytes = getPureBytes(args[ticketBase + 5])
  if (
    !sourceBytes ||
    !nullifierBytes ||
    !commitmentBytes ||
    !expiresAtBytes ||
    !escapeClawbackBytes ||
    !bffSigBytes
  ) {
    return null
  }
  return {
    source: bcs.u8().parse(sourceBytes),
    nullifiers: bcs
      .vector(bcs.vector(bcs.u8()))
      .parse(nullifierBytes)
      .map((n: number[]) => Array.from(n)),
    commitment: Array.from(bcs.vector(bcs.u8()).parse(commitmentBytes)),
    expiresAt: BigInt(bcs.u64().parse(expiresAtBytes)),
    escapeClawbackMist: BigInt(bcs.u64().parse(escapeClawbackBytes)),
    bffSig: Array.from(bcs.vector(bcs.u8()).parse(bffSigBytes)),
  }
}

export function extractPassTicketsFromMoveCall(
  getPureBytes: (arg: unknown) => Uint8Array | null,
  fn: string,
  args: unknown[]
): PassTicketFields[] | null {
  if (fn === 'update_pass_credential') {
    const ticket = parsePassTicketFromArgs(getPureBytes, args, UPDATE_PASS_CREDENTIAL_TICKET_BASE)
    return ticket ? [ticket] : null
  }
  if (fn === 'mint_pass') {
    const ticket = parsePassTicketFromArgs(getPureBytes, args, MINT_PASS_TICKET_BASE)
    return ticket ? [ticket] : null
  }
  if (fn === 'mint_pass_with_extra_credentials') {
    const primary = parsePassTicketFromArgs(getPureBytes, args, MINT_PASS_TICKET_BASE)
    if (!primary) return null
    const extraSourcesBytes = getPureBytes(args[EXTRA_SOURCES_INDEX])
    const extraNullifiersBytes = getPureBytes(args[EXTRA_NULLIFIERS_INDEX])
    const extraCommitmentsBytes = getPureBytes(args[EXTRA_COMMITMENTS_INDEX])
    const extraExpiresAtBytes = getPureBytes(args[EXTRA_EXPIRES_AT_INDEX])
    const extraBffSigsBytes = getPureBytes(args[EXTRA_BFF_SIGS_INDEX])
    if (
      !extraSourcesBytes ||
      !extraNullifiersBytes ||
      !extraCommitmentsBytes ||
      !extraExpiresAtBytes ||
      !extraBffSigsBytes
    ) {
      return null
    }
    const extraSources = bcs.vector(bcs.u8()).parse(extraSourcesBytes)
    const extraNullifiers = bcs.vector(bcs.vector(bcs.vector(bcs.u8()))).parse(extraNullifiersBytes)
    const extraCommitments = bcs.vector(bcs.vector(bcs.u8())).parse(extraCommitmentsBytes)
    const extraExpiresAt = bcs.vector(bcs.u64()).parse(extraExpiresAtBytes)
    const extraBffSigs = bcs.vector(bcs.vector(bcs.u8())).parse(extraBffSigsBytes)
    const len = extraSources.length
    if (
      len !== extraNullifiers.length ||
      len !== extraCommitments.length ||
      len !== extraExpiresAt.length ||
      len !== extraBffSigs.length
    ) {
      return null
    }
    const tickets: PassTicketFields[] = [primary]
    for (let i = 0; i < len; i++) {
      tickets.push({
        source: extraSources[i],
        nullifiers: extraNullifiers[i].map((n: number[]) => Array.from(n)),
        commitment: Array.from(extraCommitments[i]),
        expiresAt: BigInt(extraExpiresAt[i]),
        escapeClawbackMist: 0n,
        bffSig: Array.from(extraBffSigs[i]),
      })
    }
    return tickets
  }
  return null
}

export async function verifyPassTicketSignature(
  keypair: Ed25519Keypair,
  senderAddress: string,
  ticket: PassTicketFields
): Promise<{ ok: true } | { ok: false; status: number; error: string; message: string }> {
  const payloadBytes = PassTicketPayload.serialize({
    owner: senderAddress,
    source: ticket.source,
    nullifiers: ticket.nullifiers,
    commitment: ticket.commitment,
    expires_at: ticket.expiresAt.toString(),
    escape_clawback_mist: ticket.escapeClawbackMist.toString(),
  }).toBytes()
  const isValid = await keypair.getPublicKey().verify(payloadBytes, new Uint8Array(ticket.bffSig))
  if (!isValid) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_ticket_signature',
      message: 'The ticket signature in the transaction is invalid or tampered',
    }
  }
  if (Date.now() > Number(ticket.expiresAt)) {
    return {
      ok: false,
      status: 400,
      error: 'ticket_expired',
      message: 'The ticket has expired',
    }
  }
  return { ok: true }
}
