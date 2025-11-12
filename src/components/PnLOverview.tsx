import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, LineChart as LineChartIcon } from "lucide-react";
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
            <DialogTitle>Trades i perioden</DialogTitle>
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
