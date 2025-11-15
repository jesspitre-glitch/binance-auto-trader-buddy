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
      cnt: trades.length,
      wr: ((trades.filter(t => t.pnl > 0).length / trades.length) * 100).toFixed(1) + "%",
      pnl: trades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2),
      avg: (trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length).toFixed(2),
      from: new Date(trades[trades.length - 1].closed_at).toISOString().split('T')[0],
      to: new Date(trades[0].closed_at).toISOString().split('T')[0]
    };

    const formatIndicators = (snapshot: any) => {
      if (!snapshot) return null;
      
      const compact: any = {};
      
      // EMA
      if (snapshot.emaFast) compact.ema9 = +snapshot.emaFast.toFixed(2);
      if (snapshot.emaMedium) compact.ema21 = +snapshot.emaMedium.toFixed(2);
      if (snapshot.emaSlow) compact.ema50 = +snapshot.emaSlow.toFixed(2);
      
      // RSI
      if (snapshot.rsi) compact.rsi = +snapshot.rsi.toFixed(2);
      if (snapshot.rsi_min_long) compact.rsi_l = snapshot.rsi_min_long;
      if (snapshot.rsi_max_short) compact.rsi_s = snapshot.rsi_max_short;
      
      // MACD
      if (snapshot.macd) compact.macd = +snapshot.macd.toFixed(6);
      if (snapshot.macd_histogram_threshold) compact.macd_th = snapshot.macd_histogram_threshold;
      
      // ATR
      if (snapshot.atr) compact.atr = +snapshot.atr.toFixed(2);
      if (snapshot.atr_stop_loss_multiplier) compact.atr_sl = snapshot.atr_stop_loss_multiplier;
      if (snapshot.atr_take_profit_multiplier) compact.atr_tp = snapshot.atr_take_profit_multiplier;
      if (snapshot.atr_trailing_stop_multiplier) compact.atr_ts = snapshot.atr_trailing_stop_multiplier;
      if (snapshot.break_even_atr) compact.atr_be = snapshot.break_even_atr;
      
      // ADX
      if (snapshot.adx) compact.adx = +snapshot.adx.toFixed(2);
      if (snapshot.adx_threshold) compact.adx_th = snapshot.adx_threshold;
      
      // Volume
      if (snapshot.volume) compact.vol = +snapshot.volume.toFixed(2);
      if (snapshot.avgVolume) compact.vol_avg = +snapshot.avgVolume.toFixed(2);
      
      // Pivot
      if (snapshot.pivotPoints) {
        compact.pp = {
          pp: snapshot.pivotPoints.pp?.toFixed(2),
          r1: snapshot.pivotPoints.r1?.toFixed(2),
          s1: snapshot.pivotPoints.s1?.toFixed(2)
        };
      }
      
      // Config
      if (snapshot.leverage) compact.lev = snapshot.leverage;
      if (snapshot.position_size_percent) compact.size = snapshot.position_size_percent;
      if (snapshot.signal_conditions_required) compact.sig_req = snapshot.signal_conditions_required;
      if (snapshot.price) compact.px = +snapshot.price.toFixed(2);
      
      // Enabled indicators (only true ones)
      const en: string[] = [];
      if (snapshot.ema_enabled) en.push("ema");
      if (snapshot.rsi_enabled) en.push("rsi");
      if (snapshot.macd_enabled) en.push("macd");
      if (snapshot.atr_enabled) en.push("atr");
      if (snapshot.adx_enabled) en.push("adx");
      if (snapshot.volume_enabled) en.push("vol");
      if (snapshot.pivot_points_enabled) en.push("pp");
      if (en.length > 0) compact.en = en;
      
      return compact;
    };

    const compressedTrades = trades.map(t => ({
      sym: t.symbol,
      sd: t.side,
      en: +t.entry_price,
      ex: +t.exit_price,
      pnl: +t.pnl.toFixed(2),
      pnl_p: +t.pnl_percent.toFixed(2),
      dur: Math.round((new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 60000),
      op_r: t.open_reason,
      cl_r: t.close_reason,
      op_t: new Date(t.opened_at).toISOString(),
      cl_t: new Date(t.closed_at).toISOString(),
      ind: formatIndicators(t.indicators_snapshot)
    }));

    return {
      sum: summary,
      trd: compressedTrades
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
      const jsonStr = JSON.stringify(compressed);
      
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
