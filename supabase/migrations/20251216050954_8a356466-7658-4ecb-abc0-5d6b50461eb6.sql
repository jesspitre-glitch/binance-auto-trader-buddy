-- Add conditional time exit field to indicator_config
ALTER TABLE public.indicator_config
ADD COLUMN conditional_time_exit_enabled boolean DEFAULT true;

COMMENT ON COLUMN public.indicator_config.conditional_time_exit_enabled IS 'When enabled, timeout only closes positions when no momentum (Anti-Sour Exit)';
