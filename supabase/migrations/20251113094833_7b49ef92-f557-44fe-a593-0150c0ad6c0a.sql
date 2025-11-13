
-- Forhindre fremtidige duplikater: Kun én OPEN position per (user_id, symbol)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_position_per_user_symbol 
ON public.positions (user_id, symbol) 
WHERE status = 'OPEN';
