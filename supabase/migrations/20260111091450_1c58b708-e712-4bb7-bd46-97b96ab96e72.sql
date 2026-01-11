-- Create scanner_status table to persist scanner state
CREATE TABLE IF NOT EXISTS public.scanner_status (
  id TEXT PRIMARY KEY DEFAULT 'main',
  is_active BOOLEAN NOT NULL DEFAULT false,
  interval_ms INTEGER NOT NULL DEFAULT 3000,
  last_scan_at TIMESTAMP WITH TIME ZONE,
  last_heartbeat_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scanner_status ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only manage their own scanner
CREATE POLICY "Users can view their own scanner status" 
ON public.scanner_status 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own scanner status" 
ON public.scanner_status 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scanner status" 
ON public.scanner_status 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_scanner_status_updated_at
BEFORE UPDATE ON public.scanner_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();