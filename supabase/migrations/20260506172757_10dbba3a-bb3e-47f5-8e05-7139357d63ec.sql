-- Add column to track canonical row for duplicates
ALTER TABLE public.trade_history
  ADD COLUMN IF NOT EXISTS duplicate_of_trade_id uuid;

-- Mark legacy duplicate rows. Group by (user_id, symbol, side, entry_price, opened-minute).
-- Canonical = oldest closed_at then created_at. Others are flagged DUPLICATE.
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY user_id, symbol, side, entry_price, date_trunc('minute', opened_at)
      ORDER BY closed_at ASC NULLS LAST, created_at ASC
    ) AS canonical_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, symbol, side, entry_price, date_trunc('minute', opened_at)
      ORDER BY closed_at ASC NULLS LAST, created_at ASC
    ) AS rn
  FROM public.trade_history
  WHERE close_reason IS DISTINCT FROM 'DUPLICATE'
)
UPDATE public.trade_history th
SET close_reason = 'DUPLICATE',
    duplicate_of_trade_id = r.canonical_id
FROM ranked r
WHERE th.id = r.id
  AND r.rn > 1;

CREATE INDEX IF NOT EXISTS idx_trade_history_duplicate_of
  ON public.trade_history (duplicate_of_trade_id)
  WHERE duplicate_of_trade_id IS NOT NULL;