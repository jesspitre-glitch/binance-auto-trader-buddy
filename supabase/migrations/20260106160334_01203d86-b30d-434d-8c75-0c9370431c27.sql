-- Add new fee/leverage analysis columns to trade_history
ALTER TABLE public.trade_history
ADD COLUMN IF NOT EXISTS notional numeric,
ADD COLUMN IF NOT EXISTS leverage_used integer,
ADD COLUMN IF NOT EXISTS fees_pct_of_notional numeric,
ADD COLUMN IF NOT EXISTS pnl_after_fees numeric;