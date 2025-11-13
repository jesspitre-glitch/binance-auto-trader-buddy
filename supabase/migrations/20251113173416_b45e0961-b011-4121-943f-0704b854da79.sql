-- Add new indicator config columns for improved strategy
ALTER TABLE indicator_config
  ADD COLUMN IF NOT EXISTS atr_take_profit_multiplier numeric DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ema_medium_trend integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS pivot_points_lookback integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS pivot_points_near_threshold numeric DEFAULT 0.002,
  ADD COLUMN IF NOT EXISTS klines_limit integer DEFAULT 100;

-- Remove deprecated risk_reward_ratio column
ALTER TABLE indicator_config
  DROP COLUMN IF EXISTS risk_reward_ratio;