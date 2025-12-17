-- Add break-even structured configuration fields
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS break_even_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS break_even_ratchet_only boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS break_even_atr_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS break_even_atr_stop_offset numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS break_even_profit_pct_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS break_even_profit_pct_trigger numeric DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS break_even_profit_pct_stop_over_entry numeric DEFAULT 0.1;

-- Add comment for documentation
COMMENT ON COLUMN public.indicator_config.break_even_enabled IS 'Master toggle for break-even functionality';
COMMENT ON COLUMN public.indicator_config.break_even_ratchet_only IS 'If true, only ratchet stop up, never down';
COMMENT ON COLUMN public.indicator_config.break_even_atr_enabled IS 'Enable ATR-based break-even trigger';
COMMENT ON COLUMN public.indicator_config.break_even_atr_stop_offset IS 'ATR offset for stop after break-even activation';
COMMENT ON COLUMN public.indicator_config.break_even_profit_pct_enabled IS 'Enable profit percentage based break-even trigger';
COMMENT ON COLUMN public.indicator_config.break_even_profit_pct_trigger IS 'Profit % required to trigger break-even';
COMMENT ON COLUMN public.indicator_config.break_even_profit_pct_stop_over_entry IS 'Stop placed this % above entry after break-even';