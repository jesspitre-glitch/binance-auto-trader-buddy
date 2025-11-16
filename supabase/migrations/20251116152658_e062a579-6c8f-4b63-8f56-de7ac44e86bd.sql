-- Add RSI zone width field to indicator_config table
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS rsi_zone_width DOUBLE PRECISION DEFAULT 10;