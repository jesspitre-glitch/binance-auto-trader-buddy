-- Remove default values from new columns - everything must come from config
ALTER TABLE indicator_config
  ALTER COLUMN atr_take_profit_multiplier DROP DEFAULT,
  ALTER COLUMN ema_medium_trend DROP DEFAULT,
  ALTER COLUMN pivot_points_lookback DROP DEFAULT,
  ALTER COLUMN pivot_points_near_threshold DROP DEFAULT,
  ALTER COLUMN klines_limit DROP DEFAULT;