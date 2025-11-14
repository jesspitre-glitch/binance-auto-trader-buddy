-- Add minimum EMA spread percentage filter to indicator_config
ALTER TABLE indicator_config 
ADD COLUMN min_ema_spread_percent numeric DEFAULT 0.2;

COMMENT ON COLUMN indicator_config.min_ema_spread_percent IS 'Minimum required spread between EMA Fast and EMA Slow as percentage of price (e.g. 0.2 for 0.2%)';