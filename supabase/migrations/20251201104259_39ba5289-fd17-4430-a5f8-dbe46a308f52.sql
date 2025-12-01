-- Add ema_trend_hard_filter column to indicator_config
ALTER TABLE public.indicator_config 
ADD COLUMN ema_trend_hard_filter boolean DEFAULT false;

COMMENT ON COLUMN public.indicator_config.ema_trend_hard_filter IS 'When enabled, EMA trend alignment becomes a hard filter instead of soft condition';
