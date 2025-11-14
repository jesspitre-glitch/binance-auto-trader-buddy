-- Add volume multiplier filter to indicator_config
ALTER TABLE indicator_config 
ADD COLUMN volume_multiplier numeric DEFAULT 1.2;

COMMENT ON COLUMN indicator_config.volume_multiplier IS 'Minimum volume multiplier vs average (e.g. 1.2 means volume must be 120% of average)';