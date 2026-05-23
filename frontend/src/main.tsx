import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import '@mysten/dapp-kit/dist/index.css'
import './index.css'
import App from './App'

const queryClient = new QueryClient()

const networks = {
  devnet: { url: getFullnodeUrl('devnet') },
}

if (typeof window !== 'undefined') {
  ;(window as any).suiSdkForTesting = { SuiClient, Transaction }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="devnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
