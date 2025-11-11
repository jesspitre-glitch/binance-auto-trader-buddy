-- Add missing config parameters
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS rsi_min_long numeric DEFAULT 30,
ADD COLUMN IF NOT EXISTS rsi_max_short numeric DEFAULT 70,
ADD COLUMN IF NOT EXISTS volume_avg_period integer DEFAULT 20,
ADD COLUMN IF NOT EXISTS signal_conditions_required integer DEFAULT 5;