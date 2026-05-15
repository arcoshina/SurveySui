import Fastify from 'fastify'
import cors from '@fastify/cors'

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })

app.get('/health', async () => {
  return { status: 'ok' }
})

const port = Number(process.env.PORT) || 4000
await app.listen({ port, host: '0.0.0.0' })
