-- Add rollover_d_min_long to indicator_config for UI-driven LONG rollover threshold
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS rollover_d_min_long numeric DEFAULT 40;