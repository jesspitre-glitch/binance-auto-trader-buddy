
-- Add fees_pending flag for delayed fee reconciliation
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS fees_pending boolean DEFAULT false;

-- Add reconciled_at timestamp to track when fees were last reconciled
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS fees_reconciled_at timestamp with time zone DEFAULT NULL;
