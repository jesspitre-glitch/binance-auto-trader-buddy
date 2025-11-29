-- Add higher_trend_enabled column to indicator_config table
ALTER TABLE indicator_config 
ADD COLUMN higher_trend_enabled boolean DEFAULT true;

COMMENT ON COLUMN indicator_config.higher_trend_enabled IS 'Enable/disable higher trend timeframe filter';