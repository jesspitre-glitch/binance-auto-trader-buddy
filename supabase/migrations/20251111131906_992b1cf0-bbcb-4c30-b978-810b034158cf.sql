-- Create user_portfolio table for tracking deposits/withdrawals and balance
CREATE TABLE public.user_portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  futures_capital DECIMAL(20,8) DEFAULT 0,
  futures_deposited DECIMAL(20,8) DEFAULT 0,
  futures_withdrawn DECIMAL(20,8) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.user_portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own portfolio"
  ON public.user_portfolio FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own portfolio"
  ON public.user_portfolio FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own portfolio"
  ON public.user_portfolio FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_portfolio_updated_at
  BEFORE UPDATE ON public.user_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();