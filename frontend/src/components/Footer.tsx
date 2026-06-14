/**
 * 全站共用頁腳：品牌名（語系無關）＋動態年份。
 * 由 App 佈局以 flex-col 釘在底部；上下各約一行間距。
 */
export default function Footer() {
  return (
    <footer className="py-4 text-center text-xs text-slate-400 dark:text-neutral-500 font-medium transition-colors">
      SurveySui &copy; {new Date().getFullYear()}
    </footer>
  )
}
