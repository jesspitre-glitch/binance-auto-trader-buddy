-- Add configurable entry window for CANDLE_CLOSE mode (in seconds)
-- Default 120 seconds (2 minutes) to allow for cron jitter/latency
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS candle_close_entry_window_seconds integer DEFAULT 120;

COMMENT ON COLUMN public.indicator_config.candle_close_entry_window_seconds IS 'Time window in seconds at start of new candle where entry is allowed in CANDLE_CLOSE mode';