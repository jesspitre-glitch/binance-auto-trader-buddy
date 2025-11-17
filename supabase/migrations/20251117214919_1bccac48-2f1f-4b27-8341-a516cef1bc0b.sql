-- Add minimum ATR hard filter column to indicator_config
ALTER TABLE public.indicator_config
ADD COLUMN min_atr numeric DEFAULT 0;