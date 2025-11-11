-- Add open_reason and close_reason to positions table
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS open_reason TEXT,
ADD COLUMN IF NOT EXISTS close_reason TEXT;

-- Add open_reason and close_reason to trade_history table
ALTER TABLE trade_history
ADD COLUMN IF NOT EXISTS open_reason TEXT,
ADD COLUMN IF NOT EXISTS close_reason TEXT;