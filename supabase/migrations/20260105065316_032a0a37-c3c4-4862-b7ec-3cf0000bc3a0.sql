-- Add max_sl_after_mfe_pct column to indicator_config
-- When MFE (max favorable excursion) reaches this threshold, 
-- cap the stop-loss to not be further than this % from entry (only before BE triggers)
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS max_sl_after_mfe_pct numeric DEFAULT 0;