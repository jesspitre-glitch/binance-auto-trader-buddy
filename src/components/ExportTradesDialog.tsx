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
import { Textarea } from "@/components/ui/textarea";
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
  const [exportedData, setExportedData] = useState<string>("");
  const [showFallback, setShowFallback] = useState(false);
  const { toast } = useToast();

  const formatTradeForExport = (t: any) => {
    const snap = t.indicators_snapshot || {};
    const openedAt = new Date(t.opened_at);
    const closedAt = new Date(t.closed_at);
    const durationSec = Math.round((closedAt.getTime() - openedAt.getTime()) / 1000);

    // Map close_reason to standardized exit_reason
    const exitReasonMap: Record<string, string> = {
      'TRAILING_STOP': 'trailing_stop',
      'BREAK_EVEN': 'break_even',
      'STOP_LOSS': 'stop_loss',
      'TIMEOUT': 'timeout',
      'MANUAL': 'manual',
      'TAKE_PROFIT': 'take_profit'
    };
    const exitReason = exitReasonMap[t.close_reason] || t.close_reason?.toLowerCase() || 'unknown';

    return {
      // Core trade data
      symbol: t.symbol,
      side: t.side,
      entry_price: +t.entry_price,
      exit_price: +t.exit_price,
      pnl_abs: +(t.pnl?.toFixed(4) || 0),
      pnl_pct: +(t.pnl_percent?.toFixed(4) || 0),
      duration_seconds: durationSec,
      exit_reason: exitReason,

      // EMA
      EMA_fast: snap.emaFast ? +snap.emaFast.toFixed(4) : null,
      EMA_medium: snap.emaMedium ? +snap.emaMedium.toFixed(4) : null,
      EMA_slow: snap.emaSlow ? +snap.emaSlow.toFixed(4) : null,
      EMA_spread_pct: snap.ema_spread_percent ? +snap.ema_spread_percent.toFixed(4) : null,

      // MACD
      MACD_value: snap.macd ? +snap.macd.toFixed(6) : null,
      MACD_histogram: snap.macd_histogram ? +snap.macd_histogram.toFixed(6) : null,
      MACD_signal: snap.macd_signal ? +snap.macd_signal.toFixed(6) : null,
      MACD_direction_filter_passed: snap.macd_direction_passed ?? null,
      MACD_color_change_passed: snap.macd_color_change_passed ?? null,

      // ATR
      ATR_value: snap.atr ? +snap.atr.toFixed(6) : null,
      ATR_pct: snap.atr_percent ? +snap.atr_percent.toFixed(4) : null,
      ATR_filter_passed: snap.atr_filter_passed ?? null,

      // ADX
      ADX_value: snap.adx ? +snap.adx.toFixed(2) : null,
      ADX_filter_passed: snap.adx_filter_passed ?? null,

      // Volume
      volume_current: snap.volume ? +snap.volume.toFixed(2) : null,
      volume_avg: snap.avgVolume ? +snap.avgVolume.toFixed(2) : null,
      volume_multiplier_filter_passed: snap.volume_filter_passed ?? null,

      // StochRSI
      stoch_rsi_k: snap.stochRSI_k ? +snap.stochRSI_k.toFixed(2) : null,
      stoch_rsi_d: snap.stochRSI_d ? +snap.stochRSI_d.toFixed(2) : null,
      stoch_rsi_zone_passed: snap.stochrsi_zone_passed ?? null,

      // Bollinger Bands
      bollinger_upper: snap.bb_upper ? +snap.bb_upper.toFixed(4) : null,
      bollinger_middle: snap.bb_middle ? +snap.bb_middle.toFixed(4) : null,
      bollinger_lower: snap.bb_lower ? +snap.bb_lower.toFixed(4) : null,
      bollinger_signal_passed: snap.bb_signal_passed ?? null,

      // Soft conditions
      soft_ema_trend_passed: snap.soft_ema_trend ?? null,
      soft_stoch_passed: snap.soft_stochrsi ?? null,
      soft_macd_color_passed: snap.soft_macd_color ?? null,
      soft_bb_passed: snap.soft_bb ?? null,
      soft_volume_passed: snap.soft_volume ?? null,
      soft_pivot_passed: snap.soft_pivot ?? null,
      soft_conditions_total: snap.conditionsMet ?? null,

      // Break-even & Trailing stop
      break_even_triggered: snap.break_even_activated ?? t.break_even_activated ?? false,
      break_even_at_price: snap.break_even_price ? +snap.break_even_price.toFixed(4) : null,
      trailing_stop_trigger_price: snap.trailing_stop ? +snap.trailing_stop.toFixed(4) : null,
      trailing_stop_atr_multiplier: snap.atr_trailing_stop_multiplier ?? null,

      // Multi-timeframe ATR%
      atr_pct_1m: snap.atr_pct_1m ? +snap.atr_pct_1m.toFixed(4) : null,
      atr_pct_5m: snap.atr_pct_5m ? +snap.atr_pct_5m.toFixed(4) : null,
      atr_pct_15m: snap.atr_pct_15m ? +snap.atr_pct_15m.toFixed(4) : null,

      // Timestamps
      timestamp_open: openedAt.toISOString(),
      timestamp_close: closedAt.toISOString()
    };
  };

  const compressTradeData = (trades: any[]) => {
    const summary = {
      total_trades: trades.length,
      win_rate: ((trades.filter(t => t.pnl > 0).length / trades.length) * 100).toFixed(2) + "%",
      total_pnl: +trades.reduce((sum, t) => sum + t.pnl, 0).toFixed(4),
      avg_pnl: +(trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length).toFixed(4),
      period_from: new Date(trades[trades.length - 1].closed_at).toISOString(),
      period_to: new Date(trades[0].closed_at).toISOString()
    };

    return {
      summary,
      trades: trades.map(formatTradeForExport)
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
      
      // Try clipboard first, fallback to textarea on iOS/Safari
      try {
        await navigator.clipboard.writeText(jsonStr);
        
        toast({
          title: "Eksporteret til clipboard! ✓",
          description: `${trades.length} handler kopieret i kompakt format`,
        });
        
        setOpen(false);
      } catch (clipboardError) {
        // Clipboard failed (common on iOS) - show fallback
        console.log('Clipboard failed, showing fallback:', clipboardError);
        setExportedData(jsonStr);
        setShowFallback(true);
        
        toast({
          title: "Data klar til kopiering",
          description: "Tryk på tekstfeltet og vælg 'Kopier'",
        });
      }
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
          {!showFallback ? (
            <>
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
                <p>• Kompakt JSON med alle indikator-data</p>
                <p>• Inkluderer filter-status og soft conditions</p>
                <p>• Break-even, trailing stop, multi-TF ATR%</p>
              </div>

              <Button onClick={fetchAndExport} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Kopier til Clipboard
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="exportData">Eksporterede data - tryk og hold for at kopiere</Label>
                <Textarea
                  id="exportData"
                  value={exportedData}
                  readOnly
                  className="font-mono text-xs h-[400px]"
                  onClick={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.select();
                  }}
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    const textarea = document.getElementById('exportData') as HTMLTextAreaElement;
                    if (textarea) {
                      textarea.select();
                      try {
                        document.execCommand('copy');
                        toast({
                          title: "Kopieret!",
                          description: "Data er kopieret",
                        });
                      } catch (e) {
                        toast({
                          title: "Manuelt valg",
                          description: "Vælg alt tekst og kopier manuelt",
                        });
                      }
                    }
                  }}
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Kopier
                </Button>
                
                <Button 
                  onClick={() => {
                    setShowFallback(false);
                    setExportedData("");
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Tilbage
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
