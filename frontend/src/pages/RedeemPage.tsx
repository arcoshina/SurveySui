export default function RedeemPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">兌換 SurveySuiReward</h1>
      <p className="mt-3 text-neutral-600">
        列出你持有的 stakedSurveySuiReward，選擇後呼叫 amm_pool::redeem
        燒掉 sSSR 換 SSR。
      </p>
      <p className="mt-6 text-sm text-neutral-500">
        （T4.5 待實作）
      </p>
    </main>
  )
}
