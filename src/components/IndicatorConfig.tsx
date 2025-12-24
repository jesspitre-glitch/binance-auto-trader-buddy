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

interface IndicatorConfigProps {
  config?: any;
  onSave?: () => void;
}

export const IndicatorConfig = ({ config, onSave }: IndicatorConfigProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
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
    signal_conditions_required: config?.signal_conditions_required || 5,
    
    // Timeframes
    scan_interval: config?.scan_interval || "5m",
    trend_timeframe: config?.trend_timeframe || config?.mtf_timeframe || "15m",
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
    
    // Leverage
    leverage: config?.leverage || 10,
  });
  
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
      signal_conditions_required: config.signal_conditions_required ?? 5,
      // Timeframes
      scan_interval: config.scan_interval ?? "5m",
      trend_timeframe: config.trend_timeframe ?? config.mtf_timeframe ?? "15m",
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
    });
  }, [config?.id, config?.updated_at]);

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
      signal_conditions_required: config.signal_conditions_required ?? 5,
      scan_interval: config.scan_interval ?? "5m",
      trend_timeframe: config.trend_timeframe ?? config.mtf_timeframe ?? "15m",
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
      if (config?.id) {
        result = await supabase
          .from("indicator_config")
          .update(finalPayload)
          .eq("id", config.id);
      } else {
        result = await supabase
          .from("indicator_config")
          .insert(finalPayload);
      }

      if (result.error) throw result.error;

      toast({
        title: "Gemt",
        description: config?.id 
          ? "Strategi er opdateret" 
          : `Ny strategi "${finalPayload.name}" er oprettet`,
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

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>EMA (Exponential Moving Average)</CardTitle>
          <CardDescription>
            <strong>EMA Trend:</strong> Soft Condition (1 point) - bruger Fast/Medium/Slow alignment<br/>
            <strong>⚠️ EMA Spread:</strong> Hard Filter - blokerer hvis spread &lt; minimum
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <Label htmlFor="ema_enabled">Aktiver EMA</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.ema_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="ema_enabled"
                checked={formData.ema_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, ema_enabled: checked })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between sm:col-span-3">
            <Label htmlFor="ema_trend_hard_filter">⚠️ EMA Retnings-Filter (HARD)</Label>
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
            <Input
              id="ema_fast"
              type="number"
              value={formData.ema_fast}
              onChange={(e) => setFormData({ ...formData, ema_fast: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Antal bars - lavere = hurtigere reaktion</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ema_medium">Medium EMA</Label>
            <Input
              id="ema_medium"
              type="number"
              value={formData.ema_medium}
              onChange={(e) => setFormData({ ...formData, ema_medium: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Mellemperiode for trend bekræftelse</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ema_slow">Langsom EMA</Label>
            <Input
              id="ema_slow"
              type="number"
              value={formData.ema_slow}
              onChange={(e) => setFormData({ ...formData, ema_slow: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Langsom linje - mere stabil trend</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ema_medium_trend">Medium Trend EMA</Label>
            <Input
              id="ema_medium_trend"
              type="number"
              value={formData.ema_medium_trend}
              onChange={(e) => setFormData({ ...formData, ema_medium_trend: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">EMA for medium trend analyse (f.eks. 50)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="min_ema_spread_percent">⚠️ Minimum EMA Spread (%) - HARD FILTER</Label>
            <Input
              id="min_ema_spread_percent"
              type="number"
              step="0.01"
              value={formData.min_ema_spread_percent}
              onChange={(e) => setFormData({ ...formData, min_ema_spread_percent: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              <strong className="text-warning">HARD FILTER:</strong> Blokerer trades hvis (Fast-Slow)/Price &lt; dette % (sidelæns marked filter)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>RSI (Relative Strength Index) - ⚠️ HARD FILTER</CardTitle>
          <CardDescription>
            Blokerer trades UDEN for de tilladte zoner (evalueres FØR soft conditions)<br/>
            <strong className="text-warning">Dette er IKKE en Soft Condition - det er en Hard Filter!</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <Label htmlFor="rsi_enabled">Aktiver RSI</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.rsi_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="rsi_enabled"
                checked={formData.rsi_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, rsi_enabled: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rsi_period">RSI Periode</Label>
            <Input
              id="rsi_period"
              type="number"
              value={formData.rsi_period}
              onChange={(e) => setFormData({ ...formData, rsi_period: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Antal bars til RSI beregning (standard 14)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rsi_min_long">RSI for LONG</Label>
            <Input
              id="rsi_min_long"
              type="number"
              step="0.01"
              value={formData.rsi_min_long}
              onChange={(e) => setFormData({ ...formData, rsi_min_long: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">LONG når RSI krydser OP over denne værdi</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rsi_max_short">RSI for SHORT</Label>
            <Input
              id="rsi_max_short"
              type="number"
              step="0.01"
              value={formData.rsi_max_short}
              onChange={(e) => setFormData({ ...formData, rsi_max_short: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">SHORT når RSI krydser NED under denne værdi</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rsi_zone_width">RSI Zone Bredde</Label>
            <Input
              id="rsi_zone_width"
              type="number"
              step="1"
              value={formData.rsi_zone_width}
              onChange={(e) => setFormData({ ...formData, rsi_zone_width: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              {formData.rsi_zone_width === 0 
                ? "CROSSOVER MODE: Signal kun når RSI krydser grænsen (meget få signaler)" 
                : `ZONE MODE: LONG zone [${formData.rsi_min_long - formData.rsi_zone_width}-${formData.rsi_min_long + formData.rsi_zone_width}], SHORT zone [${formData.rsi_max_short - formData.rsi_zone_width}-${formData.rsi_max_short + formData.rsi_zone_width}]`}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rsi_momentum_periods">RSI Momentum Perioder</Label>
            <Input
              id="rsi_momentum_periods"
              type="number"
              min="2"
              max="5"
              step="1"
              value={formData.rsi_momentum_periods}
              onChange={(e) => setFormData({ ...formData, rsi_momentum_periods: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              Antal perioder der checkes for momentum. {formData.rsi_momentum_periods === 2 ? 'RSI₀ > RSI₁' : formData.rsi_momentum_periods === 3 ? 'RSI₀ > RSI₁ > RSI₂' : formData.rsi_momentum_periods === 4 ? 'RSI₀ > RSI₁ > RSI₂ > RSI₃' : 'RSI₀ > RSI₁ > ... > RSIₙ'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>StochRSI (Stochastic RSI)</CardTitle>
          <CardDescription>Overkøbt/Oversolgt baseret på RSI</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-5">
          <div className="flex items-center justify-between sm:col-span-5">
            <Label htmlFor="stochrsi_enabled">Aktiver StochRSI</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.stochrsi_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="stochrsi_enabled"
                checked={formData.stochrsi_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, stochrsi_enabled: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stochrsi_period">RSI Periode</Label>
            <Input
              id="stochrsi_period"
              type="number"
              value={formData.stochrsi_period}
              onChange={(e) => setFormData({ ...formData, stochrsi_period: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">RSI periode for StochRSI (standard 14)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stochrsi_k_period">%K Periode</Label>
            <Input
              id="stochrsi_k_period"
              type="number"
              value={formData.stochrsi_k_period}
              onChange={(e) => setFormData({ ...formData, stochrsi_k_period: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">%K smoothing periode (standard 3)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stochrsi_d_period">%D Periode</Label>
            <Input
              id="stochrsi_d_period"
              type="number"
              value={formData.stochrsi_d_period}
              onChange={(e) => setFormData({ ...formData, stochrsi_d_period: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">%D smoothing periode (standard 3)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stochrsi_overbought">Overkøbt</Label>
            <Input
              id="stochrsi_overbought"
              type="number"
              step="0.01"
              value={formData.stochrsi_overbought}
              onChange={(e) => setFormData({ ...formData, stochrsi_overbought: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Overkøbt niveau (standard 80)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stochrsi_oversold">Oversolgt</Label>
            <Input
              id="stochrsi_oversold"
              type="number"
              step="0.01"
              value={formData.stochrsi_oversold}
              onChange={(e) => setFormData({ ...formData, stochrsi_oversold: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Oversolgt niveau (standard 20)</p>
          </div>
        </CardContent>
      </Card>

      {/* Pivot Points */}
      <Card>
        <CardHeader>
          <CardTitle>Pivot Points</CardTitle>
          <CardDescription>Support og resistance niveauer</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="pivot_points_enabled">Brug Pivot Points</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.pivot_points_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="pivot_points_enabled"
                checked={formData.pivot_points_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, pivot_points_enabled: checked })}
              />
            </div>
          </div>
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
            <Input
              id="pivot_points_lookback"
              type="number"
              value={formData.pivot_points_lookback}
              onChange={(e) => setFormData({ ...formData, pivot_points_lookback: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Antal bars tilbage til pivot beregning (f.eks. 24)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pivot_points_near_threshold">Near Threshold</Label>
            <Input
              id="pivot_points_near_threshold"
              type="number"
              step="0.0001"
              value={formData.pivot_points_near_threshold}
              onChange={(e) => setFormData({ ...formData, pivot_points_near_threshold: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Tærskel for "tæt på" pivot (0.002 = 0.2%)</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MACD (Moving Average Convergence Divergence)</CardTitle>
          <CardDescription>Momentum bekræftelse</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div className="flex items-center justify-between sm:col-span-4">
            <Label htmlFor="macd_enabled">Aktiver MACD</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.macd_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="macd_enabled"
                checked={formData.macd_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, macd_enabled: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="macd_fast">Hurtig</Label>
            <Input
              id="macd_fast"
              type="number"
              value={formData.macd_fast}
              onChange={(e) => setFormData({ ...formData, macd_fast: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Hurtig EMA periode (standard 12)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="macd_slow">Langsom</Label>
            <Input
              id="macd_slow"
              type="number"
              value={formData.macd_slow}
              onChange={(e) => setFormData({ ...formData, macd_slow: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Langsom EMA periode (standard 26)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="macd_signal">Signal</Label>
            <Input
              id="macd_signal"
              type="number"
              value={formData.macd_signal}
              onChange={(e) => setFormData({ ...formData, macd_signal: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Signal linje EMA (standard 9)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="macd_histogram_threshold">Histogram Tærskel</Label>
            <Input
              id="macd_histogram_threshold"
              type="number"
              step="0.000001"
              value={formData.macd_histogram_threshold}
              onChange={(e) => setFormData({ ...formData, macd_histogram_threshold: parseFloat(e.target.value) })}
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
            <Input
              id="histogram_momentum_periods"
              type="number"
              min="2"
              max="10"
              value={formData.histogram_momentum_periods}
              onChange={(e) => setFormData({...formData, histogram_momentum_periods: parseInt(e.target.value)})}
            />
            <p className="text-xs text-muted-foreground">
              Antal perioder til momentum-beregning (2-10)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bollinger Bands</CardTitle>
          <CardDescription>Volatilitet og breakouts</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="bb_enabled">Aktiver Bollinger Bands</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.bb_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="bb_enabled"
                checked={formData.bb_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, bb_enabled: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bb_period">Periode</Label>
            <Input
              id="bb_period"
              type="number"
              value={formData.bb_period}
              onChange={(e) => setFormData({ ...formData, bb_period: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">SMA periode for midt-båndet (standard 20)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bb_std_dev">Standard Afvigelse</Label>
            <Input
              id="bb_std_dev"
              type="number"
              step="0.1"
              value={formData.bb_std_dev}
              onChange={(e) => setFormData({ ...formData, bb_std_dev: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Hvor bredt båndet er (standard 2.0)</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VWAP (Volume Weighted Average Price)</CardTitle>
          <CardDescription>
            <strong>Soft Condition (1 point):</strong> LONG hvis Price &gt; VWAP, SHORT hvis Price &lt; VWAP<br/>
            VWAP = Σ(Typisk Pris × Volume) / Σ(Volume)
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="vwap_enabled">Aktiver VWAP</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.vwap_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="vwap_enabled"
                checked={formData.vwap_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, vwap_enabled: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vwap_period">VWAP Periode (antal candles)</Label>
            <Input
              id="vwap_period"
              type="number"
              min="10"
              max="500"
              value={formData.vwap_period}
              onChange={(e) => setFormData({ ...formData, vwap_period: parseInt(e.target.value) })}
              disabled={!formData.vwap_enabled}
            />
            <p className="text-xs text-muted-foreground">
              Antal bars til VWAP beregning (standard 50, 288 ≈ 24h på 5m)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ATR (Average True Range) - ⚠️ HARD FILTER</CardTitle>
          <CardDescription>
            <strong className="text-warning">HARD FILTER:</strong> Blokerer trades hvis ATR = 0 (ingen volatilitet)<br/>
            Bruges også til stop-loss og trailing stop beregning
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <Label htmlFor="atr_enabled">Aktiver ATR</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.atr_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="atr_enabled"
                checked={formData.atr_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, atr_enabled: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="atr_period">ATR Periode</Label>
            <Input
              id="atr_period"
              type="number"
              value={formData.atr_period}
              onChange={(e) => setFormData({ ...formData, atr_period: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Antal bars til volatilitet (standard 14)</p>
          </div>
          {/* min_atr (raw) er DEPRECATED og skjult - kun ATR% bruges nu */}
          <div className="space-y-2">
            <Label htmlFor="min_atr_percent">Minimum ATR (%) – HARD FILTER</Label>
            <Input
              id="min_atr_percent"
              type="number"
              step="0.01"
              value={formData.min_atr_percent}
              onChange={(e) => setFormData({ ...formData, min_atr_percent: parseFloat(e.target.value) })}
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
          
          <div className="space-y-2">
            <Label htmlFor="atr_base_min">ATR Base Minimum (%)</Label>
            <Input
              id="atr_base_min"
              type="number"
              step="0.01"
              value={formData.atr_base_min}
              onChange={(e) => setFormData({ ...formData, atr_base_min: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Base værdi for adaptive beregning</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="atr_floor">ATR Floor (%)</Label>
            <Input
              id="atr_floor"
              type="number"
              step="0.01"
              value={formData.atr_floor}
              onChange={(e) => setFormData({ ...formData, atr_floor: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Minimum værdi (floor)</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="atr_ceiling">ATR Ceiling (%)</Label>
            <Input
              id="atr_ceiling"
              type="number"
              step="0.01"
              value={formData.atr_ceiling}
              onChange={(e) => setFormData({ ...formData, atr_ceiling: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Maksimum værdi (ceiling)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="atr_stop_loss_multiplier">Stop-Loss Multiplikator</Label>
            <Input
              id="atr_stop_loss_multiplier"
              type="number"
              step="0.1"
              value={formData.atr_stop_loss_multiplier}
              onChange={(e) => setFormData({ ...formData, atr_stop_loss_multiplier: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Højere = løsere SL (2.0 = 2×ATR)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="atr_trailing_stop_multiplier">ATR Trailing Stop Multiplier</Label>
            <Input
              id="atr_trailing_stop_multiplier"
              type="number"
              step="0.1"
              value={formData.atr_trailing_stop_multiplier}
              onChange={(e) => setFormData({ ...formData, atr_trailing_stop_multiplier: parseFloat(e.target.value) })}
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
            <Input
              id="trailing_stop_activation_atr"
              type="number"
              step="0.1"
              value={formData.trailing_stop_activation_atr}
              onChange={(e) => setFormData({ ...formData, trailing_stop_activation_atr: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Trailing stop aktiveres først når profit ≥ (× ATR). Standard: 1.0 ATR</p>
          </div>
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
                onCheckedChange={(checked) => setFormData({ ...formData, break_even_enabled: checked })}
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
                      <Input
                        id="break_even_atr"
                        type="number"
                        step="0.1"
                        value={formData.break_even_atr}
                        onChange={(e) => setFormData({ ...formData, break_even_atr: parseFloat(e.target.value) || 0 })}
                      />
                      <p className="text-xs text-muted-foreground">Aktiver BE når profit ≥ X × ATR</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="break_even_atr_stop_offset">Stop Offset (× ATR)</Label>
                      <Input
                        id="break_even_atr_stop_offset"
                        type="number"
                        step="0.1"
                        min="0"
                        value={formData.break_even_atr_stop_offset}
                        onChange={(e) => setFormData({ ...formData, break_even_atr_stop_offset: parseFloat(e.target.value) || 0 })}
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
                      <Input
                        id="break_even_profit_pct_trigger"
                        type="number"
                        step="0.1"
                        min="0"
                        value={formData.break_even_profit_pct_trigger}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setFormData({ ...formData, break_even_profit_pct_trigger: val });
                        }}
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
                      <Input
                        id="break_even_profit_pct_stop_over_entry"
                        type="number"
                        step="0.1"
                        min="0"
                        max={formData.break_even_profit_pct_trigger}
                        value={formData.break_even_profit_pct_stop_over_entry}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          // Validering: stop_over_entry_pct <= trigger_profit_pct
                          const clampedVal = Math.min(val, formData.break_even_profit_pct_trigger);
                          setFormData({ ...formData, break_even_profit_pct_stop_over_entry: clampedVal });
                        }}
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
          <CardTitle>ADX (Average Directional Index) - ⚠️ HARD FILTER</CardTitle>
          <CardDescription>
            Blokerer trades hvis trend-styrken er for lav (evalueres FØR soft conditions)<br/>
            <strong className="text-warning">Dette er IKKE en Soft Condition - det er en Hard Filter!</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="adx_enabled">Aktiver ADX</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.adx_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="adx_enabled"
                checked={formData.adx_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, adx_enabled: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adx_period">ADX Periode</Label>
            <Input
              id="adx_period"
              type="number"
              value={formData.adx_period}
              onChange={(e) => setFormData({ ...formData, adx_period: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Antal bars til ADX (standard 14)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adx_floor">ADX Min</Label>
            <Input
              id="adx_floor"
              type="number"
              step="0.1"
              value={formData.adx_floor}
              onChange={(e) => setFormData({ ...formData, adx_floor: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Minimum ADX værdi krævet for trade</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adx_ceiling">ADX Max</Label>
            <Input
              id="adx_ceiling"
              type="number"
              step="0.1"
              value={formData.adx_ceiling}
              onChange={(e) => setFormData({ ...formData, adx_ceiling: parseFloat(e.target.value) })}
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
          
          <div className="space-y-2">
            <Label htmlFor="adx_base_min">ADX Base (Adaptive)</Label>
            <Input
              id="adx_base_min"
              type="number"
              step="0.1"
              value={formData.adx_base_min}
              onChange={(e) => setFormData({ ...formData, adx_base_min: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Base værdi for adaptive beregning</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signal Settings (Soft Rules)</CardTitle>
          <CardDescription>
            Soft conditions evalueres KUN efter Hard Filters er godkendt<br/>
            <strong className="text-warning">⚠️ Hard Filters (blokerer alle trades):</strong> EMA Spread, ATR &gt; 0, ADX ≥ threshold, Volume ≥ multiplier
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <Label htmlFor="volume_enabled">Aktiver Volume Check</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{formData.volume_enabled ? "Tændt" : "Slukket"}</span>
              <Switch
                id="volume_enabled"
                checked={formData.volume_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, volume_enabled: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="volume_avg_period">Volumen Gennemsnit Periode</Label>
            <Input
              id="volume_avg_period"
              type="number"
              value={formData.volume_avg_period}
              onChange={(e) => setFormData({ ...formData, volume_avg_period: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Antal bars for gennemsnit</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="volume_multiplier">⚠️ Volumen Multiplier (HARD + SOFT)</Label>
            <Input
              id="volume_multiplier"
              type="number"
              step="0.1"
              value={formData.volume_multiplier}
              onChange={(e) => setFormData({ ...formData, volume_multiplier: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              <strong className="text-warning">HARD FILTER:</strong> Blokerer hvis vol &lt; avg×multiplier<br/>
              <strong>SOFT CONDITION:</strong> +1 point hvis vol &gt; avg (bruges kun hvis ikke blokeret)
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="signal_conditions_required">Signal Betingelser Påkrævet (Soft Rules)</Label>
              <span className="text-sm font-medium">{formData.signal_conditions_required}</span>
            </div>
            <Slider
              id="signal_conditions_required"
              min={1}
              max={6}
              step={1}
              value={[formData.signal_conditions_required]}
              onValueChange={(value) => setFormData({ ...formData, signal_conditions_required: value[0] })}
            />
            <p className="text-xs text-muted-foreground">
              Kræver minimum X af følgende betingelser (1 point hver):<br/>
              • EMA Trend ({formData.ema_enabled ? '✅' : '❌'})<br/>
              • StochRSI Zone ({formData.stochrsi_enabled ? '✅' : '❌'})<br/>
              • MACD Histogram Momentum ({formData.histogram_momentum_enabled && formData.macd_enabled ? '✅' : '❌'})<br/>
              • Bollinger Bands ({formData.bb_enabled ? '✅' : '❌'})<br/>
              • Volume Surge ({formData.volume_enabled ? '✅' : '❌'})<br/>
              • Pivot Points ({formData.pivot_points_enabled ? '✅' : '❌'})<br/>
              • VWAP ({formData.vwap_enabled ? '✅' : '❌'})<br/>
              <strong>Aktive: {[formData.ema_enabled, formData.stochrsi_enabled, formData.histogram_momentum_enabled && formData.macd_enabled, formData.bb_enabled, formData.volume_enabled, formData.pivot_points_enabled, formData.vwap_enabled].filter(Boolean).length}/7</strong>
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
          <div className="space-y-2">
            <Label htmlFor="trend_timeframe">Trend Timeframe</Label>
            <Select
              value={formData.trend_timeframe}
              onValueChange={(value) => setFormData({ ...formData, trend_timeframe: value })}
            >
              <SelectTrigger id="trend_timeframe">
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
            <p className="text-xs text-muted-foreground">Højere TF for trend-retning</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="higher_trend_enabled">Overordnet Trend Filter</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{formData.higher_trend_enabled ? "Tændt" : "Slukket"}</span>
                <Switch
                  id="higher_trend_enabled"
                  checked={formData.higher_trend_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, higher_trend_enabled: checked })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Blokerer LONG hvis trend er bearish, SHORT hvis bullish
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="higher_trend_timeframe">Overordnet Trend Timeframe</Label>
            <Select
              value={formData.higher_trend_timeframe}
              onValueChange={(value) => setFormData({ ...formData, higher_trend_timeframe: value })}
              disabled={!formData.higher_trend_enabled}
            >
              <SelectTrigger id="higher_trend_timeframe">
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
            <p className="text-xs text-muted-foreground">Timeframe for overordnet trend analyse</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="klines_limit">Klines Limit</Label>
            <Input
              id="klines_limit"
              type="number"
              value={formData.klines_limit}
              onChange={(e) => setFormData({ ...formData, klines_limit: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Antal bars at hente til analyse (f.eks. 100)</p>
          </div>
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
            <Input
              id="leverage"
              type="number"
              value={formData.leverage}
              onChange={(e) => setFormData({ ...formData, leverage: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Gearing - højere = større position med samme kapital</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="position_size_percent">% pr Trade</Label>
            <Input
              id="position_size_percent"
              type="number"
              step="0.1"
              value={formData.position_size_percent}
              onChange={(e) => setFormData({ ...formData, position_size_percent: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Direkte position størrelse i % af balance</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="risk_per_trade_percent">Max Risiko pr. Trade (%)</Label>
            <Input
              id="risk_per_trade_percent"
              type="number"
              step="0.1"
              value={formData.risk_per_trade_percent}
              onChange={(e) => setFormData({ ...formData, risk_per_trade_percent: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Max tab hvis stop loss rammes</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_open_positions">Max Åbne Positioner</Label>
            <Input
              id="max_open_positions"
              type="number"
              value={formData.max_open_positions}
              onChange={(e) => setFormData({ ...formData, max_open_positions: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Antal samtidige trades tilladt</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_exposure_percent">Max Eksponering (%)</Label>
            <Input
              id="max_exposure_percent"
              type="number"
              step="0.1"
              value={formData.max_exposure_percent}
              onChange={(e) => setFormData({ ...formData, max_exposure_percent: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Total eksponering max i % af balance</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="daily_loss_limit_percent">Dagligt Tab Limit (%)</Label>
            <Input
              id="daily_loss_limit_percent"
              type="number"
              step="0.1"
              value={formData.daily_loss_limit_percent}
              onChange={(e) => setFormData({ ...formData, daily_loss_limit_percent: parseFloat(e.target.value) })}
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
            <Input
              id="max_position_duration_minutes"
              type="number"
              value={formData.max_position_duration_minutes || ''}
              onChange={(e) => setFormData({ ...formData, max_position_duration_minutes: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="0 = deaktiveret"
              disabled={!formData.auto_exit_enabled}
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
              "Volume:",
              `  Status:               ${onOff(formData.volume_enabled)}`,
              `  Multiplier:           ${formData.volume_multiplier}x`,
              `  Avg Periode:          ${formData.volume_avg_period}`,
              "",
              "MACD:",
              `  Direction Hard:       ${onOff(formData.macd_direction_enabled && formData.macd_enabled)}`,
              `  Color Change Hard:    ${onOff(formData.macd_color_change_hard_filter && formData.macd_enabled)}`,
              "",
              "Higher Trend:",
              `  Status:               ${onOff(formData.higher_trend_enabled)}`,
              `  Timeframe:            ${formData.higher_trend_timeframe}`,
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
              "7. StochRSI:",
              `   Status:              ${onOff(formData.stochrsi_enabled)}`,
              `   Periode:             ${formData.stochrsi_period}`,
              `   K Periode:           ${formData.stochrsi_k_period}`,
              `   D Periode:           ${formData.stochrsi_d_period}`,
              `   Overbought:          ${formData.stochrsi_overbought}`,
              `   Oversold:            ${formData.stochrsi_oversold}`,
              "",
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