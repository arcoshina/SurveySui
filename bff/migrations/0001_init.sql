-- SurveySui BFF — D1 初始 schema
-- 取代原本 bff/src/security/db.ts 的本地 SQLite（@libsql/client，file:./data/surveysui.db）。
-- 套用：cd bff && npx wrangler d1 migrations apply surveysui-bff-testnet --remote

-- 撤銷的 World ID / 身分 nullifier（防重複領 Pass）
CREATE TABLE IF NOT EXISTS revoked_nullifiers (
  nullifier_hash TEXT PRIMARY KEY,
  source INTEGER NOT NULL,
  revoked_at INTEGER NOT NULL,
  pass_id TEXT,
  reason TEXT
);

-- 平台代付每日額度計數（claim 代付硬上限）
CREATE TABLE IF NOT EXISTS platform_sponsor_daily (
  sender_address TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sender_address, day)
);

-- 單錢包代付速率限制（時間視窗計數）
CREATE TABLE IF NOT EXISTS wallet_sponsor_rate (
  sender_address TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sender_address, window_start)
);

-- Pass 代付終生額度的短時預留（5 分鐘 TTL，疊在鏈上即時數之上防競態超賣）
CREATE TABLE IF NOT EXISTS pass_sponsor_reservation (
  sender_address TEXT NOT NULL,
  sponsor_address TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pass_sponsor_reservation_lookup
  ON pass_sponsor_reservation (sender_address, sponsor_address, created_at);

-- 即時票券槽預留（mint SurveyPass 時的去重）
CREATE TABLE IF NOT EXISTS realtime_ticket_slot (
  wallet_address TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (wallet_address, vault_id)
);

-- 鏈上代付計數快取（45 秒 TTL，減少 RPC）
CREATE TABLE IF NOT EXISTS pass_sponsor_onchain_cache (
  sender_address TEXT NOT NULL,
  sponsor_address TEXT NOT NULL,
  package_scope TEXT NOT NULL,
  since_ms INTEGER NOT NULL,
  count INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (sender_address, sponsor_address, package_scope, since_ms)
);

-- 背景任務進度游標（§6：purge/close 有界推進跨多次 cron 觸發續跑）
CREATE TABLE IF NOT EXISTS task_cursor (
  task TEXT PRIMARY KEY,
  cursor TEXT,
  updated_at INTEGER NOT NULL
);

-- Email OTP（原 MemoryOtpStore；10 分鐘 TTL）
CREATE TABLE IF NOT EXISTS otp (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- OAuth PKCE state（原 MemoryOAuthStore；10 分鐘 TTL）
CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  provider TEXT NOT NULL,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- 票券 mint 速率限制（原 revocation.ts 的 LRU；預設 1 小時 TTL）
CREATE TABLE IF NOT EXISTS mint_rate_limit (
  key TEXT PRIMARY KEY,
  recorded_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- HTTP 端點速率限制（取代 @fastify/rate-limit；以 ip+route+window 為 bucket）
CREATE TABLE IF NOT EXISTS http_rate_limit (
  bucket TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
