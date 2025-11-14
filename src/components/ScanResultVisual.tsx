import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, BarChart3, Volume2 } from "lucide-react";

interface ScanResultVisualProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: any;
  config?: any;
}

export const ScanResultVisual = ({ open, onOpenChange, result, config }: ScanResultVisualProps) => {
  if (!result?.indicators || !config) return null;

  const indicators = result.indicators;

  // Calculate progress values (0-100)
  const getRSIProgress = () => {
    const rsi = indicators.rsi || 0;
    return (rsi / 100) * 100;
  };

  const getStochRSIProgress = () => {
    const stochK = indicators.stochK || 0;
    return stochK;
  };

  const getVolumeProgress = () => {
    const current = indicators.volume || 0;
    const avg = indicators.volumeAvg || 1;
    const ratio = current / avg;
    return Math.min((ratio / 2) * 100, 100); // Cap at 100%
  };

  const getADXProgress = () => {
    const adx = indicators.adx || 0;
    return Math.min((adx / 50) * 100, 100);
  };

  const getSignalStrength = () => {
    const conditions = indicators.conditionsMet || 0;
    const required = config.signal_conditions_required || 5;
    return (conditions / required) * 100;
  };

  const isInRange = (value: number, min: number, max: number) => {
    return value >= min && value <= max;
  };

  const getColorClass = (value: number, threshold: number, isAbove: boolean) => {
    if (isAbove) {
      return value >= threshold ? "text-green-500" : "text-muted-foreground";
    }
    return value <= threshold ? "text-green-500" : "text-muted-foreground";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result.symbol}
            <Badge variant={result.signal === "LONG" ? "default" : result.signal === "SHORT" ? "destructive" : "secondary"}>
              {result.signal}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Signal Strength */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    <span className="text-sm font-medium">Signal Styrke</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {indicators.conditionsMet || 0}/{config.signal_conditions_required || 5}
                  </span>
                </div>
                <Progress value={getSignalStrength()} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* RSI */}
          {config.rsi_enabled && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-sm font-medium">RSI</span>
                    </div>
                    <span className={`text-sm font-bold ${
                      result.signal === "LONG" && indicators.rsi < config.rsi_min_long
                        ? "text-green-500"
                        : result.signal === "SHORT" && indicators.rsi > config.rsi_max_short
                        ? "text-red-500"
                        : "text-muted-foreground"
                    }`}>
                      {indicators.rsi?.toFixed(2) || "N/A"}
                    </span>
                  </div>
                  <Progress value={getRSIProgress()} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Oversolgt: {config.rsi_min_long}</span>
                    <span>Overkøbt: {config.rsi_max_short}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* StochRSI */}
          {config.stochrsi_enabled && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-medium">StochRSI</span>
                    </div>
                    <span className={`text-sm font-bold ${
                      result.signal === "LONG" && indicators.stochK < config.stochrsi_oversold
                        ? "text-green-500"
                        : result.signal === "SHORT" && indicators.stochK > config.stochrsi_overbought
                        ? "text-red-500"
                        : "text-muted-foreground"
                    }`}>
                      K: {indicators.stochK?.toFixed(2) || "N/A"}
                    </span>
                  </div>
                  <Progress value={getStochRSIProgress()} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Oversolgt: {config.stochrsi_oversold}</span>
                    <span>Overkøbt: {config.stochrsi_overbought}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Volume */}
          {config.volume_enabled && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Volume</span>
                    </div>
                    <span className={`text-sm font-bold ${
                      indicators.volume >= (indicators.volumeAvg * config.volume_multiplier)
                        ? "text-green-500"
                        : "text-red-500"
                    }`}>
                      {((indicators.volume / indicators.volumeAvg) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={getVolumeProgress()} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Krævet: {config.volume_multiplier}x</span>
                    <span>Nuværende: {(indicators.volume / indicators.volumeAvg).toFixed(2)}x</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ADX */}
          {config.adx_enabled && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      <span className="text-sm font-medium">ADX (Trend Styrke)</span>
                    </div>
                    <span className={`text-sm font-bold ${
                      indicators.adx >= config.adx_threshold
                        ? "text-green-500"
                        : "text-red-500"
                    }`}>
                      {indicators.adx?.toFixed(2) || "N/A"}
                    </span>
                  </div>
                  <Progress value={getADXProgress()} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Minimum: {config.adx_threshold}</span>
                    <span>Stærk trend: 40+</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* EMA Trend */}
          {config.ema_enabled && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm font-medium">EMA Alignment</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="space-y-1">
                      <span className="text-muted-foreground">EMA {config.ema_fast}</span>
                      <div className="font-mono font-bold">{indicators.emaFast?.toFixed(2)}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">EMA {config.ema_medium}</span>
                      <div className="font-mono font-bold">{indicators.emaMedium?.toFixed(2)}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">EMA {config.ema_slow}</span>
                      <div className="font-mono font-bold">{indicators.emaSlow?.toFixed(2)}</div>
                    </div>
                  </div>
                  {result.signal === "LONG" && (
                    <div className="text-xs text-muted-foreground">
                      ✓ Bullish når: Fast &gt; Medium &gt; Slow
                    </div>
                  )}
                  {result.signal === "SHORT" && (
                    <div className="text-xs text-muted-foreground">
                      ✓ Bearish når: Fast &lt; Medium &lt; Slow
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* MACD */}
          {config.macd_enabled && indicators.macd && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-medium">MACD Histogram</span>
                    </div>
                    <span className={`text-sm font-bold ${
                      result.signal === "LONG" && indicators.macdHistogram > config.macd_histogram_threshold
                        ? "text-green-500"
                        : result.signal === "SHORT" && indicators.macdHistogram < -config.macd_histogram_threshold
                        ? "text-red-500"
                        : "text-muted-foreground"
                    }`}>
                      {indicators.macdHistogram?.toFixed(4) || "N/A"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    MACD: {indicators.macd?.toFixed(4)} | Signal: {indicators.macdSignal?.toFixed(4)}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
