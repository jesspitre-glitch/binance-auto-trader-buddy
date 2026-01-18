-- Create exit_profiles table for storing exit profile templates
CREATE TABLE public.exit_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Break-even parameters
  be_enabled BOOLEAN DEFAULT false,
  be_trigger_profit_pct NUMERIC DEFAULT 1.5,
  be_stop_over_entry_pct NUMERIC DEFAULT 0.1,
  be_ratchet_only BOOLEAN DEFAULT false,
  
  -- Peak-lock parameters
  peaklock_enabled BOOLEAN DEFAULT false,
  peaklock_activate_profit_pct NUMERIC DEFAULT 0.6,
  peaklock_distance_from_peak_pct NUMERIC DEFAULT 0.35,
  peaklock_min_profit_floor_pct NUMERIC DEFAULT 0.15,
  peaklock_ratchet_only BOOLEAN DEFAULT true,
  
  -- Trailing stop parameters
  trailing_enabled BOOLEAN DEFAULT true,
  trailing_stop_atr_mult NUMERIC DEFAULT 2.0,
  trailing_activation_enabled BOOLEAN DEFAULT true,
  trailing_activation_atr_mult NUMERIC DEFAULT 1.0,
  
  -- Max duration parameters
  max_duration_enabled BOOLEAN DEFAULT true,
  max_duration_minutes INTEGER DEFAULT 120,
  
  -- Hard SL override
  hard_sl_override_enabled BOOLEAN DEFAULT false,
  hard_sl_pct NUMERIC DEFAULT 3.0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exit_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own exit profiles"
ON public.exit_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own exit profiles"
ON public.exit_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exit profiles"
ON public.exit_profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exit profiles"
ON public.exit_profiles FOR DELETE
USING (auth.uid() = user_id);

-- Add regime router columns to indicator_config
ALTER TABLE public.indicator_config
ADD COLUMN regime_router_enabled BOOLEAN DEFAULT false,
ADD COLUMN regime_method TEXT DEFAULT 'ADX_AND_ATR',
ADD COLUMN regime_adx_threshold NUMERIC DEFAULT 22,
ADD COLUMN regime_atr_pct_threshold NUMERIC DEFAULT 0.15,
ADD COLUMN regime_operator TEXT DEFAULT 'AND',
ADD COLUMN regime_if_true TEXT DEFAULT 'TREND',
ADD COLUMN regime_if_false TEXT DEFAULT 'RANGE',
ADD COLUMN regime_lock_at_entry BOOLEAN DEFAULT true,
ADD COLUMN regime_trend_exit_profile_id UUID REFERENCES public.exit_profiles(id) ON DELETE SET NULL,
ADD COLUMN regime_range_exit_profile_id UUID REFERENCES public.exit_profiles(id) ON DELETE SET NULL;

-- Trigger for updated_at on exit_profiles
CREATE TRIGGER update_exit_profiles_updated_at
BEFORE UPDATE ON public.exit_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();