-- Add higher trend timeframe filter for overall market direction
ALTER TABLE indicator_config 
ADD COLUMN IF NOT EXISTS higher_trend_timeframe text DEFAULT '1h';

COMMENT ON COLUMN indicator_config.higher_trend_timeframe IS 'Overordnet trend timeframe filter - blokerer LONG hvis bearish, SHORT hvis bullish';