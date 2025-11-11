-- Rename mtf_timeframe to trend_timeframe
ALTER TABLE public.indicator_config 
RENAME COLUMN mtf_timeframe TO trend_timeframe;

-- Add scan_interval column
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS scan_interval text DEFAULT '5m';

-- Update comments
COMMENT ON COLUMN public.indicator_config.trend_timeframe IS 'Higher timeframe for trend analysis (e.g. 15m, 1h)';
COMMENT ON COLUMN public.indicator_config.scan_interval IS 'Timeframe for signal scanning (e.g. 1m, 5m)';