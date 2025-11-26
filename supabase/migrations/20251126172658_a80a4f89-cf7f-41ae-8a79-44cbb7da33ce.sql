-- Add toggles for adaptive ATR and ADX features
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS adaptive_atr_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS adaptive_adx_enabled boolean DEFAULT false;