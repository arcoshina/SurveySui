import { decodeJwt, jwtToAddress } from '@mysten/sui/zklogin'

export interface ZkLoginFinalizeInput {
  jwt: string
  zkProof?: unknown
  ephPubkey: string
  maxEpoch: number
  salt: string
}

export interface ZkLoginVerificationResult {
  sub: string
  iss: string
  aud: string
  suiAddress: string
}

export type ZkLoginVerificationErrorCode =
  | 'invalid_jwt'
  | 'invalid_proof'
  | 'expired'

export class ZkLoginVerificationError extends Error {
  readonly code: ZkLoginVerificationErrorCode

  constructor(code: ZkLoginVerificationErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'ZkLoginVerificationError'
  }
}

export interface ZkLoginVerifier {
  verify(input: ZkLoginFinalizeInput): Promise<ZkLoginVerificationResult>
}

export interface ProdZkLoginVerifierConfig {
  googleClientId: string
  googleIssuer?: string
}

export class ProdZkLoginVerifier implements ZkLoginVerifier {
  constructor(private readonly config: ProdZkLoginVerifierConfig) {}

  async verify(input: ZkLoginFinalizeInput): Promise<ZkLoginVerificationResult> {
    let payload: ReturnType<typeof decodeJwt>
    try {
      payload = decodeJwt(input.jwt)
    } catch {
      throw new ZkLoginVerificationError('invalid_jwt', 'JWT decode failed')
    }

    const expectedIssuer = this.config.googleIssuer ?? 'https://accounts.google.com'
    if (!payload.sub || !payload.iss || !payload.aud) {
      throw new ZkLoginVerificationError('invalid_jwt', 'JWT missing required claims')
    }
    if (payload.iss !== expectedIssuer) {
      throw new ZkLoginVerificationError('invalid_jwt', 'JWT issuer mismatch')
    }
    if (payload.aud !== this.config.googleClientId) {
      throw new ZkLoginVerificationError('invalid_jwt', 'JWT audience mismatch')
    }
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      throw new ZkLoginVerificationError('expired', 'JWT expired')
    }

    let suiAddress: string
    try {
      suiAddress = jwtToAddress(input.jwt, input.salt)
    } catch {
      throw new ZkLoginVerificationError('invalid_proof', 'address derivation failed')
    }

    return {
      sub: payload.sub,
      iss: payload.iss,
      aud: payload.aud,
      suiAddress,
    }
  }
}
