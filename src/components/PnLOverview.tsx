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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Calculate date range
      const now = new Date();
      const startDate = new Date();
      switch (range) {
        case "24h":
          startDate.setHours(startDate.getHours() - 24);
          break;
        case "7d":
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(startDate.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(startDate.getDate() - 90);
          break;
        case "1y":
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      // Fetch trade history
      const { data: trades, error } = await supabase
        .from("trade_history")
        .select("*")
        .eq("user_id", user.id)
        .neq("close_reason", "DUPLICATE")
        .gte("closed_at", startDate.toISOString())
        .order("closed_at", { ascending: true });

      if (error) throw error;

      setAllTrades(trades || []);

      if (!trades || trades.length === 0) {
        setStats({
          totalPnL: 0,
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
        totalTrades: trades.length,
        winRate,
        avgWin,
        avgLoss,
        largestWin,
        largestLoss,
        profitFactor,
      });

      // Create cumulative P&L chart data
      let cumulativePnL = 0;
      const cumulativeData = trades.map(trade => {
        cumulativePnL += Number(trade.pnl);
        return {
          time: new Date(trade.closed_at).toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            hour: range === "24h" ? "2-digit" : undefined,
            minute: range === "24h" ? "2-digit" : undefined,
          }),
          pnl: Number(Number(trade.pnl).toFixed(2)),
          cumulative: Number(cumulativePnL.toFixed(2)),
        };
      });

      // Create aggregated P&L data for bar chart
      const aggregatedPnL = new Map<string, number>();
      trades.forEach(trade => {
        const date = new Date(trade.closed_at);
        let timeKey: string;
        
        if (range === "24h") {
          // Group by hour
          timeKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
          });
        } else {
          // Group by day
          timeKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
          });
        }
        
        const currentPnL = aggregatedPnL.get(timeKey) || 0;
        aggregatedPnL.set(timeKey, currentPnL + Number(trade.pnl));
      });

      const aggregatedData = Array.from(aggregatedPnL.entries()).map(([time, pnl]) => ({
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
                            
                            if (timeRange === "24h") {
                              timeKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toLocaleString("da-DK", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                              });
                            } else {
                              timeKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toLocaleString("da-DK", {
                                month: "short",
                                day: "numeric",
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
                  
                  // Formater indicators_snapshot til læsbare værdier
                  const formatIndicators = (snapshot: any) => {
                    if (!snapshot) return null;
                    
                    return {
                      // EMA værdier
                      "EMA Fast (9)": snapshot.emaFast?.toFixed(2),
                      "EMA Medium (21)": snapshot.emaMedium?.toFixed(2),
                      "EMA Slow (50)": snapshot.emaSlow?.toFixed(2),
                      "EMA Trend (50)": snapshot.ema_medium_trend?.toFixed(2),
                      
                      // RSI værdier
                      "RSI Period": snapshot.rsi_period || 14,
                      "RSI Værdi": snapshot.rsi?.toFixed(2),
                      "RSI Min Long": snapshot.rsi_min_long || 30,
                      "RSI Max Short": snapshot.rsi_max_short || 70,
                      "RSI Overbought": snapshot.rsi_overbought || 80,
                      "RSI Oversold": snapshot.rsi_oversold || 30,
                      
                      // MACD værdier
                      "MACD Fast": snapshot.macd_fast || 12,
                      "MACD Slow": snapshot.macd_slow || 26,
                      "MACD Signal": snapshot.macd_signal || 9,
                      "MACD Histogram": snapshot.macd?.toFixed(6),
                      "MACD Threshold": snapshot.macd_histogram_threshold || 0,
                      
                      // ATR værdier
                      "ATR Period": snapshot.atr_period || 14,
                      "ATR Værdi": snapshot.atr?.toFixed(2),
                      "ATR Stop Loss Multiplier": snapshot.atr_stop_loss_multiplier || 2.8,
                      "ATR Trailing Stop Multiplier": snapshot.atr_trailing_stop_multiplier || 2.0,
                      "ATR Break Even": snapshot.break_even_atr || 0.8,
                      "ATR Take Profit Multiplier": snapshot.atr_take_profit_multiplier || 0,
                      
                      // ADX værdier
                      "ADX Period": snapshot.adx_period || 14,
                      "ADX Værdi": snapshot.adx?.toFixed(2),
                      "ADX Threshold": snapshot.adx_threshold || 40,
                      
                      // Volume
                      "Volume": snapshot.volume?.toFixed(2),
                      "Volume Average": snapshot.avgVolume?.toFixed(2),
                      "Volume Avg Period": snapshot.volume_avg_period || 20,
                      
                      // Pivot Points
                      "Pivot Points PP": snapshot.pivotPoints?.pp?.toFixed(2),
                      "Pivot Points R1": snapshot.pivotPoints?.r1?.toFixed(2),
                      "Pivot Points R2": snapshot.pivotPoints?.r2?.toFixed(2),
                      "Pivot Points R3": snapshot.pivotPoints?.r3?.toFixed(2),
                      "Pivot Points S1": snapshot.pivotPoints?.s1?.toFixed(2),
                      "Pivot Points S2": snapshot.pivotPoints?.s2?.toFixed(2),
                      "Pivot Points S3": snapshot.pivotPoints?.s3?.toFixed(2),
                      "Pivot Points Timeframe": snapshot.pivot_points_timeframe,
                      "Pivot Points Lookback": snapshot.pivot_points_lookback,
                      "Pivot Points Near Threshold": snapshot.pivot_points_near_threshold,
                      
                      // Config værdier
                      "Scan Interval": snapshot.scan_interval,
                      "Trend Timeframe": snapshot.trend_timeframe,
                      "Higher Trend Timeframe": snapshot.higher_trend_timeframe,
                      "Klines Limit": snapshot.klines_limit,
                      "Leverage": snapshot.leverage,
                      "Position Size Percent": snapshot.position_size_percent,
                      "Risk Per Trade Percent": snapshot.risk_per_trade_percent,
                      "Max Open Positions": snapshot.max_open_positions,
                      "Max Position Duration Minutes": snapshot.max_position_duration_minutes,
                      "Max Exposure Percent": snapshot.max_exposure_percent,
                      "Daily Loss Limit Percent": snapshot.daily_loss_limit_percent,
                      "Signal Conditions Required": snapshot.signal_conditions_required,
                      
                      // Enabled flags
                      "EMA Enabled": snapshot.ema_enabled,
                      "RSI Enabled": snapshot.rsi_enabled,
                      "StochRSI Enabled": snapshot.stochrsi_enabled,
                      "MACD Enabled": snapshot.macd_enabled,
                      "BB Enabled": snapshot.bb_enabled,
                      "ATR Enabled": snapshot.atr_enabled,
                      "ADX Enabled": snapshot.adx_enabled,
                      "Volume Enabled": snapshot.volume_enabled,
                      "Pivot Points Enabled": snapshot.pivot_points_enabled,
                      
                      // Price at time of trade
                      "Price": snapshot.price?.toFixed(2),
                      "Strategy Name": snapshot.name,
                    };
                  };
                  
                  // Opbyg JSON format med ALLE detaljer for AI analyse
                  const exportData = {
                    summary: {
                      total_pnl: totalPnL.toFixed(2) + " USDC",
                      total_trades: selectedPeriodTrades.length,
                      win_rate: winRate + "%",
                      period: `${new Date(selectedPeriodTrades[selectedPeriodTrades.length - 1]?.closed_at).toLocaleDateString('da-DK')} - ${new Date(selectedPeriodTrades[0]?.closed_at).toLocaleDateString('da-DK')}`
                    },
                    trades: selectedPeriodTrades.map(t => ({
                      symbol: t.symbol,
                      side: t.side,
                      entry_price: t.entry_price,
                      exit_price: t.exit_price,
                      quantity: t.quantity,
                      pnl: Number(t.pnl).toFixed(2),
                      pnl_percent: Number(t.pnl_percent).toFixed(2) + "%",
                      duration_minutes: t.duration_minutes,
                      opened_at: new Date(t.opened_at).toISOString(),
                      closed_at: new Date(t.closed_at).toISOString(),
                      open_reason: t.open_reason,
                      close_reason: t.close_reason,
                      strategy_hash: t.strategy_hash,
                      // ALLE indikator værdier med læsbare navne
                      indicators: formatIndicators(t.indicators_snapshot)
                    }))
                  };
                  
                  const jsonStr = JSON.stringify(exportData, null, 2);
                  
                  navigator.clipboard.writeText(jsonStr).then(() => {
                    toast({
                      title: "Kopieret!",
                      description: `${selectedPeriodTrades.length} trades med ALLE indikator-værdier kopieret til clipboard`,
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
                      {new Date(trade.closed_at).toLocaleString("da-DK")}
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
