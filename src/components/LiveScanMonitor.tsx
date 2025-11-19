import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useBinanceFuturesPrices } from "@/hooks/useBinanceFuturesPrices";

interface LiveScanMonitorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CoinSignalStrength {
  symbol: string;
  signal: string;
  strength: number; // 0-100, where 100 = all conditions met
  indicators: any;
  conditionsMet: number;
  conditionsRequired: number;
  lastUpdate: string;
  allHardFiltersPassed: boolean;
  hardFiltersCount: {
    passed: number;
    total: number;
  };
  trendBlocking: boolean;
}

export const LiveScanMonitor = ({ open, onOpenChange }: LiveScanMonitorProps) => {
  const [coins, setCoins] = useState<Map<string, CoinSignalStrength>>(new Map());
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    if (!open) return;

    // Start continuous scanner (3s interval) when monitor opens; stop on close
    supabase.functions.invoke('continuous-scan-quant', {
      body: { action: 'start', interval_ms: 3000 },
    }).catch(console.error);

    const initMonitor = async () => {
      // CRITICAL: Load config FIRST before fetching scans
      await fetchConfig();
      // Small delay to ensure config is set in state
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchInitialScans();
    };

    initMonitor();

    // Real-time subscription - samme setup som ScanResults
    const channel = supabase
      .channel("live-scan-monitor-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scan_results",
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const newResult = payload.new as any;
            updateCoinStrength(newResult);
          }
        }
      )
      .subscribe();

    // Poll også hvert 2. sekund for at matche hovedscanneren's tempo
    const interval = setInterval(() => {
      fetchInitialScans();
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      // Stop continuous scanner when monitor closes
      supabase.functions.invoke('continuous-scan-quant', { body: { action: 'stop' } }).catch(console.error);
    };
  }, [open, config]);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("indicator_config")
        .select("*")
        .eq("enabled", true)
        .maybeSingle();
      
      if (error) throw error;
      console.log("Live Monitor - Config loaded:", data?.signal_conditions_required);
      setConfig(data);
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  };

  const fetchInitialScans = async () => {
    try {
      console.log("Live Monitor - Fetching initial scans");
      const { data, error } = await supabase
        .from("scan_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200); // Øget limit for at få flere coins

      if (error) throw error;

      console.log(`Live Monitor - Fetched ${data?.length || 0} scan results`);

      // Keep only latest for each symbol
      const latestBySymbol = new Map<string, any>();
      (data || []).forEach((row) => {
        if (!latestBySymbol.has(row.symbol)) {
          latestBySymbol.set(row.symbol, row);
        }
      });

      console.log(`Live Monitor - Processing ${latestBySymbol.size} unique symbols`);

      latestBySymbol.forEach((result) => {
        updateCoinStrength(result);
      });
    } catch (error) {
      console.error("Error fetching scans:", error);
    }
  };

  const updateCoinStrength = (result: any) => {
    if (!result.indicators) {
      console.log(`No indicators for ${result.symbol}`);
      return;
    }

    // CRITICAL: Don't update if config not loaded yet - prevents false positives
    if (!config) {
      console.log(`Config not loaded yet for ${result.symbol}, skipping update`);
      return;
    }

    const indicators = result.indicators;
    const conditionsMet = indicators.conditionsMet || 0;
    const conditionsRequired = config.signal_conditions_required || 5;
    const strength = (conditionsMet / conditionsRequired) * 100;

    // Initialize HÅRDE FILTRE to false by default - must prove they pass
    const hardFilters = {
      emaSpread: !config.ema_enabled, // If disabled, it passes by default
      atr: !config.atr_enabled,
      candleMomentum: !config.candle_momentum_enabled,
      adx: !config.adx_enabled,
      volume: !config.volume_enabled,
      rsiMomentum: !config.rsi_enabled,
    };

    // Check each enabled filter
    // EMA Spread Check
    if (config.ema_enabled && indicators.emaSpreadPercent !== undefined) {
      hardFilters.emaSpread = indicators.emaSpreadPercent >= config.min_ema_spread_percent;
    }
    
    // ATR Check
    if (config.atr_enabled && indicators.atr !== null && indicators.atr !== undefined) {
      hardFilters.atr = indicators.atr > 0 && (config.min_atr === 0 || indicators.atr >= config.min_atr);
    }
    
    // Candle Momentum Check
    if (config.candle_momentum_enabled) {
      // Assume passed if data not available - edge function will do actual check
      hardFilters.candleMomentum = true;
    }
    
    // ADX Check
    if (config.adx_enabled && indicators.adx !== null && indicators.adx !== undefined) {
      hardFilters.adx = indicators.adx >= config.adx_threshold;
    }
    
    // Volume Check
    if (config.volume_enabled && indicators.volumeRatio !== null && indicators.volumeRatio !== undefined) {
      hardFilters.volume = indicators.volumeRatio >= config.volume_multiplier;
    }
    
    // RSI Momentum Check
    if (config.rsi_enabled) {
      // Assume passed if data not available - edge function will do actual check
      hardFilters.rsiMomentum = true;
    }

    // Count how many hard filters are actually enabled in config
    const enabledHardFiltersCount = [
      config?.ema_enabled,
      config?.atr_enabled,
      config?.candle_momentum_enabled,
      config?.adx_enabled,
      config?.volume_enabled,
      config?.rsi_enabled,
    ].filter(Boolean).length;

    // Count how many of the ENABLED filters actually passed
    const passedHardFiltersCount = [
      config?.ema_enabled && hardFilters.emaSpread,
      config?.atr_enabled && hardFilters.atr,
      config?.candle_momentum_enabled && hardFilters.candleMomentum,
      config?.adx_enabled && hardFilters.adx,
      config?.volume_enabled && hardFilters.volume,
      config?.rsi_enabled && hardFilters.rsiMomentum,
    ].filter(Boolean).length;

    const allHardFiltersPassed = passedHardFiltersCount === enabledHardFiltersCount;
    
    // Check trend filter (blocks trades if wrong direction)
    const trend = indicators.trend || 'NEUTRAL';
    const trendBlocking = (result.signal === 'LONG' && trend !== 'BULLISH') || 
                          (result.signal === 'SHORT' && trend !== 'BEARISH');

    console.log(`Updating ${result.symbol}: strength=${strength.toFixed(1)}%, conditions=${conditionsMet}/${conditionsRequired}, hardFilters=${passedHardFiltersCount}/${enabledHardFiltersCount}, trend=${trend}, trendBlocking=${trendBlocking}`);

    setCoins((prev) => {
      const newMap = new Map(prev);
      newMap.set(result.symbol, {
        symbol: result.symbol,
        signal: result.signal,
        strength,
        indicators,
        conditionsMet,
        conditionsRequired,
        lastUpdate: result.created_at,
        allHardFiltersPassed,
        hardFiltersCount: {
          passed: passedHardFiltersCount,
          total: enabledHardFiltersCount,
        },
        trendBlocking,
      });
      return newMap;
    });
  };

  const getBackgroundColor = (strength: number) => {
    // Grønnere jo tættere på signal (80%+)
    if (strength >= 80) {
      return "bg-green-500/30";
    }
    // Mellem niveau (60-79%)
    if (strength >= 60) {
      return "bg-green-500/20";
    }
    // Lav niveau (40-59%)
    if (strength >= 40) {
      return "bg-yellow-500/20";
    }
    // Meget lav (20-39%)
    if (strength >= 20) {
      return "bg-orange-500/20";
    }
    // Rødt/svagt signal (under 20%)
    return "bg-red-500/20";
  };

  const getBorderColor = (strength: number) => {
    if (strength >= 80) return "border-green-500";
    if (strength >= 60) return "border-green-400";
    if (strength >= 40) return "border-yellow-500";
    if (strength >= 20) return "border-orange-500";
    return "border-red-500";
  };

  const getTextColor = (strength: number) => {
    if (strength >= 80) return "text-green-500";
    if (strength >= 60) return "text-green-400";
    if (strength >= 40) return "text-yellow-500";
    if (strength >= 20) return "text-orange-500";
    return "text-red-500";
  };

  const getStrengthBarColor = (strength: number) => {
    if (strength >= 80) return "bg-green-500";
    if (strength >= 60) return "bg-green-400";
    if (strength >= 40) return "bg-yellow-500";
    if (strength >= 20) return "bg-orange-500";
    return "bg-red-500";
  };

  const sortedCoins = Array.from(coins.values()).sort((a, b) => b.strength - a.strength);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live Scan Monitor
            <Badge variant="outline" className="ml-2">
              {coins.size} Coins
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 overflow-y-auto pr-2">
          {sortedCoins.map((coin) => (
            <Card
              key={coin.symbol}
              className={`p-3 border-2 transition-all duration-500 hover:scale-105 ${getBackgroundColor(
                coin.strength
              )} ${getBorderColor(coin.strength)}`}
            >
              <div className="space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between gap-1">
                  <div className="font-bold text-sm truncate flex-1 min-w-0">
                    {coin.symbol}
                  </div>
                  {coin.indicators.trend === "BULLISH" ? (
                    <TrendingUp className="h-4 w-4 flex-shrink-0" />
                  ) : coin.indicators.trend === "BEARISH" ? (
                    <TrendingDown className="h-4 w-4 flex-shrink-0" />
                  ) : null}
                </div>

                {/* Tidsstempel + Trend */}
                <div className="text-[10px] opacity-60 flex items-center justify-between">
                  <span>{new Date(coin.lastUpdate).toLocaleTimeString("da-DK", { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    second: '2-digit'
                  })}</span>
                  {coin.signal === 'NONE' && coin.strength >= 80 && (
                    <Badge variant="outline" className="h-3 px-1 text-[8px] border-muted">
                      {coin.indicators.trend || 'NEUTRAL'}
                    </Badge>
                  )}
                </div>

                {/* Signal Strength Progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="opacity-70">Signal Styrke</span>
                    <span className={`font-bold ${getTextColor(coin.strength)}`}>
                      {coin.strength.toFixed(0)}%
                    </span>
                  </div>
                  
                  {/* Main Progress Bar */}
                  <div className="relative">
                    <Progress 
                      value={coin.strength} 
                      className={`h-3 transition-all duration-700 ease-out ${
                        coin.strength >= 100 ? 'animate-pulse' : ''
                      }`}
                    />
                    {coin.strength >= 100 && (
                      <div className="absolute inset-0 bg-primary/20 animate-pulse rounded-full" />
                    )}
                  </div>
                  
                  {/* Conditions Met Display */}
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="opacity-70">Bløde regler:</span>
                      <span className="font-bold">{coin.conditionsMet}/{coin.conditionsRequired}</span>
                    </div>
                  {coin.strength >= 100 && coin.allHardFiltersPassed && coin.signal !== 'NONE' && (
                      <Badge variant="default" className="h-4 px-1.5 text-[9px] animate-fade-in">
                        ✓ KLAR
                      </Badge>
                    )}
                    {coin.strength >= 100 && !coin.allHardFiltersPassed && (
                      <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
                        ✗ HÅRDE FILTRE
                      </Badge>
                    )}
                    {coin.strength >= 100 && coin.allHardFiltersPassed && coin.signal === 'NONE' && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-orange-500 text-orange-500">
                        ⚠ TREND
                      </Badge>
                    )}
                  </div>
                  
                  {/* Hard Filters Progress Bar */}
                  <div className="space-y-1 mt-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="opacity-70">Hårde filtre:</span>
                      <span className="font-bold">
                        {coin.hardFiltersCount.passed}/{coin.hardFiltersCount.total}
                      </span>
                    </div>
                    <Progress 
                      value={coin.hardFiltersCount.total > 0 ? (coin.hardFiltersCount.passed / coin.hardFiltersCount.total) * 100 : 0} 
                      className="h-2"
                    />
                  </div>
                  
                  {/* Trend Blocking Warning */}
                  {coin.trendBlocking && coin.allHardFiltersPassed && (
                    <div className="mt-2 p-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded text-[9px]">
                      <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                        <Activity className="h-3 w-3" />
                        <span className="font-medium">Trend blokerer</span>
                      </div>
                      <div className="opacity-70 mt-0.5">
                        Markedet er {coin.indicators.trend}, men kun {coin.signal === 'LONG' ? 'LONG' : 'SHORT'} er aktiveret
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Indicators - vises altid */}
                <div className="space-y-1 text-xs border-t border-border/50 pt-2">
                  <div className="flex justify-between">
                    <span className="opacity-70">Pris:</span>
                    <span className="font-mono font-bold transition-all duration-500">
                      ${coin.indicators.price?.toFixed(coin.indicators.price < 1 ? 4 : 2) || 'N/A'}
                    </span>
                  </div>
                  
                  {coin.indicators.rsi !== null && coin.indicators.rsi !== undefined && (
                    <div className="flex justify-between">
                      <span className="opacity-70">RSI:</span>
                      <span className="font-mono font-bold transition-all duration-500">
                        {coin.indicators.rsi.toFixed(1)}
                      </span>
                    </div>
                  )}
                  
                  {coin.indicators.adx !== null && coin.indicators.adx !== undefined && (
                    <div className="flex justify-between">
                      <span className="opacity-70">ADX:</span>
                      <span className="font-mono font-bold transition-all duration-500">
                        {coin.indicators.adx.toFixed(1)}
                      </span>
                    </div>
                  )}
                  
                  {coin.indicators.volumeRatio !== undefined && coin.indicators.volumeRatio !== null && (
                    <div className="flex justify-between">
                      <span className="opacity-70">Vol:</span>
                      <span className="font-mono font-bold transition-all duration-500">
                        {(coin.indicators.volumeRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  
                  {coin.indicators.stochRSI_k !== null && coin.indicators.stochRSI_k !== undefined && (
                    <div className="flex justify-between">
                      <span className="opacity-70">StochK:</span>
                      <span className="font-mono font-bold transition-all duration-500">
                        {coin.indicators.stochRSI_k.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Signal Badge */}
                {coin.signal !== "NONE" && (
                  <Badge
                    variant={coin.signal === "LONG" ? "default" : "destructive"}
                    className="w-full justify-center text-xs"
                  >
                    {coin.signal}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>

        {sortedCoins.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Ingen scan data endnu. Vent på næste scan...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
