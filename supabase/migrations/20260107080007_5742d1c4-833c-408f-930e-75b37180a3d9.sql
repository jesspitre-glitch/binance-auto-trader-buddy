-- Add separate K and D thresholds for StochRSI
-- Default values copy existing values so behavior is unchanged

ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS stochrsi_overbought_k NUMERIC DEFAULT 80,
ADD COLUMN IF NOT EXISTS stochrsi_overbought_d NUMERIC DEFAULT 80,
ADD COLUMN IF NOT EXISTS stochrsi_oversold_k NUMERIC DEFAULT 20,
ADD COLUMN IF NOT EXISTS stochrsi_oversold_d NUMERIC DEFAULT 20;

-- Copy existing values to new columns for existing rows
UPDATE public.indicator_config 
SET 
  stochrsi_overbought_k = COALESCE(stochrsi_overbought, 80),
  stochrsi_overbought_d = COALESCE(stochrsi_overbought, 80),
  stochrsi_oversold_k = COALESCE(stochrsi_oversold, 20),
  stochrsi_oversold_d = COALESCE(stochrsi_oversold, 20);