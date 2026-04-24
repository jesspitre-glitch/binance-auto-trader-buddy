-- Stale Position Exit feature: 6 new nullable columns on indicator_config.
-- All columns are nullable with NO defaults. If any value is NULL or the master
-- toggle is false, the feature is skipped entirely (zero behaviour change).
ALTER TABLE public.indicator_config
  ADD COLUMN stale_exit_enabled boolean,
  ADD COLUMN stale_exit_max_duration_tf_mult numeric,
  ADD COLUMN stale_exit_peak_inactivity_tf_mult numeric,
  ADD COLUMN stale_exit_trailing_inactivity_tf_mult numeric,
  ADD COLUMN stale_exit_min_move_atr_mult numeric,
  ADD COLUMN stale_exit_use_momentum_filter boolean;