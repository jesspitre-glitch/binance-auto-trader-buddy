-- Add leverage to indicator_config
ALTER TABLE public.indicator_config
ADD COLUMN leverage integer DEFAULT 10;