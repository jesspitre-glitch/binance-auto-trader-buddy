import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface IndicatorConfigProps {
  config?: any;
  onSave?: () => void;
}

export const IndicatorConfig = ({ config, onSave }: IndicatorConfigProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: config?.name || "Default Strategy",
    enabled: config?.enabled ?? true,
    
    // EMA
    ema_fast: config?.ema_fast || 9,
    ema_medium: config?.ema_medium || 21,
    ema_slow: config?.ema_slow || 50,
    
    // RSI
    rsi_period: config?.rsi_period || 14,
    rsi_min_long: config?.rsi_min_long || 30,
    rsi_max_short: config?.rsi_max_short || 70,
    
    // StochRSI
    stochrsi_period: config?.stochrsi_period || 14,
    stochrsi_k_period: config?.stochrsi_k_period || 3,
    stochrsi_d_period: config?.stochrsi_d_period || 3,
    stochrsi_overbought: config?.stochrsi_overbought || 80,
    stochrsi_oversold: config?.stochrsi_oversold || 20,
    
    // Pivot Points
    pivot_points_enabled: config?.pivot_points_enabled ?? true,
    pivot_points_timeframe: config?.pivot_points_timeframe || "1d",
    
    // MACD
    macd_fast: config?.macd_fast || 12,
    macd_slow: config?.macd_slow || 26,
    macd_signal: config?.macd_signal || 9,
    macd_histogram_threshold: config?.macd_histogram_threshold || 0,
    
    // Bollinger Bands
    bb_period: config?.bb_period || 20,
    bb_std_dev: config?.bb_std_dev || 2,
    
    // ATR
    atr_period: config?.atr_period || 14,
    atr_stop_loss_multiplier: config?.atr_stop_loss_multiplier || 2,
    atr_trailing_stop_multiplier: config?.atr_trailing_stop_multiplier || 1.5,
    
    // ADX
    adx_period: config?.adx_period || 14,
    adx_threshold: config?.adx_threshold || 25,
    
    // Volume & Signal
    volume_avg_period: config?.volume_avg_period || 20,
    signal_conditions_required: config?.signal_conditions_required || 5,
    
    // Timeframes
    scan_interval: config?.scan_interval || "5m",
    trend_timeframe: config?.trend_timeframe || config?.mtf_timeframe || "15m",
    
    // Risk Management
    position_size_percent: config?.position_size_percent || 5,
    risk_per_trade_percent: config?.risk_per_trade_percent || 1,
    max_open_positions: config?.max_open_positions || 3,
    max_exposure_percent: config?.max_exposure_percent || 5,
    daily_loss_limit_percent: config?.daily_loss_limit_percent || 5,
    
    // Risk/Reward
    risk_reward_ratio: config?.risk_reward_ratio || 2,
    max_position_duration_minutes: config?.max_position_duration_minutes || 240,
    
    // Leverage
    leverage: config?.leverage || 10,
  });
  
  // Sync form with incoming config changes
  useEffect(() => {
    if (!config) return;
    setFormData({
      name: config.name ?? "Default Strategy",
      enabled: config.enabled ?? true,
      // EMA
      ema_fast: config.ema_fast ?? 9,
      ema_medium: config.ema_medium ?? 21,
      ema_slow: config.ema_slow ?? 50,
      // RSI
      rsi_period: config.rsi_period ?? 14,
      rsi_min_long: config.rsi_min_long ?? 30,
      rsi_max_short: config.rsi_max_short ?? 70,
      // StochRSI
      stochrsi_period: config.stochrsi_period ?? 14,
      stochrsi_k_period: config.stochrsi_k_period ?? 3,
      stochrsi_d_period: config.stochrsi_d_period ?? 3,
      stochrsi_overbought: config.stochrsi_overbought ?? 80,
      stochrsi_oversold: config.stochrsi_oversold ?? 20,
      // Pivot Points
      pivot_points_enabled: config.pivot_points_enabled ?? true,
      pivot_points_timeframe: config.pivot_points_timeframe ?? "1d",
      // MACD
      macd_fast: config.macd_fast ?? 12,
      macd_slow: config.macd_slow ?? 26,
      macd_signal: config.macd_signal ?? 9,
      macd_histogram_threshold: config.macd_histogram_threshold ?? 0,
      // Bollinger Bands
      bb_period: config.bb_period ?? 20,
      bb_std_dev: config.bb_std_dev ?? 2,
      // ATR
      atr_period: config.atr_period ?? 14,
      atr_stop_loss_multiplier: config.atr_stop_loss_multiplier ?? 2,
      atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier ?? 1.5,
      // ADX
      adx_period: config.adx_period ?? 14,
      adx_threshold: config.adx_threshold ?? 25,
      // Volume & Signal
      volume_avg_period: config.volume_avg_period ?? 20,
      signal_conditions_required: config.signal_conditions_required ?? 5,
      // Timeframes
      scan_interval: config.scan_interval ?? "5m",
      trend_timeframe: config.trend_timeframe ?? config.mtf_timeframe ?? "15m",
      // Risk Management
      position_size_percent: config.position_size_percent ?? 5,
      risk_per_trade_percent: config.risk_per_trade_percent ?? 1,
      max_open_positions: config.max_open_positions ?? 3,
      max_exposure_percent: config.max_exposure_percent ?? 5,
      daily_loss_limit_percent: config.daily_loss_limit_percent ?? 5,
      // Risk/Reward
      risk_reward_ratio: config.risk_reward_ratio ?? 2,
      max_position_duration_minutes: config.max_position_duration_minutes ?? 240,
      // Leverage
      leverage: config.leverage ?? 10,
    });
  }, [config]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload = {
        ...formData,
        user_id: user.id,
      };

      let result;
      if (config?.id) {
        result = await supabase
          .from("indicator_config")
          .update(payload)
          .eq("id", config.id);
      } else {
        result = await supabase
          .from("indicator_config")
          .insert(payload);
      }

      if (result.error) throw result.error;

      toast({
        title: "Gemt",
        description: "Indikator konfiguration er gemt",
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
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="enabled">Aktiver Strategi</Label>
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>EMA (Exponential Moving Average)</CardTitle>
          <CardDescription>Trendretning og dynamisk støtte/modstand</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>RSI (Relative Strength Index)</CardTitle>
          <CardDescription>Overkøbt/Oversolgt niveau</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>StochRSI (Stochastic RSI)</CardTitle>
          <CardDescription>Overkøbt/Oversolgt baseret på RSI</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-5">
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
          <div className="flex items-center space-x-2">
            <Switch
              id="pivot_points_enabled"
              checked={formData.pivot_points_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, pivot_points_enabled: checked })}
            />
            <Label htmlFor="pivot_points_enabled">Brug Pivot Points</Label>
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
            <p className="text-xs text-muted-foreground">Tidsramme for pivot points beregning</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MACD (Moving Average Convergence Divergence)</CardTitle>
          <CardDescription>Momentum bekræftelse</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bollinger Bands</CardTitle>
          <CardDescription>Volatilitet og breakouts</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
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
          <CardTitle>ATR (Average True Range)</CardTitle>
          <CardDescription>Stop-loss og trailing stop multiplikatorer</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
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
            <Label htmlFor="atr_trailing_stop_multiplier">Trailing Stop Multiplikator</Label>
            <Input
              id="atr_trailing_stop_multiplier"
              type="number"
              step="0.1"
              value={formData.atr_trailing_stop_multiplier}
              onChange={(e) => setFormData({ ...formData, atr_trailing_stop_multiplier: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Afstand fra peak når TP nås (lavere = tættere)</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ADX (Average Directional Index)</CardTitle>
          <CardDescription>Kun trades ved ADX over tærskel</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
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
            <Label htmlFor="adx_threshold">ADX Tærskel</Label>
            <Input
              id="adx_threshold"
              type="number"
              step="0.01"
              value={formData.adx_threshold}
              onChange={(e) => setFormData({ ...formData, adx_threshold: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Min trend styrke - højere = stærkere trend krævet</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signal Settings</CardTitle>
          <CardDescription>Volumen analyse og signal krav</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
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
            <Label htmlFor="signal_conditions_required">Signal Betingelser Påkrævet</Label>
            <Input
              id="signal_conditions_required"
              type="number"
              min="1"
              max={7 + (formData.pivot_points_enabled ? 1 : 0)}
              value={formData.signal_conditions_required}
              onChange={(e) => {
                const maxConditions = 7 + (formData.pivot_points_enabled ? 1 : 0);
                setFormData({ ...formData, signal_conditions_required: Math.min(maxConditions, Math.max(1, parseInt(e.target.value) || 1)) });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Hvor mange ud af {7 + (formData.pivot_points_enabled ? 1 : 0)} betingelser skal være opfyldt 
              (EMA×3 + RSI + StochRSI + MACD + ADX{formData.pivot_points_enabled ? ' + Pivot Points' : ''})
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
          <CardTitle>Risk/Reward & Exit</CardTitle>
          <CardDescription>Take-profit forhold og max position varighed</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="risk_reward_ratio">Risk/Reward Ratio</Label>
            <Input
              id="risk_reward_ratio"
              type="number"
              step="0.1"
              value={formData.risk_reward_ratio}
              onChange={(e) => setFormData({ ...formData, risk_reward_ratio: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">TP afstand = SL afstand × dette tal (2.0 = dobbelt)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_position_duration_minutes">Max Position Varighed (min)</Label>
            <Input
              id="max_position_duration_minutes"
              type="number"
              value={formData.max_position_duration_minutes}
              onChange={(e) => setFormData({ ...formData, max_position_duration_minutes: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Auto-luk position efter denne tid (240 = 4 timer)</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Gem Konfiguration
      </Button>
    </div>
  );
};