import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, X, BarChart2 } from "lucide-react";
import { useBinanceFuturesPrices } from "@/hooks/useBinanceFuturesPrices";
import { getBinanceTimeAgo } from "@/lib/timeUtils";
import { TradeDetailsDialog } from "./TradeDetailsDialog";
import { RegimeIndicator } from "./RegimeIndicator";
import { ExportTradesDialog } from "./ExportTradesDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PositionManagerProps {
  slotId?: string | null;
  includeLegacyData?: boolean;
  slots?: { id: string; name: string; slot_number: number }[];
}

/**
 * Adaptiv pris-formattering: vælg antal decimaler ud fra prisens størrelse,
 * så low-cap coins som 1000BONK/PENGU får meningsfulde decimaler.
 */
const formatPrice = (price: number | null | undefined): string => {
  if (price == null || !Number.isFinite(Number(price))) return '-';
  const abs = Math.abs(Number(price));
  let digits: number;
  if (abs >= 1000) digits = 2;
  else if (abs >= 100) digits = 3;
  else if (abs >= 1) digits = 4;
  else if (abs >= 0.1) digits = 5;
  else if (abs >= 0.01) digits = 6;
  else if (abs >= 0.001) digits = 7;
  else digits = 8;
  return Number(price).toFixed(digits);
};

export const PositionManager = ({ slotId, includeLegacyData = false, slots = [] }: PositionManagerProps) => {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const [positionToClose, setPositionToClose] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const { toast } = useToast();

  const fetchConfig = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setConfig(null);
        return;
      }

      const { data, error } = await supabase
        .from("indicator_config")
        .select("*")
        .eq("user_id", user.id)
        .eq("enabled", true)
        .maybeSingle();
      
      if (error) throw error;
      setConfig(data);
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  };

  const fetchPositions = async () => {
    try {
      let query = supabase
        .from("positions")
        .select("*")
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false });

      if (slotId) {
        query = includeLegacyData
          ? query.or(`slot_id.eq.${slotId},slot_id.is.null`)
          : query.eq("slot_id", slotId);
      }

      const { data, error } = await query;

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
    fetchConfig();
    
    // Realtime subscription for DB changes - updates state directly without refetching
    const channel = supabase
      .channel("positions-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "positions",
        },
        (payload) => {
          if (payload.new.status === "OPEN") {
            setPositions((prev) => [payload.new, ...prev]);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "positions",
        },
        (payload) => {
          if (payload.new.status === "OPEN") {
            setPositions((prev) =>
              prev.map((p) => (p.id === payload.new.id ? payload.new : p))
            );
          } else {
            // Position closed, remove from list
            setPositions((prev) => prev.filter((p) => p.id !== payload.new.id));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "positions",
        },
        (payload) => {
          setPositions((prev) => prev.filter((p) => p.id !== payload.old.id));
        }
      )
      .subscribe();

    // Update time every second for live relative times
    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    // Safety-net: periodic refetch every 5s to guarantee sync with DB
    // even if realtime websocket drops or misses events.
    const refetchInterval = setInterval(() => {
      fetchPositions();
    }, 5000);

    // Refetch on tab visibility change (browser may pause realtime in background)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchPositions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timeInterval);
      clearInterval(refetchInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [slotId, includeLegacyData]);

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
                // Binance master: show live price stream, but keep P&L from DB sync as source of truth
                const livePrice = livePrices[position.symbol] ?? position.current_price ?? position.entry_price;
                const dbPnl = Number.isFinite(Number(position.unrealized_pnl)) ? Number(position.unrealized_pnl) : 0;
                const pnl = dbPnl;
                const isProfitable = pnl >= 0;
                
                // Live peak price calculation
                const dbPeakPrice = position.peak_price || position.entry_price;
                const livePeakPrice = position.side === "LONG"
                  ? Math.max(dbPeakPrice, livePrice)
                  : Math.min(dbPeakPrice, livePrice);
                
                // Get ATR-based configuration (used for status display)
                const atr = Number(position.indicators_snapshot?.atr) || 0;
                const trailingActivationAtr = Number(position.indicators_snapshot?.trailing_stop_activation_atr) || 1.0;
                const trailingActivationEnabled = position.indicators_snapshot?.trailing_stop_activation_enabled ?? true;
                const breakEvenAtr = Number(position.indicators_snapshot?.break_even_atr) || 1.0;
                const breakEvenEnabled = position.indicators_snapshot?.break_even_enabled ?? false;
                const breakEvenAtrModeEnabled = position.indicators_snapshot?.break_even_atr_enabled ?? true;
                const breakEvenProfitPctEnabled = position.indicators_snapshot?.break_even_profit_pct_enabled ?? false;
                const breakEvenProfitPctTrigger = Number(position.indicators_snapshot?.break_even_profit_pct_trigger) || 1.5;

                // Calculate profit distance in ATR
                const profitDistance = position.side === 'LONG'
                  ? livePrice - position.entry_price
                  : position.entry_price - livePrice;
                const profitInAtr = atr > 0 ? profitDistance / atr : 0;

                // Trigger-priser: hvad skal coin koste før BE/TS aktiveres
                // BE trigger: ATR-mode bruger entry ± (break_even_atr × ATR), pct-mode bruger entry × (1 ± trigger%)
                let breakEvenTriggerPrice: number | null = null;
                if (breakEvenEnabled && atr > 0) {
                  if (breakEvenAtrModeEnabled) {
                    breakEvenTriggerPrice = position.side === 'LONG'
                      ? position.entry_price + (breakEvenAtr * atr)
                      : position.entry_price - (breakEvenAtr * atr);
                  } else if (breakEvenProfitPctEnabled) {
                    breakEvenTriggerPrice = position.side === 'LONG'
                      ? position.entry_price * (1 + breakEvenProfitPctTrigger / 100)
                      : position.entry_price * (1 - breakEvenProfitPctTrigger / 100);
                  }
                }

                // TS trigger: entry ± (trailing_stop_activation_atr × ATR) — kræver også at BE er nået
                const trailingTriggerPrice = trailingActivationEnabled && atr > 0
                  ? (position.side === 'LONG'
                      ? position.entry_price + (trailingActivationAtr * atr)
                      : position.entry_price - (trailingActivationAtr * atr))
                  : null;

                // Distance fra nuværende pris til trigger (i % af entry)
                const distancePct = (target: number) => ((target - livePrice) / position.entry_price) * 100;

                // Backend source of truth flags/levels
                const originalStopLoss = Number(position.indicators_snapshot?.original_stop_loss ?? position.stop_loss);
                const isBreakEvenActivated = position.break_even_activated === true;
                const breakEvenLevel = Number(position.indicators_snapshot?.break_even_at_price ?? position.entry_price);

                const trailingStopDb = position.trailing_stop != null ? Number(position.trailing_stop) : null;
                const trailingInProfitZone = trailingStopDb != null
                  ? (position.side === 'LONG' ? trailingStopDb >= position.entry_price : trailingStopDb <= position.entry_price)
                  : false;

                // Trailing er AKTIV når backend har sat en trailing_stop og den er i profit-zonen
                // Dette er den korrekte source-of-truth fra backend
                const trailingIsActive = trailingStopDb != null && trailingInProfitZone;

                // Aktivt stop (til visning): TS (når aktiv) → BE → SL(max tab)
                const activeStopLevel = trailingIsActive
                  ? trailingStopDb!
                  : isBreakEvenActivated
                    ? breakEvenLevel
                    : originalStopLoss;

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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant={position.side === "LONG" ? "default" : "secondary"} className="text-xs">
                              {position.side}
                            </Badge>
                            {position.slot_id && slots.length > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                {slots.find(s => s.id === position.slot_id)?.name || 'Ukendt slot'}
                              </Badge>
                            )}
                            {config?.regime_router_enabled && position.indicators_snapshot && (
                              <RegimeIndicator
                                adx={position.indicators_snapshot.adx}
                                atrPercent={position.indicators_snapshot.atr && position.indicators_snapshot.price 
                                  ? (position.indicators_snapshot.atr / position.indicators_snapshot.price) * 100 
                                  : position.indicators_snapshot.atr_percent}
                                adxThreshold={config?.regime_adx_threshold}
                                atrPctThreshold={config?.regime_atr_pct_threshold}
                                method={config?.regime_method}
                                operator={config?.regime_operator}
                                enabled={config?.regime_router_enabled}
                                size="sm"
                                showDetails
                              />
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-sm space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <div>Entry: <span className="font-mono">${formatPrice(Number(position.entry_price))}</span></div>
                          <div>
                            Current: <span className="font-mono">
                              ${formatPrice(livePrice)}
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
                         <div className="space-y-1">
                           <div className="flex items-center gap-2">
                             <span className="text-xs font-semibold">SL (max tab):</span>
                             <span className="font-mono">${Number.isFinite(originalStopLoss) ? formatPrice(originalStopLoss) : '-'}</span>
                           </div>

                           <div className="flex items-center gap-2">
                             <span className="text-xs font-semibold">Aktivt stop:</span>
                             <span className="font-mono">${Number.isFinite(activeStopLevel) ? formatPrice(activeStopLevel) : '-'}</span>
                              {trailingIsActive ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-profit/10 text-profit border-profit/20">
                                  TRAILING
                                </Badge>
                              ) : isBreakEvenActivated ? (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${trailingIsActive ? 'bg-muted/10 text-muted-foreground border-muted/20 opacity-60' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>
                                  {trailingIsActive ? 'BE OVERTAGET' : 'BREAK-EVEN'}
                                </Badge>
                              ) : null}
                           </div>

                           {isBreakEvenActivated && (
                             <div className="flex items-center gap-2">
                               <span className="text-xs font-semibold">BE niveau:</span>
                               <span className="font-mono text-blue-500">${formatPrice(breakEvenLevel)}</span>
                             </div>
                           )}

                           {/* BE trigger-pris: hvad coin skal koste før BE aktiveres */}
                           {!isBreakEvenActivated && breakEvenTriggerPrice != null && Number.isFinite(breakEvenTriggerPrice) && (
                             <div className="flex items-center gap-2">
                               <span className="text-xs font-semibold">BE trigger:</span>
                               <span className="font-mono text-blue-500">${formatPrice(breakEvenTriggerPrice)}</span>
                               <span className="text-[10px] text-muted-foreground">
                                 ({position.side === 'LONG' ? '+' : ''}{distancePct(breakEvenTriggerPrice).toFixed(2)}%)
                               </span>
                             </div>
                           )}
                           {!isBreakEvenActivated && !breakEvenEnabled && (
                             <div className="text-[10px] text-muted-foreground italic">BE er slået fra i strategien</div>
                           )}
                         </div>

                          <div className="border-t pt-2 mt-2 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">Trailing:</span>
                               {/* Trailing er AKTIV når backend har sat en trailing_stop i DB og den er i profit-zonen */}
                               {trailingStopDb != null && trailingInProfitZone ? (
                                 <>
                                   <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-profit/10 text-profit border-profit/20">
                                     AKTIV
                                   </Badge>
                                   <span className="text-xs text-muted-foreground">({profitInAtr.toFixed(1)} ATR)</span>
                                 </>
                               ) : !isBreakEvenActivated ? (
                                 <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">
                                   STANDBY (afventer BE)
                                 </Badge>
                               ) : profitDistance <= 0 ? (
                                 <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">
                                   BLOKERET (ikke i profit)
                                 </Badge>
                               ) : trailingStopDb == null ? (
                                 <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                                   VENTER ({profitInAtr.toFixed(1)}/{trailingActivationAtr} ATR)
                                 </Badge>
                               ) : (
                                 <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-profit/10 text-profit border-profit/20">
                                   AKTIV
                                 </Badge>
                               )}
                             </div>
 
                             {trailingIsActive && trailingStopDb != null && (
                               <div className="text-sm font-mono font-bold text-profit">${formatPrice(trailingStopDb)}</div>
                             )}

                             {/* TS trigger-pris: hvad coin skal koste før trailing aktiveres */}
                             {!trailingIsActive && trailingTriggerPrice != null && Number.isFinite(trailingTriggerPrice) && (
                               <div className="flex items-center gap-2">
                                 <span className="text-xs font-semibold">TS trigger:</span>
                                 <span className="font-mono text-pink-500">${formatPrice(trailingTriggerPrice)}</span>
                                 <span className="text-[10px] text-muted-foreground">
                                   ({position.side === 'LONG' ? '+' : ''}{distancePct(trailingTriggerPrice).toFixed(2)}%)
                                 </span>
                               </div>
                             )}
                          </div>
                       </div>
                    </div>
                    
                    <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 w-full md:w-auto">
                      <div className="text-left md:text-right flex-1 md:flex-none">
                        <div className={`text-xl md:text-lg font-bold ${isProfitable ? "text-profit" : "text-loss"}`}>
                          {isProfitable ? "+" : ""}{pnl.toFixed(2)} USDT
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Pris: {priceUpdatedAt[position.symbol] ? getBinanceTimeAgo(new Date(priceUpdatedAt[position.symbol])) : 'venter...'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Åbnet: {getBinanceTimeAgo(new Date(openedTime))}
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
                          onClick={() => setPositionToClose(position)}
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

      <AlertDialog open={!!positionToClose} onOpenChange={(open) => !open && setPositionToClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Luk position?</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på, at du vil lukke positionen på{" "}
              <span className="font-semibold">{positionToClose?.symbol}</span>?
              <br />
              Denne handling kan ikke fortrydes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuller</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (positionToClose) {
                  closePosition(positionToClose);
                  setPositionToClose(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Luk position
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
