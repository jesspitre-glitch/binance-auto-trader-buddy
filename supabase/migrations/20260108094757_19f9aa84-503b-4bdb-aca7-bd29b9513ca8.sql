-- Add direction-specific Volume columns for SHORT trades
-- LONG uses existing: volume_enabled + volume_multiplier
-- SHORT uses new: volume_mode_short + volume_multiplier_short

ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS volume_mode_short TEXT NOT NULL DEFAULT 'HARD',
ADD COLUMN IF NOT EXISTS volume_multiplier_short NUMERIC(6,4) NOT NULL DEFAULT 0.50;

-- Add comment for documentation
COMMENT ON COLUMN public.indicator_config.volume_mode_short IS 'Volume mode for SHORT: OFF (disabled), SOFT (1 point), HARD (required)';
COMMENT ON COLUMN public.indicator_config.volume_multiplier_short IS 'Volume multiplier threshold for SHORT trades (default 0.50x)';