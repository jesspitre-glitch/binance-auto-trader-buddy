-- Add hard_sl_pct column to indicator_config
-- This is the absolute outer stop-loss limit as a percentage from entry
-- LONG: Exit if price <= entry × (1 − hard_sl_pct/100)
-- SHORT: Exit if price >= entry × (1 + hard_sl_pct/100)
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS hard_sl_pct numeric DEFAULT 3.0;

COMMENT ON COLUMN public.indicator_config.hard_sl_pct IS 'Hard Stop Loss % - absolute outer limit from entry price. Can only tighten, never widen.';