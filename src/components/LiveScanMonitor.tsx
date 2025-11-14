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

    fetchConfig();
    fetchInitialScans();

    // Real-time subscription
    const channel = supabase
      .channel("live-scan-monitor")
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open]);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("indicator_config")
        .select("*")
        .eq("enabled", true)
        .single();
      
      if (error) throw error;
      setConfig(data);
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  };

  const fetchInitialScans = async () => {
    try {
      const { data, error } = await supabase
        .from("scan_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Keep only latest for each symbol
      const latestBySymbol = new Map<string, any>();
      (data || []).forEach((row) => {
        if (!latestBySymbol.has(row.symbol)) {
          latestBySymbol.set(row.symbol, row);
        }
      });

      latestBySymbol.forEach((result) => {
        updateCoinStrength(result);
      });
    } catch (error) {
      console.error("Error fetching scans:", error);
    }
  };

  const updateCoinStrength = (result: any) => {
    if (!result.indicators) return;

    const indicators = result.indicators;
    const conditionsMet = indicators.conditionsMet || 0;
    const conditionsRequired = config?.signal_conditions_required || 5;
    const strength = (conditionsMet / conditionsRequired) * 100;

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

  const getColorClass = (strength: number, signal: string) => {
    // Grønnere jo tættere på signal (80%+)
    if (strength >= 80) {
      return signal === "LONG" 
        ? "bg-green-500/20 border-green-500 text-green-500" 
        : signal === "SHORT"
        ? "bg-red-500/20 border-red-500 text-red-500"
        : "bg-yellow-500/20 border-yellow-500 text-yellow-500";
    }
    // Mellem niveau (50-79%)
    if (strength >= 50) {
      return signal === "LONG"
        ? "bg-green-500/10 border-green-500/50 text-green-600"
        : signal === "SHORT"
        ? "bg-red-500/10 border-red-500/50 text-red-600"
        : "bg-yellow-500/10 border-yellow-500/50 text-yellow-600";
    }
    // Rødt/svagt signal (under 50%)
    return "bg-muted/50 border-muted-foreground/20 text-muted-foreground";
  };

  const getStrengthGradient = (strength: number) => {
    const percentage = Math.min(strength, 100);
    if (percentage >= 80) {
      return `linear-gradient(90deg, hsl(var(--green-500)) ${percentage}%, hsl(var(--muted)) ${percentage}%)`;
    } else if (percentage >= 50) {
      return `linear-gradient(90deg, hsl(var(--yellow-500)) ${percentage}%, hsl(var(--muted)) ${percentage}%)`;
    } else {
      return `linear-gradient(90deg, hsl(var(--red-500)) ${percentage}%, hsl(var(--muted)) ${percentage}%)`;
    }
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

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto pr-2">
          {sortedCoins.map((coin) => (
            <Card
              key={coin.symbol}
              className={`p-4 border-2 transition-all duration-300 hover:scale-105 ${getColorClass(
                coin.strength,
                coin.signal
              )}`}
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-lg">{coin.symbol}</div>
                    <div className="text-xs opacity-70">
                      {new Date(coin.lastUpdate).toLocaleTimeString("da-DK")}
                    </div>
                  </div>
                  {coin.trend === "BULLISH" ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : coin.trend === "BEARISH" ? (
                    <TrendingDown className="h-5 w-5" />
                  ) : null}
                </div>

                {/* Signal Strength Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>Signal Styrke</span>
                    <span className="font-bold">
                      {coin.conditionsMet}/{coin.conditionsRequired}
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden bg-muted"
                    style={{
                      background: getStrengthGradient(coin.strength),
                    }}
                  />
                  <div className="text-center text-xs font-bold">
                    {coin.strength.toFixed(0)}%
                  </div>
                </div>

                {/* Quick Indicators */}
                <div className="space-y-1 text-xs">
                  {coin.indicators.rsi && (
                    <div className="flex justify-between">
                      <span className="opacity-70">RSI:</span>
                      <span className="font-mono font-bold">
                        {coin.indicators.rsi.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {coin.indicators.adx && (
                    <div className="flex justify-between">
                      <span className="opacity-70">ADX:</span>
                      <span className="font-mono font-bold">
                        {coin.indicators.adx.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {coin.indicators.volumeRatio && (
                    <div className="flex justify-between">
                      <span className="opacity-70">Vol:</span>
                      <span className="font-mono font-bold">
                        {(coin.indicators.volumeRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Signal Badge */}
                {coin.signal !== "NONE" && (
                  <Badge
                    variant={coin.signal === "LONG" ? "default" : "destructive"}
                    className="w-full justify-center"
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
