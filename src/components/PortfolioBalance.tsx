import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, TrendingUp, Wallet } from "lucide-react";

export const PortfolioBalance = () => {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const fetchPortfolio = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("user_portfolio")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      setPortfolio(data);
    } catch (error: any) {
      console.error("Portfolio fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
    
    // Realtime subscription
    const channel = supabase
      .channel("portfolio-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_portfolio",
        },
        () => {
          fetchPortfolio();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const syncBalance = async () => {
    setSyncing(true);
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

      toast({
        title: "Synkroniseret",
        description: "Balance er opdateret fra Binance",
      });

      fetchPortfolio();
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
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

  const futuresCapital = portfolio?.futures_capital || 0;
  const deposited = portfolio?.futures_deposited || 0;
  const withdrawn = portfolio?.futures_withdrawn || 0;
  const netDeposits = deposited - withdrawn;
  const totalPnL = futuresCapital - netDeposits;
  const pnlPercent = netDeposits > 0 ? (totalPnL / netDeposits) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Portfolio Balance</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={syncBalance}
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
            </div>
            <div className="text-2xl font-bold">
              ${futuresCapital.toFixed(2)} USDT
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span>Total P&L</span>
            </div>
            <div
              className={`text-2xl font-bold ${
                totalPnL >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {totalPnL >= 0 ? "+" : ""}
              ${totalPnL.toFixed(2)} USDT
              <span className="text-sm ml-2">
                ({pnlPercent >= 0 ? "+" : ""}
                {pnlPercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Net Deposits</div>
            <div className="text-lg font-semibold">
              ${netDeposits.toFixed(2)} USDT
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Last Updated</div>
            <div className="text-sm">
              {portfolio?.updated_at
                ? new Date(portfolio.updated_at).toLocaleString("da-DK")
                : "Aldrig"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};