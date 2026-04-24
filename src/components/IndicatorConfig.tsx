import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check } from "lucide-react";
import { FilterModeToggle } from "./FilterModeToggle";
import { RegimeRouter } from "./RegimeRouter";
import { ExitProfiles, ExitProfile } from "./ExitProfiles";
import { DecimalInput } from "./DecimalInput";
import { IntegerInput } from "./IntegerInput";

interface IndicatorConfigProps {
  config?: any;
  onSave?: () => void;
}

// Helper functions to handle empty input values
const safeParseInt = (value: string, fallback = 0): number => {
  if (value === '' || value === '-') return fallback;
  const parsed = parseInt(value);
  return isNaN(parsed) ? fallback : parsed;
};

const safeParseFloat = (value: string, fallback = 0): number => {
  const normalized = value.replace(",", ".").trim();
  if (
    normalized === "" ||
    normalized === "-" ||
    normalized === "." ||
    normalized === "-."
  ) {
    return fallback;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const IndicatorConfig = ({ config, onSave }: IndicatorConfigProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastSaveInfo, setLastSaveInfo] = useState<{ id: string; updated_at: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    name: config?.name || "1",
    enabled: config?.enabled !== undefined ? config?.enabled : true,
    
    // EMA
    ema_enabled: config?.ema_enabled !== undefined ? config?.ema_enabled : true,
    ema_fast: config?.ema_fast || 9,
    ema_medium: config?.ema_medium || 21,
    ema_slow: config?.ema_slow || 50,
    ema_medium_trend: config?.ema_medium_trend || 50,
    min_ema_spread_percent: config?.min_ema_spread_percent ?? 0.2,
    max_ema_spread_percent: config?.max_ema_spread_percent ?? 5.0,
    ema_trend_hard_filter: config?.ema_trend_hard_filter !== undefined ? config?.ema_trend_hard_filter : false,
    
    // RSI
    rsi_enabled: config?.rsi_enabled !== undefined ? config?.rsi_enabled : true,
    rsi_period: config?.rsi_period ?? 14,
    rsi_min_long: config?.rsi_min_long ?? 30,
    rsi_max_short: config?.rsi_max_short ?? 70,
    rsi_zone_width: config?.rsi_zone_width ?? 5,
    rsi_momentum_periods: config?.rsi_momentum_periods ?? 3,
    
    // StochRSI
    stochrsi_enabled: config?.stochrsi_enabled !== undefined ? config?.stochrsi_enabled : true,
    stochrsi_period: config?.stochrsi_period || 14,
    stochrsi_k_period: config?.stochrsi_k_period || 3,
    stochrsi_d_period: config?.stochrsi_d_period || 3,
    stochrsi_overbought: config?.stochrsi_overbought || 80,
    stochrsi_oversold: config?.stochrsi_oversold || 20,
    stochrsi_overbought_k: config?.stochrsi_overbought_k ?? config?.stochrsi_overbought ?? 80,
    stochrsi_overbought_d: config?.stochrsi_overbought_d ?? config?.stochrsi_overbought ?? 80,
    stochrsi_oversold_k: config?.stochrsi_oversold_k ?? config?.stochrsi_oversold ?? 20,
    stochrsi_oversold_d: config?.stochrsi_oversold_d ?? config?.stochrsi_oversold ?? 20,
    stochrsi_short_mode: config?.stochrsi_short_mode || 'REVERSAL_ROLLOVER',
    stochrsi_long_mode: config?.stochrsi_long_mode || 'REVERSAL_ROLLOVER',
    rollover_d_min_short: config?.rollover_d_min_short ?? 50,
    rollover_d_min_long: config?.rollover_d_min_long ?? 40,
    
    // Pivot Points
    pivot_points_enabled: config?.pivot_points_enabled !== undefined ? config?.pivot_points_enabled : true,
    pivot_points_timeframe: config?.pivot_points_timeframe || "1d",
    pivot_points_lookback: config?.pivot_points_lookback || 24,
    pivot_points_near_threshold: config?.pivot_points_near_threshold || 0.002,
    
    // MACD
    macd_enabled: config?.macd_enabled !== undefined ? config?.macd_enabled : true,
    macd_fast: config?.macd_fast || 12,
    macd_slow: config?.macd_slow || 26,
    macd_signal: config?.macd_signal || 9,
    macd_histogram_threshold: config?.macd_histogram_threshold || 0,
    macd_direction_enabled: config?.macd_direction_enabled !== undefined ? config?.macd_direction_enabled : true,
    macd_color_change_hard_filter: config?.macd_color_change_hard_filter !== undefined ? config?.macd_color_change_hard_filter : false,
    histogram_momentum_enabled: config?.histogram_momentum_enabled !== undefined ? config?.histogram_momentum_enabled : true,
    histogram_momentum_periods: config?.histogram_momentum_periods || 3,
    
    // Bollinger Bands
    bb_enabled: config?.bb_enabled !== undefined ? config?.bb_enabled : true,
    bb_period: config?.bb_period || 20,
    bb_std_dev: config?.bb_std_dev || 2,
    
    // VWAP
    vwap_enabled: config?.vwap_enabled !== undefined ? config?.vwap_enabled : false,
    vwap_period: config?.vwap_period ?? 50,
    
    // ATR
    atr_enabled: config?.atr_enabled !== undefined ? config?.atr_enabled : true,
    atr_period: config?.atr_period || 14,
    min_atr: config?.min_atr ?? 0,
    min_atr_percent: config?.min_atr_percent ?? 0.5,
    adaptive_atr_enabled: config?.adaptive_atr_enabled !== undefined ? config?.adaptive_atr_enabled : false,
    atr_base_min: config?.atr_base_min ?? 1.0,
    atr_floor: config?.atr_floor ?? 0.7,
    atr_ceiling: config?.atr_ceiling ?? 2.0,
    atr_stop_loss_multiplier: config?.atr_stop_loss_multiplier || 2,
    atr_trailing_stop_multiplier: config?.atr_trailing_stop_multiplier || 1.5,
    trailing_stop_activation_enabled: config?.trailing_stop_activation_enabled !== undefined ? config?.trailing_stop_activation_enabled : true,
    trailing_stop_activation_atr: config?.trailing_stop_activation_atr ?? 1.0,
    
    // Break-Even (structured)
    break_even_enabled: config?.break_even_enabled !== undefined ? config?.break_even_enabled : true,
    break_even_ratchet_only: config?.break_even_ratchet_only !== undefined ? config?.break_even_ratchet_only : false,
    break_even_atr_enabled: config?.break_even_atr_enabled !== undefined ? config?.break_even_atr_enabled : true,
    break_even_atr: config?.break_even_atr ?? 1.0,
    break_even_atr_stop_offset: config?.break_even_atr_stop_offset ?? 0,
    break_even_profit_pct_enabled: config?.break_even_profit_pct_enabled !== undefined ? config?.break_even_profit_pct_enabled : false,
    break_even_profit_pct_trigger: config?.break_even_profit_pct_trigger ?? 1.5,
    break_even_profit_pct_stop_over_entry: config?.break_even_profit_pct_stop_over_entry ?? 0.1,
    
    // Peak-Lock Trailing (procent-baseret)
    peak_lock_enabled: config?.peak_lock_enabled !== undefined ? config?.peak_lock_enabled : false,
    peak_lock_activate_profit_pct: config?.peak_lock_activate_profit_pct ?? 0.60,
    peak_lock_distance_pct: config?.peak_lock_distance_pct ?? 0.35,
    peak_lock_min_profit_floor_pct: config?.peak_lock_min_profit_floor_pct ?? 0.15,
    peak_lock_ratchet_only: config?.peak_lock_ratchet_only !== undefined ? config?.peak_lock_ratchet_only : true,
    
    // Max SL after MFE (stramning af SL når MFE er nået, før BE trigger)
    max_sl_after_mfe_enabled: config?.max_sl_after_mfe_enabled !== undefined ? config?.max_sl_after_mfe_enabled : false,
    max_sl_after_mfe_activate_pct: config?.max_sl_after_mfe_activate_pct ?? 0.60,
    max_sl_after_mfe_max_dist_pct: config?.max_sl_after_mfe_max_dist_pct ?? 1.0,
    
    // Hard Stop Loss % (absolut yderste grænse - prioritet 1)
    hard_sl_pct_enabled: config?.hard_sl_pct_enabled !== undefined ? config?.hard_sl_pct_enabled : true,
    hard_sl_pct: config?.hard_sl_pct ?? 3.0,
    
    // ADX
    adx_enabled: config?.adx_enabled !== undefined ? config?.adx_enabled : true,
    adx_period: config?.adx_period || 14,
    adx_threshold: config?.adx_threshold || 25,
    adaptive_adx_enabled: config?.adaptive_adx_enabled !== undefined ? config?.adaptive_adx_enabled : false,
    adx_base_min: config?.adx_base_min ?? 25,
    adx_floor: config?.adx_floor ?? 20,
    adx_ceiling: config?.adx_ceiling ?? 40,
    
    // Volume & Signal
    volume_enabled: config?.volume_enabled !== undefined ? config?.volume_enabled : true,
    volume_avg_period: config?.volume_avg_period || 20,
    volume_multiplier: config?.volume_multiplier ?? 1.2,
    volume_mode_short: config?.volume_mode_short || 'HARD',
    volume_multiplier_short: config?.volume_multiplier_short ?? 0.50,
    // IMPORTANT: use ?? so a saved value of 0 is respected
    signal_conditions_required: config?.signal_conditions_required ?? 5,
    
    // Timeframes
    scan_interval: config?.scan_interval || "5m",
    signal_timing_mode: config?.signal_timing_mode || "LIVE",
    candle_close_entry_window_seconds: config?.candle_close_entry_window_seconds ?? 120,
    trend_timeframe: config?.trend_timeframe || config?.mtf_timeframe || "15m",
    trend_timeframe_enabled: config?.trend_timeframe_enabled !== undefined ? config?.trend_timeframe_enabled : true,
    higher_trend_enabled: config?.higher_trend_enabled !== undefined ? config?.higher_trend_enabled : true,
    higher_trend_timeframe: config?.higher_trend_timeframe || "1h",
    klines_limit: config?.klines_limit || 100,
    
    // Risk Management
    position_size_percent: config?.position_size_percent || 5,
    risk_per_trade_percent: config?.risk_per_trade_percent || 1,
    max_open_positions: config?.max_open_positions || 3,
    max_exposure_percent: config?.max_exposure_percent || 5,
    daily_loss_limit_percent: config?.daily_loss_limit_percent || 5,
    max_position_duration_minutes: config?.max_position_duration_minutes || 240,
    auto_exit_enabled: config?.auto_exit_enabled !== undefined ? config?.auto_exit_enabled : true,
    conditional_time_exit_enabled: config?.conditional_time_exit_enabled !== undefined ? config?.conditional_time_exit_enabled : true,

    // Stale Position Exit (isoleret feature — INGEN defaults, alt styres af UI)
    stale_exit_enabled: (config as any)?.stale_exit_enabled ?? false,
    stale_exit_max_duration_tf_mult: (config as any)?.stale_exit_max_duration_tf_mult ?? null,
    stale_exit_peak_inactivity_tf_mult: (config as any)?.stale_exit_peak_inactivity_tf_mult ?? null,
    stale_exit_trailing_inactivity_tf_mult: (config as any)?.stale_exit_trailing_inactivity_tf_mult ?? null,
    stale_exit_min_move_atr_mult: (config as any)?.stale_exit_min_move_atr_mult ?? null,
    stale_exit_use_momentum_filter: (config as any)?.stale_exit_use_momentum_filter ?? false,
    
    // Leverage
    leverage: config?.leverage || 10,
    
    // Hard filter toggles for each indicator
    ema_hard_filter: config?.ema_hard_filter !== undefined ? config?.ema_hard_filter : true,
    rsi_hard_filter: config?.rsi_hard_filter !== undefined ? config?.rsi_hard_filter : true,
    stochrsi_hard_filter: config?.stochrsi_hard_filter !== undefined ? config?.stochrsi_hard_filter : false,
    pivot_points_hard_filter: config?.pivot_points_hard_filter !== undefined ? config?.pivot_points_hard_filter : false,
    macd_hard_filter: config?.macd_hard_filter !== undefined ? config?.macd_hard_filter : false,
    bb_hard_filter: config?.bb_hard_filter !== undefined ? config?.bb_hard_filter : false,
    vwap_hard_filter: config?.vwap_hard_filter !== undefined ? config?.vwap_hard_filter : false,
    atr_hard_filter: config?.atr_hard_filter !== undefined ? config?.atr_hard_filter : true,
    adx_hard_filter: config?.adx_hard_filter !== undefined ? config?.adx_hard_filter : true,
    volume_hard_filter: config?.volume_hard_filter !== undefined ? config?.volume_hard_filter : true,
    higher_trend_hard_filter: config?.higher_trend_hard_filter !== undefined ? config?.higher_trend_hard_filter : true,
    
    // Regime Router
    regime_router_enabled: config?.regime_router_enabled ?? false,
    regime_method: config?.regime_method ?? 'ADX_AND_ATR',
    regime_adx_threshold: config?.regime_adx_threshold ?? 22,
    regime_atr_pct_threshold: config?.regime_atr_pct_threshold ?? 0.15,
    regime_operator: config?.regime_operator ?? 'AND',
    regime_if_true: config?.regime_if_true ?? 'TREND',
    regime_if_false: config?.regime_if_false ?? 'RANGE',
    regime_lock_at_entry: config?.regime_lock_at_entry ?? true,
    regime_trend_exit_profile_id: config?.regime_trend_exit_profile_id ?? null,
    regime_range_exit_profile_id: config?.regime_range_exit_profile_id ?? null,
    
    // Supertrend
    supertrend_enabled: config?.supertrend_enabled !== undefined ? config?.supertrend_enabled : false,
    supertrend_hard_filter: config?.supertrend_hard_filter !== undefined ? config?.supertrend_hard_filter : false,
    supertrend_period: config?.supertrend_period ?? 10,
    supertrend_multiplier: config?.supertrend_multiplier ?? 3.0,
    
    // OBV
    obv_enabled: config?.obv_enabled !== undefined ? config?.obv_enabled : false,
    obv_hard_filter: config?.obv_hard_filter !== undefined ? config?.obv_hard_filter : false,
    obv_lookback: config?.obv_lookback ?? 5,
    
    // CCI
    cci_enabled: config?.cci_enabled !== undefined ? config?.cci_enabled : false,
    cci_hard_filter: config?.cci_hard_filter !== undefined ? config?.cci_hard_filter : false,
    cci_period: config?.cci_period ?? 20,
    cci_overbought: config?.cci_overbought ?? 100,
    cci_oversold: config?.cci_oversold ?? -100,
    
    // Parabolic SAR
    psar_enabled: config?.psar_enabled !== undefined ? config?.psar_enabled : false,
    psar_hard_filter: config?.psar_hard_filter !== undefined ? config?.psar_hard_filter : false,
    psar_af_start: config?.psar_af_start ?? 0.02,
    psar_af_increment: config?.psar_af_increment ?? 0.02,
    psar_af_max: config?.psar_af_max ?? 0.2,
    psar_trailing_enabled: config?.psar_trailing_enabled !== undefined ? config?.psar_trailing_enabled : false,
    
    // Candle Momentum
    candle_momentum_enabled: config?.candle_momentum_enabled !== undefined ? config?.candle_momentum_enabled : false,
    candle_momentum_hard_filter: config?.candle_momentum_hard_filter !== undefined ? config?.candle_momentum_hard_filter : false,
    min_candle_body_percent: config?.min_candle_body_percent ?? 0.15,
  });
  
  // State for exit profiles
  const [exitProfiles, setExitProfiles] = useState<ExitProfile[]>([]);
  
  // Sync form with incoming config changes - use config.id to detect actual config change
  useEffect(() => {
    if (!config) return;
    
    // Force update all fields from config, using explicit null/undefined checks
    setFormData({
      name: config.name ?? "Default Strategy",
      enabled: config.enabled !== undefined ? config.enabled : true,
      // EMA
      ema_enabled: config.ema_enabled !== undefined ? config.ema_enabled : true,
      ema_fast: config.ema_fast ?? 9,
      ema_medium: config.ema_medium ?? 21,
      ema_slow: config.ema_slow ?? 50,
      ema_medium_trend: config.ema_medium_trend ?? 50,
      min_ema_spread_percent: config.min_ema_spread_percent ?? 0.2,
      max_ema_spread_percent: config.max_ema_spread_percent ?? 5.0,
      ema_trend_hard_filter: config.ema_trend_hard_filter !== undefined ? config.ema_trend_hard_filter : false,
      // RSI
      rsi_enabled: config.rsi_enabled !== undefined ? config.rsi_enabled : true,
      rsi_period: config.rsi_period ?? 14,
      rsi_min_long: config.rsi_min_long ?? 30,
      rsi_max_short: config.rsi_max_short ?? 70,
      rsi_zone_width: config.rsi_zone_width ?? 5,
      rsi_momentum_periods: config.rsi_momentum_periods ?? 3,
      // StochRSI
      stochrsi_enabled: config.stochrsi_enabled !== undefined ? config.stochrsi_enabled : true,
      stochrsi_period: config.stochrsi_period ?? 14,
      stochrsi_k_period: config.stochrsi_k_period ?? 3,
      stochrsi_d_period: config.stochrsi_d_period ?? 3,
      stochrsi_overbought: config.stochrsi_overbought ?? 80,
      stochrsi_oversold: config.stochrsi_oversold ?? 20,
      stochrsi_overbought_k: config.stochrsi_overbought_k ?? config.stochrsi_overbought ?? 80,
      stochrsi_overbought_d: config.stochrsi_overbought_d ?? config.stochrsi_overbought ?? 80,
      stochrsi_oversold_k: config.stochrsi_oversold_k ?? config.stochrsi_oversold ?? 20,
      stochrsi_oversold_d: config.stochrsi_oversold_d ?? config.stochrsi_oversold ?? 20,
      stochrsi_short_mode: config.stochrsi_short_mode ?? 'REVERSAL_ROLLOVER',
      stochrsi_long_mode: config.stochrsi_long_mode ?? 'REVERSAL_ROLLOVER',
      rollover_d_min_short: config.rollover_d_min_short ?? 50,
      rollover_d_min_long: config.rollover_d_min_long ?? 40,
      // Pivot Points
      pivot_points_enabled: config.pivot_points_enabled !== undefined ? config.pivot_points_enabled : true,
      pivot_points_timeframe: config.pivot_points_timeframe ?? "1d",
      pivot_points_lookback: config.pivot_points_lookback ?? 24,
      pivot_points_near_threshold: config.pivot_points_near_threshold ?? 0.002,
      // MACD
      macd_enabled: config.macd_enabled !== undefined ? config.macd_enabled : true,
      macd_fast: config.macd_fast ?? 12,
      macd_slow: config.macd_slow ?? 26,
      macd_signal: config.macd_signal ?? 9,
      macd_histogram_threshold: config.macd_histogram_threshold ?? 0,
      macd_direction_enabled: config.macd_direction_enabled !== undefined ? config.macd_direction_enabled : true,
      macd_color_change_hard_filter: config.macd_color_change_hard_filter !== undefined ? config.macd_color_change_hard_filter : false,
      histogram_momentum_enabled: config.histogram_momentum_enabled !== undefined ? config.histogram_momentum_enabled : true,
      histogram_momentum_periods: config.histogram_momentum_periods ?? 3,
      // Bollinger Bands
      bb_enabled: config.bb_enabled !== undefined ? config.bb_enabled : true,
      bb_period: config.bb_period ?? 20,
      bb_std_dev: config.bb_std_dev ?? 2,
      // VWAP
      vwap_enabled: config.vwap_enabled !== undefined ? config.vwap_enabled : false,
      vwap_period: config.vwap_period ?? 50,
      // ATR
      atr_enabled: config.atr_enabled !== undefined ? config.atr_enabled : true,
      atr_period: config.atr_period ?? 14,
      min_atr: config.min_atr ?? 0,
      min_atr_percent: config.min_atr_percent ?? 0.5,
      adaptive_atr_enabled: config.adaptive_atr_enabled !== undefined ? config.adaptive_atr_enabled : false,
      atr_base_min: config.atr_base_min ?? 1.0,
      atr_floor: config.atr_floor ?? 0.7,
      atr_ceiling: config.atr_ceiling ?? 2.0,
      atr_stop_loss_multiplier: config.atr_stop_loss_multiplier ?? 2,
      atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier ?? 1.5,
      trailing_stop_activation_enabled: config.trailing_stop_activation_enabled !== undefined ? config.trailing_stop_activation_enabled : true,
      trailing_stop_activation_atr: config.trailing_stop_activation_atr ?? 1.0,
      // Break-Even (structured)
      break_even_enabled: config.break_even_enabled !== undefined ? config.break_even_enabled : true,
      break_even_ratchet_only: config.break_even_ratchet_only !== undefined ? config.break_even_ratchet_only : false,
      break_even_atr_enabled: config.break_even_atr_enabled !== undefined ? config.break_even_atr_enabled : true,
      break_even_atr: config.break_even_atr ?? 1.0,
      break_even_atr_stop_offset: config.break_even_atr_stop_offset ?? 0,
      break_even_profit_pct_enabled: config.break_even_profit_pct_enabled !== undefined ? config.break_even_profit_pct_enabled : false,
      break_even_profit_pct_trigger: config.break_even_profit_pct_trigger ?? 1.5,
      break_even_profit_pct_stop_over_entry: config.break_even_profit_pct_stop_over_entry ?? 0.1,
      // Peak-Lock Trailing
      peak_lock_enabled: config.peak_lock_enabled !== undefined ? config.peak_lock_enabled : false,
      peak_lock_activate_profit_pct: config.peak_lock_activate_profit_pct ?? 0.60,
      peak_lock_distance_pct: config.peak_lock_distance_pct ?? 0.35,
      peak_lock_min_profit_floor_pct: config.peak_lock_min_profit_floor_pct ?? 0.15,
      peak_lock_ratchet_only: config.peak_lock_ratchet_only !== undefined ? config.peak_lock_ratchet_only : true,
      // Max SL after MFE
      max_sl_after_mfe_enabled: config.max_sl_after_mfe_enabled !== undefined ? config.max_sl_after_mfe_enabled : false,
      max_sl_after_mfe_activate_pct: config.max_sl_after_mfe_activate_pct ?? 0.60,
      max_sl_after_mfe_max_dist_pct: config.max_sl_after_mfe_max_dist_pct ?? 1.0,
      // Hard Stop Loss %
      hard_sl_pct_enabled: config.hard_sl_pct_enabled !== undefined ? config.hard_sl_pct_enabled : true,
      hard_sl_pct: config.hard_sl_pct ?? 3.0,
      // ADX
      adx_enabled: config.adx_enabled !== undefined ? config.adx_enabled : true,
      adx_period: config.adx_period ?? 14,
      adx_threshold: config.adx_threshold ?? 25,
      adaptive_adx_enabled: config.adaptive_adx_enabled !== undefined ? config.adaptive_adx_enabled : false,
      adx_base_min: config.adx_base_min ?? 25,
      adx_floor: config.adx_floor ?? 20,
      adx_ceiling: config.adx_ceiling ?? 40,
      // Volume & Signal
      volume_enabled: config.volume_enabled !== undefined ? config.volume_enabled : true,
      volume_avg_period: config.volume_avg_period ?? 20,
      volume_multiplier: config.volume_multiplier ?? 1.2,
      volume_mode_short: config.volume_mode_short ?? 'HARD',
      volume_multiplier_short: config.volume_multiplier_short ?? 0.50,
      signal_conditions_required: config.signal_conditions_required ?? 5,
      // Timeframes
      scan_interval: config.scan_interval ?? "5m",
      signal_timing_mode: config.signal_timing_mode ?? "LIVE",
      candle_close_entry_window_seconds: config.candle_close_entry_window_seconds ?? 120,
      trend_timeframe: config.trend_timeframe ?? config.mtf_timeframe ?? "15m",
      trend_timeframe_enabled: config.trend_timeframe_enabled !== undefined ? config.trend_timeframe_enabled : true,
      higher_trend_enabled: config.higher_trend_enabled !== undefined ? config.higher_trend_enabled : true,
      higher_trend_timeframe: config.higher_trend_timeframe ?? "1h",
      klines_limit: config.klines_limit ?? 100,
      // Risk Management
      position_size_percent: config.position_size_percent ?? 5,
      risk_per_trade_percent: config.risk_per_trade_percent ?? 1,
      max_open_positions: config.max_open_positions ?? 3,
      max_exposure_percent: config.max_exposure_percent ?? 5,
      daily_loss_limit_percent: config.daily_loss_limit_percent ?? 5,
      max_position_duration_minutes: config.max_position_duration_minutes ?? 240,
      auto_exit_enabled: config.auto_exit_enabled !== undefined ? config.auto_exit_enabled : true,
      conditional_time_exit_enabled: config.conditional_time_exit_enabled !== undefined ? config.conditional_time_exit_enabled : true,
      // Leverage
      leverage: config.leverage ?? 10,
      // Hard filter toggles
      ema_hard_filter: config.ema_hard_filter !== undefined ? config.ema_hard_filter : true,
      rsi_hard_filter: config.rsi_hard_filter !== undefined ? config.rsi_hard_filter : true,
      stochrsi_hard_filter: config.stochrsi_hard_filter !== undefined ? config.stochrsi_hard_filter : false,
      pivot_points_hard_filter: config.pivot_points_hard_filter !== undefined ? config.pivot_points_hard_filter : false,
      macd_hard_filter: config.macd_hard_filter !== undefined ? config.macd_hard_filter : false,
      bb_hard_filter: config.bb_hard_filter !== undefined ? config.bb_hard_filter : false,
      vwap_hard_filter: config.vwap_hard_filter !== undefined ? config.vwap_hard_filter : false,
      atr_hard_filter: config.atr_hard_filter !== undefined ? config.atr_hard_filter : true,
      adx_hard_filter: config.adx_hard_filter !== undefined ? config.adx_hard_filter : true,
      volume_hard_filter: config.volume_hard_filter !== undefined ? config.volume_hard_filter : true,
      higher_trend_hard_filter: config.higher_trend_hard_filter !== undefined ? config.higher_trend_hard_filter : true,
      // Regime Router
      regime_router_enabled: config.regime_router_enabled ?? false,
      regime_method: config.regime_method ?? 'ADX_AND_ATR',
      regime_adx_threshold: config.regime_adx_threshold ?? 22,
      regime_atr_pct_threshold: config.regime_atr_pct_threshold ?? 0.15,
      regime_operator: config.regime_operator ?? 'AND',
      regime_if_true: config.regime_if_true ?? 'TREND',
      regime_if_false: config.regime_if_false ?? 'RANGE',
      regime_lock_at_entry: config.regime_lock_at_entry ?? true,
      regime_trend_exit_profile_id: config.regime_trend_exit_profile_id ?? null,
      regime_range_exit_profile_id: config.regime_range_exit_profile_id ?? null,
      // Supertrend
      supertrend_enabled: config.supertrend_enabled !== undefined ? config.supertrend_enabled : false,
      supertrend_hard_filter: config.supertrend_hard_filter !== undefined ? config.supertrend_hard_filter : false,
      supertrend_period: config.supertrend_period ?? 10,
      supertrend_multiplier: config.supertrend_multiplier ?? 3.0,
      // OBV
      obv_enabled: config.obv_enabled !== undefined ? config.obv_enabled : false,
      obv_hard_filter: config.obv_hard_filter !== undefined ? config.obv_hard_filter : false,
      obv_lookback: config.obv_lookback ?? 5,
      // CCI
      cci_enabled: config.cci_enabled !== undefined ? config.cci_enabled : false,
      cci_hard_filter: config.cci_hard_filter !== undefined ? config.cci_hard_filter : false,
      cci_period: config.cci_period ?? 20,
      cci_overbought: config.cci_overbought ?? 100,
      cci_oversold: config.cci_oversold ?? -100,
      // Parabolic SAR
      psar_enabled: config.psar_enabled !== undefined ? config.psar_enabled : false,
      psar_hard_filter: config.psar_hard_filter !== undefined ? config.psar_hard_filter : false,
      psar_af_start: config.psar_af_start ?? 0.02,
      psar_af_increment: config.psar_af_increment ?? 0.02,
      psar_af_max: config.psar_af_max ?? 0.2,
      psar_trailing_enabled: config.psar_trailing_enabled !== undefined ? config.psar_trailing_enabled : false,
      // Candle Momentum
      candle_momentum_enabled: config.candle_momentum_enabled !== undefined ? config.candle_momentum_enabled : false,
      candle_momentum_hard_filter: config.candle_momentum_hard_filter !== undefined ? config.candle_momentum_hard_filter : false,
      min_candle_body_percent: config.min_candle_body_percent ?? 0.15,
    });
  }, [config?.id, config?.updated_at]);

  // Fetch exit profiles on mount
  useEffect(() => {
    const fetchExitProfiles = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data, error } = await supabase
        .from("exit_profiles")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      
      if (!error && data) {
        setExitProfiles(data as ExitProfile[]);
      }
    };
    
    fetchExitProfiles();
  }, []);

  const handleCancel = () => {
    if (!config) return;
    
    // Gendan alle værdier til det gemte config - brug !== undefined for boolean værdier
    setFormData({
      name: config.name ?? "Default Strategy",
      enabled: config.enabled !== undefined ? config.enabled : true,
      ema_enabled: config.ema_enabled !== undefined ? config.ema_enabled : true,
      ema_fast: config.ema_fast ?? 9,
      ema_medium: config.ema_medium ?? 21,
      ema_slow: config.ema_slow ?? 50,
      ema_medium_trend: config.ema_medium_trend ?? 50,
      min_ema_spread_percent: config.min_ema_spread_percent ?? 0.2,
      max_ema_spread_percent: config.max_ema_spread_percent ?? 5.0,
      ema_trend_hard_filter: config.ema_trend_hard_filter !== undefined ? config.ema_trend_hard_filter : false,
      rsi_enabled: config.rsi_enabled !== undefined ? config.rsi_enabled : true,
      rsi_period: config.rsi_period ?? 14,
      rsi_min_long: config.rsi_min_long ?? 30,
      rsi_max_short: config.rsi_max_short ?? 70,
      rsi_zone_width: config.rsi_zone_width ?? 5,
      rsi_momentum_periods: config.rsi_momentum_periods ?? 3,
      stochrsi_enabled: config.stochrsi_enabled !== undefined ? config.stochrsi_enabled : true,
      stochrsi_period: config.stochrsi_period ?? 14,
      stochrsi_k_period: config.stochrsi_k_period ?? 3,
      stochrsi_d_period: config.stochrsi_d_period ?? 3,
      stochrsi_overbought: config.stochrsi_overbought ?? 80,
      stochrsi_oversold: config.stochrsi_oversold ?? 20,
      stochrsi_overbought_k: config.stochrsi_overbought_k ?? config.stochrsi_overbought ?? 80,
      stochrsi_overbought_d: config.stochrsi_overbought_d ?? config.stochrsi_overbought ?? 80,
      stochrsi_oversold_k: config.stochrsi_oversold_k ?? config.stochrsi_oversold ?? 20,
      stochrsi_oversold_d: config.stochrsi_oversold_d ?? config.stochrsi_oversold ?? 20,
      stochrsi_short_mode: config.stochrsi_short_mode ?? 'REVERSAL_ROLLOVER',
      stochrsi_long_mode: config.stochrsi_long_mode ?? 'REVERSAL_ROLLOVER',
      rollover_d_min_short: config.rollover_d_min_short ?? 50,
      rollover_d_min_long: config.rollover_d_min_long ?? 40,
      pivot_points_enabled: config.pivot_points_enabled !== undefined ? config.pivot_points_enabled : true,
      pivot_points_timeframe: config.pivot_points_timeframe ?? "1d",
      pivot_points_lookback: config.pivot_points_lookback ?? 24,
      pivot_points_near_threshold: config.pivot_points_near_threshold ?? 0.002,
      macd_enabled: config.macd_enabled !== undefined ? config.macd_enabled : true,
      macd_fast: config.macd_fast ?? 12,
      macd_slow: config.macd_slow ?? 26,
      macd_signal: config.macd_signal ?? 9,
      macd_histogram_threshold: config.macd_histogram_threshold ?? 0,
      macd_direction_enabled: config.macd_direction_enabled !== undefined ? config.macd_direction_enabled : true,
      macd_color_change_hard_filter: config.macd_color_change_hard_filter !== undefined ? config.macd_color_change_hard_filter : false,
      histogram_momentum_enabled: config.histogram_momentum_enabled !== undefined ? config.histogram_momentum_enabled : true,
      histogram_momentum_periods: config.histogram_momentum_periods ?? 3,
      bb_enabled: config.bb_enabled !== undefined ? config.bb_enabled : true,
      bb_period: config.bb_period ?? 20,
      bb_std_dev: config.bb_std_dev ?? 2,
      vwap_enabled: config.vwap_enabled !== undefined ? config.vwap_enabled : false,
      vwap_period: config.vwap_period ?? 50,
      atr_enabled: config.atr_enabled !== undefined ? config.atr_enabled : true,
      atr_period: config.atr_period ?? 14,
      min_atr: config.min_atr ?? 0,
      min_atr_percent: config.min_atr_percent ?? 0.5,
      adaptive_atr_enabled: config.adaptive_atr_enabled !== undefined ? config.adaptive_atr_enabled : false,
      atr_base_min: config.atr_base_min ?? 1.0,
      atr_floor: config.atr_floor ?? 0.7,
      atr_ceiling: config.atr_ceiling ?? 2.0,
      atr_stop_loss_multiplier: config.atr_stop_loss_multiplier ?? 2,
      atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier ?? 1.5,
      trailing_stop_activation_enabled: config.trailing_stop_activation_enabled !== undefined ? config.trailing_stop_activation_enabled : true,
      trailing_stop_activation_atr: config.trailing_stop_activation_atr ?? 1.0,
      break_even_enabled: config.break_even_enabled !== undefined ? config.break_even_enabled : true,
      break_even_ratchet_only: config.break_even_ratchet_only !== undefined ? config.break_even_ratchet_only : false,
      break_even_atr_enabled: config.break_even_atr_enabled !== undefined ? config.break_even_atr_enabled : true,
      break_even_atr: config.break_even_atr ?? 1.0,
      break_even_atr_stop_offset: config.break_even_atr_stop_offset ?? 0,
      break_even_profit_pct_enabled: config.break_even_profit_pct_enabled !== undefined ? config.break_even_profit_pct_enabled : false,
      break_even_profit_pct_trigger: config.break_even_profit_pct_trigger ?? 1.5,
      break_even_profit_pct_stop_over_entry: config.break_even_profit_pct_stop_over_entry ?? 0.1,
      // Peak-Lock Trailing
      peak_lock_enabled: config.peak_lock_enabled !== undefined ? config.peak_lock_enabled : false,
      peak_lock_activate_profit_pct: config.peak_lock_activate_profit_pct ?? 0.60,
      peak_lock_distance_pct: config.peak_lock_distance_pct ?? 0.35,
      peak_lock_min_profit_floor_pct: config.peak_lock_min_profit_floor_pct ?? 0.15,
      peak_lock_ratchet_only: config.peak_lock_ratchet_only !== undefined ? config.peak_lock_ratchet_only : true,
      // Max SL after MFE
      max_sl_after_mfe_enabled: config.max_sl_after_mfe_enabled !== undefined ? config.max_sl_after_mfe_enabled : false,
      max_sl_after_mfe_activate_pct: config.max_sl_after_mfe_activate_pct ?? 0.60,
      max_sl_after_mfe_max_dist_pct: config.max_sl_after_mfe_max_dist_pct ?? 1.0,
      // Hard Stop Loss %
      hard_sl_pct_enabled: config.hard_sl_pct_enabled !== undefined ? config.hard_sl_pct_enabled : true,
      hard_sl_pct: config.hard_sl_pct ?? 3.0,
      adx_enabled: config.adx_enabled !== undefined ? config.adx_enabled : true,
      adx_period: config.adx_period ?? 14,
      adx_threshold: config.adx_threshold ?? 25,
      adaptive_adx_enabled: config.adaptive_adx_enabled !== undefined ? config.adaptive_adx_enabled : false,
      adx_base_min: config.adx_base_min ?? 25,
      adx_floor: config.adx_floor ?? 20,
      adx_ceiling: config.adx_ceiling ?? 40,
      volume_enabled: config.volume_enabled !== undefined ? config.volume_enabled : true,
      volume_avg_period: config.volume_avg_period ?? 20,
      volume_multiplier: config.volume_multiplier ?? 1.2,
      volume_mode_short: config.volume_mode_short ?? 'HARD',
      volume_multiplier_short: config.volume_multiplier_short ?? 0.50,
      signal_conditions_required: config.signal_conditions_required ?? 5,
      scan_interval: config.scan_interval ?? "5m",
      signal_timing_mode: config.signal_timing_mode ?? "LIVE",
      candle_close_entry_window_seconds: config.candle_close_entry_window_seconds ?? 120,
      trend_timeframe: config.trend_timeframe ?? config.mtf_timeframe ?? "15m",
      trend_timeframe_enabled: config.trend_timeframe_enabled !== undefined ? config.trend_timeframe_enabled : true,
      higher_trend_enabled: config.higher_trend_enabled !== undefined ? config.higher_trend_enabled : true,
      higher_trend_timeframe: config.higher_trend_timeframe ?? "1h",
      klines_limit: config.klines_limit ?? 100,
      position_size_percent: config.position_size_percent ?? 5,
      risk_per_trade_percent: config.risk_per_trade_percent ?? 1,
      max_open_positions: config.max_open_positions ?? 3,
      max_exposure_percent: config.max_exposure_percent ?? 5,
      daily_loss_limit_percent: config.daily_loss_limit_percent ?? 5,
      max_position_duration_minutes: config.max_position_duration_minutes ?? 240,
      auto_exit_enabled: config.auto_exit_enabled !== undefined ? config.auto_exit_enabled : true,
      conditional_time_exit_enabled: config.conditional_time_exit_enabled !== undefined ? config.conditional_time_exit_enabled : true,
      leverage: config.leverage ?? 10,
      // Hard filter toggles
      ema_hard_filter: config.ema_hard_filter !== undefined ? config.ema_hard_filter : true,
      rsi_hard_filter: config.rsi_hard_filter !== undefined ? config.rsi_hard_filter : true,
      stochrsi_hard_filter: config.stochrsi_hard_filter !== undefined ? config.stochrsi_hard_filter : false,
      pivot_points_hard_filter: config.pivot_points_hard_filter !== undefined ? config.pivot_points_hard_filter : false,
      macd_hard_filter: config.macd_hard_filter !== undefined ? config.macd_hard_filter : false,
      bb_hard_filter: config.bb_hard_filter !== undefined ? config.bb_hard_filter : false,
      vwap_hard_filter: config.vwap_hard_filter !== undefined ? config.vwap_hard_filter : false,
      atr_hard_filter: config.atr_hard_filter !== undefined ? config.atr_hard_filter : true,
      adx_hard_filter: config.adx_hard_filter !== undefined ? config.adx_hard_filter : true,
      volume_hard_filter: config.volume_hard_filter !== undefined ? config.volume_hard_filter : true,
      higher_trend_hard_filter: config.higher_trend_hard_filter !== undefined ? config.higher_trend_hard_filter : true,
      // Regime Router
      regime_router_enabled: config.regime_router_enabled ?? false,
      regime_method: config.regime_method ?? 'ADX_AND_ATR',
      regime_adx_threshold: config.regime_adx_threshold ?? 22,
      regime_atr_pct_threshold: config.regime_atr_pct_threshold ?? 0.15,
      regime_operator: config.regime_operator ?? 'AND',
      regime_if_true: config.regime_if_true ?? 'TREND',
      regime_if_false: config.regime_if_false ?? 'RANGE',
      regime_lock_at_entry: config.regime_lock_at_entry ?? true,
      regime_trend_exit_profile_id: config.regime_trend_exit_profile_id ?? null,
      regime_range_exit_profile_id: config.regime_range_exit_profile_id ?? null,
      // Supertrend
      supertrend_enabled: config.supertrend_enabled !== undefined ? config.supertrend_enabled : false,
      supertrend_hard_filter: config.supertrend_hard_filter !== undefined ? config.supertrend_hard_filter : false,
      supertrend_period: config.supertrend_period ?? 10,
      supertrend_multiplier: config.supertrend_multiplier ?? 3.0,
      // OBV
      obv_enabled: config.obv_enabled !== undefined ? config.obv_enabled : false,
      obv_hard_filter: config.obv_hard_filter !== undefined ? config.obv_hard_filter : false,
      obv_lookback: config.obv_lookback ?? 5,
      // CCI
      cci_enabled: config.cci_enabled !== undefined ? config.cci_enabled : false,
      cci_hard_filter: config.cci_hard_filter !== undefined ? config.cci_hard_filter : false,
      cci_period: config.cci_period ?? 20,
      cci_overbought: config.cci_overbought ?? 100,
      cci_oversold: config.cci_oversold ?? -100,
      // Parabolic SAR
      psar_enabled: config.psar_enabled !== undefined ? config.psar_enabled : false,
      psar_hard_filter: config.psar_hard_filter !== undefined ? config.psar_hard_filter : false,
      psar_af_start: config.psar_af_start ?? 0.02,
      psar_af_increment: config.psar_af_increment ?? 0.02,
      psar_af_max: config.psar_af_max ?? 0.2,
      psar_trailing_enabled: config.psar_trailing_enabled !== undefined ? config.psar_trailing_enabled : false,
      // Candle Momentum
      candle_momentum_enabled: config.candle_momentum_enabled !== undefined ? config.candle_momentum_enabled : false,
      candle_momentum_hard_filter: config.candle_momentum_hard_filter !== undefined ? config.candle_momentum_hard_filter : false,
      min_candle_body_percent: config.min_candle_body_percent ?? 0.15,
    });
    
    toast({
      title: "Fortryd",
      description: "Alle ændringer er annulleret",
    });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let finalPayload = {
        ...formData,
        user_id: user.id,
      };

      // Hvis ny config (ikke update), find næste nummer i rækken
      if (!config?.id) {
        const { data: existingConfigs, error: fetchError } = await supabase
          .from("indicator_config")
          .select("name")
          .eq("user_id", user.id);

        if (fetchError) throw fetchError;

        // Find højeste nummer i eksisterende navne
        let maxNumber = 0;
        existingConfigs?.forEach(c => {
          const num = parseInt(c.name);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        });

        // Næste nummer i rækken - ALTID brug dette for nye configs
        const nextNumber = maxNumber + 1;
        finalPayload.name = nextNumber.toString();
      }

      let result;
      let savedConfigId: string | null = null;
      let savedUpdatedAt: string | null = null;
      
      if (config?.id) {
        result = await supabase
          .from("indicator_config")
          .update({ ...finalPayload, strategy_params_changed_at: new Date().toISOString() })
          .eq("id", config.id)
          .select("id, updated_at")
          .single();
        
        if (result.data) {
          savedConfigId = result.data.id;
          savedUpdatedAt = result.data.updated_at;
        }
      } else {
        result = await supabase
          .from("indicator_config")
          .insert(finalPayload)
          .select("id, updated_at")
          .single();
          
        if (result.data) {
          savedConfigId = result.data.id;
          savedUpdatedAt = result.data.updated_at;
        }
      }

      if (result.error) throw result.error;

      // 🔍 DEBUG: Set lastSaveInfo for visible UI display
      if (savedConfigId && savedUpdatedAt) {
        setLastSaveInfo({
          id: savedConfigId,
          updated_at: savedUpdatedAt,
          name: config?.name ?? finalPayload.name
        });
      }
      console.log(`[SAVED_CONFIG] saved_config_id=${savedConfigId} | saved_updated_at=${savedUpdatedAt} | config_name="${config?.name ?? finalPayload.name}"`);
      
      toast({
        title: "Gemt",
        description: `saved_config_id: ${savedConfigId}`,
      });
      onSave?.();
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Soft rules list should ONLY include rules that are NOT configured as HARD filters.
  // Alle mulige soft rule kandidater - vis ALLE, ikke kun de aktive
  const softRuleCandidates = [
    {
      key: "ema_trend",
      label: "EMA Trend",
      enabled: Boolean(formData.ema_enabled && !formData.ema_trend_hard_filter),
      parentEnabled: Boolean(formData.ema_enabled),
      isHard: Boolean(formData.ema_trend_hard_filter),
    },
    {
      key: "rsi",
      label: "RSI",
      enabled: Boolean(formData.rsi_enabled && !formData.rsi_hard_filter),
      parentEnabled: Boolean(formData.rsi_enabled),
      isHard: Boolean(formData.rsi_hard_filter),
    },
    {
      key: "stochrsi",
      label: "StochRSI Zone",
      enabled: Boolean(formData.stochrsi_enabled && !formData.stochrsi_hard_filter),
      parentEnabled: Boolean(formData.stochrsi_enabled),
      isHard: Boolean(formData.stochrsi_hard_filter),
    },
    {
      key: "macd_histogram",
      label: "MACD Histogram",
      enabled: Boolean(formData.macd_enabled),
      parentEnabled: Boolean(formData.macd_enabled),
      isHard: false, // MACD histogram er altid soft
    },
    {
      key: "macd_hist_momentum",
      label: "MACD Histogram Momentum",
      enabled: Boolean(formData.histogram_momentum_enabled && formData.macd_enabled),
      parentEnabled: Boolean(formData.macd_enabled),
      isHard: false, // Altid soft
    },
    {
      key: "bb",
      label: "Bollinger Bands",
      enabled: Boolean(formData.bb_enabled && !formData.bb_hard_filter),
      parentEnabled: Boolean(formData.bb_enabled),
      isHard: Boolean(formData.bb_hard_filter),
    },
    {
      key: "volume",
      label: "Volume Surge",
      enabled: Boolean(formData.volume_enabled && !formData.volume_hard_filter),
      parentEnabled: Boolean(formData.volume_enabled),
      isHard: Boolean(formData.volume_hard_filter),
    },
    {
      key: "pivot_points",
      label: "Pivot Points",
      enabled: Boolean(formData.pivot_points_enabled && !formData.pivot_points_hard_filter),
      parentEnabled: Boolean(formData.pivot_points_enabled),
      isHard: Boolean(formData.pivot_points_hard_filter),
    },
    {
      key: "vwap",
      label: "VWAP",
      enabled: Boolean(formData.vwap_enabled && !formData.vwap_hard_filter),
      parentEnabled: Boolean(formData.vwap_enabled),
      isHard: Boolean(formData.vwap_hard_filter),
    },
    {
      key: "supertrend",
      label: "Supertrend",
      enabled: Boolean(formData.supertrend_enabled && !formData.supertrend_hard_filter),
      parentEnabled: Boolean(formData.supertrend_enabled),
      isHard: Boolean(formData.supertrend_hard_filter),
    },
    {
      key: "obv",
      label: "OBV",
      enabled: Boolean(formData.obv_enabled && !formData.obv_hard_filter),
      parentEnabled: Boolean(formData.obv_enabled),
      isHard: Boolean(formData.obv_hard_filter),
    },
    {
      key: "cci",
      label: "CCI",
      enabled: Boolean(formData.cci_enabled && !formData.cci_hard_filter),
      parentEnabled: Boolean(formData.cci_enabled),
      isHard: Boolean(formData.cci_hard_filter),
    },
    {
      key: "psar",
      label: "Parabolic SAR",
      enabled: Boolean(formData.psar_enabled && !formData.psar_hard_filter),
      parentEnabled: Boolean(formData.psar_enabled),
      isHard: Boolean(formData.psar_hard_filter),
    },
    {
      key: "candle_momentum",
      label: "Candle Momentum",
      enabled: Boolean(formData.candle_momentum_enabled && !formData.candle_momentum_hard_filter),
      parentEnabled: Boolean(formData.candle_momentum_enabled),
      isHard: Boolean(formData.candle_momentum_hard_filter),
    },
  ] as const;

  // Vis ALLE soft rules (ikke-hard) - uanset om de er enabled eller ej
  const visibleSoftRules = softRuleCandidates.filter((r) => !r.isHard);
  const softRulesMax = visibleSoftRules.length;
  // Kun tæl dem der faktisk er enabled som active
  const activeSoftRulesCount = visibleSoftRules.filter((r) => r.enabled).length;

  // Clamp required soft conditions so it never exceeds number of ACTIVE SOFT rules.
  useEffect(() => {
    setFormData((prev) => {
      const current = Number(prev.signal_conditions_required ?? 0);
      const clamped = Math.max(0, Math.min(current, activeSoftRulesCount));
      if (clamped === current) return prev;
      return { ...prev, signal_conditions_required: clamped };
    });
  }, [activeSoftRulesCount]);

  return (
    <div className="space-y-6">
      {/* DEBUG BANNER - Shows last saved config info */}
      {lastSaveInfo && (
        <div className="bg-green-900/50 border border-green-500 rounded-lg p-3 text-sm font-mono">
          <div className="text-green-400 font-bold mb-1">✅ SAVED CONFIG INFO</div>
          <div className="text-green-200">
            <div>saved_config_id: <span className="text-white font-bold">{lastSaveInfo.id}</span></div>
            <div>saved_updated_at: <span className="text-white font-bold">{lastSaveInfo.updated_at}</span></div>
            <div>name: <span className="text-white font-bold">{lastSaveInfo.name}</span></div>
          </div>
          <div className="text-xs text-green-400 mt-2">
            Kør en scan og sammenlign med runtime_config.config_id
          </div>
        </div>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>Strategi Indstillinger</CardTitle>
          <CardDescription>Konfigurer navn og aktiver strategi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Strategi Navn</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={!config?.id}
              placeholder={!config?.id ? "Auto-genereres ved gem" : ""}
            />
            {!config?.id && (
              <p className="text-xs text-muted-foreground">
                Navn genereres automatisk som næste nummer i rækken
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="enabled">Aktiver Strategi</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* REGIME ROUTER SECTION */}
      <RegimeRouter
        enabled={formData.regime_router_enabled}
        method={formData.regime_method}
        adxThreshold={formData.regime_adx_threshold}
        atrPctThreshold={formData.regime_atr_pct_threshold}
        operator={formData.regime_operator}
        ifTrue={formData.regime_if_true}
        ifFalse={formData.regime_if_false}
        lockAtEntry={formData.regime_lock_at_entry}
        trendExitProfileId={formData.regime_trend_exit_profile_id}
        rangeExitProfileId={formData.regime_range_exit_profile_id}
        exitProfiles={exitProfiles.map(p => ({ id: p.id, name: p.name }))}
        onChange={(field, value) => setFormData({ ...formData, [field]: value })}
      />

      {/* EXIT PROFILES SECTION */}
      <ExitProfiles
        profiles={exitProfiles}
        onProfilesChange={setExitProfiles}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>EMA (Exponential Moving Average)</CardTitle>
              <CardDescription>
                EMA Trend og Spread filter
              </CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.ema_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, ema_hard_filter: isHard })}
              disabled={!formData.ema_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <Label htmlFor="ema_enabled">Aktiver EMA</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.ema_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="ema_enabled"
                checked={formData.ema_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  ema_enabled: checked,
                  // Sluk alle child-toggles når parent slukkes
                  ...(checked === false && {
                    ema_trend_hard_filter: false,
                    ema_hard_filter: false,
                  })
                })}
              />
            </div>
          </div>

          {formData.ema_enabled && (
            <>
              <div className="flex items-center justify-between sm:col-span-3">
                <Label htmlFor="ema_trend_hard_filter">EMA Retnings-Filter</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.ema_trend_hard_filter ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="ema_trend_hard_filter"
                    checked={formData.ema_trend_hard_filter}
                    onCheckedChange={(checked) => setFormData({ ...formData, ema_trend_hard_filter: checked })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ema_fast">Hurtig EMA</Label>
                <IntegerInput
                  value={formData.ema_fast}
                  onValueChange={(v) => setFormData({ ...formData, ema_fast: v })}
                  fallback={9}
                />
                <p className="text-xs text-muted-foreground">Antal bars - lavere = hurtigere reaktion</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ema_medium">Medium EMA</Label>
                <IntegerInput
                  value={formData.ema_medium}
                  onValueChange={(v) => setFormData({ ...formData, ema_medium: v })}
                  fallback={21}
                />
                <p className="text-xs text-muted-foreground">Mellemperiode for trend bekræftelse</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ema_slow">Langsom EMA</Label>
                <IntegerInput
                  value={formData.ema_slow}
                  onValueChange={(v) => setFormData({ ...formData, ema_slow: v })}
                  fallback={50}
                />
                <p className="text-xs text-muted-foreground">Langsom linje - mere stabil trend</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ema_medium_trend">Medium Trend EMA</Label>
                <IntegerInput
                  value={formData.ema_medium_trend}
                  onValueChange={(v) => setFormData({ ...formData, ema_medium_trend: v })}
                  fallback={50}
                />
                <p className="text-xs text-muted-foreground">EMA for medium trend analyse (f.eks. 50)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_ema_spread_percent">⚠️ Minimum EMA Spread (%) - HARD FILTER</Label>
                <DecimalInput
                  value={formData.min_ema_spread_percent}
                  onValueChange={(v) => setFormData({ ...formData, min_ema_spread_percent: v })}
                  fallback={0.2}
                />
                <p className="text-xs text-muted-foreground">
                  <strong className="text-warning">HARD FILTER:</strong> Blokerer trades hvis (Fast-Slow)/Price &lt; dette % (sidelæns marked filter)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_ema_spread_percent">⚠️ Maksimum EMA Spread (%) - HARD FILTER</Label>
                <DecimalInput
                  value={formData.max_ema_spread_percent}
                  onValueChange={(v) => setFormData({ ...formData, max_ema_spread_percent: v })}
                  fallback={5.0}
                />
                <p className="text-xs text-muted-foreground">
                  <strong className="text-warning">HARD FILTER:</strong> Blokerer trades hvis (Fast-Slow)/Price &gt; dette % (forhindrer for sene entries i stærkt udvidede trends)
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>RSI (Relative Strength Index)</CardTitle>
              <CardDescription>Momentum og zone filter</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.rsi_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, rsi_hard_filter: isHard })}
              disabled={!formData.rsi_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <Label htmlFor="rsi_enabled">Aktiver RSI</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.rsi_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="rsi_enabled"
                checked={formData.rsi_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  rsi_enabled: checked,
                  ...(checked === false && { rsi_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.rsi_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="rsi_period">RSI Periode</Label>
                <IntegerInput
                  value={formData.rsi_period}
                  onValueChange={(v) => setFormData({ ...formData, rsi_period: v })}
                  fallback={14}
                />
                <p className="text-xs text-muted-foreground">Antal bars til RSI beregning (standard 14)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rsi_min_long">RSI for LONG</Label>
                <DecimalInput
                  value={formData.rsi_min_long}
                  onValueChange={(v) => setFormData({ ...formData, rsi_min_long: v })}
                  fallback={30}
                />
                <p className="text-xs text-muted-foreground">LONG når RSI krydser OP over denne værdi</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rsi_max_short">RSI for SHORT</Label>
                <DecimalInput
                  value={formData.rsi_max_short}
                  onValueChange={(v) => setFormData({ ...formData, rsi_max_short: v })}
                  fallback={70}
                />
                <p className="text-xs text-muted-foreground">SHORT når RSI krydser NED under denne værdi</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rsi_zone_width">RSI Zone Bredde</Label>
                <DecimalInput
                  value={formData.rsi_zone_width}
                  onValueChange={(v) => setFormData({ ...formData, rsi_zone_width: v })}
                  fallback={5}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.rsi_zone_width === 0 
                    ? "CROSSOVER MODE: Signal kun når RSI krydser grænsen (meget få signaler)" 
                    : `ZONE MODE: LONG zone [${formData.rsi_min_long - formData.rsi_zone_width}-${formData.rsi_min_long + formData.rsi_zone_width}], SHORT zone [${formData.rsi_max_short - formData.rsi_zone_width}-${formData.rsi_max_short + formData.rsi_zone_width}]`}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rsi_momentum_periods">RSI Momentum Perioder</Label>
                <IntegerInput
                  value={formData.rsi_momentum_periods}
                  onValueChange={(v) => setFormData({ ...formData, rsi_momentum_periods: v })}
                  fallback={3}
                  min={2}
                  max={5}
                />
                <p className="text-xs text-muted-foreground">
                  Antal perioder der checkes for momentum. {formData.rsi_momentum_periods === 2 ? 'RSI₀ > RSI₁' : formData.rsi_momentum_periods === 3 ? 'RSI₀ > RSI₁ > RSI₂' : formData.rsi_momentum_periods === 4 ? 'RSI₀ > RSI₁ > RSI₂ > RSI₃' : 'RSI₀ > RSI₁ > ... > RSIₙ'}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>StochRSI (Stochastic RSI)</CardTitle>
              <CardDescription>Overkøbt/Oversolgt baseret på RSI</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.stochrsi_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, stochrsi_hard_filter: isHard })}
              disabled={!formData.stochrsi_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-5">
          <div className="flex items-center justify-between sm:col-span-5">
            <Label htmlFor="stochrsi_enabled">Aktiver StochRSI</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.stochrsi_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="stochrsi_enabled"
                checked={formData.stochrsi_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  stochrsi_enabled: checked,
                  ...(checked === false && { stochrsi_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.stochrsi_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="stochrsi_period">RSI Periode</Label>
                <IntegerInput
                  value={formData.stochrsi_period}
                  onValueChange={(v) => setFormData({ ...formData, stochrsi_period: v })}
                  fallback={14}
                />
                <p className="text-xs text-muted-foreground">RSI periode for StochRSI (standard 14)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stochrsi_k_period">%K Periode</Label>
                <IntegerInput
                  value={formData.stochrsi_k_period}
                  onValueChange={(v) => setFormData({ ...formData, stochrsi_k_period: v })}
                  fallback={3}
                />
                <p className="text-xs text-muted-foreground">%K smoothing periode (standard 3)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stochrsi_d_period">%D Periode</Label>
                <IntegerInput
                  value={formData.stochrsi_d_period}
                  onValueChange={(v) => setFormData({ ...formData, stochrsi_d_period: v })}
                  fallback={3}
                />
                <p className="text-xs text-muted-foreground">%D smoothing periode (standard 3)</p>
              </div>
              {/* StochRSI SHORT Mode */}
              <div className="sm:col-span-5 border-t pt-4 mt-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">SHORT Signal Mode</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stochrsi_short_mode">StochRSI SHORT Mode</Label>
                    <Select
                      value={formData.stochrsi_short_mode}
                      onValueChange={(value) => setFormData({ ...formData, stochrsi_short_mode: value })}
                    >
                      <SelectTrigger id="stochrsi_short_mode">
                        <SelectValue placeholder="Vælg SHORT mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ZONE_ONLY">Zone Only (K/D overbought)</SelectItem>
                        <SelectItem value="REVERSAL_ROLLOVER">Reversal Rollover (Bearish Cross)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {formData.stochrsi_short_mode === 'ZONE_ONLY' 
                        ? 'SHORT når K >= Overbought K OG D >= Overbought D' 
                        : 'SHORT ved bearish cross: K krydser under D i overbought zone'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rollover_d_min_short">Rollover D Min (SHORT)</Label>
                    <DecimalInput
                      value={formData.rollover_d_min_short}
                      onValueChange={(v) => setFormData({ ...formData, rollover_d_min_short: v })}
                      fallback={50}
                    />
                    <p className="text-xs text-muted-foreground">Ekstra filter: D skal være ≤ denne værdi ved cross (0=deaktiveret)</p>
                  </div>
                </div>
              </div>
              
              {/* Overbought thresholds for SHORT - always shown for both modes */}
              <div className="sm:col-span-5 border-t pt-4 mt-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Overkøbt (SHORT tærskler{['REVERSAL_ROLLOVER', 'REVERSAL_OVERBOUGHT'].includes(formData.stochrsi_short_mode) ? ' - Bearish Cross kræver max(K,D) >= threshold' : ''})
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stochrsi_overbought_k">Overkøbt Threshold</Label>
                    <DecimalInput
                      value={formData.stochrsi_overbought_k}
                      onValueChange={(v) => setFormData({ ...formData, stochrsi_overbought_k: v })}
                      fallback={80}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.stochrsi_short_mode === 'ZONE_ONLY' 
                        ? 'K ≥ denne værdi for SHORT' 
                        : 'max(K,D) ≥ denne værdi ved bearish cross'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stochrsi_overbought_d">Overkøbt D</Label>
                    <DecimalInput
                      value={formData.stochrsi_overbought_d}
                      onValueChange={(v) => setFormData({ ...formData, stochrsi_overbought_d: v })}
                      fallback={80}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.stochrsi_short_mode === 'ZONE_ONLY' 
                        ? 'D ≥ denne værdi for SHORT' 
                        : 'Bruges sammen med K til zone-check'}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* StochRSI LONG Mode */}
              <div className="sm:col-span-5 border-t pt-4 mt-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">LONG Signal Mode</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stochrsi_long_mode">StochRSI LONG Mode</Label>
                    <Select
                      value={formData.stochrsi_long_mode}
                      onValueChange={(value) => setFormData({ ...formData, stochrsi_long_mode: value })}
                    >
                      <SelectTrigger id="stochrsi_long_mode">
                        <SelectValue placeholder="Vælg LONG mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ZONE_ONLY">Zone Only (K/D oversold)</SelectItem>
                        <SelectItem value="REVERSAL_ROLLOVER">Reversal Rollover (Bullish Cross)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {formData.stochrsi_long_mode === 'ZONE_ONLY' 
                        ? 'LONG når K <= Oversold K OG D <= Oversold D' 
                        : 'LONG ved bullish cross: D krydser over K i oversold zone'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rollover_d_min_long">Rollover D Min (LONG)</Label>
                    <DecimalInput
                      value={formData.rollover_d_min_long}
                      onValueChange={(v) => setFormData({ ...formData, rollover_d_min_long: v })}
                      fallback={40}
                    />
                    <p className="text-xs text-muted-foreground">Ekstra filter: D skal være ≥ denne værdi ved cross (0=deaktiveret)</p>
                  </div>
                </div>
              </div>
              
              {/* Oversold thresholds for LONG */}
              <div className="sm:col-span-5 border-t pt-4 mt-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Oversolgt (LONG tærskler{['REVERSAL_ROLLOVER', 'REVERSAL_OVERSOLD'].includes(formData.stochrsi_long_mode) ? ' - Bullish Cross kræver min(K,D) <= threshold' : ''})
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stochrsi_oversold_k">Oversolgt K</Label>
                    <DecimalInput
                      value={formData.stochrsi_oversold_k}
                      onValueChange={(v) => setFormData({ ...formData, stochrsi_oversold_k: v })}
                      fallback={20}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.stochrsi_long_mode === 'ZONE_ONLY' 
                        ? 'K ≤ denne værdi for LONG' 
                        : 'min(K,D) ≤ denne værdi ved bullish cross'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stochrsi_oversold_d">Oversolgt D</Label>
                    <DecimalInput
                      value={formData.stochrsi_oversold_d}
                      onValueChange={(v) => setFormData({ ...formData, stochrsi_oversold_d: v })}
                      fallback={20}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.stochrsi_long_mode === 'ZONE_ONLY' 
                        ? 'D ≤ denne værdi for LONG' 
                        : 'Bruges sammen med K til zone-check'}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pivot Points */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pivot Points</CardTitle>
              <CardDescription>Support og resistance niveauer</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.pivot_points_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, pivot_points_hard_filter: isHard })}
              disabled={!formData.pivot_points_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="pivot_points_enabled">Brug Pivot Points</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.pivot_points_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="pivot_points_enabled"
                checked={formData.pivot_points_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  pivot_points_enabled: checked,
                  ...(checked === false && { pivot_points_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.pivot_points_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="pivot_points_timeframe">Tidsramme</Label>
                <Select
                  value={formData.pivot_points_timeframe}
                  onValueChange={(value) => setFormData({ ...formData, pivot_points_timeframe: value })}
                >
                  <SelectTrigger id="pivot_points_timeframe">
                    <SelectValue placeholder="Vælg tidsramme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">Daily</SelectItem>
                    <SelectItem value="1w">Weekly</SelectItem>
                    <SelectItem value="1M">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Beregningsperiode for pivot points</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pivot_points_lookback">Lookback Periode</Label>
                <IntegerInput
                  id="pivot_points_lookback"
                  value={formData.pivot_points_lookback}
                  onValueChange={(v) => setFormData({ ...formData, pivot_points_lookback: v })}
                  fallback={24}
                />
                <p className="text-xs text-muted-foreground">Antal bars tilbage til pivot beregning (f.eks. 24)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pivot_points_near_threshold">Near Threshold</Label>
                <DecimalInput
                  id="pivot_points_near_threshold"
                  value={formData.pivot_points_near_threshold}
                  onValueChange={(v) => setFormData({ ...formData, pivot_points_near_threshold: v })}
                  fallback={0.002}
                />
                <p className="text-xs text-muted-foreground">Tærskel for "tæt på" pivot (0.002 = 0.2%)</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>MACD (Moving Average Convergence Divergence)</CardTitle>
              <CardDescription>Momentum bekræftelse</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.macd_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, macd_hard_filter: isHard })}
              disabled={!formData.macd_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div className="flex items-center justify-between sm:col-span-4">
            <Label htmlFor="macd_enabled">Aktiver MACD</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.macd_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="macd_enabled"
                checked={formData.macd_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  macd_enabled: checked,
                  // Sluk alle child-toggles når parent slukkes
                  ...(checked === false && {
                    macd_direction_enabled: false,
                    macd_color_change_hard_filter: false,
                    histogram_momentum_enabled: false,
                    macd_hard_filter: false,
                  })
                })}
              />
            </div>
          </div>
          
          {formData.macd_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="macd_fast">Hurtig</Label>
                <IntegerInput
                  id="macd_fast"
                  value={formData.macd_fast}
                  onValueChange={(v) => setFormData({ ...formData, macd_fast: v })}
                  fallback={12}
                />
                <p className="text-xs text-muted-foreground">Hurtig EMA periode (standard 12)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="macd_slow">Langsom</Label>
                <IntegerInput
                  id="macd_slow"
                  value={formData.macd_slow}
                  onValueChange={(v) => setFormData({ ...formData, macd_slow: v })}
                  fallback={26}
                />
                <p className="text-xs text-muted-foreground">Langsom EMA periode (standard 26)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="macd_signal">Signal</Label>
                <IntegerInput
                  id="macd_signal"
                  value={formData.macd_signal}
                  onValueChange={(v) => setFormData({ ...formData, macd_signal: v })}
                  fallback={9}
                />
                <p className="text-xs text-muted-foreground">Signal linje EMA (standard 9)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="macd_histogram_threshold">Histogram Tærskel</Label>
                <DecimalInput
                  id="macd_histogram_threshold"
                  value={formData.macd_histogram_threshold}
                  onValueChange={(v) => setFormData({ ...formData, macd_histogram_threshold: v })}
                  fallback={0}
                />
                <p className="text-xs text-muted-foreground">Min histogram for signal (0 = alle)</p>
              </div>

              <div className="flex items-center justify-between sm:col-span-4">
                <Label htmlFor="macd_direction_enabled">MACD Retnings-Filter (hård)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.macd_direction_enabled ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="macd_direction_enabled"
                    checked={formData.macd_direction_enabled}
                    onCheckedChange={(checked) => setFormData({...formData, macd_direction_enabled: checked})}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between sm:col-span-4">
                <Label htmlFor="macd_color_change_hard_filter">MACD Farveskift-Filter (hård)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.macd_color_change_hard_filter ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="macd_color_change_hard_filter"
                    checked={formData.macd_color_change_hard_filter}
                    onCheckedChange={(checked) => setFormData({...formData, macd_color_change_hard_filter: checked})}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-4 -mt-2">
                Når aktiveret: LONG kun ved skift rød→grøn, SHORT kun ved skift grøn→rød
              </p>

              <div className="flex items-center justify-between sm:col-span-4">
                <Label htmlFor="histogram_momentum_enabled">Histogram Momentum Shift (blød)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.histogram_momentum_enabled ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="histogram_momentum_enabled"
                    checked={formData.histogram_momentum_enabled}
                    onCheckedChange={(checked) => setFormData({...formData, histogram_momentum_enabled: checked})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="histogram_momentum_periods">Momentum Perioder</Label>
                <IntegerInput
                  id="histogram_momentum_periods"
                  value={formData.histogram_momentum_periods}
                  onValueChange={(v) => setFormData({...formData, histogram_momentum_periods: v})}
                  fallback={3}
                  min={2}
                  max={10}
                />
                <p className="text-xs text-muted-foreground">
                  Antal perioder til momentum-beregning (2-10)
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Bollinger Bands</CardTitle>
              <CardDescription>Volatilitet og breakouts</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.bb_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, bb_hard_filter: isHard })}
              disabled={!formData.bb_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="bb_enabled">Aktiver Bollinger Bands</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.bb_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="bb_enabled"
                checked={formData.bb_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  bb_enabled: checked,
                  ...(checked === false && { bb_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.bb_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="bb_period">Periode</Label>
                <IntegerInput
                  id="bb_period"
                  value={formData.bb_period}
                  onValueChange={(v) => setFormData({ ...formData, bb_period: v })}
                  fallback={20}
                />
                <p className="text-xs text-muted-foreground">SMA periode for midt-båndet (standard 20)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bb_std_dev">Standard Afvigelse</Label>
                <DecimalInput
                  id="bb_std_dev"
                  value={formData.bb_std_dev}
                  onValueChange={(v) => setFormData({ ...formData, bb_std_dev: v })}
                  fallback={2}
                />
                <p className="text-xs text-muted-foreground">Hvor bredt båndet er (standard 2.0)</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>VWAP (Volume Weighted Average Price)</CardTitle>
              <CardDescription>LONG hvis Price &gt; VWAP, SHORT hvis Price &lt; VWAP</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.vwap_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, vwap_hard_filter: isHard })}
              disabled={!formData.vwap_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="vwap_enabled">Aktiver VWAP</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.vwap_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="vwap_enabled"
                checked={formData.vwap_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  vwap_enabled: checked,
                  ...(checked === false && { vwap_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.vwap_enabled && (
            <div className="space-y-2">
              <Label htmlFor="vwap_period">VWAP Periode (antal candles)</Label>
              <IntegerInput
                id="vwap_period"
                value={formData.vwap_period}
                onValueChange={(v) => setFormData({ ...formData, vwap_period: v })}
                fallback={50}
                min={10}
                max={500}
              />
              <p className="text-xs text-muted-foreground">
                Antal bars til VWAP beregning (standard 50, 288 ≈ 24h på 5m)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supertrend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Supertrend</CardTitle>
              <CardDescription>ATR-baseret trend direction filter. LONG hvis pris &gt; Supertrend, SHORT hvis pris &lt; Supertrend</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.supertrend_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, supertrend_hard_filter: isHard })}
              disabled={!formData.supertrend_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="supertrend_enabled">Aktiver Supertrend</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.supertrend_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="supertrend_enabled"
                checked={formData.supertrend_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  supertrend_enabled: checked,
                  ...(checked === false && { supertrend_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.supertrend_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="supertrend_period">ATR Periode</Label>
                <IntegerInput
                  id="supertrend_period"
                  value={formData.supertrend_period}
                  onValueChange={(v) => setFormData({ ...formData, supertrend_period: v })}
                  fallback={10}
                  min={1}
                  max={100}
                />
                <p className="text-xs text-muted-foreground">ATR periode for Supertrend beregning (standard 10)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supertrend_multiplier">ATR Multiplikator</Label>
                <DecimalInput
                  id="supertrend_multiplier"
                  value={formData.supertrend_multiplier}
                  onValueChange={(v) => setFormData({ ...formData, supertrend_multiplier: v })}
                  fallback={3.0}
                  min={0.5}
                  max={10}
                />
                <p className="text-xs text-muted-foreground">Multiplikator for ATR afstand (standard 3.0). Højere = bredere bånd</p>
              </div>
              <div className="sm:col-span-2 p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  <strong>📊 Logik:</strong> Supertrend = HL2 ± ({formData.supertrend_multiplier}× ATR({formData.supertrend_period}))<br/>
                  • <strong>LONG:</strong> Pris over Supertrend linje (uptrend)<br/>
                  • <strong>SHORT:</strong> Pris under Supertrend linje (downtrend)
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* OBV (On Balance Volume) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>OBV (On Balance Volume)</CardTitle>
              <CardDescription>Kumulativ volume baseret på prisændring – bekræfter trend</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.obv_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, obv_hard_filter: isHard })}
              disabled={!formData.obv_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="obv_enabled">Aktiver OBV</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.obv_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="obv_enabled"
                checked={formData.obv_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  obv_enabled: checked,
                  ...(checked === false && { obv_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.obv_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="obv_lookback">Lookback Perioder</Label>
                <IntegerInput
                  id="obv_lookback"
                  value={formData.obv_lookback}
                  onValueChange={(v) => setFormData({ ...formData, obv_lookback: v })}
                  fallback={5}
                  min={2}
                  max={50}
                />
                <p className="text-xs text-muted-foreground">Antal perioder tilbage til sammenligning (standard 5)</p>
              </div>
              <div className="sm:col-span-2 p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  <strong>📊 Logik:</strong> OBV stiger når volumen bekræfter prisretning<br/>
                  • <strong>LONG:</strong> OBV stigende (nuværende &gt; {formData.obv_lookback} perioder siden)<br/>
                  • <strong>SHORT:</strong> OBV faldende (nuværende &lt; {formData.obv_lookback} perioder siden)
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* CCI (Commodity Channel Index) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>CCI (Commodity Channel Index)</CardTitle>
              <CardDescription>Momentum oscillator – bedre i trends end StochRSI</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.cci_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, cci_hard_filter: isHard })}
              disabled={!formData.cci_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <Label htmlFor="cci_enabled">Aktiver CCI</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.cci_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="cci_enabled"
                checked={formData.cci_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  cci_enabled: checked,
                  ...(checked === false && { cci_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.cci_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cci_period">CCI Periode</Label>
                <IntegerInput
                  id="cci_period"
                  value={formData.cci_period}
                  onValueChange={(v) => setFormData({ ...formData, cci_period: v })}
                  fallback={20}
                  min={5}
                  max={100}
                />
                <p className="text-xs text-muted-foreground">Antal bars til CCI beregning (standard 20)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cci_overbought">Overbought</Label>
                <DecimalInput
                  id="cci_overbought"
                  value={formData.cci_overbought}
                  onValueChange={(v) => setFormData({ ...formData, cci_overbought: v })}
                  fallback={100}
                />
                <p className="text-xs text-muted-foreground">Over denne værdi = overbought (standard +100)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cci_oversold">Oversold</Label>
                <DecimalInput
                  id="cci_oversold"
                  value={formData.cci_oversold}
                  onValueChange={(v) => setFormData({ ...formData, cci_oversold: v })}
                  fallback={-100}
                />
                <p className="text-xs text-muted-foreground">Under denne værdi = oversold (standard -100)</p>
              </div>
              <div className="sm:col-span-3 p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  <strong>📊 Logik:</strong> CCI = (Typical Price - SMA) / (0.015 × Mean Deviation)<br/>
                  • <strong>LONG:</strong> CCI krydser op over {formData.cci_oversold} (fra oversold)<br/>
                  • <strong>SHORT:</strong> CCI krydser ned under {formData.cci_overbought} (fra overbought)
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Parabolic SAR */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Parabolic SAR</CardTitle>
              <CardDescription>Entry filter + trailing stop ved exit</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.psar_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, psar_hard_filter: isHard })}
              disabled={!formData.psar_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <Label htmlFor="psar_enabled">Aktiver Parabolic SAR</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.psar_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="psar_enabled"
                checked={formData.psar_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  psar_enabled: checked,
                  ...(checked === false && { psar_hard_filter: false, psar_trailing_enabled: false })
                })}
              />
            </div>
          </div>
          
          {formData.psar_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="psar_af_start">AF Start</Label>
                <DecimalInput
                  id="psar_af_start"
                  value={formData.psar_af_start}
                  onValueChange={(v) => setFormData({ ...formData, psar_af_start: v })}
                  fallback={0.02}
                  min={0.001}
                  max={0.1}
                />
                <p className="text-xs text-muted-foreground">Acceleration Factor start (standard 0.02)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="psar_af_increment">AF Increment</Label>
                <DecimalInput
                  id="psar_af_increment"
                  value={formData.psar_af_increment}
                  onValueChange={(v) => setFormData({ ...formData, psar_af_increment: v })}
                  fallback={0.02}
                  min={0.001}
                  max={0.1}
                />
                <p className="text-xs text-muted-foreground">AF stiger med dette pr. ny high/low (standard 0.02)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="psar_af_max">AF Max</Label>
                <DecimalInput
                  id="psar_af_max"
                  value={formData.psar_af_max}
                  onValueChange={(v) => setFormData({ ...formData, psar_af_max: v })}
                  fallback={0.2}
                  min={0.05}
                  max={0.5}
                />
                <p className="text-xs text-muted-foreground">Maksimal Acceleration Factor (standard 0.2)</p>
              </div>

              <div className="flex items-center justify-between sm:col-span-3 border-t pt-4">
                <div>
                  <Label htmlFor="psar_trailing_enabled">PSAR Trailing Stop (Exit)</Label>
                  <p className="text-xs text-muted-foreground">
                    Brug PSAR som alternativ trailing stop ved position exit
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.psar_trailing_enabled ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="psar_trailing_enabled"
                    checked={formData.psar_trailing_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, psar_trailing_enabled: checked })}
                  />
                </div>
              </div>

              <div className="sm:col-span-3 p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  <strong>📊 Entry Filter:</strong><br/>
                  • <strong>LONG:</strong> Pris &gt; PSAR (uptrend konfirmeret)<br/>
                  • <strong>SHORT:</strong> Pris &lt; PSAR (downtrend konfirmeret)<br/><br/>
                  <strong>📊 Trailing Stop (hvis aktiveret):</strong><br/>
                  • PSAR følger prisen med accelererende hastighed<br/>
                  • Integreres i Model B (Most Protective) med andre stops
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Candle Momentum */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>🕯️ Candle Momentum</CardTitle>
              <CardDescription>Filtrerer små og svage candles fra. Bruges til kun at tage handler når prisen faktisk bevæger sig med reel styrke.</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.candle_momentum_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, candle_momentum_hard_filter: isHard })}
              disabled={!formData.candle_momentum_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="candle_momentum_enabled">Aktiver Candle Momentum</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.candle_momentum_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="candle_momentum_enabled"
                checked={formData.candle_momentum_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  candle_momentum_enabled: checked,
                  ...(checked === false && { candle_momentum_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.candle_momentum_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="min_candle_body_percent">Min Body %</Label>
                <DecimalInput
                  id="min_candle_body_percent"
                  value={formData.min_candle_body_percent}
                  onValueChange={(v) => setFormData({ ...formData, min_candle_body_percent: v })}
                  fallback={0.15}
                  min={0.05}
                  max={0.50}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum candle body størrelse i % (typisk 0.05 - 0.50, standard 0.15)
                </p>
              </div>

              <div className="sm:col-span-2 p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  <strong>📊 Logik:</strong><br/>
                  • <strong>Formel:</strong> body_pct = |close - open| / open × 100<br/>
                  • <strong>Bestået:</strong> body_pct ≥ {formData.min_candle_body_percent}%<br/>
                  • <strong>Blokeret:</strong> body_pct &lt; {formData.min_candle_body_percent}%<br/>
                  • Gælder ens for LONG og SHORT. Kun candle body tæller, ikke wicks.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>ATR (Average True Range)</CardTitle>
              <CardDescription>Volatilitet - bruges til stop-loss og trailing stop</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.atr_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, atr_hard_filter: isHard })}
              disabled={!formData.atr_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <Label htmlFor="atr_enabled">Aktiver ATR</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.atr_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="atr_enabled"
                checked={formData.atr_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  atr_enabled: checked,
                  // Sluk alle child-toggles når parent slukkes
                  ...(checked === false && {
                    adaptive_atr_enabled: false,
                    trailing_stop_activation_enabled: false,
                    atr_hard_filter: false,
                  })
                })}
              />
            </div>
          </div>
          
          {formData.atr_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="atr_period">ATR Periode</Label>
                <IntegerInput
                  id="atr_period"
                  value={formData.atr_period}
                  onValueChange={(v) => setFormData({ ...formData, atr_period: v })}
                  fallback={14}
                />
                <p className="text-xs text-muted-foreground">Antal bars til volatilitet (standard 14)</p>
              </div>
              {/* min_atr (raw) er DEPRECATED og skjult - kun ATR% bruges nu */}
              <div className="space-y-2">
                <Label htmlFor="min_atr_percent">Minimum ATR (%) – HARD FILTER</Label>
                <DecimalInput
                  id="min_atr_percent"
                  value={formData.min_atr_percent}
                  onValueChange={(v) => setFormData({ ...formData, min_atr_percent: v })}
                  fallback={0.5}
                />
                <p className="text-xs text-muted-foreground">Bloker trade hvis (ATR/Price × 100) &lt; Minimum ATR (%)</p>
              </div>
              
              <div className="flex items-center justify-between sm:col-span-3 border-t pt-4">
                <div>
                  <h4 className="font-semibold">🔄 Adaptive ATR (%)</h4>
                  <p className="text-xs text-muted-foreground">
                    Dynamisk ATR% = Base × (Nuværende Volume% eller ATR%)<br/>
                    Overskriver Minimum ATR% når aktiveret
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.adaptive_atr_enabled ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="adaptive_atr_enabled"
                    checked={formData.adaptive_atr_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, adaptive_atr_enabled: checked })}
                  />
                </div>
              </div>
              
              {formData.adaptive_atr_enabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="atr_base_min">ATR Base Minimum (%)</Label>
                    <DecimalInput
                      id="atr_base_min"
                      value={formData.atr_base_min}
                      onValueChange={(v) => setFormData({ ...formData, atr_base_min: v })}
                      fallback={1.0}
                    />
                    <p className="text-xs text-muted-foreground">Base værdi for adaptive beregning</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="atr_floor">ATR Floor (%)</Label>
                    <DecimalInput
                      id="atr_floor"
                      value={formData.atr_floor}
                      onValueChange={(v) => setFormData({ ...formData, atr_floor: v })}
                      fallback={0.7}
                    />
                    <p className="text-xs text-muted-foreground">Minimum værdi (floor)</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="atr_ceiling">ATR Ceiling (%)</Label>
                    <DecimalInput
                      id="atr_ceiling"
                      value={formData.atr_ceiling}
                      onValueChange={(v) => setFormData({ ...formData, atr_ceiling: v })}
                      fallback={2.0}
                    />
                    <p className="text-xs text-muted-foreground">Maksimum værdi (ceiling)</p>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="atr_stop_loss_multiplier">Stop-Loss Multiplikator</Label>
                <DecimalInput
                  id="atr_stop_loss_multiplier"
                  value={formData.atr_stop_loss_multiplier}
                  onValueChange={(v) => setFormData({ ...formData, atr_stop_loss_multiplier: v })}
                  fallback={2}
                />
                <p className="text-xs text-muted-foreground">Højere = løsere SL (2.0 = 2×ATR)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="atr_trailing_stop_multiplier">ATR Trailing Stop Multiplier</Label>
                <DecimalInput
                  id="atr_trailing_stop_multiplier"
                  value={formData.atr_trailing_stop_multiplier}
                  onValueChange={(v) => setFormData({ ...formData, atr_trailing_stop_multiplier: v })}
                  fallback={1.5}
                />
                <p className="text-xs text-muted-foreground">Trailing stop afstand fra peak (× ATR)</p>
              </div>

              <div className="flex items-center justify-between sm:col-span-3 border-t pt-4">
                <div className="space-y-1">
                  <Label htmlFor="trailing_stop_activation_enabled">Trailing Stop Aktivering (HARD FILTER)</Label>
                  <p className="text-xs text-muted-foreground">Aktiver kun trailing stop når profit overstiger threshold</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.trailing_stop_activation_enabled ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="trailing_stop_activation_enabled"
                    checked={formData.trailing_stop_activation_enabled}
                    onCheckedChange={(checked) => setFormData({...formData, trailing_stop_activation_enabled: checked})}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="trailing_stop_activation_atr">Trailing Stop Aktiverings-Threshold (× ATR)</Label>
                <DecimalInput
                  id="trailing_stop_activation_atr"
                  value={formData.trailing_stop_activation_atr}
                  onValueChange={(v) => setFormData({ ...formData, trailing_stop_activation_atr: v })}
                  fallback={1.0}
                />
                <p className="text-xs text-muted-foreground">Trailing stop aktiveres først når profit ≥ (× ATR). Standard: 1.0 ATR</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🎯 Break-Even</CardTitle>
          <CardDescription>
            Flyt stop-loss til entry (eller over) når profit når threshold.<br/>
            Vælg mellem ATR-baseret eller Profit %-baseret trigger.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Master toggle */}
          <div className="flex items-center justify-between sm:col-span-2">
            <div>
              <Label htmlFor="break_even_enabled">Aktiver Break-Even</Label>
              <p className="text-xs text-muted-foreground">Master toggle for hele break-even funktionaliteten</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.break_even_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="break_even_enabled"
                checked={formData.break_even_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  break_even_enabled: checked,
                  // Sluk alle child-toggles når parent slukkes
                  ...(checked === false && {
                    break_even_ratchet_only: false,
                    break_even_atr_enabled: false,
                    break_even_profit_pct_enabled: false,
                  })
                })}
              />
            </div>
          </div>

          {formData.break_even_enabled && (
            <>
              {/* Ratchet only toggle */}
              <div className="flex items-center justify-between sm:col-span-2 border-t pt-4">
                <div>
                  <Label htmlFor="break_even_ratchet_only">Ratchet Only</Label>
                  <p className="text-xs text-muted-foreground">Kun flyt stop opad (LONG) / nedad (SHORT) - aldrig tilbage</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.break_even_ratchet_only ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="break_even_ratchet_only"
                    checked={formData.break_even_ratchet_only}
                    onCheckedChange={(checked) => setFormData({ ...formData, break_even_ratchet_only: checked })}
                  />
                </div>
              </div>

              {/* ATR-baseret Break-Even */}
              <div className="sm:col-span-2 border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-semibold">📐 ATR-baseret Break-Even</h4>
                    <p className="text-xs text-muted-foreground">Trigger ved profit = X × ATR</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{formData.break_even_atr_enabled ? "Tændt" : "Slukket"}</span>
                    <Switch
                      id="break_even_atr_enabled"
                      checked={formData.break_even_atr_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, break_even_atr_enabled: checked })}
                    />
                  </div>
                </div>
                
                {formData.break_even_atr_enabled && (
                  <div className="grid gap-4 sm:grid-cols-2 pl-4 border-l-2 border-primary/20">
                    <div className="space-y-2">
                      <Label htmlFor="break_even_atr">Trigger ATR Multiplier</Label>
                      <DecimalInput
                        id="break_even_atr"
                        value={formData.break_even_atr}
                        onValueChange={(v) => setFormData({ ...formData, break_even_atr: v })}
                        fallback={1.0}
                      />
                      <p className="text-xs text-muted-foreground">Aktiver BE når profit ≥ X × ATR</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="break_even_atr_stop_offset">Stop Offset (× ATR)</Label>
                      <DecimalInput
                        id="break_even_atr_stop_offset"
                        value={formData.break_even_atr_stop_offset}
                        onValueChange={(v) => setFormData({ ...formData, break_even_atr_stop_offset: v })}
                        fallback={0}
                        min={0}
                      />
                      <p className="text-xs text-muted-foreground">Stop placeres entry ± (offset × ATR). 0 = præcis entry.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Profit %-baseret Break-Even */}
              <div className="sm:col-span-2 border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-semibold">📊 Profit %-baseret Break-Even</h4>
                    <p className="text-xs text-muted-foreground">
                      Trigger ved profit = X% af entry pris.<br/>
                      <strong>LONG:</strong> Trigger når price ≥ entry × (1 + X/100), stop = entry × (1 + Y/100)<br/>
                      <strong>SHORT:</strong> Trigger når price ≤ entry × (1 - X/100), stop = entry × (1 - Y/100)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{formData.break_even_profit_pct_enabled ? "Tændt" : "Slukket"}</span>
                    <Switch
                      id="break_even_profit_pct_enabled"
                      checked={formData.break_even_profit_pct_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, break_even_profit_pct_enabled: checked })}
                    />
                  </div>
                </div>
                
                {formData.break_even_profit_pct_enabled && (
                  <div className="grid gap-4 sm:grid-cols-2 pl-4 border-l-2 border-primary/20">
                    <div className="space-y-2">
                      <Label htmlFor="break_even_profit_pct_trigger">Trigger Profit %</Label>
                      <DecimalInput
                        id="break_even_profit_pct_trigger"
                        value={formData.break_even_profit_pct_trigger}
                        onValueChange={(v) => setFormData({ ...formData, break_even_profit_pct_trigger: v })}
                        fallback={1.5}
                        min={0}
                      />
                      <p className="text-xs text-muted-foreground">
                        Aktiver BE når profit ≥ X% af entry
                        {formData.break_even_profit_pct_trigger === 0 && (
                          <span className="text-destructive block mt-1">⚠️ Trigger = 0%: BE aktiveres straks! Risiko for instant stop-out pga. spread/fees.</span>
                        )}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="break_even_profit_pct_stop_over_entry">Stop Over Entry %</Label>
                      <DecimalInput
                        id="break_even_profit_pct_stop_over_entry"
                        value={formData.break_even_profit_pct_stop_over_entry}
                        onValueChange={(v) => {
                          // Validering: stop_over_entry_pct <= trigger_profit_pct
                          const clampedVal = Math.min(v, formData.break_even_profit_pct_trigger);
                          setFormData({ ...formData, break_even_profit_pct_stop_over_entry: clampedVal });
                        }}
                        fallback={0.1}
                        min={0}
                        max={formData.break_even_profit_pct_trigger}
                      />
                      <p className="text-xs text-muted-foreground">
                        Stop placeres X% over entry (LONG) / under entry (SHORT). Skal være ≤ Trigger %.
                        {formData.break_even_profit_pct_stop_over_entry > formData.break_even_profit_pct_trigger && (
                          <span className="text-destructive block">⚠️ Må ikke overstige Trigger %!</span>
                        )}
                      </p>
                    </div>
                    
                    {/* Info om når begge modes er aktive */}
                    {formData.break_even_atr_enabled && (
                      <div className="sm:col-span-2 p-3 bg-muted/50 rounded-md">
                        <p className="text-xs text-muted-foreground">
                          <strong>ℹ️ Begge BE-modes er aktive:</strong> Når begge trigges, vælges det mest beskyttende stop (højeste for LONG, laveste for SHORT).
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🔒 Peak-Lock Trailing</CardTitle>
          <CardDescription>
            Procent-baseret trailing stop der låser profit tættere på peak end ATR-trailing.<br/>
            Når trade har momentum, flyttes stop tættere på peak så du ikke giver profit tilbage.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Master toggle */}
          <div className="flex items-center justify-between sm:col-span-2">
            <div>
              <Label htmlFor="peak_lock_enabled">Aktiver Peak-Lock Trailing</Label>
              <p className="text-xs text-muted-foreground">Slår procent-baseret peak-lock trailing til</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.peak_lock_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="peak_lock_enabled"
                checked={formData.peak_lock_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  peak_lock_enabled: checked,
                  ...(checked === false && { peak_lock_ratchet_only: false })
                })}
              />
            </div>
          </div>

          {formData.peak_lock_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="peak_lock_activate_profit_pct">Aktivér ved Profit %</Label>
                <DecimalInput
                  id="peak_lock_activate_profit_pct"
                  value={formData.peak_lock_activate_profit_pct}
                  onValueChange={(v) => setFormData({ ...formData, peak_lock_activate_profit_pct: v })}
                  fallback={0.60}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Peak-lock aktiveres når profit ≥ X% fra entry. Eks: 0.60 = 0.6% profit
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="peak_lock_distance_pct">Afstand fra Peak %</Label>
                <DecimalInput
                  id="peak_lock_distance_pct"
                  value={formData.peak_lock_distance_pct}
                  onValueChange={(v) => setFormData({ ...formData, peak_lock_distance_pct: v })}
                  fallback={0.35}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Stop placeres X% under peak (LONG) / over peak (SHORT). Eks: 0.35 = 0.35% fra peak
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="peak_lock_min_profit_floor_pct">Min Profit Floor %</Label>
                <DecimalInput
                  id="peak_lock_min_profit_floor_pct"
                  value={formData.peak_lock_min_profit_floor_pct}
                  onValueChange={(v) => setFormData({ ...formData, peak_lock_min_profit_floor_pct: v })}
                  fallback={0.15}
                  min={0}
                />
                <p className="text-xs text-muted-foreground">
                  Stop må aldrig være under minimumsgevinst. Eks: 0.15 = stop altid ≥ 0.15% over entry
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="peak_lock_ratchet_only">Ratchet Only</Label>
                  <p className="text-xs text-muted-foreground">Stop må kun strammes, aldrig løsnes</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.peak_lock_ratchet_only ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="peak_lock_ratchet_only"
                    checked={formData.peak_lock_ratchet_only}
                    onCheckedChange={(checked) => setFormData({ ...formData, peak_lock_ratchet_only: checked })}
                  />
                </div>
              </div>

              {/* Info box */}
              <div className="sm:col-span-2 p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  <strong>📊 Logik:</strong> Når profit når {formData.peak_lock_activate_profit_pct}%, beregnes:<br/>
                  • <strong>Peak-lock stop</strong> = peak × (1 - {formData.peak_lock_distance_pct}%) for LONG<br/>
                  • <strong>Profit floor</strong> = entry × (1 + {formData.peak_lock_min_profit_floor_pct}%) for LONG<br/>
                  • <strong>Kandidat stop</strong> = max(peak-lock, profit-floor)<br/>
                  • <strong>Endelig stop</strong> = max(eksisterende ATR/BE stop, kandidat){formData.peak_lock_ratchet_only && ' + ratchet'}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>🛑 Hard Stop Loss %</CardTitle>
              <CardDescription>
                Absolut yderste grænse. Højeste prioritet - overskriver alle andre stops.
              </CardDescription>
            </div>
            <Switch
              checked={formData.hard_sl_pct_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, hard_sl_pct_enabled: checked })}
            />
          </div>
        </CardHeader>
        {formData.hard_sl_pct_enabled && (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hard_sl_pct">Hard SL %</Label>
              <DecimalInput
                id="hard_sl_pct"
                value={formData.hard_sl_pct}
                onValueChange={(v) => setFormData({ ...formData, hard_sl_pct: v })}
                fallback={3.0}
                min={0.1}
                max={20}
              />
              <p className="text-xs text-muted-foreground">
                Maksimalt tab fra entry i % (fx 3.0 = max 3% tab)
              </p>
            </div>
            
            <div className="sm:col-span-2 p-3 bg-muted/50 rounded-md">
              <p className="text-xs text-muted-foreground">
                <strong>📊 Logik:</strong><br/>
                • <strong>LONG:</strong> Exit hvis price ≤ entry × (1 - {formData.hard_sl_pct}%)<br/>
                • <strong>SHORT:</strong> Exit hvis price ≥ entry × (1 + {formData.hard_sl_pct}%)<br/>
                • <strong>Prioritet:</strong> 1️⃣ Hard SL → 2️⃣ Max SL after MFE → 3️⃣ Break-Even → 4️⃣ Peak-Lock → 5️⃣ ATR Trailing<br/>
                • <strong>Ratchet:</strong> Hard SL kan kun strammes ind, aldrig ud
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>🎯 Max SL efter MFE</CardTitle>
              <CardDescription>
                Stram stop-loss automatisk når trade har været i profit (MFE).<br/>
                Gælder KUN før Break-Even aktiveres.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.max_sl_after_mfe_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="max_sl_after_mfe_enabled"
                checked={formData.max_sl_after_mfe_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, max_sl_after_mfe_enabled: checked })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="max_sl_after_mfe_activate_pct">Aktivér ved MFE (%)</Label>
            <DecimalInput
              id="max_sl_after_mfe_activate_pct"
              value={formData.max_sl_after_mfe_activate_pct}
              onValueChange={(v) => setFormData({ ...formData, max_sl_after_mfe_activate_pct: v })}
              fallback={0.60}
              min={0}
              max={5}
              disabled={!formData.max_sl_after_mfe_enabled}
            />
            <p className="text-xs text-muted-foreground">
              Reglen aktiveres når MFE har nået denne % (fx 0.60 = 0.6% profit)
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="max_sl_after_mfe_max_dist_pct">Max SL afstand fra entry (%)</Label>
            <DecimalInput
              id="max_sl_after_mfe_max_dist_pct"
              value={formData.max_sl_after_mfe_max_dist_pct}
              onValueChange={(v) => setFormData({ ...formData, max_sl_after_mfe_max_dist_pct: v })}
              fallback={1.0}
              min={0}
              max={5}
              disabled={!formData.max_sl_after_mfe_enabled}
            />
            <p className="text-xs text-muted-foreground">
              Når aktiv må SL ikke ligge længere væk end dette % fra entry (fx 1.0 = max 1% tab)
            </p>
          </div>
          
          {formData.max_sl_after_mfe_enabled && (
            <div className="sm:col-span-2 p-3 bg-muted/50 rounded-md">
              <p className="text-xs text-muted-foreground">
                <strong>📊 Logik:</strong><br/>
                • <strong>Aktivering:</strong> Når MFE% ≥ {formData.max_sl_after_mfe_activate_pct}% OG BE ikke er aktiveret<br/>
                • <strong>LONG:</strong> SL må ikke være under entry × (1 - {formData.max_sl_after_mfe_max_dist_pct}%)<br/>
                • <strong>SHORT:</strong> SL må ikke være over entry × (1 + {formData.max_sl_after_mfe_max_dist_pct}%)<br/>
                • <strong>Efter BE:</strong> Denne regel stopper - BE/Trailing styrer<br/>
                • <strong>Ratchet:</strong> SL flyttes kun indad (strammes), aldrig udad
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>ADX (Average Directional Index)</CardTitle>
              <CardDescription>Trend-styrke filter</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.adx_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, adx_hard_filter: isHard })}
              disabled={!formData.adx_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="adx_enabled">Aktiver ADX</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.adx_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="adx_enabled"
                checked={formData.adx_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  adx_enabled: checked,
                  // Sluk alle child-toggles når parent slukkes
                  ...(checked === false && {
                    adaptive_adx_enabled: false,
                    adx_hard_filter: false,
                  })
                })}
              />
            </div>
          </div>
          
          {formData.adx_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="adx_period">ADX Periode</Label>
                <IntegerInput
                  id="adx_period"
                  value={formData.adx_period}
                  onValueChange={(v) => setFormData({ ...formData, adx_period: v })}
                  fallback={14}
                />
                <p className="text-xs text-muted-foreground">Antal bars til ADX (standard 14)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adx_floor">ADX Min</Label>
                <DecimalInput
                  id="adx_floor"
                  value={formData.adx_floor}
                  onValueChange={(v) => setFormData({ ...formData, adx_floor: v })}
                  fallback={20}
                />
                <p className="text-xs text-muted-foreground">Minimum ADX værdi krævet for trade</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adx_ceiling">ADX Max</Label>
                <DecimalInput
                  id="adx_ceiling"
                  value={formData.adx_ceiling}
                  onValueChange={(v) => setFormData({ ...formData, adx_ceiling: v })}
                  fallback={40}
                />
                <p className="text-xs text-muted-foreground">Maksimum ADX værdi tilladt for trade</p>
              </div>
              
              <div className="flex items-center justify-between sm:col-span-2 border-t pt-4">
                <div>
                  <h4 className="font-semibold">🔄 Adaptive ADX</h4>
                  <p className="text-xs text-muted-foreground">
                    Dynamisk ADX = Base × (ATR% / Gennemsnits ATR%)<br/>
                    Overskriver ADX Tærskel når aktiveret
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formData.adaptive_adx_enabled ? "Tændt" : "Slukket"}</span>
                  <Switch
                    id="adaptive_adx_enabled"
                    checked={formData.adaptive_adx_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, adaptive_adx_enabled: checked })}
                  />
                </div>
              </div>
              
              {formData.adaptive_adx_enabled && (
                <div className="space-y-2">
                  <Label htmlFor="adx_base_min">ADX Base (Adaptive)</Label>
                  <DecimalInput
                    id="adx_base_min"
                    value={formData.adx_base_min}
                    onValueChange={(v) => setFormData({ ...formData, adx_base_min: v })}
                    fallback={25}
                  />
                  <p className="text-xs text-muted-foreground">Base værdi for adaptive beregning</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Volume & Signal Settings</CardTitle>
              <CardDescription>Volume filter og signal betingelser</CardDescription>
            </div>
            <FilterModeToggle
              isHard={formData.volume_hard_filter}
              onChange={(isHard) => setFormData({ ...formData, volume_hard_filter: isHard })}
              disabled={!formData.volume_enabled}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="volume_enabled">Aktiver Volume Check</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.volume_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="volume_enabled"
                checked={formData.volume_enabled}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  volume_enabled: checked,
                  ...(checked === false && { volume_hard_filter: false })
                })}
              />
            </div>
          </div>
          
          {formData.volume_enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="volume_avg_period">Volumen Gennemsnit Periode</Label>
                <IntegerInput
                  id="volume_avg_period"
                  value={formData.volume_avg_period}
                  onValueChange={(v) => setFormData({ ...formData, volume_avg_period: v })}
                  fallback={20}
                />
                <p className="text-xs text-muted-foreground">Antal bars for gennemsnit</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="volume_multiplier">Volumen Multiplier (LONG)</Label>
                <DecimalInput
                  id="volume_multiplier"
                  value={formData.volume_multiplier}
                  onValueChange={(v) => setFormData({ ...formData, volume_multiplier: v })}
                  fallback={1.2}
                />
                <p className="text-xs text-muted-foreground">
                  LONG kræver vol ≥ avg×{formData.volume_multiplier}
                </p>
              </div>
              
              {/* SHORT-specific Volume settings */}
              <div className="sm:col-span-2 pt-4 border-t border-border">
                <Label className="text-base font-medium">Volume (SHORT) - Separat indstilling</Label>
                <p className="text-xs text-muted-foreground mb-4">
                  Uafhængig volume-gate for SHORT trades
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="volume_mode_short">Volume Mode (SHORT)</Label>
                <Select
                  value={formData.volume_mode_short}
                  onValueChange={(value) => setFormData({ ...formData, volume_mode_short: value })}
                >
                  <SelectTrigger id="volume_mode_short">
                    <SelectValue placeholder="Vælg mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="OFF">OFF - Ingen volume check</SelectItem>
                    <SelectItem value="SOFT">SOFT - Giver 1 point</SelectItem>
                    <SelectItem value="HARD">HARD - Krævet for SHORT</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  OFF=deaktiveret, SOFT=1 point, HARD=blokerer
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="volume_multiplier_short">Volumen Multiplier (SHORT)</Label>
                <DecimalInput
                  id="volume_multiplier_short"
                  value={formData.volume_multiplier_short}
                  onValueChange={(v) => setFormData({ ...formData, volume_multiplier_short: v })}
                  fallback={0.50}
                  min={0}
                  disabled={formData.volume_mode_short === 'OFF'}
                />
                <p className="text-xs text-muted-foreground">
                  SHORT kræver vol ≥ avg×{formData.volume_multiplier_short} (default: 0.50)
                </p>
              </div>
            </>
          )}
          
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="signal_conditions_required">Signal Betingelser Påkrævet (Soft Rules)</Label>
              <span className="text-sm font-medium">{formData.signal_conditions_required}</span>
            </div>
            <Slider
              id="signal_conditions_required"
              min={0}
              max={activeSoftRulesCount}
              step={1}
              disabled={activeSoftRulesCount === 0}
              value={[Math.min(formData.signal_conditions_required, activeSoftRulesCount)]}
              onValueChange={(value) => setFormData({ ...formData, signal_conditions_required: value[0] })}
            />
            <p className="text-xs text-muted-foreground">
              Kræver minimum X af følgende betingelser (1 point hver) <span className="opacity-80">(kun SOFT)</span>:
              <br />
              {softRuleCandidates.map((rule) => {
                let status: string;
                let icon: string;
                if (rule.isHard && rule.parentEnabled) {
                  status = "HARD";
                  icon = "🔒";
                } else if (rule.enabled) {
                  status = "SOFT ✅";
                  icon = "✅";
                } else {
                  status = "Slukket";
                  icon = "❌";
                }
                return (
                  <span key={rule.key} className={rule.isHard ? "opacity-50" : ""}>
                    • {rule.label} ({icon} {rule.isHard ? "HARD" : status})
                    <br />
                  </span>
                );
              })}
              <strong>
                Aktive SOFT: {activeSoftRulesCount}/{softRulesMax}
              </strong>
              {activeSoftRulesCount === 0 && (
                <>
                  <br />
                  <span>
                    {softRulesMax === 0 
                      ? "Alle relevante betingelser er sat som HARD filters — soft-kravet sættes derfor til 0."
                      : "Ingen soft betingelser er aktiveret — soft-kravet sættes derfor til 0."}
                  </span>
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeframes</CardTitle>
          <CardDescription>Trading interval og trend-retning analyse</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="scan_interval">Scan Interval (Trading Timeframe)</Label>
            <Select
              value={formData.scan_interval}
              onValueChange={(value) => setFormData({ ...formData, scan_interval: value })}
            >
              <SelectTrigger id="scan_interval">
                <SelectValue placeholder="Vælg interval" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="1m">1 minut</SelectItem>
                <SelectItem value="3m">3 minutter</SelectItem>
                <SelectItem value="5m">5 minutter</SelectItem>
                <SelectItem value="15m">15 minutter</SelectItem>
                <SelectItem value="30m">30 minutter</SelectItem>
                <SelectItem value="1h">1 time</SelectItem>
                <SelectItem value="2h">2 timer</SelectItem>
                <SelectItem value="4h">4 timer</SelectItem>
                <SelectItem value="6h">6 timer</SelectItem>
                <SelectItem value="8h">8 timer</SelectItem>
                <SelectItem value="12h">12 timer</SelectItem>
                <SelectItem value="1d">1 dag</SelectItem>
                <SelectItem value="3d">3 dage</SelectItem>
                <SelectItem value="1w">1 uge</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Timeframe for trading signals</p>
          </div>
          
          <div className="space-y-3">
            <Label htmlFor="signal_timing_mode">Signal Timing</Label>
            <Select
              value={formData.signal_timing_mode}
              onValueChange={(value) => setFormData({ ...formData, signal_timing_mode: value })}
            >
              <SelectTrigger id="signal_timing_mode">
                <SelectValue placeholder="Vælg timing" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="LIVE">Live / Intra-candle</SelectItem>
                <SelectItem value="CANDLE_CLOSE">Candle Close (bekræftet)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.signal_timing_mode === 'LIVE' 
                ? "Evaluerer signaler på live candles. Hurtigere entries og flere trades."
                : "Signaler kvalificeres kun ved candle close på scan-timeframe. Entry sker i starten af næste candle."}
            </p>
          </div>
          
          {/* Entry Window - kun synlig i CANDLE_CLOSE mode */}
          {formData.signal_timing_mode === 'CANDLE_CLOSE' && (
            <>
              <div className="space-y-3">
                <Label htmlFor="candle_close_entry_window_seconds">Entry Window efter Candle Close</Label>
                <Select
                  value={String(formData.candle_close_entry_window_seconds)}
                  onValueChange={(value) => setFormData({ ...formData, candle_close_entry_window_seconds: parseInt(value) })}
                >
                  <SelectTrigger id="candle_close_entry_window_seconds">
                    <SelectValue placeholder="Vælg vindue" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="60">60 sek (1 min)</SelectItem>
                    <SelectItem value="120">120 sek (2 min)</SelectItem>
                    <SelectItem value="180">180 sek (3 min)</SelectItem>
                    <SelectItem value="300">300 sek (5 min)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Vælger hvor længe efter candle close en handel må åbnes.
                  <br />
                  <span className="text-muted-foreground/70">Bemærk: Entry window kan automatisk blive begrænset til max 50% af candle-længden.</span>
                </p>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                💡 Candle Close reducerer støj og ghost signals, men giver færre handler end Live-mode.
              </div>
            </>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="trend_timeframe">Trend Timeframe</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{formData.trend_timeframe_enabled !== false ? "Tændt" : "Slukket"}</span>
                <Switch
                  id="trend_timeframe_enabled"
                  checked={formData.trend_timeframe_enabled !== false}
                  onCheckedChange={(checked) => setFormData({ 
                    ...formData, 
                    trend_timeframe_enabled: checked,
                    ...(checked === false && { ema_trend_hard_filter: false })
                  })}
                />
              </div>
            </div>
            <Select
              value={formData.trend_timeframe}
              onValueChange={(value) => setFormData({ ...formData, trend_timeframe: value })}
              disabled={formData.trend_timeframe_enabled === false}
            >
              <SelectTrigger id="trend_timeframe" className={formData.trend_timeframe_enabled === false ? "opacity-50" : ""}>
                <SelectValue placeholder="Vælg trend timeframe" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="1m">1 minut</SelectItem>
                <SelectItem value="3m">3 minutter</SelectItem>
                <SelectItem value="5m">5 minutter</SelectItem>
                <SelectItem value="15m">15 minutter</SelectItem>
                <SelectItem value="30m">30 minutter</SelectItem>
                <SelectItem value="1h">1 time</SelectItem>
                <SelectItem value="2h">2 timer</SelectItem>
                <SelectItem value="4h">4 timer</SelectItem>
                <SelectItem value="6h">6 timer</SelectItem>
                <SelectItem value="8h">8 timer</SelectItem>
                <SelectItem value="12h">12 timer</SelectItem>
                <SelectItem value="1d">1 dag</SelectItem>
                <SelectItem value="3d">3 dage</SelectItem>
                <SelectItem value="1w">1 uge</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.trend_timeframe_enabled !== false 
                ? "Medium TF for ADX og EMA trend analyse"
                : "Slukket - ingen medium trend analyse"}
            </p>
          </div>
          
          {/* Overordnet Trend Timeframe - altid synlig med toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="higher_trend_timeframe">Overordnet Trend Timeframe</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{formData.higher_trend_enabled ? "Tændt" : "Slukket"}</span>
                <Switch
                  checked={formData.higher_trend_enabled}
                  onCheckedChange={(checked) => setFormData({ 
                    ...formData, 
                    higher_trend_enabled: checked,
                    ...(checked === false && { higher_trend_hard_filter: false })
                  })}
                />
              </div>
            </div>
            <Select
              value={formData.higher_trend_timeframe}
              onValueChange={(value) => setFormData({ ...formData, higher_trend_timeframe: value })}
              disabled={!formData.higher_trend_enabled}
            >
              <SelectTrigger id="higher_trend_timeframe" className={!formData.higher_trend_enabled ? "opacity-50" : ""}>
                <SelectValue placeholder="Vælg overordnet trend" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="5m">5 minutter</SelectItem>
                <SelectItem value="10m">10 minutter</SelectItem>
                <SelectItem value="15m">15 minutter</SelectItem>
                <SelectItem value="30m">30 minutter</SelectItem>
                <SelectItem value="1h">1 time</SelectItem>
                <SelectItem value="2h">2 timer</SelectItem>
                <SelectItem value="4h">4 timer</SelectItem>
                <SelectItem value="6h">6 timer</SelectItem>
                <SelectItem value="8h">8 timer</SelectItem>
                <SelectItem value="12h">12 timer</SelectItem>
                <SelectItem value="1d">1 dag</SelectItem>
                <SelectItem value="3d">3 dage</SelectItem>
                <SelectItem value="1w">1 uge</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.higher_trend_enabled 
                ? "HTF Side-Gate: gater LONG/SHORT baseret på trend"
                : "Slukket - begge sider tilladt"}
            </p>
          </div>

          {/* Hard Filter Mode - kun synlig når higher_trend er tændt */}
          {formData.higher_trend_enabled && (
            <div className="flex items-center justify-between sm:col-span-2">
              <div className="flex items-center gap-4">
                <div>
                  <Label>Hard Filter Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Blokerer trades mod trend (HARD) eller giver kun points (SOFT)
                  </p>
                </div>
                <FilterModeToggle
                  isHard={formData.higher_trend_hard_filter}
                  onChange={(isHard) => setFormData({ ...formData, higher_trend_hard_filter: isHard })}
                />
              </div>
            </div>
          )}
          
          {formData.higher_trend_enabled && (
            <div className="space-y-2">
              <Label htmlFor="klines_limit">Klines Limit</Label>
              <IntegerInput
                id="klines_limit"
                value={formData.klines_limit}
                onValueChange={(v) => setFormData({ ...formData, klines_limit: v })}
                fallback={100}
              />
              <p className="text-xs text-muted-foreground">Antal bars at hente til analyse (f.eks. 100)</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risikostyring</CardTitle>
          <CardDescription>Position sizing og eksponering</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="leverage">Leverage</Label>
            <IntegerInput
              id="leverage"
              value={formData.leverage}
              onValueChange={(v) => setFormData({ ...formData, leverage: v })}
              fallback={10}
            />
            <p className="text-xs text-muted-foreground">Gearing - højere = større position med samme kapital</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="position_size_percent">% pr Trade</Label>
            <DecimalInput
              id="position_size_percent"
              value={formData.position_size_percent}
              onValueChange={(v) => setFormData({ ...formData, position_size_percent: v })}
              fallback={5}
            />
            <p className="text-xs text-muted-foreground">Direkte position størrelse i % af balance</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="risk_per_trade_percent">Max Risiko pr. Trade (%)</Label>
            <DecimalInput
              id="risk_per_trade_percent"
              value={formData.risk_per_trade_percent}
              onValueChange={(v) => setFormData({ ...formData, risk_per_trade_percent: v })}
              fallback={1}
            />
            <p className="text-xs text-muted-foreground">Max tab hvis stop loss rammes</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_open_positions">Max Åbne Positioner</Label>
            <IntegerInput
              id="max_open_positions"
              value={formData.max_open_positions}
              onValueChange={(v) => setFormData({ ...formData, max_open_positions: v })}
              fallback={3}
            />
            <p className="text-xs text-muted-foreground">Antal samtidige trades tilladt</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_exposure_percent">Max Eksponering (%)</Label>
            <DecimalInput
              id="max_exposure_percent"
              value={formData.max_exposure_percent}
              onValueChange={(v) => setFormData({ ...formData, max_exposure_percent: v })}
              fallback={5}
            />
            <p className="text-xs text-muted-foreground">Total eksponering max i % af balance</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="daily_loss_limit_percent">Dagligt Tab Limit (%)</Label>
            <DecimalInput
              id="daily_loss_limit_percent"
              value={formData.daily_loss_limit_percent}
              onValueChange={(v) => setFormData({ ...formData, daily_loss_limit_percent: v })}
              fallback={5}
            />
            <p className="text-xs text-muted-foreground">Stop trading hvis tab når denne % på en dag</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Position Exit</CardTitle>
          <CardDescription>Automatisk positionslukning baseret på stop loss, trailing stop og timeout</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto_exit_enabled">Aktiver Automatisk Exit</Label>
              <p className="text-xs text-muted-foreground">
                Når slukket skal positioner lukkes manuelt - ingen automatisk stop loss/trailing stop
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.auto_exit_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="auto_exit_enabled"
                checked={formData.auto_exit_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, auto_exit_enabled: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_position_duration_minutes">Max Position Varighed (min)</Label>
            <IntegerInput
              id="max_position_duration_minutes"
              value={formData.max_position_duration_minutes}
              onValueChange={(v) => setFormData({ ...formData, max_position_duration_minutes: v })}
              fallback={240}
              placeholder="0 = deaktiveret"
              disabled={!formData.auto_exit_enabled}
              min={0}
            />
            <p className="text-xs text-muted-foreground">
              Sæt til 0 eller lad være tom for at deaktivere timeout. Positioner lukkes kun på stop loss/trailing stop. (240 = 4 timer)
            </p>
          </div>
          
          <div className="flex items-center justify-between border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="conditional_time_exit_enabled">Betinget Tids-Exit (Anti-Sour Exit)</Label>
              <p className="text-xs text-muted-foreground">
                Når tændt: Timeout lukker KUN positioner uden momentum.<br/>
                Aktive trends får lov at løbe uanset varighed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.conditional_time_exit_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="conditional_time_exit_enabled"
                checked={formData.conditional_time_exit_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, conditional_time_exit_enabled: checked })}
                disabled={!formData.auto_exit_enabled}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
            <strong>Betingelser for tids-exit (alle skal være opfyldt):</strong><br/>
            • Position overstiger max varighed<br/>
            • ADX aftager (lavere end ved åbning)<br/>
            • MACD Histogram Momentum er negativ/flad<br/>
            • Pris har bevæget sig &lt; 0.3 ATR i perioden<br/>
            • Trailing Stop er IKKE aktiveret<br/><br/>
            <strong>Position holdes åben hvis:</strong><br/>
            • ADX &gt; ADX Min (stærk trend)<br/>
            • Trailing Stop er aktiveret eller tæt på<br/>
            • Pris laver nye favorable ekstremer
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <Button 
          onClick={() => {
            const onOff = (v: boolean) => v ? "Tændt" : "Slukket";
            
            const lines = [
              "═══════════════════════════════════════════════════════════════════",
              `TRADING STRATEGI: ${formData.name}`,
              `Status: ${onOff(formData.enabled)}`,
              "═══════════════════════════════════════════════════════════════════",
              "",
              "───────────────────────────────────────────────────────────────────",
              "AKTIVE INDIKATORER",
              "───────────────────────────────────────────────────────────────────",
              `EMA:           ${onOff(formData.ema_enabled)}`,
              `RSI:           ${onOff(formData.rsi_enabled)}`,
              `StochRSI:      ${onOff(formData.stochrsi_enabled)}`,
              `MACD:          ${onOff(formData.macd_enabled)}`,
              `Bollinger:     ${onOff(formData.bb_enabled)}`,
              `ATR:           ${onOff(formData.atr_enabled)}`,
              `ADX:           ${onOff(formData.adx_enabled)}`,
              `Volume:        ${onOff(formData.volume_enabled)}`,
              `Pivot Points:  ${onOff(formData.pivot_points_enabled)}`,
              `Supertrend:    ${onOff(formData.supertrend_enabled)}`,
              `OBV:           ${onOff(formData.obv_enabled)}`,
              `CCI:           ${onOff(formData.cci_enabled)}`,
              `PSAR:          ${onOff(formData.psar_enabled)}`,
              `VWAP:          ${onOff(formData.vwap_enabled)}`,
              `Signal Timing: ${formData.signal_timing_mode}`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "HARD FILTRE (Blokerer trade hvis ikke opfyldt)",
              "───────────────────────────────────────────────────────────────────",
              "",
              "EMA Spread:",
              `  Status:               ${onOff(formData.ema_enabled)}`,
              `  Min Spread:           ${formData.min_ema_spread_percent}%`,
              `  EMA Trend Hard:       ${onOff(formData.ema_trend_hard_filter)}`,
              "",
              "ATR:",
              `  Status:               ${onOff(formData.atr_enabled)}`,
              `  Min ATR:              ${formData.min_atr_percent}%`,
              `  Adaptiv:              ${onOff(formData.adaptive_atr_enabled)}`,
              `  Adaptiv Base:         ${formData.atr_base_min}%`,
              `  Adaptiv Floor:        ${formData.atr_floor}%`,
              `  Adaptiv Ceiling:      ${formData.atr_ceiling}%`,
              "",
              "ADX:",
              `  Status:               ${onOff(formData.adx_enabled)}`,
              `  Min:                  ${formData.adx_floor}`,
              `  Max:                  ${formData.adx_ceiling}`,
              `  Adaptiv:              ${onOff(formData.adaptive_adx_enabled)}`,
              `  Adaptiv Base:         ${formData.adx_base_min}`,
              "",
              "Volume (LONG):",
              `  Status:               ${onOff(formData.volume_enabled)}`,
              `  Multiplier:           ${formData.volume_multiplier}x`,
              `  Avg Periode:          ${formData.volume_avg_period}`,
              "",
              "Volume (SHORT):",
              `  Mode:                 ${formData.volume_mode_short}`,
              `  Multiplier:           ${formData.volume_multiplier_short}x`,
              "",
              "MACD:",
              `  Direction Hard:       ${onOff(formData.macd_direction_enabled && formData.macd_enabled)}`,
              `  Color Change Hard:    ${onOff(formData.macd_color_change_hard_filter && formData.macd_enabled)}`,
              "",
              ...(formData.stochrsi_enabled && formData.stochrsi_hard_filter
                ? [
                    "StochRSI:",
                    `  Status:               ${onOff(true)}`,
                    `  Periode:              ${formData.stochrsi_period}`,
                    `  K Periode:            ${formData.stochrsi_k_period}`,
                    `  D Periode:            ${formData.stochrsi_d_period}`,
                    `  LONG Mode:            ${formData.stochrsi_long_mode}`,
                    `  Rollover D Min LONG:  ${formData.rollover_d_min_long}`,
                    `  SHORT Mode:           ${formData.stochrsi_short_mode}`,
                    `  Rollover D Min SHORT: ${formData.rollover_d_min_short}`,
                    `  Overbought K:         ${formData.stochrsi_overbought_k}`,
                    `  Overbought D:         ${formData.stochrsi_overbought_d}`,
                    `  Oversold K:           ${formData.stochrsi_oversold_k}`,
                    `  Oversold D:           ${formData.stochrsi_oversold_d}`,
                    "",
                  ]
                : []),
              "Higher Trend:",
              `  Status:               ${onOff(formData.higher_trend_enabled)}`,
              `  Timeframe:            ${formData.higher_trend_timeframe}`,
              "",
              ...(formData.supertrend_enabled ? [
                "Supertrend:",
                `  Status:               ${onOff(true)}`,
                `  Hard Filter:          ${onOff(formData.supertrend_hard_filter)}`,
                `  Periode:              ${formData.supertrend_period}`,
                `  Multiplier:           ${formData.supertrend_multiplier}`,
                "",
              ] : []),
              ...(formData.psar_enabled ? [
                "Parabolic SAR:",
                `  Status:               ${onOff(true)}`,
                `  Hard Filter:          ${onOff(formData.psar_hard_filter)}`,
                `  AF Start:             ${formData.psar_af_start}`,
                `  AF Increment:         ${formData.psar_af_increment}`,
                `  AF Max:               ${formData.psar_af_max}`,
                `  Trailing Enabled:     ${onOff(formData.psar_trailing_enabled)}`,
                "",
              ] : []),
              "Candle Momentum:",
              `  Status:               ${onOff(formData.candle_momentum_enabled)}`,
              `  Hard Filter:          ${onOff(formData.candle_momentum_hard_filter)}`,
              `  Min Body %:           ${formData.min_candle_body_percent}%`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "SOFT CONDITIONS (Mindst X skal opfyldes)",
              "───────────────────────────────────────────────────────────────────",
              `Påkrævet antal:         ${formData.signal_conditions_required}/6`,
              "",
              "1. EMA Trend:",
              `   Status:              ${onOff(formData.ema_enabled)}`,
              "",
              "2. RSI Zone:",
              `   Status:              ${onOff(formData.rsi_enabled)}`,
              `   Periode:             ${formData.rsi_period}`,
              `   Min Long:            ${formData.rsi_min_long}`,
              `   Max Short:           ${formData.rsi_max_short}`,
              `   Zone Width:          ${formData.rsi_zone_width}`,
              "",
              "3. RSI Momentum:",
              `   Status:              ${onOff(formData.rsi_enabled)}`,
              `   Perioder:            ${formData.rsi_momentum_periods}`,
              "",
              "4. MACD Histogram:",
              `   Status:              ${onOff(formData.macd_enabled)}`,
              `   Fast:                ${formData.macd_fast}`,
              `   Slow:                ${formData.macd_slow}`,
              `   Signal:              ${formData.macd_signal}`,
              `   Threshold:           ${formData.macd_histogram_threshold}`,
              "",
              "5. MACD Histogram Momentum:",
              `   Status:              ${onOff(formData.histogram_momentum_enabled && formData.macd_enabled)}`,
              `   Perioder:            ${formData.histogram_momentum_periods}`,
              "",
              "6. Bollinger Bands:",
              `   Status:              ${onOff(formData.bb_enabled)}`,
              `   Periode:             ${formData.bb_period}`,
              `   Std Dev:             ${formData.bb_std_dev}`,
              "",
              ...(formData.stochrsi_enabled && !formData.stochrsi_hard_filter
                ? [
                    "7. StochRSI:",
                    `   Status:              ${onOff(formData.stochrsi_enabled)}`,
                    `   Periode:             ${formData.stochrsi_period}`,
                    `   K Periode:           ${formData.stochrsi_k_period}`,
                    `   D Periode:           ${formData.stochrsi_d_period}`,
                    `   LONG Mode:           ${formData.stochrsi_long_mode}`,
                    `   Rollover D Min LONG: ${formData.rollover_d_min_long}`,
                    `   SHORT Mode:          ${formData.stochrsi_short_mode}`,
                    `   Rollover D Min SHORT: ${formData.rollover_d_min_short}`,
                    `   Overbought K:        ${formData.stochrsi_overbought_k}`,
                    `   Overbought D:        ${formData.stochrsi_overbought_d}`,
                    `   Oversold K:          ${formData.stochrsi_oversold_k}`,
                    `   Oversold D:          ${formData.stochrsi_oversold_d}`,
                    "",
                  ]
                : []),
              ...(formData.obv_enabled ? [
                "8. OBV:",
                `   Status:              ${onOff(true)}`,
                `   Hard Filter:         ${onOff(formData.obv_hard_filter)}`,
                `   Lookback:            ${formData.obv_lookback}`,
                "",
              ] : []),
              ...(formData.cci_enabled ? [
                "9. CCI:",
                `   Status:              ${onOff(true)}`,
                `   Hard Filter:         ${onOff(formData.cci_hard_filter)}`,
                `   Periode:             ${formData.cci_period}`,
                `   Overbought:          ${formData.cci_overbought}`,
                `   Oversold:            ${formData.cci_oversold}`,
                "",
              ] : []),
              ...(formData.vwap_enabled ? [
                "10. VWAP:",
                `   Status:              ${onOff(true)}`,
                `   Hard Filter:         ${onOff(formData.vwap_hard_filter)}`,
                `   Periode:             ${formData.vwap_period}`,
                "",
              ] : []),
              "───────────────────────────────────────────────────────────────────",
              "EMA INDSTILLINGER",
              "───────────────────────────────────────────────────────────────────",
              `Fast EMA:               ${formData.ema_fast}`,
              `Medium EMA:             ${formData.ema_medium}`,
              `Slow EMA:               ${formData.ema_slow}`,
              `Medium Trend EMA:       ${formData.ema_medium_trend}`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "ATR INDSTILLINGER",
              "───────────────────────────────────────────────────────────────────",
              `Periode:                ${formData.atr_period}`,
              `Stop Loss Multiplier:   ${formData.atr_stop_loss_multiplier}x`,
              `Trailing Stop Multi:    ${formData.atr_trailing_stop_multiplier}x`,
              `Trailing Activation:    ${onOff(formData.trailing_stop_activation_enabled)}`,
              `Activation ATR:         ${formData.trailing_stop_activation_atr}x`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "BREAK-EVEN",
              "───────────────────────────────────────────────────────────────────",
              "Master:",
              `  Aktiver Break-Even:   ${onOff(formData.break_even_enabled)}`,
              `  Ratchet Only:         ${onOff(formData.break_even_ratchet_only)}`,
              "",
              "Mode 1: ATR-baseret:",
              `  Status:               ${onOff(formData.break_even_atr_enabled)}`,
              `  Trigger ATR Multi:    ${formData.break_even_atr_enabled ? formData.break_even_atr + 'x' : '-'}`,
              `  Stop Offset (x ATR):  ${formData.break_even_atr_enabled ? formData.break_even_atr_stop_offset + 'x' : '-'}`,
              "",
              "Mode 2: Profit %-baseret:",
              `  Status:               ${onOff(formData.break_even_profit_pct_enabled)}`,
              `  Trigger Profit %:     ${formData.break_even_profit_pct_enabled ? formData.break_even_profit_pct_trigger + '%' : '-'}`,
              `  Stop Over Entry %:    ${formData.break_even_profit_pct_enabled ? formData.break_even_profit_pct_stop_over_entry + '%' : '-'}`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "PEAK-LOCK TRAILING",
              "───────────────────────────────────────────────────────────────────",
              `Aktivér Peak-Lock:       ${onOff(formData.peak_lock_enabled)}`,
              `Aktivér ved Profit %:    ${formData.peak_lock_activate_profit_pct}%`,
              `Distance fra Peak %:     ${formData.peak_lock_distance_pct}%`,
              `Min Profit Floor %:      ${formData.peak_lock_min_profit_floor_pct}%`,
              `Ratchet Only:            ${onOff(formData.peak_lock_ratchet_only)}`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "MAX SL EFTER MFE",
              "───────────────────────────────────────────────────────────────────",
              `Aktivér Max SL efter MFE:${onOff(formData.max_sl_after_mfe_enabled)}`,
              `Aktivér ved MFE %:       ${formData.max_sl_after_mfe_activate_pct}%`,
              `Max SL afstand fra entry:${formData.max_sl_after_mfe_max_dist_pct}%`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "HARD STOP LOSS %",
              "───────────────────────────────────────────────────────────────────",
              `Aktivér Hard SL %:       ${onOff(formData.hard_sl_pct_enabled)}`,
              `Hard SL %:               ${formData.hard_sl_pct_enabled ? formData.hard_sl_pct + '%' : '-'}`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "ADX INDSTILLINGER",
              "───────────────────────────────────────────────────────────────────",
              `Periode:                ${formData.adx_period}`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "PIVOT POINTS",
              "───────────────────────────────────────────────────────────────────",
              `Timeframe:              ${formData.pivot_points_timeframe}`,
              `Lookback:               ${formData.pivot_points_lookback}`,
              `Near Threshold:         ${formData.pivot_points_near_threshold}%`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "TIMEFRAMES",
              "───────────────────────────────────────────────────────────────────",
              `Scan Interval:          ${formData.scan_interval}`,
              `Trend Timeframe:        ${formData.trend_timeframe}`,
              `Higher Trend TF:        ${formData.higher_trend_timeframe}`,
              `Klines Limit:           ${formData.klines_limit}`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "RISK MANAGEMENT",
              "───────────────────────────────────────────────────────────────────",
              `Position Size:          ${formData.position_size_percent}%`,
              `Risk Per Trade:         ${formData.risk_per_trade_percent}%`,
              `Max Open Positions:     ${formData.max_open_positions}`,
              `Max Exposure:           ${formData.max_exposure_percent}%`,
              `Daily Loss Limit:       ${formData.daily_loss_limit_percent}%`,
              `Leverage:               ${formData.leverage}x`,
              `Auto Exit:              ${onOff(formData.auto_exit_enabled)}`,
              `Max Position Duration:  ${formData.max_position_duration_minutes} min`,
              `Betinget Tids-Exit:     ${onOff(formData.conditional_time_exit_enabled)}`,
              "",
              "───────────────────────────────────────────────────────────────────",
              "REGIME ROUTER",
              "───────────────────────────────────────────────────────────────────",
              `Status:                 ${onOff(formData.regime_router_enabled)}`,
              ...(formData.regime_router_enabled ? [
                `Method:                 ${formData.regime_method === 'ADX_AND_ATR' ? 'ADX + ATR%' : formData.regime_method === 'ADX_ONLY' ? 'ADX Only' : formData.regime_method === 'ATR_ONLY' ? 'ATR% Only' : formData.regime_method}`,
                `Operator:               ${formData.regime_operator}`,
                `ADX Threshold:          ${formData.regime_adx_threshold}`,
                `ATR% Threshold:         ${formData.regime_atr_pct_threshold}%`,
                `Lock Regime at Entry:   ${onOff(formData.regime_lock_at_entry)}`,
                `If Condition TRUE:      ${formData.regime_if_true}`,
                `If Condition FALSE:     ${formData.regime_if_false}`,
                "",
                "REGIME → EXIT PROFILE MAPPING",
                `  TREND →               ${exitProfiles.find(p => p.id === formData.regime_trend_exit_profile_id)?.name ?? '(ikke valgt)'}`,
                `  RANGE →               ${exitProfiles.find(p => p.id === formData.regime_range_exit_profile_id)?.name ?? '(ikke valgt)'}`,
              ] : [
                "(Regime Router er slukket - alle trades bruger standard exit-indstillinger)"
              ]),
              "",
              "═══════════════════════════════════════════════════════════════════",
            ];
            
            navigator.clipboard.writeText(lines.join("\n"));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast({
              title: "Kopieret!",
              description: "Strategi konfiguration er kopieret til udklipsholderen",
            });
          }}
          variant="secondary"
          className="w-full"
        >
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          Kopiér Strategi til AI Analyse
        </Button>
        <div className="flex gap-4">
          <Button 
            onClick={handleCancel} 
            variant="outline" 
            className="flex-1"
            disabled={!config?.id}
          >
            Fortryd Ændringer
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading} 
            className="flex-1"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Gem Konfiguration
          </Button>
        </div>
      </div>
    </div>
  );
};