-- Add trailing stop activation rule based on ATR profit threshold
ALTER TABLE indicator_config
ADD COLUMN trailing_stop_activation_enabled boolean DEFAULT true,
ADD COLUMN trailing_stop_activation_atr numeric DEFAULT 1.0;

COMMENT ON COLUMN indicator_config.trailing_stop_activation_enabled IS 'Enable trailing stop only after profit exceeds ATR threshold';
COMMENT ON COLUMN indicator_config.trailing_stop_activation_atr IS 'Number of ATR intervals profit must exceed before trailing stop activates';