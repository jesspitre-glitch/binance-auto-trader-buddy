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
      'TRAILING_STOP_HIT': 'trailing_stop',
      'BREAK_EVEN': 'break_even',
      'STOP_LOSS': 'stop_loss',
      'TIMEOUT': 'timeout',
      'MANUAL': 'manual',
      'TAKE_PROFIT': 'take_profit'
    };
    const exitReason = exitReasonMap[t.close_reason] || t.close_reason?.toLowerCase() || 'unknown';

    // Calculate ATR% from snapshot
    const atrPct = snap.atr_percent ?? (snap.atr && snap.price ? (snap.atr / snap.price) * 100 : null);
    
    // Get EMA spread from snapshot
    const emaSpread = snap.ema_spread_percent ?? snap.emaSpreadPercent ?? null;

    // Get BB values - either from flattened fields or bb object
    const bbUpper = snap.bb_upper ?? snap.bb?.upper ?? null;
    const bbMiddle = snap.bb_middle ?? snap.bb?.middle ?? null;
    const bbLower = snap.bb_lower ?? snap.bb?.lower ?? null;

    // Get soft conditions from new or old format
    const side = t.side?.toLowerCase() || 'long';
    const softEmaTrend = snap.soft_ema_trend ?? snap.conditionDetails?.ema?.[side] ?? null;
    const softStoch = snap.soft_stochrsi ?? snap.conditionDetails?.stochRSI?.[side] ?? null;
    const softMacdColor = snap.soft_macd_color ?? snap.conditionDetails?.macd?.[side] ?? null;
    const softBb = snap.soft_bb ?? snap.conditionDetails?.bb?.[side] ?? null;
    const softVolume = snap.soft_volume ?? snap.conditionDetails?.volume?.[side] ?? null;
    const softPivot = snap.soft_pivot ?? snap.conditionDetails?.pivotPoints?.[side] ?? null;

    // For old trades: if trade was opened, hard filters must have passed (infer true)
    // Check if we have explicit filter status, otherwise infer from trade existing
    const hasExplicitFilterStatus = snap.atr_filter_passed !== undefined;
    
    // Volume multiplier hard filter tri-state (null = ikke evalueret)
    const volumeEnabled = snap.volume_enabled === true;
    const volumeCurrent = (snap.volume ?? snap.volume_current) ?? null;
    const volumeAvg = (snap.avgVolume ?? snap.volume_avg) ?? null;
    const volumeMultiplier = snap.volume_multiplier ?? null;
    const volumeMultiplierFilterPassedTriState = volumeEnabled !== true
      ? null
      : (volumeCurrent == null || volumeAvg == null || volumeMultiplier == null)
        ? null
        : (volumeCurrent >= volumeAvg * volumeMultiplier);

    
    // ADX filter: check if adx >= adx_threshold
    const adxFilterInferred = snap.adx && snap.adx_threshold
      ? snap.adx >= snap.adx_threshold
      : true;
    
    // ATR filter: infer from atr > 0
    const atrFilterInferred = snap.atr ? snap.atr > 0 : true;
    
    // MACD schema (CONFIG vs RUNTIME)
    // NOTE: snap.macd_signal i snapshots er ofte CONFIG-perioden (fx 9) og må IKKE eksporteres som "MACD_signal".
    const macdSignalPeriod = snap.macd_signal_period ?? (Number.isInteger(snap.macd_signal) ? snap.macd_signal : null);
    const macdLine = snap.macd_line ?? snap.macdLine ?? null;
    const macdSignalLine = snap.macd_signal_line ?? snap.macdSignalLine ?? null;
    const macdHistogram = snap.macd_histogram ?? snap.macdHistogram ?? snap.macd ?? null;

    // MACD direction filter inference: compare macd_line vs macd_signal_line (not vs 0)
    const macdDirInferred = (macdLine != null && macdSignalLine != null)
      ? (side === 'long' ? macdLine > macdSignalLine : macdLine < macdSignalLine)
      : null;

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
      EMA_fast: snap.emaFast != null ? +Number(snap.emaFast).toFixed(4) : null,
      EMA_medium: snap.emaMedium != null ? +Number(snap.emaMedium).toFixed(4) : null,
      EMA_slow: snap.emaSlow != null ? +Number(snap.emaSlow).toFixed(4) : null,
      EMA_spread_pct: emaSpread != null ? +Number(emaSpread).toFixed(4) : null,

      // MACD (entydigt schema)
      macd_signal_period: macdSignalPeriod,
      macd_line: macdLine != null ? +Number(macdLine).toFixed(12) : null,
      macd_signal_line: macdSignalLine != null ? +Number(macdSignalLine).toFixed(12) : null,
      macd_histogram: macdHistogram != null ? +Number(macdHistogram).toFixed(12) : null,
      MACD_direction_filter_passed: snap.macd_direction_filter_passed ?? snap.macd_direction_passed ?? macdDirInferred,
      MACD_color_change_passed: softMacdColor,

      // ATR
      ATR_value: snap.atr != null ? +Number(snap.atr).toFixed(6) : null,
      ATR_pct: atrPct != null ? +Number(atrPct).toFixed(4) : null,
      ATR_filter_passed: snap.atr_filter_passed ?? atrFilterInferred,

      // ADX
      ADX_value: snap.adx != null ? +Number(snap.adx).toFixed(2) : null,
      ADX_filter_passed: snap.adx_filter_passed ?? adxFilterInferred,

      // Volume
      volume_current: volumeCurrent != null ? +Number(volumeCurrent).toFixed(2) : null,
      volume_avg: volumeAvg != null ? +Number(volumeAvg).toFixed(2) : null,
      volume_multiplier_filter_passed: snap.volume_multiplier_filter_passed !== undefined
        ? snap.volume_multiplier_filter_passed
        : volumeMultiplierFilterPassedTriState,

      // StochRSI
      stoch_rsi_k: snap.stochRSI_k != null ? +Number(snap.stochRSI_k).toFixed(2) : null,
      stoch_rsi_d: snap.stochRSI_d != null ? +Number(snap.stochRSI_d).toFixed(2) : null,
      stoch_rsi_zone_passed: snap.stochrsi_zone_passed ?? softStoch,

      // Bollinger Bands
      bollinger_upper: bbUpper != null ? +Number(bbUpper).toFixed(4) : null,
      bollinger_middle: bbMiddle != null ? +Number(bbMiddle).toFixed(4) : null,
      bollinger_lower: bbLower != null ? +Number(bbLower).toFixed(4) : null,
      bollinger_signal_passed: softBb,

      // Soft conditions
      soft_ema_trend_passed: softEmaTrend,
      soft_stoch_passed: softStoch,
      soft_macd_color_passed: softMacdColor,
      soft_bb_passed: softBb,
      soft_volume_passed: softVolume,
      soft_pivot_passed: softPivot,
      soft_conditions_total: snap.conditionsMet ?? (side === 'long' 
        ? snap.conditionDetails?.longConditionsMet 
        : snap.conditionDetails?.shortConditionsMet) ?? null,

      // Break-even & Trailing stop
      break_even_triggered: snap.break_even_activated ?? t.break_even_activated ?? false,
      break_even_at_price: snap.break_even_price != null ? +Number(snap.break_even_price).toFixed(4) : null,
      trailing_stop_trigger_price: (snap.trailing_stop_initial ?? snap.trailing_stop) != null ? +Number(snap.trailing_stop_initial ?? snap.trailing_stop).toFixed(4) : null,
      trailing_stop_atr_multiplier: snap.atr_trailing_stop_multiplier ?? null,

      // Trend data - for old trades infer from side (if trade was opened, trend matched direction)
      trend_medium: snap.trend_medium ?? snap.trend ?? (side === 'long' ? 'BULLISH' : 'BEARISH'),
      trend_higher: snap.trend_higher ?? (side === 'long' ? 'BULLISH' : 'BEARISH'),

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

  // Format med linjeskift mellem handler ved ca. 2500 tegn for nemmere AI-læsning
  const formatWithLineBreaks = (data: any): string => {
    const summaryStr = JSON.stringify({ summary: data.summary });
    const tradesFormatted: string[] = [];
    
    let currentChunk = "";
    
    for (const trade of data.trades) {
      const tradeStr = JSON.stringify(trade);
      
      // Hvis currentChunk + denne handel > 2500 tegn, start ny linje
      if (currentChunk.length > 0 && (currentChunk.length + tradeStr.length + 1) > 2500) {
        tradesFormatted.push(currentChunk);
        currentChunk = tradeStr;
      } else {
        currentChunk = currentChunk.length > 0 ? currentChunk + "," + tradeStr : tradeStr;
      }
    }
    
    // Tilføj sidste chunk
    if (currentChunk.length > 0) {
      tradesFormatted.push(currentChunk);
    }
    
    // Byg final output med linjeskift mellem chunks
    return summaryStr.slice(0, -1) + ',"trades":[\n' + tradesFormatted.join(',\n') + '\n]}'
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
        // Use UTC time to match database timestamps
        const cutoffMs = Date.now() - (parseInt(filterValue) * 24 * 60 * 60 * 1000);
        const cutoff = new Date(cutoffMs);
        query = query.gte("closed_at", cutoff.toISOString());
      } else if (filterType === "hours") {
        // Use UTC time to match database timestamps
        const cutoffMs = Date.now() - (parseInt(filterValue) * 60 * 60 * 1000);
        const cutoff = new Date(cutoffMs);
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
      const jsonStr = formatWithLineBreaks(compressed);
      
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
