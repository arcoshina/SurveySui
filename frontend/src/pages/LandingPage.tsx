import { Link } from 'react-router-dom'
import { ConnectButton } from '@mysten/dapp-kit'

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">SurveySui</h1>
        <ConnectButton />
      </header>

      <section className="space-y-6">
        <h2 className="text-4xl font-bold leading-tight">
          鏈上問卷，零門檻填答
        </h2>
        <p className="text-lg text-neutral-600">
          發起者用 Markdown 寫問卷、一筆 PTB 注資；受訪者錢包 0 SUI
          也能透過 Sponsored Transaction 完成填答並領取質押憑證。
        </p>

        <div className="flex gap-3 pt-4">
          <Link
            to="/create"
            className="rounded-lg bg-black px-5 py-2.5 text-white"
          >
            建立問卷
          </Link>
          <Link
            to="/redeem"
            className="rounded-lg border border-neutral-300 px-5 py-2.5"
          >
            兌換獎勵
          </Link>
        </div>
      </section>
    </main>
  )
}
