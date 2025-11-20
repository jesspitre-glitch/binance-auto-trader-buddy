-- Add MACD direction filter enabled flag to indicator_config
ALTER TABLE indicator_config 
ADD COLUMN macd_direction_enabled boolean DEFAULT true;