import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useBinanceFuturesPrices } from "@/hooks/useBinanceFuturesPrices";
import { CircularProgress } from "./CircularProgress";

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
  trend: string;
  hardFilters: Record<string, boolean>;
  hardFiltersProgress: Record<string, number>; // 0-100 percentage for each filter
  allHardFiltersPassed: boolean;
  totalEnabledFilters: number;
  softConditions: Record<string, boolean>; // Hvilke bløde conditions er opfyldt
  totalEnabledSoftConditions: number;
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
      await fetchConfig();
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

    const indicators = result.indicators;
    const conditionsMet = indicators.conditionsMet || 0;
    const conditionsRequired = Math.max(config?.signal_conditions_required || 5, conditionsMet);
    const strength = Math.min((conditionsMet / conditionsRequired) * 100, 100);

    // Check HÅRDE FILTRE - kun inkluder dem der er enabled
    const hardFilters: Record<string, boolean> = {};
    const hardFiltersProgress: Record<string, number> = {};
    const enabledFilters: string[] = [];
    
    // Check BLØDE CONDITIONS fra conditionDetails
    const softConditions: Record<string, boolean> = {};
    const conditionDetails = indicators.conditionDetails || {};
    const trend = result.signal === 'LONG' ? 'long' : result.signal === 'SHORT' ? 'short' : null;

    if (config) {
      // EMA Spread Check
      if (config.ema_enabled) {
        enabledFilters.push('emaSpread');
        if (indicators.emaSpreadPercent !== undefined) {
          const minSpread = config.min_ema_spread_percent;
          hardFiltersProgress.emaSpread = Math.min((indicators.emaSpreadPercent / minSpread) * 100, 100);
          hardFilters.emaSpread = indicators.emaSpreadPercent >= minSpread;
        } else {
          hardFiltersProgress.emaSpread = 0;
          hardFilters.emaSpread = false;
        }
      }
      
      // ATR Check (inkl. Minimum ATR)
      if (config.atr_enabled) {
        enabledFilters.push('atr');
        if (indicators.atr !== null && indicators.atr !== undefined) {
          const minATR = config.min_atr || 0.0001;
          hardFiltersProgress.atr = Math.min((indicators.atr / minATR) * 100, 100);
          hardFilters.atr = indicators.atr > 0 && indicators.atr >= (config.min_atr || 0);
        } else {
          hardFiltersProgress.atr = 0;
          hardFilters.atr = false;
        }
      }
      
      // ADX Check
      if (config.adx_enabled) {
        enabledFilters.push('adx');
        if (indicators.adx !== null && indicators.adx !== undefined) {
          hardFiltersProgress.adx = Math.min((indicators.adx / config.adx_threshold) * 100, 100);
          hardFilters.adx = indicators.adx >= config.adx_threshold;
        } else {
          hardFiltersProgress.adx = 0;
          hardFilters.adx = false;
        }
      }
      
      // Volume Check
      if (config.volume_enabled) {
        enabledFilters.push('volume');
        if (indicators.volumeRatio !== null && indicators.volumeRatio !== undefined) {
          hardFiltersProgress.volume = Math.min((indicators.volumeRatio / config.volume_multiplier) * 100, 100);
          hardFilters.volume = indicators.volumeRatio >= config.volume_multiplier;
        } else {
          hardFiltersProgress.volume = 0;
          hardFilters.volume = false;
        }
      }
      
      // RSI Momentum Check (zone + momentum)
      if (config.rsi_enabled) {
        enabledFilters.push('rsiMomentum');
        if (indicators.rsi !== null && indicators.rsi !== undefined) {
          const rsiZoneWidth = config.rsi_zone_width || 10;
          const rsiInLongZone = indicators.rsi >= config.rsi_min_long && indicators.rsi <= (config.rsi_min_long + rsiZoneWidth);
          const rsiInShortZone = indicators.rsi <= config.rsi_max_short && indicators.rsi >= (config.rsi_max_short - rsiZoneWidth);
          
          // Calculate progress: how close is RSI to entering a zone?
          const distanceToLongZone = Math.max(0, config.rsi_min_long - indicators.rsi);
          const distanceToShortZone = Math.max(0, indicators.rsi - config.rsi_max_short);
          const minDistance = Math.min(distanceToLongZone, distanceToShortZone);
          
          // If in zone, 100%. Otherwise, calculate based on distance
          if (rsiInLongZone || rsiInShortZone) {
            hardFiltersProgress.rsiMomentum = 100;
          } else {
            // Assume max distance of 50 points for scaling
            hardFiltersProgress.rsiMomentum = Math.max(0, 100 - (minDistance * 2));
          }
          
          hardFilters.rsiMomentum = rsiInLongZone || rsiInShortZone;
        } else {
          hardFiltersProgress.rsiMomentum = 0;
          hardFilters.rsiMomentum = false;
        }
      }
    }

    const totalEnabledFilters = enabledFilters.length;
    const allHardFiltersPassed = Object.values(hardFilters).every(v => v);
    
    // Parse soft conditions fra conditionDetails
    let totalEnabledSoftConditions = 0;
    
    if (conditionDetails.ema?.enabled) {
      totalEnabledSoftConditions++;
      softConditions.ema = trend ? conditionDetails.ema[trend] === true : false;
    }
    if (conditionDetails.rsi?.enabled) {
      totalEnabledSoftConditions++;
      softConditions.rsi = trend ? conditionDetails.rsi[trend] === true : false;
    }
    if (conditionDetails.stochRSI?.enabled) {
      totalEnabledSoftConditions++;
      softConditions.stochRSI = trend ? conditionDetails.stochRSI[trend] === true : false;
    }
    if (conditionDetails.macd?.enabled) {
      totalEnabledSoftConditions++;
      softConditions.macd = trend ? conditionDetails.macd[trend] === true : false;
    }
    if (conditionDetails.bb?.enabled) {
      totalEnabledSoftConditions++;
      softConditions.bb = trend ? conditionDetails.bb[trend] === true : false;
    }
    if (conditionDetails.pivotPoints?.enabled) {
      totalEnabledSoftConditions++;
      softConditions.pivotPoints = trend ? conditionDetails.pivotPoints[trend] === true : false;
    }

    console.log(`Updating ${result.symbol}: strength=${strength.toFixed(1)}%, conditions=${conditionsMet}/${conditionsRequired}, hardFilters=${JSON.stringify(hardFilters)}`);

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
        trend: indicators.trend || "UNKNOWN",
        hardFilters,
        hardFiltersProgress,
        allHardFiltersPassed,
        totalEnabledFilters,
        softConditions,
        totalEnabledSoftConditions,
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
                  {coin.trend === "BULLISH" ? (
                    <TrendingUp className="h-4 w-4 flex-shrink-0" />
                  ) : coin.trend === "BEARISH" ? (
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
                      {coin.trend}
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
                  
                  {/* Soft Conditions Details */}
                  {coin.totalEnabledSoftConditions > 0 && (
                    <div className="text-[9px] space-y-1 mt-1.5 border-t border-border/30 pt-1.5">
                      <div className="opacity-70 font-semibold mb-1">Bløde conditions:</div>
                      {coin.softConditions.ema !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${coin.softConditions.ema ? 'bg-green-500' : 'bg-muted'}`} />
                          <span className={coin.softConditions.ema ? 'text-green-500' : 'opacity-50'}>
                            EMA Alignment
                          </span>
                        </div>
                      )}
                      {coin.softConditions.rsi !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${coin.softConditions.rsi ? 'bg-green-500' : 'bg-muted'}`} />
                          <span className={coin.softConditions.rsi ? 'text-green-500' : 'opacity-50'}>
                            RSI Zone
                          </span>
                        </div>
                      )}
                      {coin.softConditions.stochRSI !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${coin.softConditions.stochRSI ? 'bg-green-500' : 'bg-muted'}`} />
                          <span className={coin.softConditions.stochRSI ? 'text-green-500' : 'opacity-50'}>
                            StochRSI Zone
                          </span>
                        </div>
                      )}
                      {coin.softConditions.macd !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${coin.softConditions.macd ? 'bg-green-500' : 'bg-muted'}`} />
                          <span className={coin.softConditions.macd ? 'text-green-500' : 'opacity-50'}>
                            MACD Histogram
                          </span>
                        </div>
                      )}
                      {coin.softConditions.bb !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${coin.softConditions.bb ? 'bg-green-500' : 'bg-muted'}`} />
                          <span className={coin.softConditions.bb ? 'text-green-500' : 'opacity-50'}>
                            Bollinger Bands
                          </span>
                        </div>
                      )}
                      {coin.softConditions.pivotPoints !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${coin.softConditions.pivotPoints ? 'bg-green-500' : 'bg-muted'}`} />
                          <span className={coin.softConditions.pivotPoints ? 'text-green-500' : 'opacity-50'}>
                            Pivot Points
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Hard Filters Progress Bar */}
                  {coin.totalEnabledFilters > 0 && (
                    <div className="space-y-1 mt-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="opacity-70">Hårde filtre:</span>
                        <span className="font-bold">
                          {Object.values(coin.hardFilters).filter(v => v).length}/{coin.totalEnabledFilters}
                        </span>
                      </div>
                      <Progress 
                        value={(Object.values(coin.hardFilters).filter(v => v).length / coin.totalEnabledFilters) * 100} 
                        className="h-2"
                      />
                    </div>
                  )}
                  
                  {/* Hard Filters Details - always show if enabled */}
                  {coin.totalEnabledFilters > 0 && (
                    <div className="text-[9px] space-y-1 mt-1">
                      {coin.hardFilters.emaSpread !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <CircularProgress value={coin.hardFiltersProgress.emaSpread || 0} size={16} />
                          <span className={coin.hardFilters.emaSpread ? 'text-green-500' : 'opacity-70'}>
                            EMA Spread
                          </span>
                        </div>
                      )}
                      {coin.hardFilters.volume !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <CircularProgress value={coin.hardFiltersProgress.volume || 0} size={16} />
                          <span className={coin.hardFilters.volume ? 'text-green-500' : 'opacity-70'}>
                            Volume
                          </span>
                        </div>
                      )}
                      {coin.hardFilters.adx !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <CircularProgress value={coin.hardFiltersProgress.adx || 0} size={16} />
                          <span className={coin.hardFilters.adx ? 'text-green-500' : 'opacity-70'}>
                            ADX
                          </span>
                        </div>
                      )}
                      {coin.hardFilters.atr !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <CircularProgress value={coin.hardFiltersProgress.atr || 0} size={16} />
                          <span className={coin.hardFilters.atr ? 'text-green-500' : 'opacity-70'}>
                            ATR
                          </span>
                        </div>
                      )}
                      {coin.hardFilters.rsiMomentum !== undefined && (
                        <div className="flex items-center gap-1.5">
                          <CircularProgress value={coin.hardFiltersProgress.rsiMomentum || 0} size={16} />
                          <span className={coin.hardFilters.rsiMomentum ? 'text-green-500' : 'opacity-70'}>
                            RSI Momentum
                          </span>
                        </div>
                      )}
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
