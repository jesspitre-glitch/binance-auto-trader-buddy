import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, X } from "lucide-react";
import { getBinanceTimeAgo } from "@/lib/timeUtils";
import { TradeDetailsDialog } from "./TradeDetailsDialog";
import { ExportTradesDialog } from "./ExportTradesDialog";

export const TradeHistoryTable = () => {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  const { toast } = useToast();

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from("trade_history")
        .select("*")
        .neq("close_reason", "DUPLICATE")
        .order("closed_at", { ascending: false });

      if (error) throw error;
      setTrades(data || []);
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
    fetchTrades();
    
    // Realtime subscription
    const channel = supabase
      .channel("trade-history-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trade_history",
        },
        () => {
          fetchTrades();
        }
      )
      .subscribe();

    // Also refetch when tab/window becomes visible (in case realtime is delayed)
    const onVis = () => {
      if (!document.hidden) fetchTrades();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVis);
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lukkede Handler ({trades.length})</CardTitle>
            <ExportTradesDialog />
          </div>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Ingen lukkede handler endnu</p>
          ) : (
            <div className="space-y-2">
              {trades.map((trade) => {
                const isProfitable = trade.pnl >= 0;
                
                return (
                  <div
                    key={trade.id}
                    onClick={() => setSelectedTrade(trade)}
                    className="flex items-center justify-between border rounded-lg p-3 hover:bg-accent cursor-pointer transition-colors"
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
                          {getBinanceTimeAgo(trade.closed_at)}
                        </div>
                      </div>
                      <Badge variant={trade.side === "LONG" ? "default" : "secondary"} className="text-xs">
                        {trade.side}
                      </Badge>
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-loss/20 border border-loss/40">
                        <X className="h-3.5 w-3.5 text-loss" />
                      </div>
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
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTrade && (
        <TradeDetailsDialog
          trade={selectedTrade}
          isOpen={!!selectedTrade}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </>
  );
};
