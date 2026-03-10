ALTER TABLE public.indicator_config ADD COLUMN strategy_params_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Initialize: for existing configs, copy updated_at as baseline
UPDATE public.indicator_config SET strategy_params_changed_at = updated_at WHERE strategy_params_changed_at IS NULL;