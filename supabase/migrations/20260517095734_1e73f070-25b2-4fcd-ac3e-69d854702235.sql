ALTER TABLE public.strategy_slots
  ADD COLUMN IF NOT EXISTS allowed_symbols TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.trading_session
  ADD COLUMN IF NOT EXISTS use_global_candidate_gate BOOLEAN NOT NULL DEFAULT false;