-- Add trend_timeframe_enabled column for independent toggle control
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS trend_timeframe_enabled boolean DEFAULT true;