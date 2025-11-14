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

    // Formater indicators_snapshot til læsbare værdier
    const formatIndicators = (snapshot: any) => {
      if (!snapshot) return null;
      
      return {
        // EMA værdier
        "EMA Fast (9)": snapshot.emaFast?.toFixed(2),
        "EMA Medium (21)": snapshot.emaMedium?.toFixed(2),
        "EMA Slow (50)": snapshot.emaSlow?.toFixed(2),
        "EMA Trend (50)": snapshot.ema_medium_trend?.toFixed(2),
        
        // RSI værdier
        "RSI Period": snapshot.rsi_period || 14,
        "RSI Værdi": snapshot.rsi?.toFixed(2),
        "RSI Min Long": snapshot.rsi_min_long || 30,
        "RSI Max Short": snapshot.rsi_max_short || 70,
        "RSI Overbought": snapshot.rsi_overbought || 80,
        "RSI Oversold": snapshot.rsi_oversold || 30,
        
        // MACD værdier
        "MACD Fast": snapshot.macd_fast || 12,
        "MACD Slow": snapshot.macd_slow || 26,
        "MACD Signal": snapshot.macd_signal || 9,
        "MACD Histogram": snapshot.macd?.toFixed(6),
        "MACD Threshold": snapshot.macd_histogram_threshold || 0,
        
        // ATR værdier
        "ATR Period": snapshot.atr_period || 14,
        "ATR Værdi": snapshot.atr?.toFixed(2),
        "ATR Stop Loss Multiplier": snapshot.atr_stop_loss_multiplier || 2.8,
        "ATR Trailing Stop Multiplier": snapshot.atr_trailing_stop_multiplier || 2.0,
        "ATR Break Even": snapshot.break_even_atr || 0.8,
        "ATR Take Profit Multiplier": snapshot.atr_take_profit_multiplier || 0,
        
        // ADX værdier
        "ADX Period": snapshot.adx_period || 14,
        "ADX Værdi": snapshot.adx?.toFixed(2),
        "ADX Threshold": snapshot.adx_threshold || 40,
        
        // Volume
        "Volume": snapshot.volume?.toFixed(2),
        "Volume Average": snapshot.avgVolume?.toFixed(2),
        "Volume Avg Period": snapshot.volume_avg_period || 20,
        
        // Pivot Points
        "Pivot Points PP": snapshot.pivotPoints?.pp?.toFixed(2),
        "Pivot Points R1": snapshot.pivotPoints?.r1?.toFixed(2),
        "Pivot Points R2": snapshot.pivotPoints?.r2?.toFixed(2),
        "Pivot Points R3": snapshot.pivotPoints?.r3?.toFixed(2),
        "Pivot Points S1": snapshot.pivotPoints?.s1?.toFixed(2),
        "Pivot Points S2": snapshot.pivotPoints?.s2?.toFixed(2),
        "Pivot Points S3": snapshot.pivotPoints?.s3?.toFixed(2),
        "Pivot Points Timeframe": snapshot.pivot_points_timeframe,
        "Pivot Points Lookback": snapshot.pivot_points_lookback,
        "Pivot Points Near Threshold": snapshot.pivot_points_near_threshold,
        
        // Config værdier
        "Scan Interval": snapshot.scan_interval,
        "Trend Timeframe": snapshot.trend_timeframe,
        "Higher Trend Timeframe": snapshot.higher_trend_timeframe,
        "Klines Limit": snapshot.klines_limit,
        "Leverage": snapshot.leverage,
        "Position Size Percent": snapshot.position_size_percent,
        "Risk Per Trade Percent": snapshot.risk_per_trade_percent,
        "Max Open Positions": snapshot.max_open_positions,
        "Max Position Duration Minutes": snapshot.max_position_duration_minutes,
        "Max Exposure Percent": snapshot.max_exposure_percent,
        "Daily Loss Limit Percent": snapshot.daily_loss_limit_percent,
        "Signal Conditions Required": snapshot.signal_conditions_required,
        
        // Enabled flags
        "EMA Enabled": snapshot.ema_enabled,
        "RSI Enabled": snapshot.rsi_enabled,
        "StochRSI Enabled": snapshot.stochrsi_enabled,
        "MACD Enabled": snapshot.macd_enabled,
        "BB Enabled": snapshot.bb_enabled,
        "ATR Enabled": snapshot.atr_enabled,
        "ADX Enabled": snapshot.adx_enabled,
        "Volume Enabled": snapshot.volume_enabled,
        "Pivot Points Enabled": snapshot.pivot_points_enabled,
        
        // Price at time of trade
        "Price": snapshot.price?.toFixed(2),
        "Strategy Name": snapshot.name,
      };
    };

    const compressedTrades = trades.map(t => ({
      sym: t.symbol,
      side: t.side,
      entry: t.entry_price,
      exit: t.exit_price,
      pnl: t.pnl.toFixed(2),
      pnl_pct: t.pnl_percent.toFixed(2) + "%",
      dur: Math.round((new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 60000) + "m",
      open_reason: t.open_reason,
      close_reason: t.close_reason,
      opened_at: new Date(t.opened_at).toISOString(),
      closed_at: new Date(t.closed_at).toISOString(),
      // Inkluder ALLE indikator værdier med læsbare navne
      indicators: formatIndicators(t.indicators_snapshot)
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
