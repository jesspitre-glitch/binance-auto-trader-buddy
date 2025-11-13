-- Create price cache table for Binance real-time prices
CREATE TABLE IF NOT EXISTS public.price_cache (
  symbol TEXT PRIMARY KEY,
  price DECIMAL NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  volume DECIMAL,
  change_24h DECIMAL
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_price_cache_updated_at ON public.price_cache(updated_at);

-- Enable RLS but allow read access to authenticated users
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read price cache"
  ON public.price_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow the service role to insert/update
CREATE POLICY "Allow service role to manage price cache"
  ON public.price_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);