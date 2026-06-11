import { bcs } from '@mysten/sui/bcs'
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

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
    const ticket = parsePassTicketFromArgs(getPureBytes, args, 3)
    return ticket ? [ticket] : null
  }
  if (fn === 'mint_pass') {
    const ticket = parsePassTicketFromArgs(getPureBytes, args, 4)
    return ticket ? [ticket] : null
  }
  if (fn === 'mint_pass_with_extra_credentials') {
    const primary = parsePassTicketFromArgs(getPureBytes, args, 4)
    if (!primary) return null
    const extraSourcesBytes = getPureBytes(args[10])
    const extraNullifiersBytes = getPureBytes(args[11])
    const extraCommitmentsBytes = getPureBytes(args[12])
    const extraExpiresAtBytes = getPureBytes(args[13])
    const extraBffSigsBytes = getPureBytes(args[14])
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
