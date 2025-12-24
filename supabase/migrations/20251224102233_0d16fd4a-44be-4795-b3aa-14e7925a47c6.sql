-- Add VWAP indicator columns to indicator_config
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS vwap_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS vwap_period integer DEFAULT 50;