import { useMemo } from 'react'
import { useCurrentAccount, useSignAndExecuteTransaction, useSignTransaction } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'

export interface ActiveSigner {
  address: string
  mode: 'wallet'
  /** 自付路徑：build + 簽名 + 廣播，回傳 digest */
  signAndExecute: (tx: Transaction) => Promise<{ digest: string }>
  /** 代付路徑：簽署 tx bytes（Uint8Array），回傳 base64 signature */
  signTxBytes: (txBytes: Uint8Array) => Promise<string>
}

/**
 * 錢包簽名者抽象（dapp-kit）。
 * 全站身份與簽署一律使用連接的 Sui 錢包。
 */
export function useActiveSigner(): ActiveSigner | null {
  const walletAccount = useCurrentAccount()
  const { mutateAsync: signAndExecuteWallet } = useSignAndExecuteTransaction()
  const { mutateAsync: signTxWallet } = useSignTransaction()

  return useMemo(() => {
    if (walletAccount) {
      return {
        address: walletAccount.address,
        mode: 'wallet' as const,
        signAndExecute: async (tx: Transaction) => {
          const res = await signAndExecuteWallet({ transaction: tx as any })
          return { digest: res.digest }
        },
        signTxBytes: async (txBytes: Uint8Array) => {
          // 將 raw bytes 包回 Transaction 供 dapp-kit 簽名
          const tx = Transaction.from(txBytes)
          const { signature } = await signTxWallet({ transaction: tx as any })
          return signature
        },
      }
    }

    return null
  }, [walletAccount, signAndExecuteWallet, signTxWallet])
}
