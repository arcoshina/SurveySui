/**
 * SSRF 防護：判定一個 http/https URL 的目標主機是否指向內網/保留/link-local 位址。
 * 用於 image proxy 等「以使用者提供之 URL 對外抓取」的場景。
 *
 * 設計取捨（標準層級）：僅依 URL.hostname 字面位址 + 已知內部主機名判定，**不**解析 DNS。
 * WHATWG URL parser 已將 http(s) 的數字/八進位/十六進位 IPv4（如 2130706433、0x7f000001、
 * 0177.0.0.1）正規化為點分十進位，故對正規化後的 hostname 比對即可涵蓋這些繞過。
 * DNS rebinding（網域解析到私網 IP）由 Cloudflare Workers egress 兜底，不在本層處理。
 */

export type SsrfCheck = { ok: true } | { ok: false; reason: string }

// 結尾為這些後綴或完全等於 localhost 的主機名一律封鎖（不分大小寫）
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal']
const BLOCKED_HOST_EXACT = new Set(['localhost', 'metadata.google.internal'])

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (BLOCKED_HOST_EXACT.has(h)) return true
  return BLOCKED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix))
}

function ipv4ToOctets(hostname: string): [number, number, number, number] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null
  const parts = hostname.split('.').map((p) => Number(p))
  if (parts.some((n) => n < 0 || n > 255)) return null
  return parts as [number, number, number, number]
}

/** 是否落在私有/保留/link-local/multicast 等不可對外的 IPv4 範圍 */
function isBlockedIPv4(o: [number, number, number, number]): boolean {
  const [a, b] = o
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 CGNAT
  if (a === 127) return true // 127/8 loopback
  if (a === 169 && b === 254) return true // 169.254/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
  if (a === 192 && b === 0 && o[2] === 0) return true // 192.0.0/24
  if (a === 192 && b === 0 && o[2] === 2) return true // 192.0.2/24 TEST-NET-1
  if (a === 192 && b === 168) return true // 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18/15 benchmark
  if (a === 198 && b === 51 && o[2] === 100) return true // 198.51.100/24 TEST-NET-2
  if (a === 203 && b === 0 && o[2] === 113) return true // 203.0.113/24 TEST-NET-3
  if (a >= 224 && a <= 239) return true // 224/4 multicast
  if (a >= 240) return true // 240/4 reserved + 255.255.255.255
  return false
}

/** 解析 IPv6 字面位址（去掉中括號）為 8 組 16-bit；無法解析回 null */
function parseIPv6(host: string): number[] | null {
  const raw = host.replace(/^\[/, '').replace(/\]$/, '')
  // 拆出可能的內嵌 IPv4（如 ::ffff:127.0.0.1）
  let embeddedV4: [number, number, number, number] | null = null
  let s = raw
  const v4Match = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (v4Match) {
    embeddedV4 = ipv4ToOctets(v4Match[1])
    if (!embeddedV4) return null
    s = s.slice(0, s.length - v4Match[1].length)
    // 移除內嵌 IPv4 前的單一分隔冒號（但保留 "::" 壓縮標記）
    if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1)
  }

  const halves = s.split('::')
  if (halves.length > 2) return null

  const toGroups = (part: string): number[] | null => {
    if (part === '') return []
    const segs = part.split(':')
    const out: number[] = []
    for (const seg of segs) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(seg)) return null
      out.push(parseInt(seg, 16))
    }
    return out
  }

  const v4Groups = embeddedV4
    ? [(embeddedV4[0] << 8) | embeddedV4[1], (embeddedV4[2] << 8) | embeddedV4[3]]
    : []

  let groups: number[]
  if (halves.length === 2) {
    const head = toGroups(halves[0])
    const tail = toGroups(halves[1])
    if (head === null || tail === null) return null
    const fill = 8 - head.length - tail.length - v4Groups.length
    if (fill < 0) return null
    groups = [...head, ...new Array(fill).fill(0), ...tail, ...v4Groups]
  } else {
    const head = toGroups(halves[0])
    if (head === null) return null
    groups = [...head, ...v4Groups]
  }
  if (groups.length !== 8) return null
  return groups
}

function isBlockedIPv6(host: string): boolean {
  const g = parseIPv6(host)
  if (!g) return false // 非合法 IPv6 字面位址 → 交由主機名/IPv4 規則
  // ::（unspecified）與 ::1（loopback）
  if (g.every((x) => x === 0)) return true
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true
  const first = g[0]
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  // IPv4-mapped ::ffff:a.b.c.d → 抽出內嵌 IPv4 套規則
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    const a = (g[6] >> 8) & 0xff
    const b = g[6] & 0xff
    const c = (g[7] >> 8) & 0xff
    const d = g[7] & 0xff
    if (isBlockedIPv4([a, b, c, d])) return true
  }
  return false
}

/**
 * 驗證目標 URL 可安全對外抓取。protocol 須為 http/https 且主機非內網/保留位址。
 */
export function assertPublicHttpUrl(target: URL): SsrfCheck {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_protocol' }
  }
  const hostname = target.hostname
  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: 'blocked_hostname' }
  }
  const v4 = ipv4ToOctets(hostname)
  if (v4 && isBlockedIPv4(v4)) {
    return { ok: false, reason: 'blocked_ipv4' }
  }
  if ((hostname.includes(':') || hostname.startsWith('[')) && isBlockedIPv6(hostname)) {
    return { ok: false, reason: 'blocked_ipv6' }
  }
  return { ok: true }
}
