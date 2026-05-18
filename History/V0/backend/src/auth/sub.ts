import { createHash } from 'node:crypto'

export function hashSub(sub: string): string {
  return createHash('sha256').update(sub, 'utf8').digest('hex')
}
