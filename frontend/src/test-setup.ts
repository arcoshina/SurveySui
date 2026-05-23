import { expect, afterEach } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'

expect.extend(matchers)
afterEach(cleanup)

// jsdom 29 預設未提供 localStorage；補一個輕量 in-memory polyfill 供測試使用
if (
  typeof window !== 'undefined' &&
  !('localStorage' in window && typeof window.localStorage?.clear === 'function')
) {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>()
    get length() {
      return this.store.size
    }
    clear() {
      this.store.clear()
    }
    getItem(key: string) {
      return this.store.has(key) ? this.store.get(key)! : null
    }
    key(i: number) {
      return Array.from(this.store.keys())[i] ?? null
    }
    removeItem(key: string) {
      this.store.delete(key)
    }
    setItem(key: string, value: string) {
      this.store.set(key, String(value))
    }
  }
  Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true })
}
