-- Enable full row data for realtime updates on positions table
ALTER TABLE public.positions REPLICA IDENTITY FULL;