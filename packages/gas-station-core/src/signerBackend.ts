/** Reserved for Phase 2 multisig / KMS sponsor signing. */
export interface SignerBackend {
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>
  getSponsorAddress(): string
}

export class Ed25519SignerBackend implements SignerBackend {
  constructor(
    private readonly keypair: {
      getPublicKey(): { toSuiAddress(): string }
      signTransaction(bytes: Uint8Array): Promise<{ signature: string }>
    }
  ) {}

  getSponsorAddress(): string {
    return this.keypair.getPublicKey().toSuiAddress()
  }

  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    return this.keypair.signTransaction(txBytes)
  }
}
