-- Unique partial index: only ONE open position per user+slot+symbol
-- This is the ultimate database-level guard against race conditions
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_position_per_slot_symbol
ON public.positions (user_id, slot_id, symbol)
WHERE (status = 'OPEN' OR status = 'PENDING');

-- Also add index for positions without slot_id (legacy)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_position_legacy_symbol
ON public.positions (user_id, symbol)
WHERE (status = 'OPEN' OR status = 'PENDING') AND slot_id IS NULL;