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
      
      // Find active strategy hash from open positions (most reliable source)
      let activeHash: string | null = null;
      let source: string | null = null;
      
      const { data: openPositions } = await supabase
        .from("positions")
        .select("strategy_hash, opened_at, status")
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false });

      const openHashes = (openPositions || [])
        .map((p: any) => p.strategy_hash)
        .filter((h: any) => h && typeof h === 'string' && h.length === 64) as string[];

      if (openHashes.length) {
        const counts: Record<string, number> = {};
        openHashes.forEach((h) => { counts[h] = (counts[h] || 0) + 1; });
        activeHash = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        source = 'open_positions';
      }
      
      setActiveStrategyHash(activeHash);
      setActiveSource(source);
      
      // Fetch ALL trades with strategy_hash using pagination (Supabase has 1000 row limit)
      let allFetchedTrades: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data: batch, error } = await supabase
          .from("trade_history")
          .select("*")
          .not("strategy_hash", "is", null)
          .order("closed_at", { ascending: false })
          .range(offset, offset + batchSize - 1);
        
        if (error) throw error;
        
        if (batch && batch.length > 0) {
          allFetchedTrades = [...allFetchedTrades, ...batch];
          offset += batchSize;
          hasMore = batch.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      
      console.log(`[StrategyAnalysis] Fetched ${allFetchedTrades.length} total trades`);
      
      // Filter to only include trades with valid 64-character hashes (exclude old numeric hashes like "1", "3", etc.)
      const validTrades = allFetchedTrades.filter((trade: any) => {
        const hash = trade.strategy_hash;
        return hash && typeof hash === 'string' && hash.length === 64;
      });
      
      console.log(`[StrategyAnalysis] ${validTrades.length} trades have valid strategy hashes (filtered out ${allFetchedTrades.length - validTrades.length} old trades)`);

      if (!validTrades || validTrades.length === 0) {
        setStrategies([]);
        setAllTrades([]);
        setLoading(false);
        return;
      }

      setAllTrades(validTrades);

      // Group trades by ACTUAL config values only - these are the settings that define a unique strategy
      // Only use values that are user-configurable, not runtime indicator values
      const strategyMap = new Map<string, any[]>();
      
      // Create config key from ALL user-configurable settings (not runtime indicator values)
      // Use nullish coalescing to ensure consistent key even when fields are undefined/null
      const getConfigKey = (snapshot: any) => {
        const config = {
          // EMA settings
          ema_enabled: snapshot.ema_enabled ?? null,
          ema_fast: snapshot.ema_fast ?? null,
          ema_medium: snapshot.ema_medium ?? null,
          ema_slow: snapshot.ema_slow ?? null,
          ema_medium_trend: snapshot.ema_medium_trend ?? null,
          ema_trend_hard_filter: snapshot.ema_trend_hard_filter ?? null,
          min_ema_spread_percent: snapshot.min_ema_spread_percent ?? null,
          // RSI settings
          rsi_enabled: snapshot.rsi_enabled ?? null,
          rsi_period: snapshot.rsi_period ?? null,
          rsi_overbought: snapshot.rsi_overbought ?? null,
          rsi_oversold: snapshot.rsi_oversold ?? null,
          rsi_min_long: snapshot.rsi_min_long ?? null,
          rsi_max_short: snapshot.rsi_max_short ?? null,
          rsi_zone_width: snapshot.rsi_zone_width ?? null,
          rsi_momentum_periods: snapshot.rsi_momentum_periods ?? null,
          // MACD settings (macd_signal in old snapshots contains runtime value, use macd_signal_period for new trades)
          macd_enabled: snapshot.macd_enabled ?? null,
          macd_fast: snapshot.macd_fast ?? null,
          macd_slow: snapshot.macd_slow ?? null,
          macd_signal_period: snapshot.macd_signal_period ?? null, // Only use the explicit config field, ignore runtime macd_signal
          macd_histogram_threshold: snapshot.macd_histogram_threshold ?? null,
          macd_direction_enabled: snapshot.macd_direction_enabled ?? null,
          macd_color_change_hard_filter: snapshot.macd_color_change_hard_filter ?? null,
          histogram_momentum_enabled: snapshot.histogram_momentum_enabled ?? null,
          histogram_momentum_periods: snapshot.histogram_momentum_periods ?? null,
          // Bollinger Bands
          bb_enabled: snapshot.bb_enabled ?? null,
          bb_period: snapshot.bb_period ?? null,
          bb_std_dev: snapshot.bb_std_dev ?? null,
          // ATR settings
          atr_enabled: snapshot.atr_enabled ?? null,
          atr_period: snapshot.atr_period ?? null,
          atr_stop_loss_multiplier: snapshot.atr_stop_loss_multiplier ?? null,
          atr_take_profit_multiplier: snapshot.atr_take_profit_multiplier ?? null,
          atr_trailing_stop_multiplier: snapshot.atr_trailing_stop_multiplier ?? null,
          break_even_atr: snapshot.break_even_atr ?? null,
          min_atr: snapshot.min_atr ?? null,
          min_atr_percent: snapshot.min_atr_percent ?? null,
          atr_base_min: snapshot.atr_base_min ?? null,
          atr_floor: snapshot.atr_floor ?? null,
          atr_ceiling: snapshot.atr_ceiling ?? null,
          adaptive_atr_enabled: snapshot.adaptive_atr_enabled ?? null,
          trailing_stop_activation_enabled: snapshot.trailing_stop_activation_enabled ?? null,
          trailing_stop_activation_atr: snapshot.trailing_stop_activation_atr ?? null,
          // ADX settings
          adx_enabled: snapshot.adx_enabled ?? null,
          adx_period: snapshot.adx_period ?? null,
          adx_threshold: snapshot.adx_threshold ?? null,
          adx_base_min: snapshot.adx_base_min ?? null,
          adx_floor: snapshot.adx_floor ?? null,
          adx_ceiling: snapshot.adx_ceiling ?? null,
          adaptive_adx_enabled: snapshot.adaptive_adx_enabled ?? null,
          // Volume settings
          volume_enabled: snapshot.volume_enabled ?? null,
          volume_avg_period: snapshot.volume_avg_period ?? null,
          volume_multiplier: snapshot.volume_multiplier ?? null,
          // StochRSI settings
          stochrsi_enabled: snapshot.stochrsi_enabled ?? null,
          stochrsi_period: snapshot.stochrsi_period ?? null,
          stochrsi_k_period: snapshot.stochrsi_k_period ?? null,
          stochrsi_d_period: snapshot.stochrsi_d_period ?? null,
          stochrsi_overbought: snapshot.stochrsi_overbought ?? null,
          stochrsi_oversold: snapshot.stochrsi_oversold ?? null,
          // Pivot Points
          pivot_points_enabled: snapshot.pivot_points_enabled ?? null,
          pivot_points_lookback: snapshot.pivot_points_lookback ?? null,
          pivot_points_near_threshold: snapshot.pivot_points_near_threshold ?? null,
          pivot_points_timeframe: snapshot.pivot_points_timeframe ?? null,
          // Position & Risk
          leverage: snapshot.leverage ?? null,
          position_size_percent: snapshot.position_size_percent ?? null,
          risk_per_trade_percent: snapshot.risk_per_trade_percent ?? null,
          max_open_positions: snapshot.max_open_positions ?? null,
          max_exposure_percent: snapshot.max_exposure_percent ?? null,
          daily_loss_limit_percent: snapshot.daily_loss_limit_percent ?? null,
          max_position_duration_minutes: snapshot.max_position_duration_minutes ?? null,
          // Signal requirements
          signal_conditions_required: snapshot.signal_conditions_required ?? null,
          // Candle & momentum
          candle_momentum_enabled: snapshot.candle_momentum_enabled ?? null,
          min_candle_body_percent: snapshot.min_candle_body_percent ?? null,
          // Auto exit & higher trend
          auto_exit_enabled: snapshot.auto_exit_enabled ?? null,
          higher_trend_enabled: snapshot.higher_trend_enabled ?? null,
          // Timeframes
          scan_interval: snapshot.scan_interval ?? null,
          trend_timeframe: snapshot.trend_timeframe ?? null,
          higher_trend_timeframe: snapshot.higher_trend_timeframe ?? null,
          klines_limit: snapshot.klines_limit ?? null,
        };
        return JSON.stringify(config);
      };
      
      // Debug: Log first few trades to see what config keys are generated
      const debugTrades = validTrades.slice(0, 3);
      debugTrades.forEach((trade: any, i: number) => {
        const snapshot = trade.indicators_snapshot || {};
        const configKey = getConfigKey(snapshot);
        console.log(`[DEBUG] Trade ${i} (${trade.id.slice(0,8)}):`, 
          'signal_req=', snapshot.signal_conditions_required, 
          'leverage=', snapshot.leverage,
          'scan=', snapshot.scan_interval,
          'ema_fast=', snapshot.ema_fast,
          'configKey length=', configKey.length
        );
      });
      
      // Check if first two trades have same config - show ALL differences
      if (debugTrades.length >= 2) {
        const key1 = getConfigKey(debugTrades[0].indicators_snapshot || {});
        const key2 = getConfigKey(debugTrades[1].indicators_snapshot || {});
        console.log('[DEBUG] Keys match?', key1 === key2);
        if (key1 !== key2) {
          // Find ALL differences, not just first
          const obj1 = JSON.parse(key1);
          const obj2 = JSON.parse(key2);
          const diffs: string[] = [];
          for (const k of Object.keys(obj1)) {
            if (JSON.stringify(obj1[k]) !== JSON.stringify(obj2[k])) {
              diffs.push(`${k}: ${JSON.stringify(obj1[k])} vs ${JSON.stringify(obj2[k])}`);
            }
          }
          console.log('[DEBUG] ALL differences between trade 0 and 1:', diffs);
        }
      }
      
      validTrades.forEach((trade: any) => {
        const snapshot = trade.indicators_snapshot || {};
        const configKey = getConfigKey(snapshot);
        if (!strategyMap.has(configKey)) {
          strategyMap.set(configKey, []);
        }
        strategyMap.get(configKey)!.push({ ...trade, _configKey: configKey });
      });
      
      console.log('[StrategyAnalysis] Unique config keys:', strategyMap.size);

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
      
      for (const [configKey, strategyTrades] of sortedHashes) {
        const winningTrades = strategyTrades.filter(t => t.pnl > 0);
        const losingTrades = strategyTrades.filter(t => t.pnl <= 0);
        const totalPnl = strategyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const avgPnl = totalPnl / strategyTrades.length;
        
        // Assign sequential strategy numbers
        const strategyNumber = nextStrategyNumber++;
        
        stats.push({
          strategy_hash: configKey, // Use configKey as identifier
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

      // Pick the most active strategy in the last 24 hours using configKey
      const recentWindowMs = 24 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const recentTrades = validTrades.filter((t: any) => t.closed_at && (nowMs - new Date(t.closed_at).getTime()) <= recentWindowMs);
      if (recentTrades.length > 0) {
        const recentCounts: Record<string, number> = {};
        for (const t of recentTrades) {
          const snapshot = t.indicators_snapshot || {};
          const configKey = getConfigKey(snapshot);
          recentCounts[configKey] = (recentCounts[configKey] || 0) + 1;
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

      console.debug('[StrategyAnalysis] active detection', { activeStrategyHash: activeHash, source, totalStrategies: stats.length, totalTrades: validTrades.length });

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
