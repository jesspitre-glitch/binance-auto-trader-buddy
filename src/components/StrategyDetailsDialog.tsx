import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Copy, Check, Settings } from "lucide-react";
import { formatBinanceDate } from "@/lib/timeUtils";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StrategyDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  strategyHash: string;
  trades: any[];
  stats: {
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    total_pnl: number;
    avg_pnl: number;
    win_rate: number;
    largest_win: number;
    largest_loss: number;
    first_trade_date: string;
    last_trade_date: string;
  };
}

export const StrategyDetailsDialog = ({
  isOpen,
  onClose,
  strategyHash,
  trades,
  stats,
}: StrategyDetailsDialogProps) => {
  const { toast } = useToast();
  const [copiedTrades, setCopiedTrades] = useState(false);
  const [copiedIndicators, setCopiedIndicators] = useState(false);
  const [implementingConfig, setImplementingConfig] = useState(false);
  const [indicators, setIndicators] = useState<any>({});
  const [indicatorSource, setIndicatorSource] = useState<"trade" | "position" | "config" | null>(null);

  // Fetch indicators - prioritize from trades, fallback to positions, then latest config
  useEffect(() => {
    const fetchIndicators = async () => {
      // 1) From trades
      const tradeWithIndicators = trades.find(t => t.indicators_snapshot);
      if (tradeWithIndicators) {
        setIndicators(tradeWithIndicators.indicators_snapshot);
        setIndicatorSource("trade");
        return;
      }

      // 2) From positions by strategy
      const { data: pos } = await supabase
        .from("positions")
        .select("indicators_snapshot")
        .eq("strategy_hash", strategyHash)
        .not("indicators_snapshot", "is", null)
        .limit(1);
      
      if (pos && pos.length > 0 && pos[0].indicators_snapshot) {
        setIndicators(pos[0].indicators_snapshot as any);
        setIndicatorSource("position");
        return;
      }

      // 3) Fallback to user's latest config
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: cfg } = await supabase
          .from("indicator_config")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (cfg && cfg.length > 0) {
          setIndicators(cfg[0] as any);
          setIndicatorSource("config");
        }
      }
    };

    if (isOpen) {
      fetchIndicators();
    }
  }, [isOpen, strategyHash, trades]);

  const copyTradesToClipboard = () => {
    const formatIndicatorLine = (s: any) => {
      if (!s) return "";
      const parts: string[] = [];
      const pushNum = (label: string, val?: number | null, digits = 2) => {
        if (val === undefined || val === null || isNaN(Number(val))) return;
        parts.push(`${label} ${Number(val).toFixed(digits)}`);
      };
      pushNum("ADX", s.adx, 2);
      pushNum("RSI", s.rsi, 2);
      pushNum("MACD_LINE", s.macdLine, 6);
      pushNum("MACD_HIST", s.macd, 6);
      pushNum("ATR", s.atr, 2);
      pushNum("EMA9", s.emaFast, 2);
      pushNum("EMA21", s.emaMedium, 2);
      pushNum("EMA50", s.emaSlow, 2);
      pushNum("VOL", s.volume, 2);
      if (s.pivotPoints) pushNum("PP", s.pivotPoints.pp, 2);
      return parts.join(" ");
    };

    const tradesText = trades.map(t => {
      const opened = formatBinanceDate(t.opened_at, { includeTime: true });
      const closed = formatBinanceDate(t.closed_at, { includeTime: true });
      const indicators = formatIndicatorLine(t.indicators_snapshot);
      return `${t.symbol}\t${t.side}\t${opened}\t${closed}\t${t.entry_price}\t${t.exit_price}\t${t.pnl.toFixed(2)}\t${t.pnl_percent.toFixed(2)}%\t${(t.duration_minutes || 0)}m\t${t.close_reason || ''}\t${indicators}`;
    }).join('\n');
    
    const header = 'Symbol\tSide\tÅbnet\tLukket\tEntry\tExit\tPnL\tPnL%\tVarighed\tÅrsag\tIndikatorer\n';
    navigator.clipboard.writeText(header + tradesText);
    
    setCopiedTrades(true);
    setTimeout(() => setCopiedTrades(false), 2000);
    toast({ title: "Kopieret!", description: `${trades.length} trades kopieret til clipboard` });
  };

  const copyIndicatorsToClipboard = () => {
    const indicatorsText = Object.entries(indicators)
      .map(([key, value]) => `${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`)
      .join('\n');
    
    navigator.clipboard.writeText(indicatorsText);
    
    setCopiedIndicators(true);
    setTimeout(() => setCopiedIndicators(false), 2000);
    toast({ title: "Kopieret!", description: "Indikatorer kopieret til clipboard" });
  };

  const implementToConfig = async () => {
    setImplementingConfig(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ikke logget ind");

      // Find den aktive config ID fra sessionen
      const { data: session } = await supabase
        .from("trading_session")
        .select("active_config_id")
        .eq("user_id", user.id)
        .maybeSingle();

      let targetConfigId = session?.active_config_id;

      // Hvis ingen aktiv config, brug seneste eller opret ny
      if (!targetConfigId) {
        const { data: existingConfigs } = await supabase
          .from("indicator_config")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (existingConfigs && existingConfigs.length > 0) {
          targetConfigId = existingConfigs[0].id;
        }
      }

      // Byg payload med ALLE værdier fra indicators
      const payload: any = {
        user_id: user.id,
        name: indicators.name ?? `Strategy ${strategyHash.substring(0, 8)}`,
        enabled: indicators.enabled ?? true,
        // EMA
        ema_fast: indicators.ema_fast ?? 9,
        ema_medium: indicators.ema_medium ?? 21,
        ema_slow: indicators.ema_slow ?? 50,
        // RSI
        rsi_period: indicators.rsi_period ?? 14,
        rsi_overbought: indicators.rsi_overbought ?? 70,
        rsi_oversold: indicators.rsi_oversold ?? 30,
        rsi_min_long: indicators.rsi_min_long ?? 30,
        rsi_max_short: indicators.rsi_max_short ?? 70,
        // MACD
        macd_fast: indicators.macd_fast ?? 12,
        macd_slow: indicators.macd_slow ?? 26,
        macd_signal: indicators.macd_signal ?? 9,
        macd_histogram_threshold: indicators.macd_histogram_threshold ?? 0,
        // Bollinger Bands
        bb_period: indicators.bb_period ?? 20,
        bb_std_dev: indicators.bb_std_dev ?? 2,
        // ATR
        atr_period: indicators.atr_period ?? 14,
        atr_stop_loss_multiplier: indicators.atr_stop_loss_multiplier ?? 2,
        atr_trailing_stop_multiplier: indicators.atr_trailing_stop_multiplier ?? 1.5,
        // ADX
        adx_period: indicators.adx_period ?? 14,
        adx_threshold: indicators.adx_threshold ?? 25,
        // Volume & Signal
        volume_avg_period: indicators.volume_avg_period ?? 20,
        signal_conditions_required: indicators.signal_conditions_required ?? 5,
        // Timeframes
        scan_interval: indicators.scan_interval ?? "5m",
        trend_timeframe: indicators.trend_timeframe ?? "15m",
        // Risk Management
        position_size_percent: indicators.position_size_percent ?? 5,
        risk_per_trade_percent: indicators.risk_per_trade_percent ?? 1,
        max_open_positions: indicators.max_open_positions ?? 3,
        max_exposure_percent: indicators.max_exposure_percent ?? 5,
        daily_loss_limit_percent: indicators.daily_loss_limit_percent ?? 5,
        max_position_duration_minutes: indicators.max_position_duration_minutes ?? 240,
        // Leverage
        leverage: indicators.leverage ?? 10,
      };

      let result;
      if (targetConfigId) {
        // Opdater eksisterende config
        result = await supabase
          .from("indicator_config")
          .update(payload)
          .eq("id", targetConfigId)
          .select();
      } else {
        // Opret ny config
        result = await supabase
          .from("indicator_config")
          .insert(payload)
          .select();
      }

      if (result.error) throw result.error;

      toast({
        title: "Gemt!",
        description: "Strategiens værdier er nu indlæst i din indikator konfiguration.",
      });

      // Luk dialogen så brugeren kan se ændringerne
      setTimeout(() => {
        onClose();
      }, 1000);
      
    } catch (error: any) {
      console.error("implementToConfig error:", error);
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImplementingConfig(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Strategi Detaljer
            <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
              {strategyHash.substring(0, 12)}...
            </code>
          </DialogTitle>
        </DialogHeader>
        
        {/* Compact Stats Row */}
        <div className="grid grid-cols-4 gap-3 py-2">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Trades</div>
            <div className="text-xl font-bold">{stats.total_trades}</div>
            <div className="text-xs text-muted-foreground">{stats.winning_trades}W/{stats.losing_trades}L</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Win Rate</div>
            <div className={`text-xl font-bold ${stats.win_rate >= 50 ? "text-success" : "text-destructive"}`}>
              {stats.win_rate.toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Total PnL</div>
            <div className={`text-xl font-bold ${stats.total_pnl >= 0 ? "text-success" : "text-destructive"}`}>
              ${stats.total_pnl.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Avg PnL</div>
            <div className={`text-xl font-bold ${stats.avg_pnl >= 0 ? "text-success" : "text-destructive"}`}>
              ${stats.avg_pnl.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Tabs for content */}
        <Tabs defaultValue="trades" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="trades">Trades ({trades.length})</TabsTrigger>
            <TabsTrigger value="indicators">Indikatorer</TabsTrigger>
          </TabsList>

          {/* Trades Tab */}
          <TabsContent value="trades" className="flex-1 mt-4 overflow-hidden">
            <div className="flex justify-end mb-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={copyTradesToClipboard}
              >
                {copiedTrades ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copiedTrades ? "Kopieret" : "Kopier"}
              </Button>
            </div>
            <ScrollArea className="h-full border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Åbnet</TableHead>
                    <TableHead>Lukket</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Exit</TableHead>
                    <TableHead className="text-right">PnL</TableHead>
                    <TableHead className="text-right">PnL%</TableHead>
                    <TableHead>Varighed</TableHead>
                    <TableHead>Årsag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...trades]
                    .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
                    .map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={trade.side === "LONG" ? "default" : "secondary"} className="text-xs">
                          {trade.side === "LONG" ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
                          {trade.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatBinanceDate(trade.opened_at, { includeTime: true })}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatBinanceDate(trade.closed_at, { includeTime: true })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ${trade.entry_price}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ${trade.exit_price}
                      </TableCell>
                      <TableCell className={`text-right font-bold text-sm ${trade.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                        {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-right text-xs ${trade.pnl_percent >= 0 ? "text-success" : "text-destructive"}`}>
                        {trade.pnl_percent >= 0 ? "+" : ""}{trade.pnl_percent.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-xs">
                        {trade.duration_minutes || 0}m
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {trade.close_reason?.replace(/_/g, ' ') || 'N/A'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          {/* Indicators Tab */}
          <TabsContent value="indicators" className="flex-1 mt-4 overflow-hidden">
            {Object.keys(indicators).length > 0 ? (
              <div className="space-y-3 h-full flex flex-col">
                <div className="flex justify-between items-center">
                  <div>
                    {indicatorSource && (
                      <span className="text-xs text-muted-foreground">
                        Kilde: {indicatorSource === 'trade' ? 'Trade snapshot' : indicatorSource === 'position' ? 'Position snapshot' : 'Seneste config'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={copyIndicatorsToClipboard}
                      disabled={implementingConfig}
                    >
                      {copiedIndicators ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                      {copiedIndicators ? "Kopieret" : "Kopier"}
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={implementToConfig}
                      disabled={implementingConfig}
                    >
                      {implementingConfig ? (
                        <>
                          <Check className="h-4 w-4 mr-2 animate-spin" />
                          Implementerer...
                        </>
                      ) : (
                        <>
                          <Settings className="h-4 w-4 mr-2" />
                          Implementer til Config
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pr-4">
                    {Object.entries(indicators)
                      .filter(([key]) => !['id', 'user_id', 'name', 'enabled', 'created_at', 'updated_at'].includes(key))
                      .map(([key, value]: [string, any]) => (
                        <Card key={key}>
                          <CardContent className="pt-4 pb-3">
                            <div className="text-xs text-muted-foreground mb-1">
                              {key.replace(/_/g, ' ').toUpperCase()}
                            </div>
                            <div className="font-mono font-bold text-sm">
                              {typeof value === 'number' ? value.toFixed(2) : String(value)}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Ingen indikator data tilgængelig
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
