import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Copy, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ExportTradesDialogProps {
  strategyHash?: string;
  buttonVariant?: "default" | "outline" | "ghost";
  buttonSize?: "default" | "sm" | "lg" | "icon";
}

export const ExportTradesDialog = ({ 
  strategyHash, 
  buttonVariant = "outline",
  buttonSize = "sm" 
}: ExportTradesDialogProps) => {
  const [open, setOpen] = useState(false);
  const [filterType, setFilterType] = useState<"count" | "days" | "hours">("count");
  const [filterValue, setFilterValue] = useState("50");
  const { toast } = useToast();

  const compressTradeData = (trades: any[]) => {
    const summary = {
      total_trades: trades.length,
      win_rate: ((trades.filter(t => t.pnl > 0).length / trades.length) * 100).toFixed(1) + "%",
      total_pnl: trades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2) + " USDC",
      avg_pnl: (trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length).toFixed(2) + " USDC",
      period: `${new Date(trades[trades.length - 1].closed_at).toLocaleDateString('da-DK')} - ${new Date(trades[0].closed_at).toLocaleDateString('da-DK')}`,
    };

    const entryExitRules = trades[0]?.entry_conditions && trades[0]?.exit_conditions ? {
      entry: JSON.parse(trades[0].entry_conditions),
      exit: JSON.parse(trades[0].exit_conditions)
    } : { entry: "N/A", exit: "N/A" };

    const compressedTrades = trades.map(t => ({
      sym: t.symbol,
      side: t.side,
      entry: t.entry_price,
      exit: t.exit_price,
      pnl: t.pnl.toFixed(2),
      pnl_pct: t.pnl_percent.toFixed(2) + "%",
      dur: Math.round((new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 60000) + "m",
      reason: t.close_reason,
      indicators: t.indicators_snapshot ? {
        ema: {
          fast_9: t.indicators_snapshot.ema_fast,
          medium_21: t.indicators_snapshot.ema_medium,
          slow_50: t.indicators_snapshot.ema_slow,
          trend_50: t.indicators_snapshot.ema_medium_trend
        },
        rsi: {
          period_14: 14,
          value: t.indicators_snapshot.rsi,
          min_long: 20,
          max_short: 80,
          overbought: 80,
          oversold: 30
        },
        macd: {
          fast_12: 12,
          slow_26: 26,
          signal_9: 9,
          histogram: t.indicators_snapshot.macd,
          threshold: 0.0
        },
        atr: {
          period_14: 14,
          value: t.indicators_snapshot.atr,
          stop_loss_multiplier: 2.80,
          trailing_stop_multiplier: 2.00,
          break_even_atr: 0.8
        },
        adx: {
          period_14: 14,
          value: t.indicators_snapshot.adx,
          threshold: 40
        },
        volume: {
          avg_period_20: 20,
          value: t.indicators_snapshot.volume
        },
        config: {
          scan_interval: "1m",
          trend_timeframe: "5m",
          higher_trend_timeframe: "15m",
          klines_limit: 100,
          leverage: 3,
          position_size_percent: 20,
          risk_per_trade_percent: 5,
          max_positions: 5,
          max_duration_minutes: 240,
          signal_conditions_required: 3
        }
      } : null
    }));

    return {
      summary,
      entry_exit_rules: entryExitRules,
      trades: compressedTrades
    };
  };

  const fetchAndExport = async () => {
    try {
      let query = supabase
        .from("trade_history")
        .select("*")
        .order("closed_at", { ascending: false });

      if (strategyHash) {
        query = query.eq("strategy_hash", strategyHash);
      }

      if (filterType === "count") {
        query = query.limit(parseInt(filterValue));
      } else if (filterType === "days") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - parseInt(filterValue));
        query = query.gte("closed_at", cutoff.toISOString());
      } else if (filterType === "hours") {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - parseInt(filterValue));
        query = query.gte("closed_at", cutoff.toISOString());
      }

      const { data: trades, error } = await query;

      if (error) throw error;
      if (!trades || trades.length === 0) {
        toast({
          title: "Ingen handler",
          description: "Ingen handler fundet med de valgte kriterier",
          variant: "destructive",
        });
        return;
      }

      const compressed = compressTradeData(trades);
      const jsonStr = JSON.stringify(compressed, null, 2);
      
      await navigator.clipboard.writeText(jsonStr);
      
      toast({
        title: "Kopieret til clipboard",
        description: `${trades.length} handler kopieret i komprimeret format`,
      });
      
      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} size={buttonSize}>
          <Copy className="h-4 w-4 mr-2" />
          Eksporter til AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eksporter Handler til AI Analyse</DialogTitle>
          <DialogDescription>
            Vælg filter for hvilke handler du vil eksportere
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <RadioGroup value={filterType} onValueChange={(v) => setFilterType(v as any)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="count" id="count" />
              <Label htmlFor="count">Antal handler</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="days" id="days" />
              <Label htmlFor="days">Sidste X dage</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="hours" id="hours" />
              <Label htmlFor="hours">Sidste X timer</Label>
            </div>
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="value">
              {filterType === "count" ? "Antal" : filterType === "days" ? "Dage" : "Timer"}
            </Label>
            <Input
              id="value"
              type="number"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              min="1"
            />
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Handler bliver komprimeret til analyse-venligt format</p>
            <p>• Inkluderer entry/exit regler fra strategien</p>
            <p>• Kopieres direkte til clipboard</p>
          </div>
        </div>

        <Button onClick={fetchAndExport} className="w-full">
          <Download className="h-4 w-4 mr-2" />
          Kopier til Clipboard
        </Button>
      </DialogContent>
    </Dialog>
  );
};
