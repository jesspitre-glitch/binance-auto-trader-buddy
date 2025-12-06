import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, LineChart as LineChartIcon, Copy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TimeRange = "24h" | "7d" | "30d" | "90d" | "1y";

export const PnLOverview = () => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [stats, setStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [aggregatedData, setAggregatedData] = useState<any[]>([]);
  const [allTrades, setAllTrades] = useState<any[]>([]);
  const [selectedPeriodTrades, setSelectedPeriodTrades] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchPnLData = async (range: TimeRange) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Calculate date range in UTC (Binance server time)
      const now = new Date();
      const startDate = new Date();
      switch (range) {
        case "24h":
          startDate.setUTCHours(startDate.getUTCHours() - 24);
          break;
        case "7d":
          startDate.setUTCDate(startDate.getUTCDate() - 7);
          break;
        case "30d":
          startDate.setUTCDate(startDate.getUTCDate() - 30);
          break;
        case "90d":
          startDate.setUTCDate(startDate.getUTCDate() - 90);
          break;
        case "1y":
          startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
          break;
      }

      // Fetch trade history and portfolio balance in parallel
      const [tradesResult, portfolioResult] = await Promise.all([
        supabase
          .from("trade_history")
          .select("*")
          .eq("user_id", user.id)
          .neq("close_reason", "DUPLICATE")
          .gte("closed_at", startDate.toISOString())
          .order("closed_at", { ascending: true }),
        supabase
          .from("user_portfolio")
          .select("futures_capital")
          .eq("user_id", user.id)
          .single()
      ]);

      if (tradesResult.error) throw tradesResult.error;
      
      const trades = tradesResult.data;
      const portfolioBalance = portfolioResult.data?.futures_capital || 0;

      setAllTrades(trades || []);

      if (!trades || trades.length === 0) {
        setStats({
          totalPnL: 0,
          totalPnLPercent: 0,
          totalTrades: 0,
          winRate: 0,
          avgWin: 0,
          avgLoss: 0,
          largestWin: 0,
          largestLoss: 0,
          profitFactor: 0,
        });
        setChartData([]);
        return;
      }

      // Calculate statistics
      const totalPnL = trades.reduce((sum, t) => sum + Number(t.pnl), 0);
      const totalPnLPercent = portfolioBalance > 0 ? (totalPnL / portfolioBalance) * 100 : 0;
      const winners = trades.filter(t => Number(t.pnl) > 0);
      const losers = trades.filter(t => Number(t.pnl) < 0);
      const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;
      
      const totalWins = winners.reduce((sum, t) => sum + Number(t.pnl), 0);
      const totalLosses = Math.abs(losers.reduce((sum, t) => sum + Number(t.pnl), 0));
      const avgWin = winners.length > 0 ? totalWins / winners.length : 0;
      const avgLoss = losers.length > 0 ? totalLosses / losers.length : 0;
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

      const largestWin = winners.length > 0 
        ? Math.max(...winners.map(t => Number(t.pnl))) 
        : 0;
      const largestLoss = losers.length > 0 
        ? Math.min(...losers.map(t => Number(t.pnl))) 
        : 0;

      setStats({
        totalPnL,
        totalPnLPercent,
        totalTrades: trades.length,
        winRate,
        avgWin,
        avgLoss,
        largestWin,
        largestLoss,
        profitFactor,
      });

      // Create cumulative P&L chart data (UTC/Binance time)
      let cumulativePnL = 0;
      const cumulativeData = trades.map(trade => {
        cumulativePnL += Number(trade.pnl);
        const date = new Date(trade.closed_at);
        return {
          time: date.toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            hour: range === "24h" ? "2-digit" : undefined,
            minute: range === "24h" ? "2-digit" : undefined,
            timeZone: "UTC",
          }) + " UTC",
          pnl: Number(Number(trade.pnl).toFixed(2)),
          cumulative: Number(cumulativePnL.toFixed(2)),
        };
      });

      // Create aggregated P&L data for bar chart (UTC/Binance time)
      const aggregatedPnL = new Map<string, number>();
      
      // Helper to get week number
      const getWeekNumber = (date: Date): number => {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      };

      // Helper to format date key
      const formatDateKey = (date: Date, rangeType: TimeRange): string => {
        if (rangeType === "24h") {
          return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())).toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            timeZone: "UTC",
          }) + " UTC";
        } else if (rangeType === "7d" || rangeType === "30d") {
          return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }) + " UTC";
        } else if (rangeType === "90d") {
          const weekNum = getWeekNumber(date);
          return `Uge ${weekNum}, ${date.getUTCFullYear()}`;
        } else {
          return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toLocaleString("da-DK", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          });
        }
      };

      // Pre-fill all time slots with 0 for ranges that need complete data
      if (range === "24h" || range === "7d" || range === "30d") {
        const current = new Date(startDate);
        while (current <= now) {
          const key = formatDateKey(current, range);
          aggregatedPnL.set(key, 0);
          if (range === "24h") {
            current.setUTCHours(current.getUTCHours() + 1);
          } else {
            current.setUTCDate(current.getUTCDate() + 1);
          }
        }
      }
      
      trades.forEach(trade => {
        const date = new Date(trade.closed_at);
        const timeKey = formatDateKey(date, range);
        const currentPnL = aggregatedPnL.get(timeKey) || 0;
        aggregatedPnL.set(timeKey, currentPnL + Number(trade.pnl));
      });

      // Convert to array and sort chronologically
      const aggregatedData = Array.from(aggregatedPnL.entries())
        .sort((a, b) => {
          // Parse the time keys back to comparable values
          // This works because the keys are formatted consistently
          return Array.from(aggregatedPnL.keys()).indexOf(a[0]) - Array.from(aggregatedPnL.keys()).indexOf(b[0]);
        })
        .map(([time, pnl]) => ({
          time,
          pnl: Number(pnl.toFixed(2)),
        }));

      setChartData(cumulativeData);
      setAggregatedData(aggregatedData);
    } catch (error: any) {
      console.error("P&L fetch error:", error);
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPnLData(timeRange);
  }, [timeRange]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isProfitable = stats?.totalPnL >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profit & Loss Oversigt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="24h">24t</TabsTrigger>
            <TabsTrigger value="7d">7 dage</TabsTrigger>
            <TabsTrigger value="30d">30 dage</TabsTrigger>
            <TabsTrigger value="90d">90 dage</TabsTrigger>
            <TabsTrigger value="1y">1 år</TabsTrigger>
          </TabsList>

          <TabsContent value={timeRange} className="space-y-6">
            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span>Total P&L</span>
                </div>
                <div
                  className={`text-2xl font-bold ${
                    isProfitable ? "text-profit" : "text-loss"
                  }`}
                >
                  {isProfitable ? "+" : ""}${stats?.totalPnL.toFixed(2)}
                  <span className="text-lg ml-2">
                    ({isProfitable ? "+" : ""}{stats?.totalPnLPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Percent className="h-4 w-4" />
                  <span>Win Rate</span>
                </div>
                <div className="text-2xl font-bold">{stats?.winRate.toFixed(1)}%</div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Total Trades</div>
                <div className="text-2xl font-bold">{stats?.totalTrades}</div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Profit Factor</div>
                <div className="text-2xl font-bold">
                  {stats?.profitFactor === Infinity ? "∞" : stats?.profitFactor.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Cumulative P&L Chart */}
            {chartData.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium">Kumulativ P&L</h3>
                  <div className="flex gap-1">
                    <Button
                      variant={chartType === "line" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setChartType("line")}
                    >
                      <LineChartIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={chartType === "bar" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setChartType("bar")}
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  {chartType === "line" ? (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="cumulative"
                        stroke={isProfitable ? "#10b981" : "#ef4444"}
                        strokeWidth={2}
                      />
                    </LineChart>
                  ) : (
                    <BarChart 
                      data={aggregatedData}
                      onClick={(data) => {
                        if (data && data.activePayload && data.activePayload[0]) {
                          const clickedTime = data.activePayload[0].payload.time;
                          const tradesInPeriod = allTrades.filter(trade => {
                            const date = new Date(trade.closed_at);
                            let timeKey: string;
                            
                            // Helper to get week number
                            const getWeekNumber = (d: Date): number => {
                              const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
                              const dayNum = utcDate.getUTCDay() || 7;
                              utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
                              const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
                              return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
                            };
                            
                            if (timeRange === "24h") {
                              timeKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())).toLocaleString("da-DK", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                timeZone: "UTC",
                              }) + " UTC";
                            } else if (timeRange === "7d" || timeRange === "30d") {
                              timeKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toLocaleString("da-DK", {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              }) + " UTC";
                            } else if (timeRange === "90d") {
                              const weekNum = getWeekNumber(date);
                              timeKey = `Uge ${weekNum}, ${date.getUTCFullYear()}`;
                            } else {
                              timeKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toLocaleString("da-DK", {
                                month: "short",
                                year: "numeric",
                                timeZone: "UTC",
                              });
                            }
                            
                            return timeKey === clickedTime;
                          });
                          setSelectedPeriodTrades(tradesInPeriod);
                          setDialogOpen(true);
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="pnl" cursor="pointer">
                        {aggregatedData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}

            {/* Additional Stats */}
            <div className="grid gap-4 md:grid-cols-4 pt-4 border-t">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Gns. Gevinst</div>
                <div className="text-lg font-semibold text-profit">
                  ${stats?.avgWin.toFixed(2)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Gns. Tab</div>
                <div className="text-lg font-semibold text-loss">
                  ${stats?.avgLoss.toFixed(2)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Største Gevinst</div>
                <div className="text-lg font-semibold text-profit">
                  ${stats?.largestWin.toFixed(2)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Største Tab</div>
                <div className="text-lg font-semibold text-loss">
                  ${stats?.largestLoss.toFixed(2)}
                </div>
              </div>
            </div>

            {chartData.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Ingen trades i denne periode
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Trades i perioden</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const totalPnL = selectedPeriodTrades.reduce((sum, t) => sum + Number(t.pnl), 0);
                  const winRate = selectedPeriodTrades.length > 0
                    ? ((selectedPeriodTrades.filter(t => Number(t.pnl) > 0).length / selectedPeriodTrades.length) * 100).toFixed(1)
                    : 0;
                  
                  // Formater indicators_snapshot til læsbar tekst
                  const formatIndicatorsText = (snapshot: any) => {
                    if (!snapshot) return "Ingen indikator data tilgængelig";
                    
                    const lines = [];
                    
                    // EMA værdier
                    if (snapshot.ema_enabled) {
                      lines.push(`EMA Fast (9): ${snapshot.emaFast?.toFixed(2)}`);
                      lines.push(`EMA Medium (21): ${snapshot.emaMedium?.toFixed(2)}`);
                      lines.push(`EMA Slow (50): ${snapshot.emaSlow?.toFixed(2)}`);
                      if (snapshot.ema_medium_trend) lines.push(`EMA Trend (50): ${snapshot.ema_medium_trend.toFixed(2)}`);
                    }
                    
                    // RSI værdier
                    if (snapshot.rsi_enabled) {
                      lines.push(`RSI Værdi: ${snapshot.rsi?.toFixed(2)}`);
                      lines.push(`RSI Min Long: ${snapshot.rsi_min_long || 30}`);
                      lines.push(`RSI Max Short: ${snapshot.rsi_max_short || 70}`);
                    }
                    
                    // MACD værdier
                    if (snapshot.macd_enabled) {
                      lines.push(`MACD Histogram: ${snapshot.macd?.toFixed(6)}`);
                      lines.push(`MACD Fast: ${snapshot.macd_fast || 12}, Slow: ${snapshot.macd_slow || 26}, Signal: ${snapshot.macd_signal || 9}`);
                    }
                    
                    // ATR værdier
                    if (snapshot.atr_enabled) {
                      lines.push(`ATR Værdi: ${snapshot.atr?.toFixed(2)}`);
                      lines.push(`ATR Stop Loss: ${snapshot.atr_stop_loss_multiplier || 2.8}x, Trailing: ${snapshot.atr_trailing_stop_multiplier || 2.0}x, Break Even: ${snapshot.break_even_atr || 0.8}x`);
                    }
                    
                    // ADX værdier
                    if (snapshot.adx_enabled) {
                      lines.push(`ADX Værdi: ${snapshot.adx?.toFixed(2)}`);
                      lines.push(`ADX Threshold: ${snapshot.adx_threshold || 40}`);
                    }
                    
                    // Volume
                    if (snapshot.volume_enabled) {
                      lines.push(`Volume: ${snapshot.volume?.toFixed(2)}`);
                      lines.push(`Volume Average: ${snapshot.avgVolume?.toFixed(2)}`);
                    }
                    
                    // Pivot Points
                    if (snapshot.pivot_points_enabled && snapshot.pivotPoints) {
                      lines.push(`Pivot Points - PP: ${snapshot.pivotPoints.pp?.toFixed(2)}, R1: ${snapshot.pivotPoints.r1?.toFixed(2)}, R2: ${snapshot.pivotPoints.r2?.toFixed(2)}, S1: ${snapshot.pivotPoints.s1?.toFixed(2)}, S2: ${snapshot.pivotPoints.s2?.toFixed(2)}`);
                    }
                    
                    // Config
                    lines.push(`Timeframes: Scan ${snapshot.scan_interval}, Trend ${snapshot.trend_timeframe}, Higher ${snapshot.higher_trend_timeframe}`);
                    lines.push(`Risk: Leverage ${snapshot.leverage}x, Position ${snapshot.position_size_percent}%, Risk/Trade ${snapshot.risk_per_trade_percent}%`);
                    lines.push(`Limits: Max Positions ${snapshot.max_open_positions}, Max Duration ${snapshot.max_position_duration_minutes}m`);
                    
                    return lines.join(", ");
                  };
                  
                  // Byg TSV tabel med indikatorer i én kolonne som 'NAVN værdi'
                  const header = `Symbol\tSide\tÅbnet\tLukket\tEntry\tExit\tP&L\tP&L%\tVarighed\tÅrsag\tIndikatorer\n`;

                  const formatIndicatorLine = (s: any) => {
                    if (!s) return "";
                    const parts: string[] = [];
                    const pushNum = (label: string, val?: number | null, digits = 2) => {
                      if (val === undefined || val === null || isNaN(Number(val))) return;
                      parts.push(`${label} ${Number(val).toFixed(digits)}`);
                    };
                    pushNum("ADX", s.adx, 2);
                    pushNum("RSI", s.rsi, 2);
                    pushNum("MACD", s.macd, 6);
                    pushNum("ATR", s.atr, 2);
                    pushNum("EMA9", s.emaFast, 2);
                    pushNum("EMA21", s.emaMedium, 2);
                    pushNum("EMA50", s.emaSlow, 2);
                    pushNum("VOL", s.volume, 2);
                    if (s.pivotPoints) pushNum("PP", s.pivotPoints.pp, 2);
                    return parts.join(" ");
                  };

                  const rows = selectedPeriodTrades.map((t) => {
                      const opened = new Date(t.opened_at).toLocaleString("da-DK", { timeZone: "UTC" }) + " UTC";
                      const closed = new Date(t.closed_at).toLocaleString("da-DK", { timeZone: "UTC" }) + " UTC";
                    const entry = String(t.entry_price);
                    const exit = String(t.exit_price);
                    const pnl = `${Number(t.pnl) >= 0 ? "" : "-"}$${Math.abs(Number(t.pnl)).toFixed(2)}`;
                    const pnlPct = `${Number(t.pnl_percent).toFixed(2)}%`;
                    const duration = `${t.duration_minutes}m`;
                    const reason = t.close_reason || "";
                    const ind = formatIndicatorLine(t.indicators_snapshot);
                    return `${t.symbol}\t${t.side}\t${opened}\t${closed}\t${entry}\t${exit}\t${pnl}\t${pnlPct}\t${duration}\t${reason}\t${ind}`;
                  }).join("\n");

                  const text = header + rows;
                  
                  navigator.clipboard.writeText(text).then(() => {
                    toast({
                      title: "Kopieret!",
                      description: `${selectedPeriodTrades.length} trades med indikatorer kopieret`,
                    });
                  });
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Kopier
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Total P&L</div>
                <div className={`text-xl font-bold ${
                  selectedPeriodTrades.reduce((sum, t) => sum + Number(t.pnl), 0) >= 0 
                    ? "text-profit" 
                    : "text-loss"
                }`}>
                  ${selectedPeriodTrades.reduce((sum, t) => sum + Number(t.pnl), 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Antal Trades</div>
                <div className="text-xl font-bold">{selectedPeriodTrades.length}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Win Rate</div>
                <div className="text-xl font-bold">
                  {selectedPeriodTrades.length > 0
                    ? ((selectedPeriodTrades.filter(t => Number(t.pnl) > 0).length / selectedPeriodTrades.length) * 100).toFixed(1)
                    : 0}%
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>P&L %</TableHead>
                  <TableHead>Tidspunkt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedPeriodTrades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="font-medium">{trade.symbol}</TableCell>
                    <TableCell>
                      <span className={trade.side === "LONG" ? "text-profit" : "text-loss"}>
                        {trade.side}
                      </span>
                    </TableCell>
                    <TableCell>${Number(trade.entry_price).toFixed(2)}</TableCell>
                    <TableCell>${Number(trade.exit_price).toFixed(2)}</TableCell>
                    <TableCell>{Number(trade.quantity).toFixed(4)}</TableCell>
                    <TableCell className={Number(trade.pnl) >= 0 ? "text-profit" : "text-loss"}>
                      {Number(trade.pnl) >= 0 ? "+" : ""}${Number(trade.pnl).toFixed(2)}
                    </TableCell>
                    <TableCell className={Number(trade.pnl_percent) >= 0 ? "text-profit" : "text-loss"}>
                      {Number(trade.pnl_percent) >= 0 ? "+" : ""}{Number(trade.pnl_percent).toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      {new Date(trade.closed_at).toLocaleString("da-DK", { timeZone: "UTC" })} UTC
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
