import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

type LogRow = {
  id: string;
  event_type: string;
  symbol: string;
  side: string | null;
  binance_qty: number | null;
  db_qty_sum: number | null;
  diff: number | null;
  binance_unrealized_profit: number | null;
  created_at: string;
};

type OrphanPos = {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  recovery_reason: string | null;
};

export const ReconciliationPanel = () => {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [orphans, setOrphans] = useState<OrphanPos[]>([]);
  const [binanceUPnL, setBinanceUPnL] = useState<number>(0);

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const sb = supabase as any;
    const [{ data: logRows }, { data: orphanRows }, { data: portfolio }] = await Promise.all([
      sb.from("reconciliation_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      sb.from("positions").select("id, symbol, side, quantity, entry_price, current_price, unrealized_pnl, recovery_reason").eq("user_id", user.id).eq("status", "OPEN").eq("is_orphan_recovery", true),
      sb.from("user_portfolio").select("binance_unrealized_pnl").eq("user_id", user.id).maybeSingle(),
    ]);

    setLogs((logRows as any) || []);
    setOrphans((orphanRows as any) || []);
    setBinanceUPnL(Number(portfolio?.binance_unrealized_pnl) || 0);
  };

  useEffect(() => {
    fetchAll();
    const i = window.setInterval(fetchAll, 10000);
    return () => window.clearInterval(i);
  }, []);

  const orphanPnLSum = orphans.reduce((s, o) => s + (Number(o.unrealized_pnl) || 0), 0);
  const hasCritical = logs.some((l) => l.event_type === "DB_BINANCE_QTY_MISMATCH_CRITICAL");

  if (orphans.length === 0 && logs.length === 0) return null;

  return (
    <Card className="border-yellow-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {hasCritical ? <ShieldAlert className="h-4 w-4 text-loss" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
          Binance Reconciliation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Binance Open PnL</div>
            <div className={`font-bold ${binanceUPnL >= 0 ? "text-profit" : "text-loss"}`}>${binanceUPnL.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Orphan PnL</div>
            <div className={`font-bold ${orphanPnLSum >= 0 ? "text-profit" : "text-loss"}`}>${orphanPnLSum.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Orphan rows</div>
            <div className="font-bold">{orphans.length}</div>
          </div>
        </div>

        {orphans.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">Active orphan recovery</div>
            {orphans.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded border border-yellow-500/20 bg-yellow-500/5 px-2 py-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-yellow-500 text-yellow-500 text-[10px]">ORPHAN</Badge>
                  <span className="font-mono text-xs">{o.symbol} {o.side}</span>
                  <span className="text-xs text-muted-foreground">qty {Number(o.quantity).toFixed(6)} @ {Number(o.entry_price).toFixed(4)}</span>
                </div>
                <span className={`text-xs font-bold ${(o.unrealized_pnl ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                  {(o.unrealized_pnl ?? 0) >= 0 ? "+" : ""}${(Number(o.unrealized_pnl) || 0).toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        )}

        {logs.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">Recent events</div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {logs.slice(0, 10).map((l) => {
                const critical = l.event_type === "DB_BINANCE_QTY_MISMATCH_CRITICAL";
                const recovered = l.event_type === "ORPHAN_EXPOSURE_RECOVERED";
                return (
                  <div key={l.id} className="flex items-center gap-2 text-[11px]">
                    {critical ? <ShieldAlert className="h-3 w-3 text-loss" /> : recovered ? <CheckCircle2 className="h-3 w-3 text-profit" /> : <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                    <span className="font-mono">{l.symbol}</span>
                    <span className="text-muted-foreground">{l.event_type}</span>
                    <span className="text-muted-foreground">B={Number(l.binance_qty || 0).toFixed(4)} DB={Number(l.db_qty_sum || 0).toFixed(4)} Δ={Number(l.diff || 0).toFixed(4)}</span>
                    <span className="ml-auto text-muted-foreground">{new Date(l.created_at).toLocaleTimeString("da-DK", { timeZone: "UTC" })} UTC</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
