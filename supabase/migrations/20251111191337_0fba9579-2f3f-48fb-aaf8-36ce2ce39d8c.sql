-- Add position_size_percent column
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS position_size_percent numeric DEFAULT 5;