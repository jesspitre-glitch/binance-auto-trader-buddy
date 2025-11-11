-- Add strategy_hash to positions and trade_history tables
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS strategy_hash text;

ALTER TABLE public.trade_history 
ADD COLUMN IF NOT EXISTS strategy_hash text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_trade_history_strategy_hash 
ON public.trade_history(strategy_hash);

CREATE INDEX IF NOT EXISTS idx_positions_strategy_hash 
ON public.positions(strategy_hash);

-- Add comment explaining the field
COMMENT ON COLUMN public.positions.strategy_hash IS 'SHA-256 hash of the indicator config used for this position';
COMMENT ON COLUMN public.trade_history.strategy_hash IS 'SHA-256 hash of the indicator config used for this trade';