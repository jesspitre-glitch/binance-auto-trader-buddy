-- Add max_ema_spread_percent column for the Maximum EMA Spread hard filter
ALTER TABLE public.indicator_config
ADD COLUMN max_ema_spread_percent numeric DEFAULT 5.0;