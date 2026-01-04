-- Peak-Lock Trailing - Procent-baseret trailing stop
ALTER TABLE public.indicator_config
ADD COLUMN IF NOT EXISTS peak_lock_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS peak_lock_activate_profit_pct numeric DEFAULT 0.60,
ADD COLUMN IF NOT EXISTS peak_lock_distance_pct numeric DEFAULT 0.35,
ADD COLUMN IF NOT EXISTS peak_lock_min_profit_floor_pct numeric DEFAULT 0.15,
ADD COLUMN IF NOT EXISTS peak_lock_ratchet_only boolean DEFAULT true;