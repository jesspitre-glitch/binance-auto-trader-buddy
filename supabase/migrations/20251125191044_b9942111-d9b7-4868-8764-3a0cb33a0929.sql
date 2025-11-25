-- Add auto_exit_enabled column to indicator_config
ALTER TABLE public.indicator_config 
ADD COLUMN IF NOT EXISTS auto_exit_enabled boolean DEFAULT true;

COMMENT ON COLUMN public.indicator_config.auto_exit_enabled IS 'When disabled, positions will not be automatically closed by the monitor. User must close manually.';