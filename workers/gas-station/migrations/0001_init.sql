CREATE TABLE IF NOT EXISTS platform_sponsor_daily (
  sender_address TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sender_address, day)
);

CREATE TABLE IF NOT EXISTS wallet_sponsor_rate (
  sender_address TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sender_address, window_start)
);
