import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, LineChart as LineChartIcon, Copy, Download } from "lucide-react";
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
import { formatTradeForExport, compressTradeData, formatWithLineBreaks } from "@/lib/tradeExportUtils";

type TimeRange = "24h" | "7d" | "30d" | "90d" | "1y" | "all";

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

      // Calculate rolling time window using exact hours (UTC/Binance server time)
      const nowMs = Date.now();
      let startMs: number;
      
      switch (range) {
        case "24h":
          startMs = nowMs - (24 * 60 * 60 * 1000); // Exactly 24 hours
          break;
        case "7d":
          startMs = nowMs - (7 * 24 * 60 * 60 * 1000); // Exactly 7×24 hours = 168 hours
          break;
        case "30d":
          startMs = nowMs - (30 * 24 * 60 * 60 * 1000); // Exactly 30×24 hours
          break;
        case "90d":
          startMs = nowMs - (90 * 24 * 60 * 60 * 1000); // Exactly 90×24 hours
          break;
        case "1y":
          startMs = nowMs - (365 * 24 * 60 * 60 * 1000); // Exactly 365×24 hours
          break;
        case "all":
          startMs = new Date(2020, 0, 1).getTime(); // All time
          break;
      }
      
      const startDate = new Date(startMs);
      const now = new Date(nowMs);

      console.log(`[PnL] Rolling window: ${range}, from ${startDate.toISOString()} to ${now.toISOString()}`);
      
      // Fetch portfolio balance
      const portfolioResult = await supabase
        .from("user_portfolio")
        .select("futures_capital")
        .eq("user_id", user.id)
        .maybeSingle();

      // Fetch ALL trades using pagination
      const allTradesData: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        const { data, error } = await supabase
          .from("trade_history")
          .select("*")
          .eq("user_id", user.id)
          .neq("close_reason", "DUPLICATE")
          .gte("closed_at", startDate.toISOString())
          .order("closed_at", { ascending: false })
          .range(from, to);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allTradesData.push(...data);
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }
      
      // Fetch funding fees for the period (using binance_time in ms)
      const { data: fundingData, error: fundingError } = await supabase
        .from("funding_fees")
        .select("*")
        .eq("user_id", user.id)
        .gte("binance_time", startMs)
        .lte("binance_time", nowMs)
        .order("binance_time", { ascending: true });
      
      if (fundingError) {
        console.warn("[PnL] Failed to fetch funding fees:", fundingError);
      }
      
      const fundingFees = fundingData || [];
      const totalFundingFees = fundingFees.reduce((sum, f) => sum + Number(f.income), 0);
      
      console.log(`[PnL] Trades: ${allTradesData.length}, Funding fees: ${fundingFees.length} (total: ${totalFundingFees.toFixed(2)} USDT)`);
      
      // Sort trades ascending for cumulative chart
      const trades = allTradesData.sort((a, b) => 
        new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime()
      );
      const portfolioBalance = portfolioResult?.data?.futures_capital || 0;

      setAllTrades(trades);

      // Calculate total P&L including funding fees
      const tradePnL = trades.reduce((sum, t) => sum + Number(t.pnl), 0);
      const totalPnL = tradePnL + totalFundingFees;

      if (trades.length === 0 && fundingFees.length === 0) {
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
          fundingFees: 0,
        });
        setChartData([]);
        setAggregatedData([]);
        return;
      }

      // Calculate statistics (totalPnL already includes funding fees from above)
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
        fundingFees: totalFundingFees,
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
      // Use timestamp as key for reliable sorting, store label separately
      const aggregatedPnL = new Map<number, { label: string; pnl: number }>();
      
      // Helper to get week number
      const getWeekNumber = (date: Date): number => {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      };

      // Helper to get timestamp key and label for a date
      const getKeyAndLabel = (date: Date, rangeType: TimeRange): { key: number; label: string } => {
        if (rangeType === "24h") {
          const key = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
          const label = new Date(key).toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            timeZone: "UTC",
          }) + " UTC";
          return { key, label };
        } else if (rangeType === "7d" || rangeType === "30d") {
          const key = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
          const label = new Date(key).toLocaleString("da-DK", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }) + " UTC";
          return { key, label };
        } else if (rangeType === "90d") {
          const weekNum = getWeekNumber(date);
          const key = Date.UTC(date.getUTCFullYear(), 0, 1) + (weekNum * 7 * 24 * 60 * 60 * 1000);
          const label = `Uge ${weekNum}, ${date.getUTCFullYear()}`;
          return { key, label };
        } else {
          const key = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
          const label = new Date(key).toLocaleString("da-DK", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          });
          return { key, label };
        }
      };

      // Pre-fill all time slots with 0 for ranges that need complete data
      if (range === "24h" || range === "7d" || range === "30d") {
        // Create fresh copies to avoid mutating startDate
        const rangeStart = new Date(startDate.getTime());
        const rangeEnd = new Date(now.getTime());
        
        // Reset to start of day/hour for consistent keys
        if (range === "24h") {
          rangeStart.setUTCMinutes(0, 0, 0);
          rangeEnd.setUTCMinutes(0, 0, 0);
        } else {
          rangeStart.setUTCHours(0, 0, 0, 0);
          rangeEnd.setUTCHours(0, 0, 0, 0);
        }
        
        const current = new Date(rangeStart.getTime());
        console.log(`Pre-fill: range=${range}, from ${rangeStart.toISOString()} to ${rangeEnd.toISOString()}`);
        let prefillCount = 0;
        while (current <= rangeEnd) {
          const { key, label } = getKeyAndLabel(current, range);
          aggregatedPnL.set(key, { label, pnl: 0 });
          prefillCount++;
          if (range === "24h") {
            current.setUTCHours(current.getUTCHours() + 1);
          } else {
            current.setUTCDate(current.getUTCDate() + 1);
          }
        }
        console.log(`Pre-filled ${prefillCount} slots, Map size: ${aggregatedPnL.size}`);
      }
      
      let matchedCount = 0;
      let unmatchedCount = 0;
      
      // Debug: log first and last few trades to see their dates
      if (trades.length > 0) {
        console.log(`First trade closed_at: ${trades[0].closed_at}`);
        console.log(`Last trade closed_at: ${trades[trades.length - 1].closed_at}`);
      }
      
      trades.forEach((trade, idx) => {
        const date = new Date(trade.closed_at);
        const { key, label } = getKeyAndLabel(date, range);
        const existing = aggregatedPnL.get(key);
        
        // Debug first few trades
        if (idx < 3) {
          console.log(`Trade ${idx}: closed_at=${trade.closed_at}, key=${key}, label=${label}, exists=${!!existing}`);
        }
        
        if (existing) {
          existing.pnl += Number(trade.pnl);
          matchedCount++;
        } else {
          aggregatedPnL.set(key, { label, pnl: Number(trade.pnl) });
          unmatchedCount++;
        }
      });

      console.log(`Trades processed: ${matchedCount} matched, ${unmatchedCount} unmatched, total: ${trades.length}`);
      console.log(`After trades: Map size: ${aggregatedPnL.size}`);
      
      // Log all pre-filled keys for 30d range
      if (range === "30d") {
        const allKeys = Array.from(aggregatedPnL.keys()).sort((a, b) => a - b);
        console.log(`All pre-filled keys (first 5):`, allKeys.slice(0, 5).map(k => ({ key: k, date: new Date(k).toISOString() })));
        console.log(`All pre-filled keys (last 5):`, allKeys.slice(-5).map(k => ({ key: k, date: new Date(k).toISOString() })));
      }
      
      // Log entries with non-zero pnl
      const nonZeroEntries = Array.from(aggregatedPnL.entries()).filter(([_, data]) => data.pnl !== 0);
      console.log(`Non-zero entries (${nonZeroEntries.length}):`, nonZeroEntries.map(([k, d]) => ({ key: k, label: d.label, pnl: d.pnl.toFixed(2) })));

      // Convert to array, sort by timestamp key, and extract display data
      const aggregatedData = Array.from(aggregatedPnL.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([_, data]) => ({
          time: data.label,
          pnl: Number(data.pnl.toFixed(2)),
        }));
      
      console.log(`Final aggregatedData length: ${aggregatedData.length}`);

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

  // Ref to track current timeRange for use in subscription callback
  const timeRangeRef = useRef(timeRange);
  
  useEffect(() => {
    timeRangeRef.current = timeRange;
  }, [timeRange]);

  useEffect(() => {
    fetchPnLData(timeRange);
  }, [timeRange]);

  // Separate effect for realtime subscription - only set up once
  useEffect(() => {
    console.log("[PnL] Setting up realtime subscription for trade_history");
    
    const channel = supabase
      .channel("pnl-trade-history-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trade_history",
        },
        (payload) => {
          console.log("[PnL] Realtime: New trade detected, refetching data", payload);
          fetchPnLData(timeRangeRef.current);
        }
      )
      .subscribe((status) => {
        console.log("[PnL] Realtime subscription status:", status);
      });

    return () => {
      console.log("[PnL] Cleaning up realtime subscription");
      supabase.removeChannel(channel);
    };
  }, []);

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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="24h">24t</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
            <TabsTrigger value="90d">90d</TabsTrigger>
            <TabsTrigger value="1y">1år</TabsTrigger>
            <TabsTrigger value="all">Alt</TabsTrigger>
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
                  {stats?.fundingFees !== 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      inkl. funding: {stats?.fundingFees >= 0 ? "+" : ""}{stats?.fundingFees?.toFixed(2)} USDT
                    </div>
                  )}
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedPeriodTrades.length === 0) {
                      toast({
                        title: "Ingen handler",
                        description: "Ingen handler i denne periode",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    // Sort trades descending by closed_at for export
                    const sortedTrades = [...selectedPeriodTrades].sort(
                      (a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime()
                    );
                    
                    const compressed = compressTradeData(sortedTrades);
                    const jsonStr = formatWithLineBreaks(compressed);
                    
                    navigator.clipboard.writeText(jsonStr).then(() => {
                      toast({
                        title: "Eksporteret til clipboard! ✓",
                        description: `${selectedPeriodTrades.length} handler kopieret i kompakt format`,
                      });
                    }).catch((err) => {
                      console.error('Clipboard failed:', err);
                      toast({
                        title: "Fejl",
                        description: "Kunne ikke kopiere til clipboard",
                        variant: "destructive",
                      });
                    });
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Eksporter til AI
                </Button>
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
                  Kopier TSV
                </Button>
              </div>
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
