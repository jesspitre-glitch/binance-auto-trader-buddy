-- Add min_atr_percent column to indicator_config table
ALTER TABLE public.indicator_config
ADD COLUMN min_atr_percent numeric DEFAULT 0.5;