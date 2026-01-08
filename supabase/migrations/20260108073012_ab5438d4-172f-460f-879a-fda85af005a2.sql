-- Add StochRSI SHORT mode and rollover D min fields
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS stochrsi_short_mode text NOT NULL DEFAULT 'REVERSAL_OVERBOUGHT',
ADD COLUMN IF NOT EXISTS rollover_d_min_short numeric DEFAULT 50;

-- Add comment for documentation
COMMENT ON COLUMN public.indicator_config.stochrsi_short_mode IS 'SHORT mode: REVERSAL_OVERBOUGHT or CONTINUATION_OVERSOLD';
COMMENT ON COLUMN public.indicator_config.rollover_d_min_short IS 'Minimum D value for SHORT rollover entry (only used in REVERSAL_OVERBOUGHT mode)';