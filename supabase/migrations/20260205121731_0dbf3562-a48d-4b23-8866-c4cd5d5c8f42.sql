-- Add stochrsi_long_mode to indicator_config for LONG signal mode selection
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS stochrsi_long_mode text NOT NULL DEFAULT 'REVERSAL_OVERSOLD';