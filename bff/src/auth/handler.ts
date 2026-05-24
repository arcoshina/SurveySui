import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { otpStore } from './otpStore.js'
import { computeNullifierHash, signTicket } from './ticket.js'

interface OtpRequestBody {
  email: string
}

interface VerifyRequestBody {
  email: string
  code: string
  owner: string
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // POST /auth/email/otp
  app.post(
    '/auth/email/otp',
    async (req: FastifyRequest<{ Body: OtpRequestBody }>, reply: FastifyReply) => {
      const { email } = req.body
      if (!email || !email.includes('@')) {
        return reply.status(400).send({ error: 'Invalid email address' })
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString()
      otpStore.set(email, code)

      console.log(`[OTP] Email: ${email}, Code: ${code}`)

      const responsePayload: { message: string; code?: string } = {
        message: 'OTP sent successfully',
      }
      if (process.env.NODE_ENV !== 'production') {
        responsePayload.code = code
      }

      return responsePayload
    }
  )

  // POST /auth/email/verify
  app.post(
    '/auth/email/verify',
    async (req: FastifyRequest<{ Body: VerifyRequestBody }>, reply: FastifyReply) => {
      const { email, code, owner } = req.body
      if (!email || !code || !owner) {
        return reply.status(400).send({ error: 'Missing required fields' })
      }

      const storedCode = otpStore.get(email)
      if (!storedCode || storedCode !== code) {
        return reply.status(401).send({ error: 'Invalid or expired OTP code' })
      }

      otpStore.invalidate(email)

      try {
        const nullifierHash = computeNullifierHash(email)
        const source = 2 // SRC_EMAIL
        const commitment = new Uint8Array(0)
        const ttlMs = Number(process.env.BFF_PASS_TTL_MS) || 7 * 24 * 60 * 60 * 1000
        const expiresAtMs = Date.now() + ttlMs

        const ticket = await signTicket(owner, source, nullifierHash, commitment, expiresAtMs)

        return {
          ...ticket,
          source,
        }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: err.message || 'Failed to sign ticket' })
      }
    }
  )
}
