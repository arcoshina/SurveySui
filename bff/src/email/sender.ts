import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM ?? 'noreply@surveysui.com'

export async function sendOtpEmail(to: string, code: string, lang?: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)

  let subject = 'SurveySui 驗證碼'
  let title = '您的驗證碼'
  let bodyText = '請在 10 分鐘內輸入以下驗證碼完成身份驗證：'
  let footerText = '若您未發起此請求，請忽略此信。'

  const normalized = lang?.trim().toUpperCase()
  if (normalized === 'EN') {
    subject = 'SurveySui Verification Code'
    title = 'Your Verification Code'
    bodyText = 'Please enter the following verification code within 10 minutes to complete authentication:'
    footerText = 'If you did not make this request, please ignore this email.'
  } else if (normalized === 'JA') {
    subject = 'SurveySui 確認コード'
    title = '確認コード'
    bodyText = '本人確認を完了するため、10分以内に以下の確認コードを入力してください：'
    footerText = 'このリクエストに覚えがない場合は、このメールを無視してください。'
  } else if (normalized === 'KO') {
    subject = 'SurveySui 인증 코드'
    title = '인증 코드'
    bodyText = '본인 인증을 완료하려면 10분 이내에 아래 인증 코드를 입력하십시오:'
    footerText = '이 요청을 요청하지 않은 경우 이 이메일을 무시하십시오.'
  } else if (normalized === 'ES') {
    subject = 'Código de verificación de SurveySui'
    title = 'Su código de verificación'
    bodyText = 'Ingrese el siguiente código de verificación en un plazo de 10 minutos para completar la autenticación:'
    footerText = 'Si no realizó esta solicitud, ignore este correo electrónico.'
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: otpEmailHtml(code, title, bodyText, footerText),
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}

function otpEmailHtml(code: string, title: string, bodyText: string, footerText: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
      <h2 style="color:#1a1a1a">${title}</h2>
      <p style="font-size:14px;color:#555">${bodyText}</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;
                  background:#f5f5f5;border-radius:8px;padding:16px 0;margin:24px 0">
        ${code}
      </div>
      <p style="font-size:12px;color:#999">${footerText}</p>
    </div>
  `
}
