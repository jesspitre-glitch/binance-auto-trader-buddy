-- Create funding_fees table to track Binance funding payments
CREATE TABLE public.funding_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  income_type TEXT NOT NULL DEFAULT 'FUNDING_FEE',
  income NUMERIC NOT NULL,
  asset TEXT NOT NULL DEFAULT 'USDT',
  binance_time BIGINT NOT NULL,
  transaction_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_funding_fees_user_time ON public.funding_fees(user_id, binance_time DESC);
CREATE UNIQUE INDEX idx_funding_fees_unique ON public.funding_fees(user_id, symbol, binance_time, transaction_id);

-- Enable RLS
ALTER TABLE public.funding_fees ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own funding fees"
ON public.funding_fees
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert funding fees"
ON public.funding_fees
FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.funding_fees;