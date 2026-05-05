CREATE TABLE public.exit_stop_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  position_id uuid NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL,
  price numeric,
  peak_price numeric,
  active_stop numeric,
  trailing_stop numeric,
  stop_loss numeric,
  break_even_price numeric,
  peak_lock_stop numeric,
  active_exit_rule text NOT NULL DEFAULT 'NONE',
  source text,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.exit_stop_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exit stop history"
  ON public.exit_stop_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert exit stop history"
  ON public.exit_stop_history FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_exit_stop_history_user_symbol_time
  ON public.exit_stop_history (user_id, symbol, recorded_at);

CREATE INDEX idx_exit_stop_history_position_time
  ON public.exit_stop_history (position_id, recorded_at);