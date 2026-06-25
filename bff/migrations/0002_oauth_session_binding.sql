-- M3 修復：OAuth session 綁定
-- 為 oauth_state 增加 sid_hash 欄位，用以把 callback 綁回發起 authorize 的同一瀏覽器
-- （sid 存於 HttpOnly cookie，DB 僅存 sha256(sid)）。
-- 套用：cd bff && npx wrangler d1 migrations apply surveysui-bff-testnet --remote

ALTER TABLE oauth_state ADD COLUMN sid_hash TEXT;
