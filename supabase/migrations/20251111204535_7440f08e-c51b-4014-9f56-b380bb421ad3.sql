-- Enable realtime for trade_history and ensure full row data
ALTER TABLE public.trade_history REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_history;