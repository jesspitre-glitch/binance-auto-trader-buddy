-- Add hard_filter toggle columns for each indicator
-- When true: indicator acts as hard filter (must pass to trade)
-- When false: indicator acts as soft condition (contributes to signal score)

-- EMA hard filter (not just trend, but spread as well)
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS ema_hard_filter boolean DEFAULT true;

-- RSI hard filter
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS rsi_hard_filter boolean DEFAULT true;

-- StochRSI hard filter  
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS stochrsi_hard_filter boolean DEFAULT false;

-- Pivot Points hard filter
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS pivot_points_hard_filter boolean DEFAULT false;

-- MACD hard filter (histogram shift)
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS macd_hard_filter boolean DEFAULT false;

-- Bollinger Bands hard filter
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS bb_hard_filter boolean DEFAULT false;

-- VWAP hard filter
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS vwap_hard_filter boolean DEFAULT false;

-- ATR hard filter
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS atr_hard_filter boolean DEFAULT true;

-- ADX hard filter
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS adx_hard_filter boolean DEFAULT true;

-- Volume hard filter
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS volume_hard_filter boolean DEFAULT true;

-- Higher Trend hard filter
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS higher_trend_hard_filter boolean DEFAULT true;