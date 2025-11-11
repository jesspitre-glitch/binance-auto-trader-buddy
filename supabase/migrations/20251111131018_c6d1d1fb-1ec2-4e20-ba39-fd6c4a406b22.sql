-- Create indicator_config table for storing all configurable indicator parameters
CREATE TABLE public.indicator_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  
  -- EMA settings
  ema_fast INTEGER,
  ema_medium INTEGER,
  ema_slow INTEGER,
  
  -- RSI settings
  rsi_period INTEGER,
  rsi_overbought DECIMAL(5,2),
  rsi_oversold DECIMAL(5,2),
  
  -- MACD settings
  macd_fast INTEGER,
  macd_slow INTEGER,
  macd_signal INTEGER,
  macd_histogram_threshold DECIMAL(10,6),
  
  -- Bollinger Bands settings
  bb_period INTEGER,
  bb_std_dev DECIMAL(5,2),
  
  -- ATR settings
  atr_period INTEGER,
  atr_stop_loss_multiplier DECIMAL(5,2),
  atr_trailing_stop_multiplier DECIMAL(5,2),
  
  -- ADX settings
  adx_period INTEGER,
  adx_threshold DECIMAL(5,2),
  
  -- Volume settings
  volume_spike_multiplier DECIMAL(5,2),
  
  -- Multi-timeframe settings
  mtf_timeframe TEXT,
  
  -- Position sizing
  risk_per_trade_percent DECIMAL(5,2),
  max_open_positions INTEGER,
  max_exposure_percent DECIMAL(5,2),
  daily_loss_limit_percent DECIMAL(5,2),
  
  -- Risk/Reward
  risk_reward_ratio DECIMAL(5,2),
  max_position_duration_minutes INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.indicator_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own indicator configs"
  ON public.indicator_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own indicator configs"
  ON public.indicator_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own indicator configs"
  ON public.indicator_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own indicator configs"
  ON public.indicator_config FOR DELETE
  USING (auth.uid() = user_id);

-- Create positions table
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price DECIMAL(20,8) NOT NULL,
  quantity DECIMAL(20,8) NOT NULL,
  stop_loss DECIMAL(20,8),
  take_profit DECIMAL(20,8),
  trailing_stop DECIMAL(20,8),
  current_price DECIMAL(20,8),
  unrealized_pnl DECIMAL(20,8),
  binance_order_id TEXT,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own positions"
  ON public.positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own positions"
  ON public.positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own positions"
  ON public.positions FOR UPDATE
  USING (auth.uid() = user_id);

-- Create trade_history table
CREATE TABLE public.trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price DECIMAL(20,8) NOT NULL,
  exit_price DECIMAL(20,8) NOT NULL,
  quantity DECIMAL(20,8) NOT NULL,
  pnl DECIMAL(20,8) NOT NULL,
  pnl_percent DECIMAL(10,4) NOT NULL,
  duration_minutes INTEGER,
  indicators_snapshot JSONB,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trade history"
  ON public.trade_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trade history"
  ON public.trade_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create trading_session table to track bot state
CREATE TABLE public.trading_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT false,
  active_config_id UUID REFERENCES public.indicator_config(id),
  started_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.trading_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trading session"
  ON public.trading_session FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own trading session"
  ON public.trading_session FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trading session"
  ON public.trading_session FOR UPDATE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_indicator_config_updated_at
  BEFORE UPDATE ON public.indicator_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trading_session_updated_at
  BEFORE UPDATE ON public.trading_session
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();