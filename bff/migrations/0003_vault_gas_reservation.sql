-- SurveySui BFF — M5：vault gas 補償額度的短時預留
-- 套用：cd bff && npx wrangler d1 migrations apply surveysui-bff-testnet --remote
--
-- claim 代付時，vault 補償槽（floor(gas_balance / gas_compensation_amount)）為有限資源。
-- 多筆併發 claim 各自讀到鏈上餘額足夠時會全判 vault 代付，合計卻把餘額抽乾，部分溢出
-- 交易在鏈上被靜默跳過補償（平台實付）卻未計入平台日額度。此表以 5 分鐘 TTL 的在途預留，
-- 疊在鏈上即時槽數之上，原子決定每筆 claim 走 vault 或平台代付，杜絕競態漏計。
CREATE TABLE IF NOT EXISTS vault_gas_reservation (
  vault_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vault_gas_reservation_lookup
  ON vault_gas_reservation (vault_id, created_at);
