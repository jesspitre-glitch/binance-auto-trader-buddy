-- Add signal_timing_mode to indicator_config
-- Values: 'LIVE' (intra-candle, current behavior) or 'CANDLE_CLOSE' (confirmed signal at candle close)
ALTER TABLE public.indicator_config 
ADD COLUMN signal_timing_mode text NOT NULL DEFAULT 'LIVE';

-- Add comment for documentation
COMMENT ON COLUMN public.indicator_config.signal_timing_mode IS 'Signal timing mode: LIVE (intra-candle entry) or CANDLE_CLOSE (entry only after signal confirmed at candle close)';