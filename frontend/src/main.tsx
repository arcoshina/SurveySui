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

// Failover RPC endpoints — official devnet first, community mirror as backup.
// Browser may hit intermittent CORS / rate-limit on the official endpoint;
// the wrapped fetch transparently retries the request against the next URL.
const DEVNET_RPC_ENDPOINTS = [
  getFullnodeUrl('devnet'),
  'https://rpc-devnet.suiscan.xyz/',
]

const failoverFetch: typeof fetch = async (_input, init) => {
  let lastError: unknown = null
  for (const endpoint of DEVNET_RPC_ENDPOINTS) {
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
  devnet: { url: DEVNET_RPC_ENDPOINTS[0] },
}

const createSuiClient = (_name: string, _config: { url: string }) =>
  new SuiClient({
    transport: new SuiHTTPTransport({
      url: DEVNET_RPC_ENDPOINTS[0],
      fetch: failoverFetch,
    }),
  })

if (typeof window !== 'undefined') {
  ;(window as any).suiSdkForTesting = { SuiClient, Transaction }
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
        defaultNetwork="devnet"
        createClient={createSuiClient as any}
      >
        <ThemeProvider>
          <WalletProviderWithTheme />
        </ThemeProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
