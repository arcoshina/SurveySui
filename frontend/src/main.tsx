import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { getFullnodeUrl, SuiClient, SuiHTTPTransport } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import '@mysten/dapp-kit/dist/index.css'
import './index.css'
import App from './App'
import { ThemeProvider, useTheme, darkTheme } from './context/ThemeContext'

const queryClient = new QueryClient()

// 連線網路由 VITE_NETWORK 決定（預設 testnet），日後切網不必改 code。
const NETWORK = (import.meta.env.VITE_NETWORK as 'testnet' | 'devnet' | 'mainnet') ?? 'testnet'

// Failover RPC endpoints — official fullnode first, community mirror as backup.
// Browser may hit intermittent CORS / rate-limit on the official endpoint;
// the wrapped fetch transparently retries the request against the next URL.
const SUISCAN_MIRROR: Record<string, string | undefined> = {
  testnet: 'https://rpc-testnet.suiscan.xyz/',
  devnet: 'https://rpc-devnet.suiscan.xyz/',
  mainnet: 'https://rpc-mainnet.suiscan.xyz/',
}
const RPC_ENDPOINTS = [getFullnodeUrl(NETWORK), SUISCAN_MIRROR[NETWORK]].filter(
  (url): url is string => Boolean(url)
)

const failoverFetch: typeof fetch = async (_input, init) => {
  let lastError: unknown = null
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, init)
      if (response.ok) return response
      lastError = new Error(`RPC ${endpoint} responded ${response.status}`)
      console.warn(`[RPC failover] ${endpoint} returned ${response.status}, trying next`)
    } catch (err) {
      lastError = err
      console.warn(`[RPC failover] ${endpoint} fetch failed, trying next`, err)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All RPC endpoints failed')
}

const networks = {
  [NETWORK]: { url: RPC_ENDPOINTS[0] },
}

const createSuiClient = (_name: string, _config: { url: string }) =>
  new SuiClient({
    transport: new SuiHTTPTransport({
      url: RPC_ENDPOINTS[0],
      fetch: failoverFetch,
    }),
  })

if (typeof window !== 'undefined') {
  ;(
    window as Window & {
      suiSdkForTesting?: { SuiClient: typeof SuiClient; Transaction: typeof Transaction }
    }
  ).suiSdkForTesting = { SuiClient, Transaction }
}

function WalletProviderWithTheme() {
  const { isDark } = useTheme()
  return (
    <WalletProvider autoConnect theme={isDark ? darkTheme : undefined}>
      <App />
    </WalletProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networks}
        defaultNetwork={NETWORK}
        createClient={
          // dapp-kit 綁定的 sui 版本與 app 不同，SuiClient 型別不相容；以 dapp-kit
          // useSuiClient 的回傳型別作為跨邊界目標型別。
          createSuiClient as unknown as (
            name: string | number,
            config: { url: string }
          ) => ReturnType<typeof import('@mysten/dapp-kit').useSuiClient>
        }
      >
        <ThemeProvider>
          <WalletProviderWithTheme />
        </ThemeProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
