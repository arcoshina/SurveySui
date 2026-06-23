import { useMemo } from 'react'
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignTransaction,
  useSuiClientContext,
} from '@mysten/dapp-kit'
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
  // dApp 設定的目標網路（來自 SuiClientProvider 的 defaultNetwork/VITE_NETWORK）。
  // 顯式鎖定 chain，避免錢包停在其他網路時把交易送錯鏈（如 testnet package 在 mainnet 找不到）。
  const { network } = useSuiClientContext()
  const chain = `sui:${network}` as `${string}:${string}`

  return useMemo(() => {
    if (walletAccount) {
      return {
        address: walletAccount.address,
        mode: 'wallet' as const,
        signAndExecute: async (tx: Transaction) => {
          // dapp-kit 綁定的 sui 版本與 app 不同，Transaction 型別 #private 不相容，跨邊界轉型。
          const res = await signAndExecuteWallet({
            transaction: tx as unknown as Parameters<typeof signAndExecuteWallet>[0]['transaction'],
            chain,
          })
          return { digest: res.digest }
        },
        signTxBytes: async (txBytes: Uint8Array) => {
          // 將 raw bytes 包回 Transaction 供 dapp-kit 簽名
          const tx = Transaction.from(txBytes)
          const { signature } = await signTxWallet({
            transaction: tx as unknown as Parameters<typeof signTxWallet>[0]['transaction'],
            chain,
          })
          return signature
        },
      }
    }

    return null
  }, [walletAccount, signAndExecuteWallet, signTxWallet, chain])
}
