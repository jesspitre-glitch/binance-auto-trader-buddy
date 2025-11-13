-- Add enabled flags for all indicators
ALTER TABLE indicator_config
  ADD COLUMN IF NOT EXISTS ema_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS rsi_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS stochrsi_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS macd_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS bb_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS atr_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS adx_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS volume_enabled boolean DEFAULT true;