export function buildOgHtml(surveyId: string, frontendUrl: string): string {
  const surveyUrl = `${frontendUrl}/s/${surveyId}`
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${surveyUrl}" />
  <meta property="og:title" content="SurveySui 問卷" />
  <meta property="og:description" content="參與 Sui 區塊鏈問卷，完成即獲 SurveySuiReward 獎勵。" />
  <meta property="og:image" content="${frontendUrl}/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta http-equiv="refresh" content="0;url=${surveyUrl}" />
</head>
<body>
  <a href="${surveyUrl}">前往問卷</a>
</body>
</html>`
}
