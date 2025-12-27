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
  filterModeSettings: Record<string, boolean>; // Om hvert filter er hard (true) eller soft (false)
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
    const conditionsRequired = config?.signal_conditions_required || 2;
    
    // 🔍 DIAGNOSTIC: Log MACD and Higher Trend keys for N/A debugging
    console.log(`📊 [${result.symbol}] MACD keys:`, {
      macdLine: indicators.macdLine,
      macdSignalLine: indicators.macdSignalLine,
      macdSignal: indicators.macdSignal,
      macd_line: indicators.macd_line,
      macd_signal_line: indicators.macd_signal_line,
    });
    console.log(`📊 [${result.symbol}] Higher Trend keys:`, {
      higherTrend: indicators.higherTrend,
      trend_higher: indicators.trend_higher,
      trend: indicators.trend,
    });
    // conditionsMet will be calculated based on trend-specific conditions below

    // Check HÅRDE FILTRE - kun inkluder dem der er enabled
    const hardFilters: Record<string, boolean> = {};
    const hardFiltersProgress: Record<string, number> = {};
    const enabledFilters: string[] = [];
    
    // Check BLØDE CONDITIONS fra conditionDetails
    const softConditions: Record<string, boolean> = {};
    const conditionDetails = indicators.conditionDetails || {};
    
    // Brug DIREKTE longConditionsMet/shortConditionsMet fra DB i stedet for at parse én efter én
    const longConditionsMet = conditionDetails.longConditionsMet || 0;
    const shortConditionsMet = conditionDetails.shortConditionsMet || 0;
    
    // Bestem trend baseret på hvilken retning har flest betingelser opfyldt
    const trend = longConditionsMet > shortConditionsMet ? 'long' : 
                  shortConditionsMet > longConditionsMet ? 'short' : 
                  result.signal === 'LONG' ? 'long' :
                  result.signal === 'SHORT' ? 'short' : 
                  null;

    if (config) {
      // EMA Spread Check
      if (config.ema_enabled) {
        enabledFilters.push('emaSpread');
        if (indicators.emaSpreadPercent !== undefined) {
          // Use filterStatus if available
          if (indicators.filterStatus?.hard?.emaSpread) {
            hardFilters.emaSpread = indicators.filterStatus.hard.emaSpread.passed;
            hardFiltersProgress.emaSpread = hardFilters.emaSpread ? 100 : Math.min((indicators.emaSpreadPercent / config.min_ema_spread_percent) * 100, 99);
          } else {
            // Fallback to local calculation
            const minSpread = config.min_ema_spread_percent;
            hardFiltersProgress.emaSpread = Math.min((indicators.emaSpreadPercent / minSpread) * 100, 100);
            hardFilters.emaSpread = indicators.emaSpreadPercent >= minSpread;
          }
        } else {
          hardFiltersProgress.emaSpread = 0;
          hardFilters.emaSpread = false;
        }
      }
      
      // ATR Check
      if (config.atr_enabled) {
        enabledFilters.push('atr');
        if (indicators.atr !== null && indicators.atr !== undefined && indicators.price) {
          // Use filterStatus if available
          if (indicators.filterStatus?.hard?.atr) {
            hardFilters.atr = indicators.filterStatus.hard.atr.passed;
            if (hardFilters.atr) {
              hardFiltersProgress.atr = 100;
            } else {
              const atrPercent = (indicators.atr / indicators.price) * 100;
              hardFiltersProgress.atr = Math.min((atrPercent / config.min_atr_percent) * 100, 99);
            }
          } else {
            // Fallback to local calculation
            let atrPassed = true;
            
            if (indicators.atr === 0) atrPassed = false;
            // NOTE: Raw min_atr check er FJERNET - kun ATR% bruges nu
            
            if (config.min_atr_percent > 0) {
              const atrPercent = (indicators.atr / indicators.price) * 100;
              hardFiltersProgress.atr = Math.min((atrPercent / config.min_atr_percent) * 100, 100);
              if (atrPercent < config.min_atr_percent) atrPassed = false;
            } else {
              // Fallback: vis progress baseret på ATR%
              const atrPercent = (indicators.atr / indicators.price) * 100;
              hardFiltersProgress.atr = Math.min(atrPercent * 100, 100);
            }
            
            hardFilters.atr = atrPassed;
          }
        } else {
          hardFiltersProgress.atr = 0;
          hardFilters.atr = false;
        }
      }
      
      // ADX Check
      if (config.adx_enabled) {
        enabledFilters.push('adx');
        if (indicators.adx !== null && indicators.adx !== undefined) {
          if (indicators.filterStatus?.hard?.adx) {
            hardFilters.adx = indicators.filterStatus.hard.adx.passed;
            hardFiltersProgress.adx = hardFilters.adx ? 100 : Math.min((indicators.adx / config.adx_threshold) * 100, 99);
          } else {
            hardFiltersProgress.adx = Math.min((indicators.adx / config.adx_threshold) * 100, 100);
            hardFilters.adx = indicators.adx >= config.adx_threshold;
          }
        } else {
          hardFiltersProgress.adx = 0;
          hardFilters.adx = false;
        }
      }
      
      // Volume Check
      if (config.volume_enabled) {
        enabledFilters.push('volume');
        if (indicators.volumeRatio !== null && indicators.volumeRatio !== undefined) {
          // Check if filterStatus is available (from edge function)
          if (indicators.filterStatus?.hard?.volume && indicators.filterStatus.hard.volume.passed !== undefined) {
            // Use edge function's evaluation - ONLY true if passed === true (not null or false)
            hardFilters.volume = indicators.filterStatus.hard.volume.passed === true;
            const progressRatio = Math.min((indicators.volumeRatio / config.volume_multiplier) * 100, 100);
            hardFiltersProgress.volume = hardFilters.volume ? 100 : Math.min(progressRatio, 99);
          } else {
            // Fallback to local calculation
            hardFilters.volume = indicators.volumeRatio >= config.volume_multiplier;
            const progressRatio = Math.min((indicators.volumeRatio / config.volume_multiplier) * 100, 100);
            hardFiltersProgress.volume = hardFilters.volume ? 100 : Math.min(progressRatio, 99);
          }
        } else {
          hardFiltersProgress.volume = 0;
          hardFilters.volume = false;
        }
      }
      
      // MACD Direction Check - Retningsspecifik baseret på trend
      if (config.macd_direction_enabled && config.macd_enabled) {
        enabledFilters.push('macdDirection');
        const macdLine = indicators.macdLine;
        const macdSignalLine = indicators.macdSignalLine;
        
        // Support both field names: macdSignalLine (new) and macdSignal (deprecated)
        const effectiveSignalLine = macdSignalLine ?? indicators.macdSignal;
        
        if (macdLine !== null && macdLine !== undefined && effectiveSignalLine !== null && effectiveSignalLine !== undefined) {
          // MACD Direction filteret er RETNINGSSPECIFIKT:
          // - For LONG: macdLine > signalLine
          // - For SHORT: macdLine < signalLine
          const macdLongOK = macdLine > effectiveSignalLine;
          const macdShortOK = macdLine < effectiveSignalLine;
          
          // Check mod trend retning
          if (trend === 'long') {
            hardFilters.macdDirection = macdLongOK;
          } else if (trend === 'short') {
            hardFilters.macdDirection = macdShortOK;
          } else {
            // Ingen trend - check om nogen af dem er OK
            hardFilters.macdDirection = macdLongOK || macdShortOK;
          }
          
          const diff = Math.abs(macdLine - effectiveSignalLine);
          hardFiltersProgress.macdDirection = hardFilters.macdDirection ? 100 : Math.min(diff * 500, 99);
        } else {
          hardFiltersProgress.macdDirection = 0;
          hardFilters.macdDirection = false;
        }
      }
      
      // MACD Color Change Check
      if (config.macd_color_change_hard_filter && config.macd_enabled) {
        enabledFilters.push('macdColorChange');
        // Check if filterStatus is available from edge function
        if (indicators.filterStatus?.hard?.macdColorChange) {
          hardFilters.macdColorChange = indicators.filterStatus.hard.macdColorChange.passed;
          hardFiltersProgress.macdColorChange = hardFilters.macdColorChange ? 100 : 0;
        } else {
          // Fallback - check histogram color shift from previous to current
          const prevHistogram = indicators.macdHistogramPrev;
          const curHistogram = indicators.macdHistogram;
          
          if (prevHistogram !== undefined && curHistogram !== undefined) {
            const shiftedRedToGreen = prevHistogram <= 0 && curHistogram > 0;
            const shiftedGreenToRed = prevHistogram >= 0 && curHistogram < 0;
            hardFilters.macdColorChange = shiftedRedToGreen || shiftedGreenToRed;
            hardFiltersProgress.macdColorChange = hardFilters.macdColorChange ? 100 : 0;
          } else {
            hardFilters.macdColorChange = false;
            hardFiltersProgress.macdColorChange = 0;
          }
        }
      }
      
      // Higher Trend Check (KRITISK HARD FILTER)
      if (config.higher_trend_enabled) {
        enabledFilters.push('higherTrend');
        const higherTrend = indicators.higherTrend || indicators.trend_higher;
        
        if (higherTrend && trend) {
          // Higher trend skal matche signal retning
          const trendMatches = (trend === 'long' && higherTrend === 'BULLISH') || 
                              (trend === 'short' && higherTrend === 'BEARISH');
          hardFilters.higherTrend = trendMatches;
          hardFiltersProgress.higherTrend = trendMatches ? 100 : 0;
        } else if (higherTrend) {
          // Ingen trend endnu - vis bare om higher trend er aktiv
          hardFilters.higherTrend = higherTrend !== 'NEUTRAL';
          hardFiltersProgress.higherTrend = higherTrend !== 'NEUTRAL' ? 50 : 0;
        } else {
          hardFilters.higherTrend = false;
          hardFiltersProgress.higherTrend = 0;
        }
      }
      
      // EMA Trend Hard Filter (hvis aktiveret som hårdt filter)
      if (config.ema_trend_hard_filter && config.ema_enabled) {
        enabledFilters.push('emaTrend');
        const emaAlignmentLong = indicators.filterStatus?.soft?.emaAlignment?.long;
        const emaAlignmentShort = indicators.filterStatus?.soft?.emaAlignment?.short;
        
        if (trend === 'long') {
          hardFilters.emaTrend = emaAlignmentLong === true;
        } else if (trend === 'short') {
          hardFilters.emaTrend = emaAlignmentShort === true;
        } else {
          hardFilters.emaTrend = emaAlignmentLong === true || emaAlignmentShort === true;
        }
        hardFiltersProgress.emaTrend = hardFilters.emaTrend ? 100 : 0;
      }
      
      // RSI Momentum Check (zone + momentum)
      if (config.rsi_enabled) {
        enabledFilters.push('rsiMomentum');
        if (indicators.rsi !== null && indicators.rsi !== undefined) {
          // Check if filterStatus is available
          if (indicators.filterStatus?.hard?.rsiMomentum) {
            hardFilters.rsiMomentum = indicators.filterStatus.hard.rsiMomentum.passed;
            
            if (hardFilters.rsiMomentum) {
              hardFiltersProgress.rsiMomentum = 100;
            } else {
              const rsiZoneWidth = config.rsi_zone_width || 10;
              const distanceToLongZone = Math.max(0, config.rsi_min_long - indicators.rsi);
              const distanceToShortZone = Math.max(0, indicators.rsi - config.rsi_max_short);
              const minDistance = Math.min(distanceToLongZone, distanceToShortZone);
              hardFiltersProgress.rsiMomentum = Math.max(0, 100 - (minDistance * 2));
            }
          } else {
            const rsiZoneWidth = config.rsi_zone_width || 10;
            const rsiInLongZone = indicators.rsi >= config.rsi_min_long && indicators.rsi <= (config.rsi_min_long + rsiZoneWidth);
            const rsiInShortZone = indicators.rsi <= config.rsi_max_short && indicators.rsi >= (config.rsi_max_short - rsiZoneWidth);
            
            const distanceToLongZone = Math.max(0, config.rsi_min_long - indicators.rsi);
            const distanceToShortZone = Math.max(0, indicators.rsi - config.rsi_max_short);
            const minDistance = Math.min(distanceToLongZone, distanceToShortZone);
            
            if (rsiInLongZone || rsiInShortZone) {
              hardFiltersProgress.rsiMomentum = 100;
            } else {
              hardFiltersProgress.rsiMomentum = Math.max(0, 100 - (minDistance * 2));
            }
            
            hardFilters.rsiMomentum = rsiInLongZone || rsiInShortZone;
          }
        } else {
          hardFiltersProgress.rsiMomentum = 0;
          hardFilters.rsiMomentum = false;
        }
      }
      
      // StochRSI Zone Check - 🔴 TILFØJET: Vises altid med HARD/SOFT badge
      if (config.stochrsi_enabled) {
        enabledFilters.push('stochRSI');
        const stochK = indicators.stochRSI_k;
        
        if (stochK !== null && stochK !== undefined) {
          // Check if filterStatus is available from edge function
          if (indicators.filterStatus?.hard?.stochrsi) {
            hardFilters.stochRSI = indicators.filterStatus.hard.stochrsi.passed;
            hardFiltersProgress.stochRSI = hardFilters.stochRSI ? 100 : 0;
          } else {
            // Fallback: check K value against thresholds
            const oversold = config.stochrsi_oversold || 20;
            const overbought = config.stochrsi_overbought || 80;
            
            const inLongZone = stochK <= oversold;
            const inShortZone = stochK >= overbought;
            
            if (trend === 'long') {
              hardFilters.stochRSI = inLongZone;
            } else if (trend === 'short') {
              hardFilters.stochRSI = inShortZone;
            } else {
              hardFilters.stochRSI = inLongZone || inShortZone;
            }
            
            // Progress: distance to zone
            const distanceToLongZone = Math.max(0, stochK - oversold);
            const distanceToShortZone = Math.max(0, overbought - stochK);
            const minDistance = Math.min(distanceToLongZone, distanceToShortZone);
            hardFiltersProgress.stochRSI = hardFilters.stochRSI ? 100 : Math.max(0, 100 - minDistance);
          }
        } else {
          hardFilters.stochRSI = false;
          hardFiltersProgress.stochRSI = 0;
        }
      }
    }

    const totalEnabledFilters = enabledFilters.length;
    const allHardFiltersPassed = Object.values(hardFilters).every(v => v);
    
    // Parse hvilke soft conditions der er enabled (til visning)
    let totalEnabledSoftConditions = 0;
    
    if (conditionDetails.ema?.enabled) {
      totalEnabledSoftConditions++;
      const isMetForTrend = trend ? conditionDetails.ema[trend] === true : false;
      softConditions.ema = isMetForTrend;
    }
    if (conditionDetails.rsi?.enabled) {
      totalEnabledSoftConditions++;
      const isMetForTrend = trend ? conditionDetails.rsi[trend] === true : false;
      softConditions.rsi = isMetForTrend;
    }
    // 🔴 StochRSI: Kun tæl som soft condition hvis det IKKE er hard filter
    const filterModeSettingsPreview: Record<string, boolean | undefined> = indicators.filter_mode_settings || {};
    if (conditionDetails.stochRSI?.enabled && !filterModeSettingsPreview.stochrsi_hard_filter) {
      totalEnabledSoftConditions++;
      const isMetForTrend = trend ? conditionDetails.stochRSI[trend] === true : false;
      softConditions.stochRSI = isMetForTrend;
    }
    if (conditionDetails.macd?.enabled) {
      totalEnabledSoftConditions++;
      const isMetForTrend = trend ? conditionDetails.macd[trend] === true : false;
      softConditions.macd = isMetForTrend;
    }
    if (conditionDetails.bb?.enabled) {
      totalEnabledSoftConditions++;
      const isMetForTrend = trend ? conditionDetails.bb[trend] === true : false;
      softConditions.bb = isMetForTrend;
    }
    if (conditionDetails.pivotPoints?.enabled) {
      totalEnabledSoftConditions++;
      const isMetForTrend = trend ? conditionDetails.pivotPoints[trend] === true : false;
      softConditions.pivotPoints = isMetForTrend;
    }
    if (conditionDetails.volume?.enabled) {
      totalEnabledSoftConditions++;
      const isMetForTrend = trend ? conditionDetails.volume[trend] === true : false;
      softConditions.volume = isMetForTrend;
    }

    // Brug trend-specifikke conditions direkte fra DB i stedet for at parse
    const actualConditionsMet = trend === 'long' ? longConditionsMet : 
                                trend === 'short' ? shortConditionsMet : 
                                Math.max(longConditionsMet, shortConditionsMet);
    const strength = Math.min((actualConditionsMet / conditionsRequired) * 100, 100);

    console.log(`Updating ${result.symbol}: strength=${strength.toFixed(1)}%, trend=${trend}, conditions=${actualConditionsMet}/${conditionsRequired} (long:${longConditionsMet}, short:${shortConditionsMet}), hardFilters=${JSON.stringify(hardFilters)}`);

    // Hent filter mode settings fra indicators - brug direkte fra snapshot, INGEN fallbacks
    const filterModeSettings: Record<string, boolean | undefined> = indicators.filter_mode_settings || {};

    setCoins((prev) => {
      const newMap = new Map(prev);
      newMap.set(result.symbol, {
        symbol: result.symbol,
        signal: result.signal,
        strength,
        indicators,
        conditionsMet: actualConditionsMet,
        conditionsRequired,
        lastUpdate: result.created_at,
        trend: indicators.trend || "UNKNOWN",
        hardFilters,
        hardFiltersProgress,
        allHardFiltersPassed,
        totalEnabledFilters,
        softConditions,
        totalEnabledSoftConditions,
        filterModeSettings,
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
                    second: '2-digit',
                    timeZone: 'UTC'
                  })} UTC</span>
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
                      {coin.softConditions.ema === true && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-green-500">
                            EMA Alignment
                          </span>
                        </div>
                      )}
                      {coin.softConditions.rsi === true && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-green-500">
                            RSI Zone
                          </span>
                        </div>
                      )}
                      {/* 🔴 StochRSI: Vis kun her hvis det IKKE er hard filter */}
                      {coin.softConditions.stochRSI === true && !coin.filterModeSettings.stochrsi_hard_filter && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-green-500">
                            StochRSI Zone
                          </span>
                        </div>
                      )}
                      {coin.softConditions.macd === true && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-green-500">
                            MACD Histogram
                          </span>
                        </div>
                      )}
                      {coin.softConditions.bb === true && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-green-500">
                            Bollinger Bands
                          </span>
                        </div>
                      )}
                      {coin.softConditions.pivotPoints === true && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-green-500">
                            Pivot Points
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Hard Filters Section - always show if enabled */}
                  {coin.totalEnabledFilters > 0 && (
                    <div className="space-y-1.5 mt-2 border-t border-border/30 pt-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="opacity-70 font-semibold">Hårde filtre:</span>
                        <span className="font-bold">
                          {Object.values(coin.hardFilters).filter(v => v).length}/{coin.totalEnabledFilters}
                        </span>
                      </div>
                      <Progress 
                        value={(Object.values(coin.hardFilters).filter(v => v).length / coin.totalEnabledFilters) * 100} 
                        className="h-2"
                      />
                      
                      {/* Hard Filters Details - All active filters with values */}
                      <div className="text-[9px] space-y-1 pt-1">
                        {coin.hardFilters.emaSpread !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.emaSpread || 0} 
                                size={16}
                                passed={coin.hardFilters.emaSpread}
                              />
                              <span className={coin.hardFilters.emaSpread ? 'text-green-500' : 'opacity-70'}>
                                EMA Spread
                              </span>
                              <span className="text-[7px] px-1 py-0.5 rounded bg-destructive/20 text-destructive font-semibold">
                                HARD
                              </span>
                            </div>
                            <span className="font-mono font-bold">
                              {coin.indicators.emaSpreadPercent?.toFixed(2)}%
                            </span>
                          </div>
                        )}
                        {coin.hardFilters.atr !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.atr || 0} 
                                size={16}
                                passed={coin.hardFilters.atr}
                              />
                              <span className={coin.hardFilters.atr ? 'text-green-500' : 'opacity-70'}>
                                ATR
                              </span>
                              <span className={`text-[7px] px-1 py-0.5 rounded font-semibold ${
                                coin.filterModeSettings.atr_hard_filter 
                                  ? 'bg-destructive/20 text-destructive' 
                                  : 'bg-yellow-500/20 text-yellow-600'
                              }`}>
                                {coin.filterModeSettings.atr_hard_filter ? 'HARD' : 'SOFT'}
                              </span>
                            </div>
                            <span className="font-mono font-bold">
                              {coin.indicators.price && coin.indicators.atr ? 
                                ((coin.indicators.atr / coin.indicators.price) * 100).toFixed(2) + '%' : 
                                'N/A'}
                            </span>
                          </div>
                        )}
                        {coin.hardFilters.adx !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.adx || 0} 
                                size={16}
                                passed={coin.hardFilters.adx}
                              />
                              <span className={coin.hardFilters.adx ? 'text-green-500' : 'opacity-70'}>
                                ADX
                              </span>
                              <span className={`text-[7px] px-1 py-0.5 rounded font-semibold ${
                                coin.filterModeSettings.adx_hard_filter 
                                  ? 'bg-destructive/20 text-destructive' 
                                  : 'bg-yellow-500/20 text-yellow-600'
                              }`}>
                                {coin.filterModeSettings.adx_hard_filter ? 'HARD' : 'SOFT'}
                              </span>
                            </div>
                            <span className="font-mono font-bold">
                              {coin.indicators.adx?.toFixed(1) || 'N/A'}
                            </span>
                          </div>
                        )}
                        {coin.hardFilters.volume !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.volume || 0} 
                                size={16}
                                passed={coin.hardFilters.volume}
                              />
                              <span className={coin.hardFilters.volume ? 'text-green-500' : 'opacity-70'}>
                                Volume
                              </span>
                              <span className={`text-[7px] px-1 py-0.5 rounded font-semibold ${
                                coin.filterModeSettings.volume_hard_filter 
                                  ? 'bg-destructive/20 text-destructive' 
                                  : 'bg-yellow-500/20 text-yellow-600'
                              }`}>
                                {coin.filterModeSettings.volume_hard_filter ? 'HARD' : 'SOFT'}
                              </span>
                            </div>
                            <span className="font-mono font-bold">
                              {coin.indicators.volumeRatio != null ? 
                                coin.indicators.volumeRatio.toFixed(2) + 'x' : 
                                'N/A'}
                            </span>
                          </div>
                        )}
                        {coin.hardFilters.macdColorChange !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.macdColorChange || 0} 
                                size={16}
                                passed={coin.hardFilters.macdColorChange}
                              />
                              <span className={coin.hardFilters.macdColorChange ? 'text-green-500' : 'opacity-70'}>
                                MACD Farveskift
                              </span>
                              <span className={`text-[7px] px-1 py-0.5 rounded font-semibold ${
                                coin.filterModeSettings.macd_hard_filter 
                                  ? 'bg-destructive/20 text-destructive' 
                                  : 'bg-yellow-500/20 text-yellow-600'
                              }`}>
                                {coin.filterModeSettings.macd_hard_filter ? 'HARD' : 'SOFT'}
                              </span>
                            </div>
                            <span className="font-mono font-bold">
                              {coin.hardFilters.macdColorChange ? '✓' : '✗'}
                            </span>
                          </div>
                        )}
                        {coin.hardFilters.macdDirection !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.macdDirection || 0} 
                                size={16}
                                passed={coin.hardFilters.macdDirection}
                              />
                              <span className={coin.hardFilters.macdDirection ? 'text-green-500' : 'opacity-70'}>
                                MACD Retning
                              </span>
                              <span className={`text-[7px] px-1 py-0.5 rounded font-semibold ${
                                coin.filterModeSettings.macd_hard_filter 
                                  ? 'bg-destructive/20 text-destructive' 
                                  : 'bg-yellow-500/20 text-yellow-600'
                              }`}>
                                {coin.filterModeSettings.macd_hard_filter ? 'HARD' : 'SOFT'}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-[8px]">
                              {coin.indicators.macdLine !== undefined && (coin.indicators.macdSignalLine !== undefined || coin.indicators.macdSignal !== undefined) ? (
                                coin.indicators.macdLine > (coin.indicators.macdSignalLine ?? coin.indicators.macdSignal) ? 
                                  <span className="text-green-500">BULL</span> : 
                                  <span className="text-red-500">BEAR</span>
                              ) : 'N/A'}
                            </span>
                          </div>
                        )}
                        {coin.hardFilters.higherTrend !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.higherTrend || 0} 
                                size={16}
                                passed={coin.hardFilters.higherTrend}
                              />
                              <span className={coin.hardFilters.higherTrend ? 'text-green-500' : 'opacity-70'}>
                                Higher Trend
                              </span>
                              <span className={`text-[7px] px-1 py-0.5 rounded font-semibold ${
                                coin.filterModeSettings.higher_trend_hard_filter 
                                  ? 'bg-destructive/20 text-destructive' 
                                  : 'bg-yellow-500/20 text-yellow-600'
                              }`}>
                                {coin.filterModeSettings.higher_trend_hard_filter ? 'HARD' : 'SOFT'}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-[8px]">
                              {coin.indicators.higherTrend || coin.indicators.trend_higher || 'N/A'}
                            </span>
                          </div>
                        )}
                        {coin.hardFilters.emaTrend !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.emaTrend || 0} 
                                size={16}
                                passed={coin.hardFilters.emaTrend}
                              />
                              <span className={coin.hardFilters.emaTrend ? 'text-green-500' : 'opacity-70'}>
                                EMA Trend
                              </span>
                              <span className={`text-[7px] px-1 py-0.5 rounded font-semibold ${
                                coin.filterModeSettings.ema_hard_filter 
                                  ? 'bg-destructive/20 text-destructive' 
                                  : 'bg-yellow-500/20 text-yellow-600'
                              }`}>
                                {coin.filterModeSettings.ema_hard_filter ? 'HARD' : 'SOFT'}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-[8px]">
                              {coin.hardFilters.emaTrend ? '✓' : '✗'}
                            </span>
                          </div>
                        )}
                        {coin.hardFilters.rsiMomentum !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.rsiMomentum || 0} 
                                size={16}
                                passed={coin.hardFilters.rsiMomentum}
                              />
                              <span className={coin.hardFilters.rsiMomentum ? 'text-green-500' : 'opacity-70'}>
                                RSI Momentum
                              </span>
                              <span className={`text-[7px] px-1 py-0.5 rounded font-semibold ${
                                coin.filterModeSettings.rsi_hard_filter 
                                  ? 'bg-destructive/20 text-destructive' 
                                  : 'bg-yellow-500/20 text-yellow-600'
                              }`}>
                                {coin.filterModeSettings.rsi_hard_filter ? 'HARD' : 'SOFT'}
                              </span>
                            </div>
                            <span className="font-mono font-bold">
                              {coin.indicators.rsiMomentum || 'N/A'}
                            </span>
                          </div>
                        )}
                        {/* 🔴 StochRSI Zone - vises altid med HARD/SOFT badge */}
                        {coin.hardFilters.stochRSI !== undefined && (
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <CircularProgress 
                                value={coin.hardFiltersProgress.stochRSI || 0} 
                                size={16}
                                passed={coin.hardFilters.stochRSI}
                              />
                              <span className={coin.hardFilters.stochRSI ? 'text-green-500' : 'opacity-70'}>
                                StochRSI Zone
                              </span>
                              <span className={`text-[7px] px-1 py-0.5 rounded font-semibold ${
                                coin.filterModeSettings.stochrsi_hard_filter 
                                  ? 'bg-destructive/20 text-destructive' 
                                  : 'bg-yellow-500/20 text-yellow-600'
                              }`}>
                                {coin.filterModeSettings.stochrsi_hard_filter ? 'HARD' : 'SOFT'}
                              </span>
                            </div>
                            <span className="font-mono font-bold">
                              K={coin.indicators.stochRSI_k?.toFixed(1) || 'N/A'}
                            </span>
                          </div>
                        )}
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
