import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export default async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL must be set for backend tests (see .env.example)',
    )
  }

  const prismaBin = require.resolve('prisma/build/index.js')
  execFileSync(
    process.execPath,
    [
      prismaBin,
      'db',
      'push',
      '--force-reset',
      '--skip-generate',
      '--accept-data-loss',
    ],
    { stdio: 'inherit' },
  )
}
