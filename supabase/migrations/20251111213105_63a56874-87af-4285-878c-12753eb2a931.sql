-- Add peak_price column to track highest (LONG) or lowest (SHORT) price for trailing stop
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS peak_price numeric;

-- Add trailing_stop_percent column to track the trailing distance percentage
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS trailing_stop_percent numeric DEFAULT 2.0;

COMMENT ON COLUMN public.positions.peak_price IS 'Tracks the highest price for LONG or lowest price for SHORT positions';
COMMENT ON COLUMN public.positions.trailing_stop_percent IS 'Percentage distance for trailing stop (e.g., 2.0 means 2%)';