const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../frontend/src/pages/SurveyPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replacements
const replacements = [
  {
    search: `  if (!account && phase !== 'loading' && phase !== 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full">
          <h1 className="text-2xl font-semibold text-slate-800">請連接錢包</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            本平台為確保填答真實性，需要使用您的 Sui 錢包進行零手續費交易與簽名。
          </p>
          <div className="my-3 scale-110">
            <ConnectButton />
          </div>
          <p className="text-xs text-slate-400">請點擊上方按鈕連接錢包，或重整頁面。</p>
        </div>
      </main>
    )`,
    replace: `  if (!account && phase !== 'loading' && phase !== 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800/80 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full transition-colors">
          <h1 className="text-h1">請連接錢包</h1>
          <p className="text-muted text-base leading-relaxed">
            本平台為確保填答真實性，需要使用您的 Sui 錢包進行零手續費交易與簽名。
          </p>
          <div className="my-3 scale-110">
            <ConnectButton />
          </div>
          <p className="text-muted text-sm">請點擊上方按鈕連接錢包，或重整頁面。</p>
        </div>
      </main>
    )`
  },
  {
    search: `  if (phase === 'loading') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-8 text-center space-y-4 animate-fadeIn w-full">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p aria-live="polite" className="text-sm text-slate-500 font-medium">
            載入問卷中…
          </p>
        </div>
      </main>
    )
  }`,
    replace: `  if (phase === 'loading') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800/80 shadow-xl p-8 text-center space-y-4 animate-fadeIn w-full transition-colors">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p aria-live="polite" className="text-muted text-base">
            載入問卷中…
          </p>
        </div>
      </main>
    )
  }`
  },
  {
    search: `  if ((phase === 'error' || !survey) && phase !== 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-8 text-center space-y-4 animate-fadeIn w-full">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 text-rose-500 border border-rose-100">
            <AlertTriangle size={24} />
          </div>
          <p role="alert" className="text-sm text-rose-600 font-semibold">
            問卷載入失敗，請確認網址或稍後再試。
          </p>
        </div>
      </main>
    )
  }`,
    replace: `  if ((phase === 'error' || !survey) && phase !== 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="alert-error flex flex-col items-center justify-center p-8 text-center space-y-4 animate-fadeIn w-full">
          <AlertTriangle size={32} />
          <p role="alert" className="text-base font-normal">
            問卷載入失敗，請確認網址或稍後再試。
          </p>
        </div>
      </main>
    )
  }`
  },
  {
    search: `  if (phase === 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 text-slate-400">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-800">此問卷已關閉</h1>
          <p className="text-sm text-slate-500 leading-relaxed">發起人已結束此問卷活動，目前已無法再填寫。</p>
          <Link
            to="/"
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-707 font-semibold px-6 py-3 rounded-xl transition-all shadow-sm text-sm"
          >
            返回首頁
          </Link>
        </div>
      </main>
    )
  }`,
    replace: `  if (phase === 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800/80 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full transition-colors">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-105 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
          </div>
          <h1 className="text-h1">此問卷已關閉</h1>
          <p className="text-muted text-base leading-relaxed">發起人已結束此問卷活動，目前已無法再填寫。</p>
          <Link
            to="/"
            className="btn-secondary w-full text-center"
          >
            返回首頁
          </Link>
        </div>
      </main>
    )
  }`
  },
  {
    search: `  if (phase === 'need_pass') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 animate-fadeIn w-full">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-50 border border-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <IdCard size={24} />
            </div>
            <h2 className="text-2xl font-semibold text-slate-800">
              首次填答，請先領取通行證
            </h2>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              本系統需要真人憑證 (SurveyPass) 以防範女巫攻擊。請輸入 Email 獲取驗證碼以鑄造您專屬的
              SBT 憑證卡。
            </p>
          </div>

          {!account ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-slate-500">
                要獲取或鑄造您的 SurveyPass，您必須先連結您的 Sui 錢包。
              </p>
              <div className="flex justify-center my-2">
                <ConnectButton />
              </div>
              <button
                type="button"
                onClick={() => setPhase('filling')}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline block mx-auto"
              >
                返回問卷
              </button>
            </div>
          ) : otpStep === 'input' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-bold text-slate-500 uppercase tracking-wider"
                >
                  電子郵件地址
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="respondent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 text-sm font-semibold bg-white text-slate-800"
                  required
                />
              </div>

              {issuingError && (
                <div role="alert" className="text-rose-500 text-xs font-semibold flex items-center gap-1 bg-rose-50 border border-rose-100 rounded-xl p-3">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{issuingError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPhase('filling')}
                  className="w-1/3 border border-slate-200 py-2.5 rounded-xl hover:bg-slate-50 transition-all text-sm font-semibold text-slate-650 shadow-sm"
                >
                  返回修改
                </button>
                <button
                  type="submit"
                  disabled={issuingPass}
                  className="w-2/3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm hover:brightness-110 shadow-md"
                >
                  {issuingPass ? '正在發送...' : '獲取驗證碼 →'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndMint} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  請輸入 6 位數驗證碼
                </label>
                <input
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full border border-slate-205 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 text-sm text-center font-mono font-bold tracking-widest bg-white text-slate-800"
                  required
                />
                {debugOtp && (
                  <p className="text-[10px] text-blue-700 mt-2 bg-blue-50/50 p-2.5 rounded-xl border border-blue-105 font-medium leading-relaxed">
                    開發者提示：輸入 <span className="font-bold font-mono">{debugOtp}</span>{' '}
                    即可。
                  </p>
                )}
              </div>

              {issuingError && (
                <div role="alert" className="text-rose-500 text-xs font-semibold flex items-center gap-1 bg-rose-50 border border-rose-100 rounded-xl p-3">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{issuingError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep('input')
                    setDebugOtp(null)
                  }}
                  className="w-1/3 border border-slate-200 py-2.5 rounded-xl hover:bg-slate-50 transition-all text-sm font-semibold text-slate-655 shadow-sm"
                >
                  返回修改
                </button>
                <button
                  type="submit"
                  disabled={issuingPass}
                  className="w-2/3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm hover:brightness-110 shadow-md"
                >
                  {issuingPass ? '正在驗證鑄造...' : '驗證並鑄造憑證'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    )`,
    replace: `  if (phase === 'need_pass') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800/80 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 animate-fadeIn w-full transition-colors">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-955/20 border border-blue-100 dark:border-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <IdCard size={24} />
            </div>
            <h2 className="text-h1">
              首次填答，請先領取通行證
            </h2>
            <p className="text-muted text-base mt-2 leading-relaxed">
              本系統需要真人憑證 (SurveyPass) 以防範女巫攻擊。請輸入 Email 獲取驗證碼以鑄造您專屬的
              SBT 憑證卡。
            </p>
          </div>

          {!account ? (
            <div className="text-center space-y-4">
              <p className="text-muted text-sm">
                要獲取或鑄造您的 SurveyPass，您必須先連結您的 Sui 錢包。
              </p>
              <div className="flex justify-center my-2">
                <ConnectButton />
              </div>
              <button
                type="button"
                onClick={() => setPhase('filling')}
                className="text-sm text-slate-400 dark:text-neutral-500 hover:text-slate-650 dark:hover:text-neutral-300 transition-colors underline block mx-auto font-normal"
              >
                返回問卷
              </button>
            </div>
          ) : otpStep === 'input' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="form-label"
                >
                  電子郵件地址
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="respondent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              {issuingError && (
                <div role="alert" className="alert-error break-all flex items-center gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{issuingError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPhase('filling')}
                  className="btn-outline w-1/3 flex items-center justify-center"
                >
                  返回修改
                </button>
                <button
                  type="submit"
                  disabled={issuingPass}
                  className="btn-primary w-2/3 flex items-center justify-center"
                >
                  {issuingPass ? '正在發送...' : '獲取驗證碼 →'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndMint} className="space-y-4">
              <div className="space-y-1.5">
                <label className="form-label">
                  請輸入 6 位數驗證碼
                </label>
                <input
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="form-input text-center font-mono tracking-widest"
                  required
                />
                {debugOtp && (
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-2 bg-blue-50/50 dark:bg-blue-955/20 p-2.5 rounded-xl border border-blue-105 dark:border-blue-900/30 font-normal leading-relaxed">
                    開發者提示：輸入 <span className="font-semibold font-mono">{debugOtp}</span>{' '}
                    即可。
                  </p>
                )}
              </div>

              {issuingError && (
                <div role="alert" className="alert-error break-all flex items-center gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{issuingError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep('input')
                    setDebugOtp(null)
                  }}
                  className="btn-outline w-1/3 flex items-center justify-center"
                >
                  返回修改
                </button>
                <button
                  type="submit"
                  disabled={issuingPass}
                  className="btn-primary w-2/3 flex items-center justify-center"
                >
                  {issuingPass ? '正在驗證鑄造...' : '驗證並鑄造憑證'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    )`
  },
  {
    search: `  if (phase === 'success') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 mb-1 animate-scaleIn">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-800">提交成功！</h1>
          {selfPaidMode && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 leading-relaxed w-full">
              <strong>提示：</strong>本次以自付 gas 模式完成（Gas Station 暫時不可用）
            </div>
          )}
          <p className="text-slate-500 text-sm leading-relaxed">
            感謝您的熱心參與，填答完成驗證已在鏈上通過，RWD 獎勵已發放至您的錢包！
          </p>
          <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-5 text-left w-full space-y-1 shadow-inner">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">交易雜湊（TX Hash）</p>
            <p aria-label="tx-hash" className="font-mono text-xs break-all text-blue-600 font-semibold">
              {txHash}
            </p>
          </div>
          <Link
            to="/"
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-705 font-semibold px-6 py-3 rounded-xl transition-all shadow-sm text-sm"
          >
            返回首頁
          </Link>
        </div>
      </main>
    )
  }`,
    replace: `  if (phase === 'success') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800/80 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full transition-colors">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-955/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 mb-1 animate-scaleIn">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
          </div>
          <h1 className="text-h1">提交成功！</h1>
          {selfPaidMode && (
            <div className="text-sm text-amber-700 dark:text-amber-404 bg-amber-50 dark:bg-amber-955/20 border border-amber-100 dark:border-amber-900/30 rounded-xl px-4 py-3 leading-relaxed w-full font-normal">
              <strong>提示：</strong>本次以自付 gas 模式完成（Gas Station 暫時不可用）
            </div>
          )}
          <p className="text-body leading-relaxed">
            感謝您的熱心參與，填答完成驗證已在鏈上通過，RWD 獎勵已發放至您的錢包！
          </p>
          <div className="bg-slate-50/50 dark:bg-neutral-950/30 border border-slate-100 dark:border-neutral-850 rounded-2xl p-5 text-left w-full space-y-1 shadow-inner transition-colors">
            <p className="text-xs text-slate-404 dark:text-neutral-500 font-normal uppercase tracking-wider">交易雜湊（TX Hash）</p>
            <p aria-label="tx-hash" className="font-mono text-sm break-all text-blue-700 dark:text-blue-400 font-normal">
              {txHash}
            </p>
          </div>
          <Link
            to="/"
            className="btn-secondary w-full text-center"
          >
            返回首頁
          </Link>
        </div>
      </main>
    )
  }`
  },
  {
    search: `  if (phase === 'review' || phase === 'submitting') {
    if (!survey) return null
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn">
          <div className="border-b pb-4 border-slate-100">
            <h1 className="text-2xl font-semibold text-slate-800">確認您的答案</h1>
            <p className="text-sm text-slate-500 mt-1">請在提交前核對您所填寫的回答內容。</p>
          </div>

          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            {survey.questions.map((q, i) => (
              <div key={q.id} className="bg-slate-50/50 border border-slate-100 rounded-2xl p-5 space-y-3 shadow-sm transition-colors hover:bg-slate-50">
                <div className="flex items-center justify-between border-b pb-2 border-slate-202/60">
                  <span className="text-sm font-semibold text-slate-700">第 {i + 1} 題</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-105 text-slate-500 rounded-full">
                    {q.required ? '必填' : '選填'}
                  </span>
                </div>
                <p className="font-semibold text-slate-800 text-sm leading-relaxed">{q.prompt}</p>
                <div className="bg-white border border-slate-100 rounded-xl px-4 py-2.5 shadow-inner">
                  <p className="text-blue-700 font-bold text-sm">{getAnswerDisplay(q)}</p>
                </div>
              </div>
            ))}
          </div>

          {submitError && (
            <div role="alert" className="text-rose-500 text-xs font-semibold flex items-center gap-1 bg-rose-50 border border-rose-100 rounded-xl p-3">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPhase('filling')}
              disabled={phase === 'submitting'}
              className="w-full sm:w-1/3 border border-slate-200 py-3 rounded-xl hover:bg-slate-50 transition-all text-sm font-semibold text-slate-650 shadow-sm flex items-center justify-center gap-1.5"
            >
              ⬅ 返回修改
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={phase === 'submitting'}
              className="w-full sm:w-2/3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 text-sm shadow-md flex items-center justify-center gap-1.5"
            >
              {phase === 'submitting' ? '提交中…' : '確認提交並領取獎勵 ➔'}
            </button>
          </div>
        </div>
      </main>
    )
  }`,
    replace: `  if (phase === 'review' || phase === 'submitting') {
    if (!survey) return null
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800/80 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn transition-colors">
          <div className="border-b pb-4 border-slate-100 dark:border-neutral-800">
            <h1 className="text-h1">確認您的答案</h1>
            <p className="text-muted text-base mt-1">請在提交前核對您所填寫的回答內容。</p>
          </div>

          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            {survey.questions.map((q, i) => (
              <div key={q.id} className="bg-slate-50/50 dark:bg-neutral-955/20 border border-slate-100 dark:border-neutral-855 rounded-2xl p-5 space-y-3 shadow-sm transition-colors hover:bg-slate-50 dark:hover:bg-neutral-950/40">
                <div className="flex items-center justify-between border-b pb-2 border-slate-202/60 dark:border-neutral-850">
                  <span className="text-sm font-normal text-slate-705 dark:text-neutral-350">第 {i + 1} 題</span>
                  <span className="text-[10px] font-normal px-2 py-0.5 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 rounded-full">
                    {q.required ? '必填' : '選填'}
                  </span>
                </div>
                <p className="font-normal text-slate-800 dark:text-white text-sm leading-relaxed">{q.prompt}</p>
                <div className="bg-white dark:bg-neutral-900 border border-slate-105 dark:border-neutral-800 rounded-xl px-4 py-2.5 shadow-inner">
                  <p className="text-blue-700 dark:text-blue-400 font-normal text-sm">{getAnswerDisplay(q)}</p>
                </div>
              </div>
            ))}
          </div>

          {submitError && (
            <div role="alert" className="alert-error break-all flex items-center gap-1.5">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPhase('filling')}
              disabled={phase === 'submitting'}
              className="btn-outline w-full sm:w-1/3 flex items-center justify-center gap-1.5 py-3"
            >
              ⬅ 返回修改
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={phase === 'submitting'}
              className="btn-primary w-full sm:w-2/3 flex items-center justify-center gap-1.5 py-3"
            >
              {phase === 'submitting' ? '提交中…' : '確認提交並領取獎勵 ➔'}
            </button>
          </div>
        </div>
      </main>
    )
  }`
  },
  {
    search: `  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn">
        
        {/* 頂部問卷標題與說明區 */}
        <div className="space-y-3 bg-slate-50/50 border border-slate-100 p-5 rounded-2xl animate-fadeIn">
          <h1 className="text-2xl font-bold text-slate-800">{survey.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-500 border-b border-slate-200/60 pb-3">
            <span>截止日期：{new Date(survey.deadline).toLocaleDateString('zh-TW')}</span>
            <span>單份獎勵：{survey.per_response} SSR</span>
            {survey.repeat_reward > 0 && (
              <span>重複填答：{survey.repeat_reward} SSR (上限 {1 + survey.repeat_max_times} 次)</span>
            )}
          </div>
          {survey.description && (
            <div
              aria-label="問卷說明"
              className="prose max-w-none text-sm text-slate-600 leading-relaxed pt-1"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(survey.description) }}
            />
          )}
        </div>

        {!account && (
          <div className="bg-blue-50/50 border border-blue-105 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="text-blue-800 text-left font-semibold">
              <strong>請先連結錢包：</strong> 填寫此問卷需要連結錢包並檢測您的身分憑證 (SurveyPass)。
            </div>
            <ConnectButton />
          </div>
        )}

        {isPassValid && (
          <span
            data-testid="tier-badge"
            className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 mb-2 font-bold"
          >
            <Check size={14} />
            {activePass!.effectiveTier === 0
              ? 'Email 驗證'
              : activePass!.effectiveTier === 1
                ? '社交帳號驗證'
                : '高階驗證'}
          </span>
        )}

        {/* Repeat-submission status banner */}
        {account && myClaimCount > 0 && (
          <div
            data-testid="repeat-banner"
            className={\`mb-2 rounded-2xl border px-5 py-3.5 text-sm shadow-sm \${
              atSubmissionLimit
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-blue-50/50 border-blue-100 text-blue-900'
            }\`}
          >
            {atSubmissionLimit ? (
              <p className="font-semibold">
                <strong>已達填答次數上限：</strong>您此地址已填過 {myClaimCount} 次
                {repeatsEnabled ? \`（上限 \${maxTotalSubmissions} 次）\` : ''}，無法再次提交。
              </p>
            ) : (
              <div className="space-y-1">
                <p className="font-semibold"><strong>您已填過 {myClaimCount} 次。</strong></p>
                {repeatsEnabled && (
                  <p className="text-xs text-blue-750 font-semibold">
                    再填可得 {survey.repeat_reward} SSR，還可再填 {remainingSubmissions} 次。
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  鏈上事件歷史不可抹除，每次提交都會獨立永久保留。
                </p>
              </div>
            )}
          </div>
        )}

        {validationError && (
          <div role="alert" className="text-rose-500 text-xs font-semibold flex items-center gap-1 bg-rose-50 border border-rose-100 rounded-xl p-3">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            validateAndPreview()
          }}
          noValidate
          className="space-y-6"
        >
          {survey.questions.map((q, i) => (
            <div
              key={q.id}
              className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm hover:border-slate-200 transition-colors animate-fadeIn"
            >
              <div className="flex items-center justify-between border-b pb-2 border-slate-200/60">
                <div className="flex items-center gap-3">
                  <span className={\`text-sm font-semibold transition-colors \${q.required ? 'text-rose-800' : 'text-slate-700'}\`}>
                    第 {i + 1} 題
                  </span>
                  {q.required && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 border border-rose-100 text-rose-800">
                      必填
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                  {TYPE_LABELS_INFO[q.type as QuestionType]?.label ?? q.type}
                </span>
              </div>

              <p className="text-base font-semibold text-slate-800">{q.prompt}</p>

              <div className="mt-1">
                {q.type === 'single_choice' && q.options_json && (
                  <div className="space-y-2">
                    {q.options_json.map((opt) => {
                      const isChecked = answers[q.id] === opt
                      return (
                        <label
                          key={opt}
                          className={\`flex items-center gap-2.5 text-sm font-medium cursor-pointer border rounded-xl px-3.5 py-2.5 transition-all w-full \${
                            isChecked
                              ? 'bg-blue-50/50 border-blue-200 text-blue-800 font-semibold'
                              : 'bg-slate-50/50 border-slate-100 hover:bg-slate-55 text-slate-650'
                          }\`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={isChecked}
                            onChange={() => handleAnswerChange(q.id, opt)}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 transition-colors"
                            aria-label={opt}
                          />
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'multi_choice' && q.options_json && (
                  <div className="space-y-2">
                    {q.options_json.map((opt) => {
                      const selected = (answers[q.id] as string[] | undefined) ?? []
                      const isChecked = selected.includes(opt)
                      return (
                        <label
                          key={opt}
                          className={\`flex items-center gap-2.5 text-sm font-medium cursor-pointer border rounded-xl px-3.5 py-2.5 transition-all w-full \${
                            isChecked
                              ? 'bg-blue-50/50 border-blue-200 text-blue-800 font-semibold'
                              : 'bg-slate-50/50 border-slate-100 hover:bg-slate-55 text-slate-655'
                          }\`}
                        >
                          <input
                            type="checkbox"
                            value={opt}
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selected, opt]
                                : selected.filter((s) => s !== opt)
                              handleAnswerChange(q.id, next)
                            }}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-550 border-slate-300 rounded transition-colors"
                            aria-label={opt}
                          />
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'text' && (
                  <textarea
                    className="w-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 text-sm text-slate-800 bg-white placeholder:text-slate-400 font-mono transition-all"
                    rows={3}
                    value={(answers[q.id] as string | undefined) ?? ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    aria-label={q.prompt}
                    placeholder="請輸入您的回答..."
                  />
                )}

                {q.type === 'scale' && (
                  <div className="flex flex-wrap gap-3">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const isChecked = answers[q.id] === String(n)
                      return (
                        <label
                          key={n}
                          className={\`flex flex-col items-center justify-center gap-1.5 cursor-pointer border rounded-xl p-3 w-12 h-14 transition-all \${
                            isChecked
                              ? 'bg-blue-50/50 border-blue-200 text-blue-800 font-semibold ring-2 ring-blue-500/20'
                              : 'bg-slate-50/50 border-slate-100 hover:bg-slate-50 text-slate-600'
                          }\`}
                        >
                          <span className={\`text-xs font-bold \${isChecked ? 'text-blue-700' : 'text-slate-400'}\`}>{n}</span>
                          <input
                            type="radio"
                            name={q.id}
                            value={String(n)}
                            checked={isChecked}
                            onChange={() => handleAnswerChange(q.id, String(n))}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 transition-colors"
                            aria-label={String(n)}
                          />
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {(!isPassValid || (activePass && activePass.effectiveTier < surveyMinTier)) && (
            <div className="mt-4">
              {!isPassValid ? (
                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                  <div className="text-blue-800 text-left font-semibold">
                    <strong>需要 SurveyPass 憑證：</strong> 填寫此問卷要求經過身分驗證。
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep('input')
                      setPhase('need_pass')
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md whitespace-nowrap"
                  >
                    獲取 SurveyPass 憑證
                  </button>
                </div>
              ) : (
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                  <div className="text-amber-800 text-left font-semibold">
                    <strong>憑證等級不足：</strong> 本問卷要求 Tier {surveyMinTier}
                    ，但您的憑證等級為 Tier {activePass!.effectiveTier}。
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep('input')
                      setPhase('need_pass')
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md whitespace-nowrap"
                  >
                    升級 SurveyPass 憑證
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitDisabled}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-semibold py-3.5 rounded-xl transition-all shadow-md w-full disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {submitLabel}
          </button>
        </form>
      </div>
    </main>
  )`,
    replace: `  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn transition-colors">
        
        {/* 頂部問卷標題與說明區 */}
        <div className="space-y-3 bg-slate-50/50 dark:bg-neutral-955/20 border border-slate-105 dark:border-neutral-855 p-5 rounded-2xl animate-fadeIn transition-colors">
          <h1 className="text-h1">{survey.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-normal text-slate-505 dark:text-neutral-450 border-b border-slate-200/60 dark:border-neutral-800 pb-3">
            <span>截止日期：{new Date(survey.deadline).toLocaleDateString('zh-TW')}</span>
            <span>單份獎勵：{survey.per_response} SSR</span>
            {survey.repeat_reward > 0 && (
              <span>重複填答：{survey.repeat_reward} SSR (上限 {1 + survey.repeat_max_times} 次)</span>
            )}
          </div>
          {survey.description && (
            <div
              aria-label="問卷說明"
              className="prose max-w-none text-sm text-slate-650 dark:text-neutral-300 leading-relaxed pt-1 font-normal"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(survey.description) }}
            />
          )}
        </div>

        {!account && (
          <div className="alert-info flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-left font-normal">
              <strong>請先連結錢包：</strong> 填寫此問卷需要連結錢包並檢測您的身分憑證 (SurveyPass)。
            </div>
            <ConnectButton />
          </div>
        )}

        {isPassValid && (
          <span
            data-testid="tier-badge"
            className="inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 rounded-full px-3 py-1 mb-2 font-normal transition-colors"
          >
            <Check size={14} />
            {activePass!.effectiveTier === 0
              ? 'Email 驗證'
              : activePass!.effectiveTier === 1
                ? '社交帳號驗證'
                : '高階驗證'}
          </span>
        )}

        {/* Repeat-submission status banner */}
        {account && myClaimCount > 0 && (
          <div
            data-testid="repeat-banner"
            className={\`mb-2 rounded-2xl border px-5 py-3.5 text-sm shadow-sm transition-colors \${
              atSubmissionLimit
                ? 'bg-amber-50/70 dark:bg-amber-955/20 border-amber-202 dark:border-amber-900/30 text-amber-900 dark:text-amber-400'
                : 'bg-blue-50/50 dark:bg-blue-955/20 border-blue-105 dark:border-blue-900/30 text-blue-900 dark:text-blue-300'
            }\`}
          >
            {atSubmissionLimit ? (
              <p className="font-normal">
                <strong>已達填答次數上限：</strong>您此地址已填過 {myClaimCount} 次
                {repeatsEnabled ? \`（上限 \${maxTotalSubmissions} 次）\` : ''}，無法再次提交。
              </p>
            ) : (
              <div className="space-y-1">
                <p className="font-normal"><strong>您已填過 {myClaimCount} 次。</strong></p>
                {repeatsEnabled && (
                  <p className="text-xs text-blue-700 dark:text-blue-400 font-normal">
                    再填可得 {survey.repeat_reward} SSR，還可再填 {remainingSubmissions} 次。
                  </p>
                )}
                <p className="text-xs text-slate-405 dark:text-neutral-500 font-normal">
                  鏈上事件歷史不可抹除，每次提交都會獨立永久保留。
                </p>
              </div>
            )}
          </div>
        )}

        {validationError && (
          <div role="alert" className="alert-error break-all flex items-center gap-1.5">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            validateAndPreview()
          }}
          noValidate
          className="space-y-6"
        >
          {survey.questions.map((q, i) => (
            <div
              key={q.id}
              className="bg-white dark:bg-neutral-900/40 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 space-y-4 shadow-sm hover:border-slate-250 dark:hover:border-neutral-700 transition-colors animate-fadeIn"
            >
              <div className="flex items-center justify-between border-b pb-2 border-slate-200/60 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <span className={\`text-sm font-normal transition-colors \${q.required ? 'text-rose-800 dark:text-rose-455' : 'text-slate-707 dark:text-neutral-300'}\`}>
                    第 {i + 1} 題
                  </span>
                  {q.required && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-normal bg-rose-50 dark:bg-rose-955/20 border border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400">
                      必填
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-normal px-2 py-0.5 bg-slate-105 dark:bg-neutral-800 text-slate-500 dark:text-neutral-450 rounded-full">
                  {TYPE_LABELS_INFO[q.type as QuestionType]?.label ?? q.type}
                </span>
              </div>

              <p className="text-base font-normal text-slate-800 dark:text-white">{q.prompt}</p>

              <div className="mt-1">
                {q.type === 'single_choice' && q.options_json && (
                  <div className="space-y-2">
                    {q.options_json.map((opt) => {
                      const isChecked = answers[q.id] === opt
                      return (
                        <label
                          key={opt}
                          className={\`flex items-center gap-2.5 text-sm font-normal cursor-pointer border rounded-xl px-3.5 py-2.5 transition-all w-full \${
                            isChecked
                              ? 'bg-blue-50/50 dark:bg-blue-955/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-350'
                              : 'bg-slate-50/50 dark:bg-neutral-950/20 border-slate-100 dark:border-neutral-850 hover:bg-slate-50 dark:hover:bg-neutral-950/40 text-slate-650 dark:text-neutral-400'
                          }\`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={isChecked}
                            onChange={() => handleAnswerChange(q.id, opt)}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-neutral-800 dark:border-neutral-700 transition-colors"
                            aria-label={opt}
                          />
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'multi_choice' && q.options_json && (
                  <div className="space-y-2">
                    {q.options_json.map((opt) => {
                      const selected = (answers[q.id] as string[] | undefined) ?? []
                      const isChecked = selected.includes(opt)
                      return (
                        <label
                          key={opt}
                          className={\`flex items-center gap-2.5 text-sm font-normal cursor-pointer border rounded-xl px-3.5 py-2.5 transition-all w-full \${
                            isChecked
                              ? 'bg-blue-50/50 dark:bg-blue-955/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-350'
                              : 'bg-slate-50/50 dark:bg-neutral-955/20 border-slate-100 dark:border-neutral-855 hover:bg-slate-55 dark:hover:bg-neutral-955/40 text-slate-650 dark:text-neutral-400'
                          }\`}
                        >
                          <input
                            type="checkbox"
                            value={opt}
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selected, opt]
                                : selected.filter((s) => s !== opt)
                              handleAnswerChange(q.id, next)
                            }}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-neutral-800 dark:border-neutral-700 rounded transition-colors"
                            aria-label={opt}
                          />
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'text' && (
                  <textarea
                    className="form-input font-mono"
                    rows={3}
                    value={(answers[q.id] as string | undefined) ?? ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    aria-label={q.prompt}
                    placeholder="請輸入您的回答..."
                  />
                )}

                {q.type === 'scale' && (
                  <div className="flex flex-wrap gap-3">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const isChecked = answers[q.id] === String(n)
                      return (
                        <label
                          key={n}
                          className={\`flex flex-col items-center justify-center gap-1.5 cursor-pointer border rounded-xl p-3 w-12 h-14 transition-all \${
                            isChecked
                              ? 'bg-blue-50/50 dark:bg-blue-955/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-350 ring-2 ring-blue-500/20 dark:ring-blue-900/30'
                              : 'bg-slate-50/50 dark:bg-neutral-950/20 border-slate-100 dark:border-neutral-850 hover:bg-slate-50 dark:hover:bg-neutral-950/40 text-slate-600 dark:text-neutral-400'
                          }\`}
                        >
                          <span className={\`text-xs font-normal \${isChecked ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-neutral-500'}\`}>{n}</span>
                          <input
                            type="radio"
                            name={q.id}
                            value={String(n)}
                            checked={isChecked}
                            onChange={() => handleAnswerChange(q.id, String(n))}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-neutral-800 dark:border-neutral-700 transition-colors"
                            aria-label={String(n)}
                          />
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {(!isPassValid || (activePass && activePass.effectiveTier < surveyMinTier)) && (
            <div className="mt-4">
              {!isPassValid ? (
                <div className="alert-info flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-left font-normal">
                    <strong>需要 SurveyPass 憑證：</strong> 填寫此問卷要求經過身分驗證。
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep('input')
                      setPhase('need_pass')
                    }}
                    className="btn-primary py-1.5 text-sm whitespace-nowrap animate-pulse shrink-0"
                  >
                    獲取 SurveyPass 憑證
                  </button>
                </div>
              ) : (
                <div className="bg-amber-50/55 dark:bg-amber-955/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors">
                  <div className="text-amber-850 dark:text-amber-300 text-left font-normal">
                    <strong>憑證等級不足：</strong> 本問卷要求 Tier {surveyMinTier}
                    ，但您的憑證等級為 Tier {activePass!.effectiveTier}。
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep('input')
                      setPhase('need_pass')
                    }}
                    className="btn-secondary py-1.5 text-sm text-amber-800 dark:text-amber-405 bg-amber-105 hover:bg-amber-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 whitespace-nowrap shrink-0"
                  >
                    升級 SurveyPass 憑證
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitDisabled}
            className="btn-primary w-full py-3.5"
          >
            {submitLabel}
          </button>
        </form>
      </div>
    </main>
  )`
  }
];

replacements.forEach(({ search, replace }, idx) => {
  if (!content.includes(search)) {
    console.error(`Error: Search term index ${idx} not found!`);
  } else {
    content = content.replace(search, replace);
  }
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully refactored SurveyPage.tsx!');
