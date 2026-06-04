import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { SuiClient } from '@mysten/sui/client'
import { saveToIpfsMock, getFromIpfsMock, downloadFromWalrus } from './ipfsProxy.js'
import { cacheSurveyContent } from './cacheManager.js'

interface CacheSurveyRequestBody {
  surveyId: string
  blobId: string
}

export function registerStorageRoutes(app: FastifyInstance, deps: { suiClient: SuiClient }): void {
  // Support parsing binary data uploaded by the client
  if (!app.hasContentTypeParser('application/octet-stream')) {
    app.addContentTypeParser('application/octet-stream', (request, payload, done) => {
      const chunks: Buffer[] = []
      payload.on('data', (chunk) => chunks.push(chunk))
      payload.on('end', () => {
        done(null, Buffer.concat(chunks))
      })
      payload.on('error', (err) => {
        done(err)
      })
    })
  }

  // IPFS Mock Upload
  app.post('/api/storage/ipfs/upload', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Buffer
    if (!body || body.length === 0) {
      return reply.status(400).send({ error: 'empty_body', message: 'Binary data is required' })
    }

    try {
      const cid = await saveToIpfsMock(body)
      return reply.status(200).send({ cid })
    } catch (err: any) {
      req.log.error(err)
      return reply.status(500).send({ error: 'ipfs_upload_failed', message: err.message })
    }
  })

  // IPFS Mock Download
  app.get<{ Params: { cid: string } }>('/api/storage/ipfs/download/:cid', async (req, reply) => {
    const { cid } = req.params
    if (!cid) {
      return reply.status(400).send({ error: 'invalid_cid', message: 'CID is required' })
    }

    try {
      const data = await getFromIpfsMock(cid)
      return reply
        .header('Content-Type', 'application/octet-stream')
        .status(200)
        .send(data)
    } catch (err: any) {
      req.log.error(err)
      return reply.status(404).send({ error: 'ipfs_download_failed', message: err.message })
    }
  })

  // Walrus Proxy Download
  app.get<{ Params: { blobId: string } }>('/api/storage/walrus/download/:blobId', async (req, reply) => {
    const { blobId } = req.params
    if (!blobId) {
      return reply.status(400).send({ error: 'invalid_blob_id', message: 'Blob ID is required' })
    }

    try {
      const data = await downloadFromWalrus(blobId)
      return reply
        .header('Content-Type', 'application/octet-stream')
        .status(200)
        .send(data)
    } catch (err: any) {
      req.log.error(err)
      return reply.status(502).send({ error: 'walrus_download_failed', message: err.message })
    }
  })

  // Cache survey endpoint (zero-trust verified)
  app.post('/api/cache/survey', async (req: FastifyRequest<{ Body: CacheSurveyRequestBody }>, reply: FastifyReply) => {
    const { surveyId, blobId } = req.body ?? {}
    if (!surveyId || !blobId) {
      return reply.status(400).send({ error: 'missing_params', message: 'surveyId and blobId are required' })
    }

    try {
      await cacheSurveyContent(deps.suiClient, surveyId, blobId)
      return reply.status(200).send({ success: true })
    } catch (err: any) {
      req.log.error(`[BFF] Survey cache error: ${err.message}`)
      return reply.status(400).send({ error: 'cache_failed', message: err.message })
    }
  })
}
