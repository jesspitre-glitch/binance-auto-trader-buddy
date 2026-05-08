ALTER TABLE public.positions
ADD COLUMN IF NOT EXISTS close_failed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS close_failed_reason text,
ADD COLUMN IF NOT EXISTS close_failed_price numeric,
ADD COLUMN IF NOT EXISTS close_failed_stop_level numeric,
ADD COLUMN IF NOT EXISTS close_failed_at timestamp with time zone;