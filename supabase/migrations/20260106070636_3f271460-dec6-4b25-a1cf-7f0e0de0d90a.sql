-- Add low_price to positions for tracking worst price during trade (like peak_price for MFE)
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS low_price numeric;

-- Add MAE fields to trade_history for logging
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS mae numeric;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS mae_percent numeric;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS low_price numeric;