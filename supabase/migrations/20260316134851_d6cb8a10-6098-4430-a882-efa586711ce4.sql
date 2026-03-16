
-- Supertrend indicator
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS supertrend_enabled boolean DEFAULT false;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS supertrend_hard_filter boolean DEFAULT false;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS supertrend_period integer DEFAULT 10;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS supertrend_multiplier numeric DEFAULT 3.0;

-- OBV (On Balance Volume) indicator
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS obv_enabled boolean DEFAULT false;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS obv_hard_filter boolean DEFAULT false;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS obv_lookback integer DEFAULT 5;

-- CCI (Commodity Channel Index) indicator
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS cci_enabled boolean DEFAULT false;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS cci_hard_filter boolean DEFAULT false;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS cci_period integer DEFAULT 20;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS cci_overbought numeric DEFAULT 100;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS cci_oversold numeric DEFAULT -100;

-- Parabolic SAR indicator (entry filter + exit trailing)
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS psar_enabled boolean DEFAULT false;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS psar_hard_filter boolean DEFAULT false;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS psar_af_start numeric DEFAULT 0.02;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS psar_af_increment numeric DEFAULT 0.02;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS psar_af_max numeric DEFAULT 0.2;
ALTER TABLE public.indicator_config ADD COLUMN IF NOT EXISTS psar_trailing_enabled boolean DEFAULT false;
