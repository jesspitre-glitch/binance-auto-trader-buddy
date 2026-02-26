
-- Opret strategy_slots tabel
CREATE TABLE public.strategy_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  slot_number INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'Slot 1',
  config_id UUID REFERENCES public.indicator_config(id) ON DELETE SET NULL,
  capital_percent NUMERIC NOT NULL DEFAULT 25,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, slot_number)
);

-- Enable RLS
ALTER TABLE public.strategy_slots ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own slots"
  ON public.strategy_slots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own slots"
  ON public.strategy_slots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own slots"
  ON public.strategy_slots FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own slots"
  ON public.strategy_slots FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE TRIGGER update_strategy_slots_updated_at
  BEFORE UPDATE ON public.strategy_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tilføj slot_id til positions
ALTER TABLE public.positions ADD COLUMN slot_id UUID REFERENCES public.strategy_slots(id) ON DELETE SET NULL;

-- Tilføj slot_id til trade_history
ALTER TABLE public.trade_history ADD COLUMN slot_id UUID REFERENCES public.strategy_slots(id) ON DELETE SET NULL;

-- Tilføj slot_id til scan_results
ALTER TABLE public.scan_results ADD COLUMN slot_id UUID REFERENCES public.strategy_slots(id) ON DELETE SET NULL;
