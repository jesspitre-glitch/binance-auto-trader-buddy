-- Add break-even configuration to indicator_config
ALTER TABLE indicator_config 
ADD COLUMN break_even_atr numeric DEFAULT 1.0;

-- Add break-even tracking to positions
ALTER TABLE positions 
ADD COLUMN break_even_activated boolean DEFAULT false;