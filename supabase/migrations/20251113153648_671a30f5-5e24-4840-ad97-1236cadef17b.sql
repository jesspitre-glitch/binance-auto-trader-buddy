-- Add Pivot Points indicator configuration
ALTER TABLE indicator_config
ADD COLUMN IF NOT EXISTS pivot_points_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS pivot_points_timeframe text DEFAULT '1d';