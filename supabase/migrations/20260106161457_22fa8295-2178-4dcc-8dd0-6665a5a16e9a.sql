-- Add fees_data_missing column to track trades without accurate fee data
ALTER TABLE public.trade_history 
ADD COLUMN IF NOT EXISTS fees_data_missing boolean DEFAULT false;