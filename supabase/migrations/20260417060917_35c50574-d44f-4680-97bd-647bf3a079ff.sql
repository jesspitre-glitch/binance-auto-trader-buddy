-- Slot signal evaluations: logs each slot's decision per scan cycle per symbol
CREATE TABLE public.slot_signal_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  slot_id UUID NOT NULL REFERENCES public.strategy_slots(id) ON DELETE CASCADE,
  scan_cycle_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  signal TEXT NOT NULL,
  qualified BOOLEAN NOT NULL DEFAULT false,
  action_taken TEXT,
  block_reason TEXT,
  indicators_summary JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.slot_signal_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own slot evaluations"
  ON public.slot_signal_evaluations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert slot evaluations"
  ON public.slot_signal_evaluations
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete old evaluations"
  ON public.slot_signal_evaluations
  FOR DELETE
  USING (true);

CREATE INDEX idx_slot_signal_eval_user_created
  ON public.slot_signal_evaluations(user_id, created_at DESC);

CREATE INDEX idx_slot_signal_eval_cycle
  ON public.slot_signal_evaluations(scan_cycle_id);

CREATE INDEX idx_slot_signal_eval_symbol
  ON public.slot_signal_evaluations(user_id, symbol, created_at DESC);

-- Auto-cleanup: schedule purge of evaluations older than 24h
-- (uses existing pg_cron infra)
SELECT cron.schedule(
  'purge-slot-signal-evaluations',
  '17 * * * *',
  $$DELETE FROM public.slot_signal_evaluations WHERE created_at < now() - interval '24 hours'$$
);