-- Create table to store daily balance snapshots at UTC midnight
CREATE TABLE public.daily_balance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  futures_balance NUMERIC NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one snapshot per user per day
CREATE UNIQUE INDEX idx_daily_balance_user_date ON public.daily_balance_snapshots(user_id, snapshot_date);

-- Enable RLS
ALTER TABLE public.daily_balance_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own balance snapshots" 
ON public.daily_balance_snapshots 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert balance snapshots" 
ON public.daily_balance_snapshots 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service role can update balance snapshots" 
ON public.daily_balance_snapshots 
FOR UPDATE 
USING (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_balance_snapshots;