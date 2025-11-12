import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Copy, Check, Settings } from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
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
    const tradesText = trades.map(t => 
      `${t.symbol}\t${t.side}\t${format(new Date(t.opened_at), 'dd/MM/yyyy HH:mm', { locale: da })}\t${format(new Date(t.closed_at), 'dd/MM/yyyy HH:mm', { locale: da })}\t${t.entry_price}\t${t.exit_price}\t${t.pnl.toFixed(2)}\t${t.pnl_percent.toFixed(2)}%\t${t.duration_minutes || 0}m\t${t.close_reason || ''}`
    ).join('\n');
    
    const header = 'Symbol\tSide\tÅbnet\tLukket\tEntry\tExit\tPnL\tPnL%\tVarighed\tÅrsag\n';
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

      // Hent eksisterende configs
      const { data: existingConfigs } = await supabase
        .from("indicator_config")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const configPayload = {
        ...indicators,
        user_id: user.id,
        name: `Strategy ${strategyHash.substring(0, 8)}`,
        enabled: false, // Disabled by default so user can review
      };

      let result;
      if (existingConfigs && existingConfigs.length > 0) {
        // Update existing config
        result = await supabase
          .from("indicator_config")
          .update(configPayload)
          .eq("id", existingConfigs[0].id);
      } else {
        // Create new config
        result = await supabase
          .from("indicator_config")
          .insert(configPayload);
      }

      if (result.error) throw result.error;

      toast({
        title: "Implementeret!",
        description: "Indikator værdierne er gemt i din config (disabled som standard)",
      });
    } catch (error: any) {
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
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              Strategi Detaljer
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                {strategyHash.substring(0, 12)}...
              </code>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-full pr-4">
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Trades</div>
                  <div className="text-2xl font-bold">{stats.total_trades}</div>
                  <div className="text-xs text-muted-foreground">{stats.winning_trades}W / {stats.losing_trades}L</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                  <div className={`text-2xl font-bold ${stats.win_rate >= 50 ? "text-success" : "text-destructive"}`}>
                    {stats.win_rate.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Total PnL</div>
                  <div className={`text-2xl font-bold ${stats.total_pnl >= 0 ? "text-success" : "text-destructive"}`}>
                    ${stats.total_pnl.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Avg PnL</div>
                  <div className={`text-2xl font-bold ${stats.avg_pnl >= 0 ? "text-success" : "text-destructive"}`}>
                    ${stats.avg_pnl.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Indikator Konfiguration */}
            {Object.keys(indicators).length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex flex-col">
                    <CardTitle>Indikator Konfiguration</CardTitle>
                    {indicatorSource && (
                      <span className="text-xs text-muted-foreground">Kilde: {indicatorSource === 'trade' ? 'Trade snapshot' : indicatorSource === 'position' ? 'Position snapshot' : 'Seneste config'}</span>
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
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(indicators).map(([key, value]: [string, any]) => (
                      <div key={key} className="border rounded p-3">
                        <div className="text-xs text-muted-foreground mb-1">
                          {key.replace(/_/g, ' ')}
                        </div>
                        <div className="font-mono font-bold">
                          {typeof value === 'number' ? value.toFixed(2) : String(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Trades Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Alle Trades ({trades.length})</CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={copyTradesToClipboard}
                >
                  {copiedTrades ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copiedTrades ? "Kopieret" : "Kopier til Clipboard"}
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
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
                        <TableHead className="text-right">Varighed</TableHead>
                        <TableHead>Årsag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map((trade) => (
                        <TableRow key={trade.id}>
                          <TableCell className="font-medium">{trade.symbol}</TableCell>
                          <TableCell>
                            <Badge variant={trade.side === "LONG" ? "default" : "secondary"}>
                              {trade.side === "LONG" ? (
                                <TrendingUp className="h-3 w-3 mr-1" />
                              ) : (
                                <TrendingDown className="h-3 w-3 mr-1" />
                              )}
                              {trade.side}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {format(new Date(trade.opened_at), 'dd/MM/yyyy HH:mm', { locale: da })}
                          </TableCell>
                          <TableCell className="text-xs">
                            {format(new Date(trade.closed_at), 'dd/MM/yyyy HH:mm', { locale: da })}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            ${trade.entry_price}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            ${trade.exit_price}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${trade.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                            {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right ${trade.pnl_percent >= 0 ? "text-success" : "text-destructive"}`}>
                            {trade.pnl_percent >= 0 ? "+" : ""}{trade.pnl_percent.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right text-xs">
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
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
