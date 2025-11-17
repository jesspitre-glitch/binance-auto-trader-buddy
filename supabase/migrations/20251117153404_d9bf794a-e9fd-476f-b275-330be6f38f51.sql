-- Add rsi_momentum_periods column to indicator_config table
ALTER TABLE public.indicator_config 
ADD COLUMN rsi_momentum_periods integer DEFAULT 3;

COMMENT ON COLUMN public.indicator_config.rsi_momentum_periods IS 'Antal RSI-perioder der skal checkes for momentum (stigende/faldende). Standard er 3 (RSI₀ > RSI₁ > RSI₂)';