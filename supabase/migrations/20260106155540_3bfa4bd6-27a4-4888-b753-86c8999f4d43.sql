-- Add fee and funding columns to trade_history for analysis
ALTER TABLE public.trade_history
ADD COLUMN entry_fee numeric DEFAULT NULL,
ADD COLUMN exit_fee numeric DEFAULT NULL,
ADD COLUMN total_fee numeric DEFAULT NULL,
ADD COLUMN funding_fee numeric DEFAULT NULL,
ADD COLUMN net_pnl numeric DEFAULT NULL;