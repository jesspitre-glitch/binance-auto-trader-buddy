import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, Activity, Hash, CheckCircle2 } from "lucide-react";
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

interface StrategyStats {
  strategy_hash: string;
  config_name: string;
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

export const StrategyAnalysis = () => {
  const [strategies, setStrategies] = useState<StrategyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<{ stats: StrategyStats; trades: any[] } | null>(null);
  const [allTrades, setAllTrades] = useState<any[]>([]);
  const [activeStrategyHash, setActiveStrategyHash] = useState<string | null>(null);
  const [activeConfigName, setActiveConfigName] = useState<string | null>(null);
  const [activeConfigUpdatedAt, setActiveConfigUpdatedAt] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchStrategyStats = async () => {
    try {
      setLoading(true);
      
      // Bestem aktiv strategi ud fra sessionens aktive konfiguration (foretrukket)
      let activeHash: string | null = null;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: sessionRow } = await supabase
          .from("trading_session")
          .select("active_config_id, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .single();

        if (sessionRow?.active_config_id) {
          const { data: configData } = await supabase
            .from("indicator_config")
            .select("name, updated_at")
            .eq("id", sessionRow.active_config_id)
            .maybeSingle();
          activeHash = String(sessionRow.active_config_id);
          setActiveConfigName(configData?.name ?? null);
          setActiveConfigUpdatedAt(configData?.updated_at ?? null);
        }
      }

      if (!activeHash) {
        // Fallback: find dominerende strategi blandt åbne positioner
        const { data: openPositions } = await supabase
          .from("positions")
          .select("strategy_hash")
          .eq("status", "OPEN")
          .order("opened_at", { ascending: false });

        const openHashes = (openPositions || [])
          .map((p: any) => p.strategy_hash)
          .filter(Boolean) as string[];

        if (openHashes.length) {
          const counts: Record<string, number> = {};
          openHashes.forEach((h) => (counts[h] = (counts[h] || 0) + 1));
          activeHash = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
          setActiveConfigName(null);
        }
      }
      
      console.debug("[StrategyAnalysis] activeHash resolved =", activeHash);
      setActiveStrategyHash(activeHash);
      
      // Hent alle trades med strategy_hash (filtrer gamle uden hash)
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

      // Store all trades for dialog
      setAllTrades(trades);

      // Hent konfig-navne map for at vise navn for UUID-baserede strategier
      const { data: configList } = await supabase
        .from("indicator_config")
        .select("id, name");
      const nameById: Record<string, string> = Object.fromEntries(
        (configList || []).map((c: any) => [String(c.id), String(c.name)])
      );
      const idByName: Record<string, string> = Object.fromEntries(
        (configList || []).map((c: any) => [String(c.name), String(c.id)])
      );

      // Group trades by strategy_hash
      const strategyMap = new Map<string, any[]>();
      trades.forEach((trade: any) => {
        const snapshot = (trade.indicators_snapshot || null) as any;
        let key: string;

        if (snapshot && snapshot.id) {
          key = String(snapshot.id);
        } else if (trade.strategy_hash && /^[0-9a-fA-F-]{36}$/.test(String(trade.strategy_hash))) {
          key = String(trade.strategy_hash);
        } else if (trade.strategy_hash && idByName[String(trade.strategy_hash)]) {
          key = idByName[String(trade.strategy_hash)];
        } else {
          key = String(trade.strategy_hash);
        }

        if (!strategyMap.has(key)) {
          strategyMap.set(key, []);
        }
        strategyMap.get(key)!.push(trade);
      });

      // Calculate stats for each strategy
      const stats: StrategyStats[] = [];
      
      for (const [hash, strategyTrades] of strategyMap.entries()) {
        const winningTrades = strategyTrades.filter(t => t.pnl > 0);
        const losingTrades = strategyTrades.filter(t => t.pnl <= 0);
        const totalPnl = strategyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const avgPnl = totalPnl / strategyTrades.length;
        
        // Intelligent navn-mapping:
        let displayName: string;

        if (nameById[hash]) {
          // UUID matcher en konfiguration – brug det menneskelige navn
          displayName = nameById[hash];
        } else if (/^[a-zA-Z0-9]{1,3}$/.test(hash)) {
          // Simpelt tal/navn (ældre strategier)
          displayName = hash;
        } else {
          // Fallback: kort UUID/hash
          displayName = `#${String(hash).substring(0, 6)}`;
        }
        
        stats.push({
          strategy_hash: hash,
          config_name: displayName,
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

      // Sort by total PnL descending
      stats.sort((a, b) => b.total_pnl - a.total_pnl);
      
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

    // Subscribe to trade_history and positions changes
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Strategi Performance Oversigt
            </CardTitle>
            {activeStrategyHash && (
              <Badge variant="default" className="gap-2 px-3 py-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-mono text-sm">
                  Aktiv: {activeConfigName || (activeStrategyHash ? activeStrategyHash.slice(0, 8) : "-")}
                </span>
              </Badge>
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
                  <TableHead className="w-[200px]">Strategi</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Win Rate</TableHead>
                  <TableHead className="text-right">Total PnL</TableHead>
                  <TableHead className="text-right">Avg PnL</TableHead>
                  <TableHead className="text-right">Største Win</TableHead>
                  <TableHead className="text-right">Største Tab</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {strategies
                  .sort((a, b) => {
                    // Sorter så aktiv strategi er øverst
                    if (a.strategy_hash === activeStrategyHash) return -1;
                    if (b.strategy_hash === activeStrategyHash) return 1;
                    return b.total_pnl - a.total_pnl;
                  })
                  .map((strategy) => (
                  <TableRow 
                    key={strategy.strategy_hash}
                    className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                      strategy.strategy_hash === activeStrategyHash 
                        ? "bg-primary/10 border-l-4 border-l-primary font-semibold" 
                        : ""
                    }`}
                    onClick={() => setSelectedStrategy({ 
                      stats: strategy, 
                      trades: allTrades.filter(t => t.strategy_hash === strategy.strategy_hash) 
                    })}
                  >
                    <TableCell className="w-[200px]">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">
                            {strategy.config_name}
                          </span>
                          {strategy.strategy_hash === activeStrategyHash && (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
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
                      <div className={`text-sm font-medium ${strategy.win_rate >= 50 ? "text-success" : "text-destructive"}`}>
                        {strategy.win_rate.toFixed(1)}%
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`text-sm font-bold flex items-center justify-end gap-1 ${strategy.total_pnl >= 0 ? "text-success" : "text-destructive"}`}>
                        {strategy.total_pnl >= 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        ${strategy.total_pnl.toFixed(2)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`text-sm ${strategy.avg_pnl >= 0 ? "text-success" : "text-destructive"}`}>
                        ${strategy.avg_pnl.toFixed(2)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm text-success">
                        ${strategy.largest_win.toFixed(2)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm text-destructive">
                        ${strategy.largest_loss.toFixed(2)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
