-- Remove volume_spike_multiplier column
ALTER TABLE public.indicator_config 
DROP COLUMN IF EXISTS volume_spike_multiplier;