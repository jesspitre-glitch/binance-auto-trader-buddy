import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, Clock, Target, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
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
  // Group trades by symbol to see which symbols performed best
  const symbolPerformance = trades.reduce((acc: any, trade) => {
    if (!acc[trade.symbol]) {
      acc[trade.symbol] = { 
        symbol: trade.symbol, 
        trades: 0, 
        pnl: 0, 
        wins: 0, 
        losses: 0 
      };
    }
    acc[trade.symbol].trades++;
    acc[trade.symbol].pnl += trade.pnl;
    if (trade.pnl > 0) acc[trade.symbol].wins++;
    else acc[trade.symbol].losses++;
    return acc;
  }, {});

  const symbolStats = Object.values(symbolPerformance)
    .sort((a: any, b: any) => b.pnl - a.pnl)
    .slice(0, 10);

  // Calculate average hold time
  const avgHoldTime = trades.reduce((sum, trade) => {
    const duration = trade.duration_minutes || 0;
    return sum + duration;
  }, 0) / trades.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Strategi Detaljer
            <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
              {strategyHash.substring(0, 12)}...
            </code>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-full pr-4">
          <div className="space-y-6">
            {/* Performance Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">Total Trades</div>
                  <div className="text-2xl font-bold">{stats.total_trades}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {stats.winning_trades}W / {stats.losing_trades}L
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">Win Rate</div>
                  <div className={`text-2xl font-bold ${stats.win_rate >= 50 ? "text-success" : "text-destructive"}`}>
                    {stats.win_rate.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">Total PnL</div>
                  <div className={`text-2xl font-bold ${stats.total_pnl >= 0 ? "text-success" : "text-destructive"}`}>
                    ${stats.total_pnl.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">Avg PnL</div>
                  <div className={`text-2xl font-bold ${stats.avg_pnl >= 0 ? "text-success" : "text-destructive"}`}>
                    ${stats.avg_pnl.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Største Win
                  </div>
                  <div className="text-2xl font-bold text-success">
                    ${stats.largest_win.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Største Tab
                  </div>
                  <div className="text-2xl font-bold text-destructive">
                    ${stats.largest_loss.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Avg Hold Time
                  </div>
                  <div className="text-2xl font-bold">
                    {avgHoldTime.toFixed(0)}m
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">Profit Factor</div>
                  <div className="text-2xl font-bold">
                    {(Math.abs(stats.largest_win / stats.largest_loss) || 0).toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Performing Symbols */}
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Symbols Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Total PnL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {symbolStats.map((stat: any) => (
                      <TableRow key={stat.symbol}>
                        <TableCell className="font-medium">{stat.symbol}</TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm">{stat.trades}</div>
                          <div className="text-xs text-muted-foreground">
                            {stat.wins}W / {stat.losses}L
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={stat.wins / stat.trades >= 0.5 ? "text-success" : "text-destructive"}>
                            {((stat.wins / stat.trades) * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-bold ${stat.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                            ${stat.pnl.toFixed(2)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* All Trades */}
            <Card>
              <CardHeader>
                <CardTitle>Alle Trades ({trades.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {trades.map((trade) => {
                      const isProfitable = trade.pnl >= 0;
                      
                      return (
                        <div
                          key={trade.id}
                          className="flex items-center justify-between border rounded-lg p-3 hover:bg-accent transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {trade.side === "LONG" ? (
                              <TrendingUp className="h-4 w-4 text-profit" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-loss" />
                            )}
                            <div>
                              <div className="font-semibold text-sm">{trade.symbol}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(trade.closed_at), { 
                                  addSuffix: true,
                                  locale: da 
                                })}
                              </div>
                            </div>
                            <Badge variant={trade.side === "LONG" ? "default" : "secondary"} className="text-xs">
                              {trade.side}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {trade.close_reason?.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="text-xs space-y-1 text-right">
                              <div>Entry: <span className="font-mono">${trade.entry_price}</span></div>
                              <div>Exit: <span className="font-mono">${trade.exit_price}</span></div>
                            </div>
                            <div className="text-right">
                              <div className={`text-sm font-bold ${isProfitable ? "text-profit" : "text-loss"}`}>
                                {isProfitable ? "+" : ""}{trade.pnl.toFixed(2)} USDC
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {trade.pnl_percent >= 0 ? "+" : ""}{trade.pnl_percent.toFixed(2)}%
                              </div>
                              {trade.duration_minutes && (
                                <div className="text-xs text-muted-foreground">
                                  {trade.duration_minutes}m
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
