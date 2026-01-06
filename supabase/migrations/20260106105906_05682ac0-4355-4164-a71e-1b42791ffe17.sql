-- Add enabled toggle for Hard SL %
ALTER TABLE public.indicator_config 
ADD COLUMN hard_sl_pct_enabled boolean DEFAULT true;