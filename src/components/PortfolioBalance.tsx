import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, TrendingUp, Wallet } from "lucide-react";

interface SlotPnL {
  slotId: string;
  name: string;
  pnl: number;
}

interface PortfolioBalanceProps {
  slotId?: string | null;
  includeLegacyData?: boolean;
  slots?: { id: string; name: string }[];
}

export const PortfolioBalance = ({ slotId, includeLegacyData, slots }: PortfolioBalanceProps) => {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [totalPnLFromTrades, setTotalPnLFromTrades] = useState<number>(0);
  const [slotPnLs, setSlotPnLs] = useState<SlotPnL[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const latestRequestRef = useRef(0);
  const syncInFlightRef = useRef(false);

  const fetchPortfolio = async () => {
    const requestId = ++latestRequestRef.current;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (requestId === latestRequestRef.current) {
          setPortfolio(null);
          setTotalPnLFromTrades(0);
        }
        return;
      }

      // Fetch portfolio balance
      const { data, error } = await supabase
        .from("user_portfolio")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (requestId !== latestRequestRef.current) return;
      setPortfolio(data);

      // Fetch trades with pagination, filtered by slot if applicable
      let allPnL = 0;
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let pnlQuery = supabase
          .from("trade_history")
          .select("pnl")
          .eq("user_id", user.id);

        if (slotId) {
          pnlQuery = includeLegacyData
            ? pnlQuery.or(`slot_id.eq.${slotId},slot_id.is.null`)
            : pnlQuery.eq("slot_id", slotId);
        }

        const { data: pnlData, error: pnlError } = await pnlQuery
          .range(offset, offset + pageSize - 1);

        if (pnlError) throw pnlError;

        if (requestId !== latestRequestRef.current) return;

        if (pnlData && pnlData.length > 0) {
          allPnL += pnlData.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
          offset += pageSize;
          hasMore = pnlData.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      if (requestId === latestRequestRef.current) {
        setTotalPnLFromTrades(allPnL);
      }

      // If showing "Samlet Overblik" (no slotId), fetch per-slot breakdown
      if (!slotId && slots && slots.length > 0) {
        const perSlot: SlotPnL[] = [];
        for (const slot of slots) {
          let slotTotal = 0;
          let sOffset = 0;
          let sMore = true;
          while (sMore) {
            const { data: sData, error: sErr } = await supabase
              .from("trade_history")
              .select("pnl")
              .eq("user_id", user.id)
              .eq("slot_id", slot.id)
              .range(sOffset, sOffset + pageSize - 1);
            if (sErr) throw sErr;
            if (requestId !== latestRequestRef.current) return;
            if (sData && sData.length > 0) {
              slotTotal += sData.reduce((s, t) => s + (t.pnl || 0), 0);
              sOffset += pageSize;
              sMore = sData.length === pageSize;
            } else {
              sMore = false;
            }
          }
          perSlot.push({ slotId: slot.id, name: slot.name, pnl: slotTotal });
        }
        if (requestId === latestRequestRef.current) {
          setSlotPnLs(perSlot);
        }
      }
    } catch (error: any) {
      console.error("Portfolio fetch error:", error);
    } finally {
      if (requestId === latestRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const syncBalance = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    if (!silent) {
      setSyncing(true);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke(
        "sync-binance-futures-positions",
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (error) throw error;

      if (!silent) {
        toast({
          title: "Synkroniseret",
          description: "Balance er opdateret fra Binance",
        });
      }

      fetchPortfolio();
    } catch (error: any) {
      console.error("Binance sync error:", error);

      if (!silent) {
        toast({
          title: "Fejl",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      syncInFlightRef.current = false;

      if (!silent) {
        setSyncing(false);
      }
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchPortfolio();
    syncBalance({ silent: true });
    
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let mounted = true;
    
    // Delay subscription to not block initial render
    const timer = window.setTimeout(() => {
      if (!mounted) return;
      channel = supabase
        .channel("portfolio-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_portfolio",
          },
          () => {
            if (mounted) fetchPortfolio();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "trade_history",
          },
          () => {
            if (mounted) fetchPortfolio();
          }
        )
        .subscribe();
    }, 500);

    const syncTimer = window.setInterval(() => {
      if (mounted) {
        syncBalance({ silent: true });
      }
    }, 5000);

    return () => {
      mounted = false;
      latestRequestRef.current += 1;
      window.clearTimeout(timer);
      window.clearInterval(syncTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [slotId, includeLegacyData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const futuresCapital = portfolio?.futures_capital || 0;
  const deposited = portfolio?.futures_deposited || 0;
  const withdrawn = portfolio?.futures_withdrawn || 0;
  const netDeposits = deposited - withdrawn;

  // Binance live data (synced every 5s)
  const binanceUnrealizedPnL = portfolio?.binance_unrealized_pnl ?? null;
  const binanceMarginBalance = portfolio?.binance_total_margin_balance ?? null;
  const binanceSyncedAt = portfolio?.binance_synced_at ?? null;
  const hasBinanceLive = binanceUnrealizedPnL !== null && binanceSyncedAt !== null;

  // Realized P&L from trade history
  const totalPnL = totalPnLFromTrades;
  const pnlPercent = futuresCapital > 0 ? (totalPnL / futuresCapital) * 100 : 0;
  const binancePnLPercent = futuresCapital > 0 && binanceUnrealizedPnL !== null
    ? (binanceUnrealizedPnL / futuresCapital) * 100
    : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Portfolio Balance</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncBalance()}
          disabled={syncing}
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" />
              <span>Total Margin Balance</span>
              {hasBinanceLive && (
                <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">LIVE</span>
              )}
            </div>
            <div className="text-2xl font-bold">
              ${(binanceMarginBalance ?? futuresCapital).toFixed(2)} USDC
            </div>
          </div>

          {hasBinanceLive && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span>Unrealized P&L (Binance LIVE)</span>
                <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">LIVE</span>
              </div>
              <div
                className={`text-2xl font-bold ${
                  binanceUnrealizedPnL >= 0 ? "text-profit" : "text-loss"
                }`}
              >
                {binanceUnrealizedPnL >= 0 ? "+" : ""}
                ${binanceUnrealizedPnL.toFixed(2)} USDC
                <span className="text-sm ml-2">
                  ({binancePnLPercent >= 0 ? "+" : ""}
                  {binancePnLPercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span>Realized P&L (alle trades)</span>
            </div>
            <div
              className={`text-2xl font-bold ${
                totalPnL >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {totalPnL >= 0 ? "+" : ""}
              ${totalPnL.toFixed(2)} USDC
              <span className="text-sm ml-2">
                ({pnlPercent >= 0 ? "+" : ""}
                {pnlPercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Net Deposits</div>
            <div className="text-lg font-semibold">
              ${netDeposits.toFixed(2)} USDC
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">
              {hasBinanceLive ? "Binance Synced" : "Last Updated"}
            </div>
            <div className="text-sm">
              {binanceSyncedAt
                ? new Date(binanceSyncedAt).toLocaleString("da-DK", { timeZone: "UTC" }) + " UTC"
                : portfolio?.updated_at
                ? new Date(portfolio.updated_at).toLocaleString("da-DK", { timeZone: "UTC" }) + " UTC"
                : "Aldrig"}
            </div>
          </div>
        </div>

        {/* Per-slot P&L breakdown in Samlet Overblik */}
        {!slotId && slotPnLs.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm font-medium text-muted-foreground mb-2">P&L pr. Slot</div>
            <div className="grid gap-2 md:grid-cols-2">
              {slotPnLs.map((sp) => (
                <div key={sp.slotId} className="flex items-center justify-between rounded-md border p-2">
                  <span className="text-sm font-medium">{sp.name}</span>
                  <span className={`text-sm font-bold ${sp.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                    {sp.pnl >= 0 ? "+" : ""}${sp.pnl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};