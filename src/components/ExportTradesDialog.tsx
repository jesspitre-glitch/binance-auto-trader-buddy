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

    // 🔴 SCHEMA VERSION CHECK - Determines which fields to use
    // v2+ = guaranteed fields, NO fallbacks
    // v1/undefined = legacy trades, fallbacks allowed
    const schemaVersion = snap.schema_version ?? 1;
    const isLegacy = schemaVersion < 2;

    // 🔴 V2 SCHEMA VALIDATION - Check guaranteed fields exist
    const schemaErrors: string[] = [];
    if (!isLegacy) {
      // MACD guaranteed fields
      if (snap.macd_signal_period === undefined) schemaErrors.push('macd_signal_period');
      if (snap.macd_line === undefined) schemaErrors.push('macd_line');
      if (snap.macd_signal_line === undefined) schemaErrors.push('macd_signal_line');
      if (snap.macd_histogram === undefined) schemaErrors.push('macd_histogram');
      
      // ATR (required for exits)
      if (snap.atr === undefined || snap.atr === null) schemaErrors.push('atr');
      if (snap.atr_percent === undefined) schemaErrors.push('atr_percent');
      
      // Break-even: if triggered, at_price must exist
      if (snap.break_even_activated === true && snap.break_even_at_price === null) {
        schemaErrors.push('break_even_at_price (BE activated but price null)');
      }
      
      // ADX audit (if ADX enabled)
      if (snap.adx_enabled === true && !snap.adx_audit) {
        schemaErrors.push('adx_audit (ADX enabled but audit missing)');
      }
      
      // Trailing stop exit audit (if exit reason is trailing_stop)
      const exitReason = t.close_reason?.toUpperCase() || '';
      if (exitReason.includes('TRAILING') && !snap.trailing_stop_exit_audit) {
        schemaErrors.push('trailing_stop_exit_audit (trailing exit but audit missing)');
      }
      
      // StochRSI separate fields
      if (snap.stochrsi_enabled === true) {
        if (snap.stochRSI_k === undefined) schemaErrors.push('stochRSI_k');
        if (snap.stochRSI_d === undefined) schemaErrors.push('stochRSI_d');
      }
      
      // Soft conditions total
      if (snap.soft_conditions_total === undefined) schemaErrors.push('soft_conditions_total');
      
      // Exit type flag
      if (snap.exit_type === undefined) schemaErrors.push('exit_type');
    }
    
    const hasSchemaError = schemaErrors.length > 0;
    const schemaErrorReason = hasSchemaError ? schemaErrors.join(', ') : null;

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

    // 🔴 V2 SCHEMA: Direct field access - NO FALLBACKS
    // 🔴 V1 LEGACY: Fallback to old field names
    
    // ATR percent
    const atrPct = isLegacy 
      ? (snap.atr_percent ?? (snap.atr && snap.price ? (snap.atr / snap.price) * 100 : null))
      : snap.atr_percent; // v2: must exist or null
    
    // EMA spread
    const emaSpread = isLegacy
      ? (snap.ema_spread_percent ?? snap.emaSpreadPercent ?? null)
      : snap.ema_spread_percent; // v2: direct

    // BB values
    const bbUpper = isLegacy ? (snap.bb_upper ?? snap.bb?.upper ?? null) : snap.bb_upper;
    const bbMiddle = isLegacy ? (snap.bb_middle ?? snap.bb?.middle ?? null) : snap.bb_middle;
    const bbLower = isLegacy ? (snap.bb_lower ?? snap.bb?.lower ?? null) : snap.bb_lower;

    // Soft conditions
    const side = t.side?.toLowerCase() || 'long';
    const softEmaTrend = isLegacy 
      ? (snap.soft_ema_trend_passed ?? snap.soft_ema_trend ?? snap.conditionDetails?.ema?.[side] ?? null)
      : snap.soft_ema_trend_passed;
    const softStoch = isLegacy 
      ? (snap.soft_stochrsi_passed ?? snap.soft_stochrsi ?? snap.conditionDetails?.stochRSI?.[side] ?? null)
      : snap.soft_stochrsi_passed;
    const softMacdHistogram = isLegacy 
      ? (snap.soft_macd_histogram_passed ?? snap.soft_macd_color ?? snap.conditionDetails?.macd?.[side] ?? null)
      : snap.soft_macd_histogram_passed;
    const softMacdMomentum = isLegacy
      ? (snap.soft_macd_momentum_passed ?? null)
      : snap.soft_macd_momentum_passed;
    const softBb = isLegacy 
      ? (snap.soft_bb_passed ?? snap.soft_bb ?? snap.conditionDetails?.bb?.[side] ?? null)
      : snap.soft_bb_passed;
    const softVolume = isLegacy 
      ? (snap.soft_volume_passed ?? snap.soft_volume ?? snap.conditionDetails?.volume?.[side] ?? null)
      : snap.soft_volume_passed;
    const softPivot = isLegacy 
      ? (snap.soft_pivot_passed ?? snap.soft_pivot ?? snap.conditionDetails?.pivotPoints?.[side] ?? null)
      : snap.soft_pivot_passed;

    // Volume multiplier tri-state
    const volumeCurrent = isLegacy 
      ? ((snap.volume ?? snap.volume_current) ?? null)
      : snap.volume_current;
    const volumeAvg = isLegacy 
      ? ((snap.avgVolume ?? snap.volume_avg) ?? null)
      : snap.volume_avg;

    // 🔴 V2: Use explicit filter status - NO inference
    // 🔴 V1: Fall back to inference
    const adxFilterPassed = isLegacy
      ? (snap.adx_filter_passed ?? (snap.adx && snap.adx_threshold ? snap.adx >= snap.adx_threshold : null))
      : snap.adx_filter_passed;
    
    const atrFilterPassed = isLegacy
      ? (snap.atr_filter_passed ?? (snap.atr ? snap.atr > 0 : null))
      : snap.atr_filter_passed;
    
    // 🔴 MACD SCHEMA - V2 har garanterede felter
    const macdSignalPeriod = isLegacy 
      ? (snap.macd_signal_period ?? (Number.isInteger(snap.macd_signal) ? snap.macd_signal : null))
      : snap.macd_signal_period; // v2: guaranteed int
    const macdLine = isLegacy 
      ? (snap.macd_line ?? snap.macdLine ?? null)
      : snap.macd_line; // v2: guaranteed
    const macdSignalLine = isLegacy 
      ? (snap.macd_signal_line ?? snap.macdSignalLine ?? null)
      : snap.macd_signal_line; // v2: guaranteed
    const macdHistogram = isLegacy 
      ? (snap.macd_histogram ?? snap.macdHistogram ?? snap.macd ?? null)
      : snap.macd_histogram; // v2: guaranteed

    // MACD direction filter
    const macdDirPassed = isLegacy
      ? (snap.macd_direction_passed ?? snap.macd_direction_filter_passed ?? 
         ((macdLine != null && macdSignalLine != null)
           ? (side === 'long' ? macdLine > macdSignalLine : macdLine < macdSignalLine)
           : null))
      : snap.macd_direction_passed; // v2: direct

    // StochRSI - v2 har separate felter
    const stochRsiK = isLegacy 
      ? (snap.stochRSI_k ?? snap.stochRSI?.k ?? null)
      : snap.stochRSI_k;
    const stochRsiD = isLegacy 
      ? (snap.stochRSI_d ?? snap.stochRSI?.d ?? null)
      : snap.stochRSI_d;

    // Break-even - v2 garanterer at break_even_at_price ikke er null når BE aktiveret
    const breakEvenTriggered = isLegacy
      ? (snap.break_even_activated ?? t.break_even_activated ?? false)
      : snap.break_even_activated;
    const breakEvenAtPrice = snap.break_even_at_price; // v2: guaranteed if BE triggered

    // Soft conditions total
    const softConditionsTotal = isLegacy
      ? (snap.soft_conditions_total ?? snap.conditionsMet ?? 
         (side === 'long' ? snap.conditionDetails?.longConditionsMet : snap.conditionDetails?.shortConditionsMet) ?? null)
      : snap.soft_conditions_total;

    // Trend data
    const trendMedium = isLegacy
      ? (snap.trend_medium ?? snap.trend ?? (side === 'long' ? 'BULLISH' : 'BEARISH'))
      : snap.trend_medium;
    const trendHigher = isLegacy
      ? (snap.trend_higher ?? (side === 'long' ? 'BULLISH' : 'BEARISH'))
      : snap.trend_higher;

    return {
      // 🔴 SCHEMA VERSION & VALIDATION
      schema_version: schemaVersion,
      is_legacy: isLegacy,
      schema_error: hasSchemaError,
      schema_error_reason: schemaErrorReason,

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
      MACD_direction_filter_passed: macdDirPassed,
      MACD_histogram_soft_passed: softMacdHistogram,
      MACD_momentum_soft_passed: softMacdMomentum,

      // ATR
      ATR_value: snap.atr != null ? +Number(snap.atr).toFixed(6) : null,
      ATR_pct: atrPct != null ? +Number(atrPct).toFixed(4) : null,
      ATR_filter_passed: atrFilterPassed,

      // ADX - med audit felter (v2 garanterer adx_audit hvis ADX enabled)
      ADX_value: snap.adx != null ? +Number(snap.adx).toFixed(2) : null,
      ADX_filter_passed: adxFilterPassed,
      ADX_audit: snap.adx_audit ? {
        adx_value: snap.adx_audit.adx_value,
        adx_period: snap.adx_audit.adx_period,
        adx_timeframe: snap.adx_audit.adx_timeframe,
        adx_floor_used: snap.adx_audit.adx_floor_used,
        adx_ceiling_used: snap.adx_audit.adx_ceiling_used,
        plus_di: snap.adx_audit.plus_di != null ? +Number(snap.adx_audit.plus_di).toFixed(2) : null,
        minus_di: snap.adx_audit.minus_di != null ? +Number(snap.adx_audit.minus_di).toFixed(2) : null,
        dx_instant: snap.adx_audit.dx_instant != null ? +Number(snap.adx_audit.dx_instant).toFixed(2) : null,
      } : null,

      // Volume
      volume_current: volumeCurrent != null ? +Number(volumeCurrent).toFixed(2) : null,
      volume_avg: volumeAvg != null ? +Number(volumeAvg).toFixed(2) : null,
      volume_multiplier_filter_passed: snap.volume_multiplier_filter_passed,

      // StochRSI (v2: separate k/d felter)
      stoch_rsi_k: stochRsiK != null ? +Number(stochRsiK).toFixed(2) : null,
      stoch_rsi_d: stochRsiD != null ? +Number(stochRsiD).toFixed(2) : null,
      stoch_rsi_zone_passed: isLegacy ? (snap.stochrsi_zone_passed ?? softStoch) : snap.stochrsi_zone_passed,

      // Bollinger Bands
      bollinger_upper: bbUpper != null ? +Number(bbUpper).toFixed(4) : null,
      bollinger_middle: bbMiddle != null ? +Number(bbMiddle).toFixed(4) : null,
      bollinger_lower: bbLower != null ? +Number(bbLower).toFixed(4) : null,
      bollinger_signal_passed: softBb,

      // Soft conditions
      soft_ema_trend_passed: softEmaTrend,
      soft_stoch_passed: softStoch,
      soft_macd_histogram_passed: softMacdHistogram,
      soft_macd_momentum_passed: softMacdMomentum,
      soft_bb_passed: softBb,
      soft_volume_passed: softVolume,
      soft_pivot_passed: softPivot,
      soft_conditions_total: softConditionsTotal,

      // Break-even (v2: break_even_at_price guaranteed if triggered)
      break_even_triggered: breakEvenTriggered,
      break_even_at_price: breakEvenAtPrice != null ? +Number(breakEvenAtPrice).toFixed(8) : null,
      
      // Trailing stop config
      trailing_stop_initial_price: snap.trailing_stop_initial_price != null 
        ? +Number(snap.trailing_stop_initial_price).toFixed(8) 
        : (isLegacy && snap.trailing_stop_initial != null ? +Number(snap.trailing_stop_initial).toFixed(8) : null),
      trailing_stop_atr_multiplier: snap.atr_trailing_stop_multiplier ?? null,
      
      // 📊 TRAILING STOP EXIT AUDIT (v2: guaranteed when exit_reason=trailing_stop)
      trailing_stop_exit_audit: snap.trailing_stop_exit_audit ? {
        peak_price: snap.trailing_stop_exit_audit.peak_price,
        trailing_stop_price_at_exit: snap.trailing_stop_exit_audit.trailing_stop_price_at_exit,
        stop_loss_at_exit: snap.trailing_stop_exit_audit.stop_loss_at_exit,
        atr_value_at_exit: snap.trailing_stop_exit_audit.atr_value_at_exit,
        trailing_distance: snap.trailing_stop_exit_audit.trailing_distance,
        distance_from_peak_pct: snap.trailing_stop_exit_audit.distance_from_peak_pct,
        distance_from_peak_atr: snap.trailing_stop_exit_audit.distance_from_peak_atr,
        multiplier_used: snap.trailing_stop_exit_audit.multiplier_used,
        multiplier_was_fallback: snap.trailing_stop_exit_audit.multiplier_was_fallback,
        is_legacy_position: snap.trailing_stop_exit_audit.is_legacy_position,
        trailing_calculation_matches: snap.trailing_stop_exit_audit.trailing_calculation_matches,
      } : null,

      // Trend data
      trend_medium: trendMedium,
      trend_higher: trendHigher,

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
