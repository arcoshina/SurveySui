import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SurveySui',
  description: 'Sui-powered survey platform with on-chain rewards',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  )
}
