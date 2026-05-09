-- Add reconciliation/orphan recovery tracking columns to positions
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS is_orphan_recovery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_reason text,
  ADD COLUMN IF NOT EXISTS recovered_at timestamp with time zone;

-- Index to quickly find existing OPEN orphan recovery rows per symbol/side
CREATE INDEX IF NOT EXISTS idx_positions_orphan_open
  ON public.positions (user_id, symbol, side)
  WHERE is_orphan_recovery = true AND status = 'OPEN';

-- Audit log for reconciliation events
CREATE TABLE IF NOT EXISTS public.reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL, -- ORPHAN_EXPOSURE_DETECTED | ORPHAN_EXPOSURE_RECOVERED | DB_BINANCE_QTY_MISMATCH_CRITICAL | ORPHAN_EXPOSURE_UPDATED
  symbol text NOT NULL,
  side text,
  binance_qty numeric,
  db_qty_sum numeric,
  diff numeric,
  binance_entry numeric,
  binance_unrealized_profit numeric,
  position_id uuid,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reconciliation log"
  ON public.reconciliation_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert reconciliation log"
  ON public.reconciliation_log FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_reconciliation_log_user_created
  ON public.reconciliation_log (user_id, created_at DESC);