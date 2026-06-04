import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM ?? 'noreply@example.com'

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'SurveySui 驗證碼',
    html: otpEmailHtml(code),
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}

function otpEmailHtml(code: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
      <h2 style="color:#1a1a1a">您的驗證碼</h2>
      <p style="font-size:14px;color:#555">請在 10 分鐘內輸入以下驗證碼完成身份驗證：</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;
                  background:#f5f5f5;border-radius:8px;padding:16px 0;margin:24px 0">
        ${code}
      </div>
      <p style="font-size:12px;color:#999">若您未發起此請求，請忽略此信。</p>
    </div>
  `
}
