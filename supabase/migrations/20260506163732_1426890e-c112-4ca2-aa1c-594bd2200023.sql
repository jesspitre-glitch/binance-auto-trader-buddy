ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS binance_client_order_id text,
  ADD COLUMN IF NOT EXISTS order_status text,
  ADD COLUMN IF NOT EXISTS order_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS promotion_failed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS promotion_error text;

CREATE INDEX IF NOT EXISTS idx_positions_binance_client_order_id
  ON public.positions (binance_client_order_id)
  WHERE binance_client_order_id IS NOT NULL;