import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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
    rsi_overbought: config?.rsi_overbought || 70,
    rsi_oversold: config?.rsi_oversold || 30,
    
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
    
    // Timeframes
    scan_interval: config?.scan_interval || "5m",
    trend_timeframe: config?.trend_timeframe || config?.mtf_timeframe || "15m",
    
    // Risk Management
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="ema_medium">Medium EMA</Label>
            <Input
              id="ema_medium"
              type="number"
              value={formData.ema_medium}
              onChange={(e) => setFormData({ ...formData, ema_medium: parseInt(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ema_slow">Langsom EMA</Label>
            <Input
              id="ema_slow"
              type="number"
              value={formData.ema_slow}
              onChange={(e) => setFormData({ ...formData, ema_slow: parseInt(e.target.value) })}
            />
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="rsi_overbought">Overkøbt &gt;</Label>
            <Input
              id="rsi_overbought"
              type="number"
              step="0.01"
              value={formData.rsi_overbought}
              onChange={(e) => setFormData({ ...formData, rsi_overbought: parseFloat(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rsi_oversold">Oversolgt &lt;</Label>
            <Input
              id="rsi_oversold"
              type="number"
              step="0.01"
              value={formData.rsi_oversold}
              onChange={(e) => setFormData({ ...formData, rsi_oversold: parseFloat(e.target.value) })}
            />
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="macd_slow">Langsom</Label>
            <Input
              id="macd_slow"
              type="number"
              value={formData.macd_slow}
              onChange={(e) => setFormData({ ...formData, macd_slow: parseInt(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="macd_signal">Signal</Label>
            <Input
              id="macd_signal"
              type="number"
              value={formData.macd_signal}
              onChange={(e) => setFormData({ ...formData, macd_signal: parseInt(e.target.value) })}
            />
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
            <Input
              id="scan_interval"
              value={formData.scan_interval}
              onChange={(e) => setFormData({ ...formData, scan_interval: e.target.value })}
              placeholder="5m"
            />
            <p className="text-xs text-muted-foreground">1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trend_timeframe">Trend Timeframe</Label>
            <Input
              id="trend_timeframe"
              value={formData.trend_timeframe}
              onChange={(e) => setFormData({ ...formData, trend_timeframe: e.target.value })}
              placeholder="15m"
            />
            <p className="text-xs text-muted-foreground">Højere TF for at bestemme trend-retning</p>
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="risk_per_trade_percent">Risiko pr. Trade (%)</Label>
            <Input
              id="risk_per_trade_percent"
              type="number"
              step="0.1"
              value={formData.risk_per_trade_percent}
              onChange={(e) => setFormData({ ...formData, risk_per_trade_percent: parseFloat(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_open_positions">Max Åbne Positioner</Label>
            <Input
              id="max_open_positions"
              type="number"
              value={formData.max_open_positions}
              onChange={(e) => setFormData({ ...formData, max_open_positions: parseInt(e.target.value) })}
            />
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_position_duration_minutes">Max Position Varighed (min)</Label>
            <Input
              id="max_position_duration_minutes"
              type="number"
              value={formData.max_position_duration_minutes}
              onChange={(e) => setFormData({ ...formData, max_position_duration_minutes: parseInt(e.target.value) })}
            />
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