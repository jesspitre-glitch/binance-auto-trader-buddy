-- Create scan_results table to store scan history
CREATE TABLE public.scan_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  signal TEXT NOT NULL CHECK (signal IN ('LONG', 'SHORT', 'NONE')),
  indicators JSONB,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  action_taken TEXT, -- 'PLACED_ORDER', 'MAX_POSITIONS', 'NO_CAPACITY', etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own scan results"
ON public.scan_results FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert scan results"
ON public.scan_results FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_results;

-- Create index for better query performance
CREATE INDEX idx_scan_results_user_created ON public.scan_results(user_id, created_at DESC);
CREATE INDEX idx_scan_results_signal ON public.scan_results(signal, created_at DESC);