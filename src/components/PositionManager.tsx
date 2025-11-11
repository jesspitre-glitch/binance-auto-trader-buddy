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

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timeInterval);
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
        <CardContent>
          {positions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Ingen åbne positioner</p>
          ) : (
            <div className="space-y-4">
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
                    className="flex items-center justify-between border rounded-lg p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {position.side === "LONG" ? (
                          <TrendingUp className="h-5 w-5 text-profit" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-loss" />
                        )}
                        <div>
                          <div className="font-semibold">{position.symbol}</div>
                          <Badge variant={position.side === "LONG" ? "default" : "secondary"}>
                            {position.side}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="text-sm space-y-1">
                        <div>Entry: <span className="font-mono">${position.entry_price}</span></div>
                        <div>
                          Current: <span className="font-mono">
                            ${livePrices[position.symbol] ?? position.current_price ?? "..."}
                          </span>
                        </div>
                        <div>Quantity: <span className="font-mono">{position.quantity}</span></div>
                        {position.open_reason && (
                          <div className="text-xs text-muted-foreground mt-1 max-w-xs">
                            <span className="font-semibold">Åbnet: </span>
                            {position.open_reason}
                          </div>
                        )}
                      </div>
                      
                      <div className="text-sm space-y-1">
                        <div>SL: <span className="font-mono">${position.stop_loss}</span></div>
                        <div>TP: <span className="font-mono">${position.take_profit}</span></div>
                        {position.trailing_stop && (() => {
                          // Trailing stop is only active if peak has moved in profit direction
                          const peakPrice = Number(position.peak_price) || Number(position.entry_price);
                          const entryPrice = Number(position.entry_price);
                          const isTrailing = position.side === "LONG" 
                            ? peakPrice > entryPrice * 1.001 // At least 0.1% profit for LONG
                            : peakPrice < entryPrice * 0.999; // At least 0.1% profit for SHORT
                          return (
                            <>
                              <div className="flex items-center gap-2">
                                <span>Trail:</span>
                                <span className="font-mono">${Number(position.trailing_stop).toFixed(4)}</span>
                                {isTrailing && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-profit/10 text-profit border-profit/20">
                                    AKTIV
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Peak: <span className="font-mono">${peakPrice.toFixed(4)}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className={`text-lg font-bold ${isProfitable ? "text-profit" : "text-loss"}`}>
                          {isProfitable ? "+" : ""}{pnl.toFixed(2)} USDT
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Senest pris: {priceUpdatedAt[position.symbol] ? formatDistanceToNow(new Date(priceUpdatedAt[position.symbol]), { addSuffix: true, locale: da }) : 'venter...'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Åbnet: {formatDistanceToNow(new Date(openedTime), { addSuffix: true, locale: da })}
                        </div>
                      </div>
                      
                      <Button
                        size="icon"
                        variant="ghost"
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
                        <BarChart2 className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => closePosition(position)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
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
