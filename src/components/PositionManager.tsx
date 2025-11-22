import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, X, BarChart2 } from "lucide-react";
import { useBinanceFuturesPrices } from "@/hooks/useBinanceFuturesPrices";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { TradeDetailsDialog } from "./TradeDetailsDialog";

export const PositionManager = () => {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const { toast } = useToast();

  const fetchPositions = async () => {
    try {
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false });

      if (error) throw error;
      setPositions(data || []);
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
    fetchPositions();
    
    // Realtime subscription for DB changes (open/close/status)
    const channel = supabase
      .channel("positions-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "positions",
        },
        () => {
          fetchPositions();
        }
      )
      .subscribe();

    // Update time every second for live relative times
    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    // Fetch positions every 15 seconds to get latest trailing stop updates
    const positionsInterval = setInterval(() => {
      fetchPositions();
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timeInterval);
      clearInterval(positionsInterval);
    };
  }, []);

  // Live Binance prices for open symbols
  const symbols = positions.map((p) => p.symbol).filter(Boolean);
  const { prices: livePrices, updatedAt: priceUpdatedAt } = useBinanceFuturesPrices(symbols);

  const closePosition = async (position: any) => {
    try {
      toast({ title: "Lukker på Binance...", description: position.symbol });
      const { data, error } = await supabase.functions.invoke('close-position-binance', {
        body: { symbol: position.symbol },
      });
      if (error) throw error;
      toast({ title: "Lukket og synkroniseret", description: `${position.symbol} lukket på Binance` });
      // fetchPositions will be triggered by realtime, but also force refresh
      fetchPositions();
    } catch (error: any) {
      toast({ title: "Fejl ved lukning", description: error.message, variant: "destructive" });
    }
  };

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
          <CardTitle>Åbne Positioner ({positions.length})</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[120px]">
          {positions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Ingen åbne positioner</p>
          ) : (
            <div className="space-y-3 md:space-y-4">
              {positions.map((position) => {
                const pnlLiveBase = (() => {
                  const live = livePrices[position.symbol];
                  const price = live ?? position.current_price ?? position.entry_price;
                  return position.side === "LONG"
                    ? (price - position.entry_price) * position.quantity
                    : (position.entry_price - price) * position.quantity;
                })();
                const pnl = Number.isFinite(pnlLiveBase) ? pnlLiveBase : (position.unrealized_pnl || 0);
                const isProfitable = pnl >= 0;
                
                const openedTime = new Date(position.opened_at).getTime();
                
                return (
                  <div
                    key={position.id}
                    className="flex flex-col md:flex-row md:items-center justify-between border rounded-lg p-3 md:p-4 gap-3 md:gap-0"
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {position.side === "LONG" ? (
                          <TrendingUp className="h-6 w-6 md:h-5 md:w-5 text-profit" />
                        ) : (
                          <TrendingDown className="h-6 w-6 md:h-5 md:w-5 text-loss" />
                        )}
                        <div>
                          <div className="font-semibold text-base md:text-sm">{position.symbol}</div>
                          <Badge variant={position.side === "LONG" ? "default" : "secondary"} className="text-xs">
                            {position.side}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="text-sm space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <div>Entry: <span className="font-mono">${position.entry_price}</span></div>
                          <div>
                            Current: <span className="font-mono">
                              ${livePrices[position.symbol] ?? position.current_price ?? "..."}
                            </span>
                          </div>
                          <div>Qty: <span className="font-mono">{position.quantity}</span></div>
                        </div>
                        {position.open_reason && (
                          <div className="text-xs text-muted-foreground mt-1 truncate">
                            <span className="font-semibold">Åbnet: </span>
                            {position.open_reason}
                          </div>
                        )}
                      </div>
                      
                       <div className="text-sm space-y-1 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <span>SL:</span>
                          <span className="font-mono">${position.stop_loss}</span>
                          {position.break_even_activated && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-500/10 text-blue-500 border-blue-500/20">
                              BREAK-EVEN
                            </Badge>
                          )}
                        </div>
                        {position.trailing_stop && (() => {
                          const trailingPercent = position.trailing_stop_percent || 2.0;
                          const trailingStopPrice = Number(position.trailing_stop);
                          
                          return (
                            <div className="border-t pt-2 mt-2 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold">Trailing Stop:</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-profit/10 text-profit border-profit/20">
                                  AKTIV
                                </Badge>
                              </div>
                              <div className="text-sm font-mono font-bold text-foreground">
                                ${trailingStopPrice.toFixed(4)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {trailingPercent.toFixed(1)}% fra peak
                              </div>
                              {position.peak_price && (
                                <div className="text-xs text-muted-foreground">
                                  Peak: <span className="font-mono">${Number(position.peak_price).toFixed(4)}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 w-full md:w-auto">
                      <div className="text-left md:text-right flex-1 md:flex-none">
                        <div className={`text-xl md:text-lg font-bold ${isProfitable ? "text-profit" : "text-loss"}`}>
                          {isProfitable ? "+" : ""}{pnl.toFixed(2)} USDT
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Pris: {priceUpdatedAt[position.symbol] ? formatDistanceToNow(new Date(priceUpdatedAt[position.symbol]), { addSuffix: true, locale: da }) : 'venter...'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Åbnet: {formatDistanceToNow(new Date(openedTime), { addSuffix: true, locale: da })}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-10 w-10 md:h-9 md:w-9"
                          onClick={() => {
                          // Convert position to trade-like format for dialog
                          const tradeView = {
                            ...position,
                            exit_price: livePrices[position.symbol] ?? position.current_price,
                            pnl: pnl,
                            pnl_percent: ((pnl / (position.entry_price * position.quantity)) * 100),
                            closed_at: new Date().toISOString(),
                            duration_minutes: Math.floor((Date.now() - openedTime) / (1000 * 60)),
                            indicators_snapshot: null,
                            open_reason: position.open_reason,
                            close_reason: null, // Still open
                          };
                          setSelectedPosition(tradeView);
                        }}
                        >
                          <BarChart2 className="h-5 w-5 md:h-4 md:w-4" />
                        </Button>
                        
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-10 w-10 md:h-9 md:w-9"
                          onClick={() => closePosition(position)}
                        >
                          <X className="h-5 w-5 md:h-4 md:w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPosition && (
        <TradeDetailsDialog
          trade={selectedPosition}
          isOpen={!!selectedPosition}
          onClose={() => setSelectedPosition(null)}
        />
      )}
    </>
  );
};
