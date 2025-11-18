-- Add Candle Momentum Filter columns to indicator_config
ALTER TABLE public.indicator_config
ADD COLUMN candle_momentum_enabled boolean DEFAULT true,
ADD COLUMN min_candle_body_percent numeric DEFAULT 0.10;