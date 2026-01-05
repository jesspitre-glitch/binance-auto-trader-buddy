-- Refactor max_sl_after_mfe to proper feature with toggle and 2 separate values
-- Add enabled toggle
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS max_sl_after_mfe_enabled boolean DEFAULT false;

-- Add activation threshold (MFE% required to activate)
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS max_sl_after_mfe_activate_pct numeric DEFAULT 0.60;

-- Add max distance from entry (the cap on how far SL can be)
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS max_sl_after_mfe_max_dist_pct numeric DEFAULT 1.0;

-- Update existing rows: if max_sl_after_mfe_pct > 0, enable the feature and migrate value
UPDATE public.indicator_config 
SET 
  max_sl_after_mfe_enabled = (max_sl_after_mfe_pct > 0),
  max_sl_after_mfe_activate_pct = CASE WHEN max_sl_after_mfe_pct > 0 THEN max_sl_after_mfe_pct ELSE 0.60 END,
  max_sl_after_mfe_max_dist_pct = CASE WHEN max_sl_after_mfe_pct > 0 THEN max_sl_after_mfe_pct ELSE 1.0 END
WHERE max_sl_after_mfe_pct IS NOT NULL;