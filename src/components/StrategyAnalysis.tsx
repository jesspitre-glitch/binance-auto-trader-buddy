import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Activity, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExportTradesDialog } from "./ExportTradesDialog";
import { StrategyDetailsDialog } from "./StrategyDetailsDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface StrategyStats {
  strategy_hash: string;
  strategy_number: number;
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
}

type SortField = 'strategy_number' | 'total_trades' | 'win_rate' | 'total_pnl' | 'avg_pnl' | 'largest_win' | 'largest_loss';
type SortDirection = 'asc' | 'desc';

export const StrategyAnalysis = () => {
  const [strategies, setStrategies] = useState<StrategyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<{ stats: StrategyStats; trades: any[] } | null>(null);
  const [allTrades, setAllTrades] = useState<any[]>([]);
  const [activeStrategyHash, setActiveStrategyHash] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('total_pnl');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const fetchStrategyStats = async () => {
    try {
      setLoading(true);
      
      // Find active strategy hash from current session
      let activeHash: string | null = null;
      let source: string | null = null;
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: sessionRow } = await supabase
          .from("trading_session")
          .select("active_config_id")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sessionRow?.active_config_id) {
          // Fetch the config to generate its hash
          const { data: configData } = await supabase
            .from("indicator_config")
            .select("*")
            .eq("id", sessionRow.active_config_id)
            .maybeSingle();
          
          if (configData) {
            // Generate hash from config parameters (same logic as backend)
            activeHash = await generateConfigHash(configData);
            source = 'session';
          }
        }
      }
      
      // Fallback: find active hash from open positions if no session-based hash
      if (!activeHash) {
        const { data: openPositions } = await supabase
          .from("positions")
          .select("strategy_hash, opened_at, status")
          .eq("status", "OPEN")
          .order("opened_at", { ascending: false });

        const openHashes = (openPositions || [])
          .map((p: any) => p.strategy_hash)
          .filter(Boolean) as string[];

        if (openHashes.length) {
          const counts: Record<string, number> = {};
          openHashes.forEach((h) => { counts[h] = (counts[h] || 0) + 1; });
          activeHash = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
          source = 'open_positions';
        }
      }
      
      setActiveStrategyHash(activeHash);
      setActiveSource(source);
      // Fetch all trades with strategy_hash
      const { data: trades, error } = await supabase
        .from("trade_history")
        .select("*")
        .not("strategy_hash", "is", null)
        .order("closed_at", { ascending: false });

      if (error) throw error;

      if (!trades || trades.length === 0) {
        setStrategies([]);
        setAllTrades([]);
        setLoading(false);
        return;
      }

      setAllTrades(trades);

      // Group trades by strategy_hash
      const strategyMap = new Map<string, any[]>();
      trades.forEach((trade: any) => {
        const hash = String(trade.strategy_hash);
        if (!strategyMap.has(hash)) {
          strategyMap.set(hash, []);
        }
        strategyMap.get(hash)!.push(trade);
      });

      // Calculate stats for each strategy
      const stats: StrategyStats[] = [];
      let nextStrategyNumber = 1;
      
      // Sort by first trade date to assign numbers chronologically
      const sortedHashes = Array.from(strategyMap.entries())
        .sort((a, b) => {
          const dateA = new Date(a[1][a[1].length - 1].closed_at).getTime();
          const dateB = new Date(b[1][b[1].length - 1].closed_at).getTime();
          return dateA - dateB;
        });
      
      for (const [hash, strategyTrades] of sortedHashes) {
        const winningTrades = strategyTrades.filter(t => t.pnl > 0);
        const losingTrades = strategyTrades.filter(t => t.pnl <= 0);
        const totalPnl = strategyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const avgPnl = totalPnl / strategyTrades.length;
        
        // If hash is a pure number, use it as strategy_number; otherwise assign sequential number
        const isNumericHash = /^\d+$/.test(hash);
        const strategyNumber = isNumericHash ? parseInt(hash, 10) : nextStrategyNumber++;
        
        stats.push({
          strategy_hash: hash,
          strategy_number: strategyNumber,
          total_trades: strategyTrades.length,
          winning_trades: winningTrades.length,
          losing_trades: losingTrades.length,
          total_pnl: totalPnl,
          avg_pnl: avgPnl,
          win_rate: (winningTrades.length / strategyTrades.length) * 100,
          largest_win: Math.max(...strategyTrades.map(t => t.pnl || 0)),
          largest_loss: Math.min(...strategyTrades.map(t => t.pnl || 0)),
          first_trade_date: strategyTrades[strategyTrades.length - 1].closed_at,
          last_trade_date: strategyTrades[0].closed_at,
        });
      }

      // Pick the most active strategy in the last 24 hours (override session/positions if present)
      const recentWindowMs = 24 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const recentTrades = trades.filter((t: any) => t.closed_at && (nowMs - new Date(t.closed_at).getTime()) <= recentWindowMs);
      if (recentTrades.length > 0) {
        const recentCounts: Record<string, number> = {};
        for (const t of recentTrades) {
          const h = String(t.strategy_hash);
          recentCounts[h] = (recentCounts[h] || 0) + 1;
        }
        const recentTop = Object.entries(recentCounts).sort((a, b) => b[1] - a[1])[0];
        if (recentTop) {
          activeHash = recentTop[0];
          source = 'most_active_24h';
        }
      } else if (!activeHash || !stats.some((s) => s.strategy_hash === activeHash)) {
        // Fallback to most active overall if no recent trades
        const topEntry = Array.from(strategyMap.entries()).sort((a, b) => b[1].length - a[1].length)[0];
        if (topEntry) {
          activeHash = topEntry[0];
          source = 'most_active';
        }
      }
      
      setActiveStrategyHash(activeHash);
      setActiveSource(source);

      console.debug('[StrategyAnalysis] active detection', { activeStrategyHash: activeHash, source, totalStrategies: stats.length, totalTrades: trades.length });

      setStrategies(stats);
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate hash from config (MUST match backend auto-trade-quant getStrategyIdentifier exactly!)
  async function generateConfigHash(config: any): Promise<string> {
    // This must be IDENTICAL to the strategyParams object in auto-trade-quant/index.ts
    const strategyParams = {
      ema_enabled: config.ema_enabled,
      ema_fast: config.ema_fast,
      ema_medium: config.ema_medium,
      ema_slow: config.ema_slow,
      ema_medium_trend: config.ema_medium_trend,
      min_ema_spread_percent: config.min_ema_spread_percent,
      rsi_enabled: config.rsi_enabled,
      rsi_period: config.rsi_period,
      rsi_min_long: config.rsi_min_long,
      rsi_max_short: config.rsi_max_short,
      rsi_zone_width: config.rsi_zone_width,
      rsi_momentum_periods: config.rsi_momentum_periods,
      stochrsi_enabled: config.stochrsi_enabled,
      stochrsi_period: config.stochrsi_period,
      stochrsi_k_period: config.stochrsi_k_period,
      stochrsi_d_period: config.stochrsi_d_period,
      stochrsi_overbought: config.stochrsi_overbought,
      stochrsi_oversold: config.stochrsi_oversold,
      pivot_points_enabled: config.pivot_points_enabled,
      pivot_points_timeframe: config.pivot_points_timeframe,
      pivot_points_lookback: config.pivot_points_lookback,
      pivot_points_near_threshold: config.pivot_points_near_threshold,
      macd_enabled: config.macd_enabled,
      macd_fast: config.macd_fast,
      macd_slow: config.macd_slow,
      macd_signal: config.macd_signal,
      macd_histogram_threshold: config.macd_histogram_threshold,
      macd_direction_enabled: config.macd_direction_enabled,
      histogram_momentum_enabled: config.histogram_momentum_enabled,
      histogram_momentum_periods: config.histogram_momentum_periods,
      bb_enabled: config.bb_enabled,
      bb_period: config.bb_period,
      bb_std_dev: config.bb_std_dev,
      atr_enabled: config.atr_enabled,
      atr_period: config.atr_period,
      atr_stop_loss_multiplier: config.atr_stop_loss_multiplier,
      atr_take_profit_multiplier: config.atr_take_profit_multiplier,
      atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier,
      break_even_atr: config.break_even_atr,
      adx_enabled: config.adx_enabled,
      adx_period: config.adx_period,
      adx_threshold: config.adx_threshold,
      volume_enabled: config.volume_enabled,
      volume_avg_period: config.volume_avg_period,
      volume_multiplier: config.volume_multiplier,
      signal_conditions_required: config.signal_conditions_required,
      position_size_percent: config.position_size_percent,
      risk_per_trade_percent: config.risk_per_trade_percent,
      max_open_positions: config.max_open_positions,
      max_exposure_percent: config.max_exposure_percent,
      daily_loss_limit_percent: config.daily_loss_limit_percent,
      max_position_duration_minutes: config.max_position_duration_minutes,
      leverage: config.leverage,
      scan_interval: config.scan_interval,
      trend_timeframe: config.trend_timeframe,
      higher_trend_enabled: config.higher_trend_enabled,
      higher_trend_timeframe: config.higher_trend_timeframe,
      klines_limit: config.klines_limit,
    };
    
    // Sort keys to ensure consistent hashing regardless of object property order
    const sortedJson = JSON.stringify(strategyParams, Object.keys(strategyParams).sort());
    const encoder = new TextEncoder();
    const data = encoder.encode(sortedJson);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  }

  useEffect(() => {
    fetchStrategyStats();

    const channel = supabase
      .channel("strategy-analysis")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trade_history",
        },
        () => {
          fetchStrategyStats();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "positions",
        },
        () => {
          fetchStrategyStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Strategi Analyse</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Activity className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (strategies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Strategi Analyse</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Ingen strategier fundet. Start trading for at se strategi performance.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort strategies based on current sort field and direction
  const sortedStrategies = [...strategies].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    // Always put active strategy first
    if (a.strategy_hash === activeStrategyHash) return -1;
    if (b.strategy_hash === activeStrategyHash) return 1;
    
    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const activeStat = strategies.find((s) => s.strategy_hash === activeStrategyHash) || null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Strategi Performance Oversigt
            </CardTitle>
            {activeStrategyHash && activeStat && (
              <div className="flex items-center gap-2">
                <Badge variant="default" className="gap-2 px-3 py-1 bg-primary text-primary-foreground">
                  Aktiv: Strategi {activeStat.strategy_number}
                </Badge>
                {activeSource && (
                  <span className="text-xs text-muted-foreground">
                    via {activeSource === 'open_positions' ? 'åbne positioner' : 
                         activeSource === 'latest_trade' ? 'seneste trade' : 
                         activeSource === 'most_active_24h' ? 'mest aktive (24t)' : 
                         activeSource === 'most_active' ? 'mest aktive (all-time)' : 
                         activeSource === 'recent_trades' ? 'seneste handler' : 
                         'aktiv konfiguration'}
                  </span>
                )}
              </div>
            )}
            {activeStrategyHash && !activeStat && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-2 px-3 py-1">
                  Aktiv strategi har endnu ingen lukkede trades
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Strategier</div>
                <div className="text-3xl font-bold">{strategies.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Bedste Strategi PnL</div>
                <div className={`text-3xl font-bold ${strategies[0]?.total_pnl >= 0 ? "text-success" : "text-destructive"}`}>
                  ${strategies[0]?.total_pnl.toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Trades</div>
                <div className="text-3xl font-bold">
                  {strategies.reduce((sum, s) => sum + s.total_trades, 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-2"
                      onClick={() => handleSort('strategy_number')}
                    >
                      Strategi
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-2"
                      onClick={() => handleSort('total_trades')}
                    >
                      Trades
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-2"
                      onClick={() => handleSort('win_rate')}
                    >
                      Win Rate
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-2"
                      onClick={() => handleSort('total_pnl')}
                    >
                      Total PnL
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-2"
                      onClick={() => handleSort('avg_pnl')}
                    >
                      Avg PnL
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-2"
                      onClick={() => handleSort('largest_win')}
                    >
                      Største Win
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-2"
                      onClick={() => handleSort('largest_loss')}
                    >
                      Største Tab
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStrategies.map((strategy) => {
                  const isWinning = strategy.total_pnl > 0;
                  const rowClass = isWinning ? "bg-success/20" : "bg-loss/20";
                  
                  return (
                    <TableRow 
                      key={strategy.strategy_hash}
                      className={`cursor-pointer hover:opacity-80 transition-opacity ${rowClass} ${
                        strategy.strategy_hash === activeStrategyHash 
                          ? "border-l-4 border-l-primary ring-2 ring-primary/60 bg-primary/10 font-semibold" 
                          : ""
                      }`}
                      onClick={() => setSelectedStrategy({ 
                        stats: strategy, 
                        trades: allTrades.filter((t: any) => String(t.strategy_hash) === strategy.strategy_hash) 
                      })}
                    >
                      <TableCell className="w-[120px]">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold">
                              Strategi {strategy.strategy_number}
                            </span>
                            {strategy.strategy_hash === activeStrategyHash && (
                              <Badge variant="default" className="gap-1 bg-primary text-primary-foreground">
                                Aktiv
                              </Badge>
                            )}
                          </div>
                          <ExportTradesDialog 
                            strategyHash={strategy.strategy_hash}
                            buttonVariant="ghost"
                            buttonSize="sm"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm">
                          {strategy.total_trades}
                          <div className="text-xs text-muted-foreground">
                            {strategy.winning_trades}W / {strategy.losing_trades}L
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`text-sm font-medium ${strategy.win_rate >= 50 ? "text-success" : "text-loss"}`}>
                          {strategy.win_rate.toFixed(1)}%
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`text-sm font-bold ${isWinning ? "text-success" : "text-loss"}`}>
                          ${strategy.total_pnl.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`text-sm ${strategy.avg_pnl >= 0 ? "text-success" : "text-loss"}`}>
                          ${strategy.avg_pnl.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm text-success">
                          ${strategy.largest_win.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm text-loss">
                          ${strategy.largest_loss.toFixed(2)}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedStrategy && (
        <StrategyDetailsDialog
          isOpen={!!selectedStrategy}
          onClose={() => setSelectedStrategy(null)}
          strategyHash={selectedStrategy.stats.strategy_hash}
          trades={selectedStrategy.trades}
          stats={selectedStrategy.stats}
        />
      )}
    </div>
  );
};
