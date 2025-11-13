-- Add StochRSI indicator fields to indicator_config
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS stochrsi_period integer DEFAULT 14,
ADD COLUMN IF NOT EXISTS stochrsi_k_period integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS stochrsi_d_period integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS stochrsi_overbought numeric DEFAULT 80,
ADD COLUMN IF NOT EXISTS stochrsi_oversold numeric DEFAULT 20;