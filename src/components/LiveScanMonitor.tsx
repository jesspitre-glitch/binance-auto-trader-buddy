import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

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
}

export const LiveScanMonitor = ({ open, onOpenChange }: LiveScanMonitorProps) => {
  const [coins, setCoins] = useState<Map<string, CoinSignalStrength>>(new Map());
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    if (!open) return;

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
          console.log("Live Monitor - Real-time update:", payload);
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const newResult = payload.new as any;
            console.log(`Live Monitor - Updating ${newResult.symbol} with conditionsMet:`, newResult.indicators?.conditionsMet);
            updateCoinStrength(newResult);
          }
        }
      )
      .subscribe((status) => {
        console.log("Live Monitor subscription status:", status);
      });

    return () => {
      console.log("Live Monitor - Cleaning up subscription");
      supabase.removeChannel(channel);
    };
  }, [open, config]); // Tilføjet config dependency

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
    const conditionsRequired = config?.signal_conditions_required || 5;
    const strength = (conditionsMet / conditionsRequired) * 100;

    console.log(`Updating ${result.symbol}: strength=${strength.toFixed(1)}%, conditions=${conditionsMet}/${conditionsRequired}`);

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

                {/* Tidsstempel */}
                <div className="text-[10px] opacity-60">
                  {new Date(coin.lastUpdate).toLocaleTimeString("da-DK", { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </div>

                {/* Signal Strength */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="opacity-70">Styrke</span>
                    <span className={`font-bold ${getTextColor(coin.strength)}`}>
                      {coin.conditionsMet}/{coin.conditionsRequired}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-muted/50">
                    <div 
                      className={`h-full transition-all duration-500 ${getStrengthBarColor(coin.strength)}`}
                      style={{ width: `${Math.min(coin.strength, 100)}%` }}
                    />
                  </div>
                  <div className={`text-center text-xs font-bold ${getTextColor(coin.strength)}`}>
                    {coin.strength.toFixed(0)}%
                  </div>
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
