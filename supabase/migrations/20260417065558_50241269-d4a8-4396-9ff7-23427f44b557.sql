-- Add master_scan_slot_id to trading_session
-- This slot's config drives the global symbol scan; all other active slots
-- evaluate the resulting candidate symbols against their own filters.
ALTER TABLE public.trading_session
  ADD COLUMN IF NOT EXISTS master_scan_slot_id uuid REFERENCES public.strategy_slots(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trading_session.master_scan_slot_id IS
  'Slot whose config is used to scan all symbols and produce the candidate pool. Other active slots evaluate these candidates against their own filters.';