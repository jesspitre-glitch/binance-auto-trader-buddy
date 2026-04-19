ALTER TABLE public.user_portfolio
ADD COLUMN IF NOT EXISTS binance_unrealized_pnl numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS binance_total_margin_balance numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS binance_synced_at timestamp with time zone;