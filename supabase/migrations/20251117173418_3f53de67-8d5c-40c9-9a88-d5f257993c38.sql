-- Add Histogram Momentum Shift indicator fields to indicator_config table
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS histogram_momentum_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS histogram_momentum_periods INTEGER DEFAULT 3;