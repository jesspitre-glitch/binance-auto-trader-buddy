import { useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Scatter,
  Line,
  ComposedChart,
  Customized,
} from "recharts";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TradeChartProps {
  trade: any;
}

// =============================================================================
// Adaptiv prisformatering — flere decimaler for lave priser (PENGU, BONK, osv.)
// =============================================================================
const formatPriceAdaptive = (price: number | null | undefined): string => {
  if (price == null || !isFinite(Number(price))) return "-";
  const p = Number(price);
  const abs = Math.abs(p);
  let decimals: number;
  if (abs === 0) decimals = 2;
  else if (abs >= 1000) decimals = 2;
  else if (abs >= 1) decimals = 4;
  else if (abs >= 0.01) decimals = 6;
  else if (abs >= 0.0001) decimals = 7;
  else decimals = 8;
  return p.toFixed(decimals);
};

// Alias for at matche tidligere brug i koden
const formatPrice = formatPriceAdaptive;

// =============================================================================
// Datastruktur for en candle-række på grafen
// =============================================================================
interface ChartRow {
  timestamp: number;
  time: string;
  price: number;
  high: number;
  low: number;
  // exitStop = den stop-regel der faktisk ville lukke handlen på hvert tidspunkt
  exitStop: number | null;
  // Bevarede felter (kun current-værdier — ingen rekonstrueret historik)
  effectiveStop: number | null;
  trailingStop: number | null;
  breakEven: number | null;
  peakLockStop: number | null;
  entryMarker: number | null;
  exitMarker: number | null;
  // Marker for "post-exit" så vi visuelt kan adskille perioden
  isPostExit: boolean;
}

// Diagnose af exit-stop-historik (vises i debug + UI banner)
interface TsHistoryDiagnostic {
  hasHistorical: boolean;
  source: string;
  pointCount: number;
  firstTs: number | null;
  firstValue: number | null;
  lastTs: number | null;
  lastValue: number | null;
  activationTs: number | null;
  isReconstructed: boolean;
  ruleDistribution: Record<string, number>;
  mappedExitStopPoints: number;
  renderExitStop: boolean;
  renderMode: string;
  renderReason: string;
}

// Egen tidsserie til Exit Stop (uafhængig af candle-rækker)
interface ExitStopPoint {
  timestamp: number;
  exitStop: number;
  activeExitRule: string;
}

interface ExitStopHistoryRow {
  recorded_at: string;
  active_stop: number | null;
  active_exit_rule: string | null;
  source: string | null;
  trailing_stop: number | null;
  stop_loss: number | null;
  break_even_price: number | null;
  peak_lock_stop: number | null;
}

interface TriggerLevels {
  breakEvenTrigger: number | null;
  trailingTrigger: number | null;
  peakLockTrigger: number | null;
}

interface LiveExitStopState {
  side: "LONG" | "SHORT";
  entryPrice: number | null;
  currentPrice: number | null;
  highestPrice: number | null;
  lowestPrice: number | null;
  tsTrigger: number | null;
  trailingDistance: number | null;
  trailingActive: boolean;
  rawTrailingStop: number | null;
  computedTrailingStop: number | null;
  hardStop: number | null;
  beStop: number | null;
  effectiveExitStop: number | null;
  sourceUsed: string;
  exitStopHistoryCount?: number;
}

const toPositiveNumber = (value: any): number | null => {
  const n = Number(value);
  return value != null && isFinite(n) && n > 0 ? n : null;
};

const firstPositive = (...values: any[]): number | null => {
  for (const value of values) {
    const n = toPositiveNumber(value);
    if (n != null) return n;
  }
  return null;
};

const getSnapshot = (trade: any): Record<string, any> =>
  trade?.indicators_snapshot && typeof trade.indicators_snapshot === "object"
    ? trade.indicators_snapshot
    : {};

const resolveLiveExitStopState = (
  trade: any,
  rows: ChartRow[] = [],
  openTime?: number,
  closeTime?: number,
): LiveExitStopState => {
  const side = trade.side as "LONG" | "SHORT";
  const snapshot = getSnapshot(trade);
  const exitAudit = snapshot.trailing_stop_exit_audit || {};
  const entryPrice = toPositiveNumber(trade.entry_price);
  const currentPrice =
    firstPositive(trade.current_price, rows[rows.length - 1]?.price, trade.exit_price) ?? null;
  const hardStop = firstPositive(trade.stop_loss, snapshot.stop_loss);
  const rawTrailingStop = firstPositive(trade.trailing_stop, snapshot.trailing_stop);

  const inTradeRows = rows.filter((row) => {
    if (openTime != null && row.timestamp < openTime) return false;
    if (closeTime != null && isFinite(closeTime) && row.timestamp > closeTime) return false;
    return !row.isPostExit;
  });
  const highs = inTradeRows.map((row) => row.high).filter((v) => isFinite(v) && v > 0);
  const lows = inTradeRows.map((row) => row.low).filter((v) => isFinite(v) && v > 0);
  const peakPrice = firstPositive(trade.peak_price, snapshot.peak_price);
  const lowPrice = firstPositive(trade.low_price, snapshot.low_price);

  const highestPrice = firstPositive(
    side === "LONG" ? Math.max(...[peakPrice, currentPrice, ...highs].filter((v): v is number => v != null)) : null,
    side === "SHORT" ? Math.max(...[lowPrice, currentPrice, ...highs].filter((v): v is number => v != null)) : null,
  );
  const lowestPrice = firstPositive(
    side === "SHORT" ? Math.min(...[peakPrice, currentPrice, ...lows].filter((v): v is number => v != null)) : null,
    side === "LONG" ? Math.min(...[lowPrice, currentPrice, ...lows].filter((v): v is number => v != null)) : null,
  );

  const atrValue = firstPositive(
    snapshot.atr,
    snapshot.atr_audit?.atr_value,
    snapshot.atr_filter_audit?.atr_value_raw,
    exitAudit.atr_value_used_for_trailing,
    exitAudit.atr_value_at_exit,
  );
  const trailingMultiplier = firstPositive(
    snapshot.atr_trailing_stop_multiplier,
    snapshot.trailing_stop_atr_multiplier,
    exitAudit.multiplier_used,
  );
  const initialTrailingStop = firstPositive(
    trade.trailing_stop_initial_price,
    snapshot.trailing_stop_initial_price,
  );
  const trailingDistance = firstPositive(
    trade.trailing_distance,
    snapshot.trailing_distance,
    exitAudit.trailing_distance,
    atrValue != null && trailingMultiplier != null ? atrValue * trailingMultiplier : null,
    entryPrice != null && initialTrailingStop != null ? Math.abs(initialTrailingStop - entryPrice) : null,
    entryPrice != null && trade.trailing_stop_percent != null
      ? entryPrice * (Number(trade.trailing_stop_percent) / 100)
      : null,
  );
  const tsTrigger = firstPositive(
    trade.trailing_activation_price,
    snapshot.trailing_activation_price,
    entryPrice != null && atrValue != null && snapshot.trailing_stop_activation_atr != null
      ? side === "LONG"
        ? entryPrice + atrValue * Number(snapshot.trailing_stop_activation_atr)
        : entryPrice - atrValue * Number(snapshot.trailing_stop_activation_atr)
      : null,
  );

  const referencePrice = side === "LONG" ? highestPrice : lowestPrice;
  const computedFromPeak =
    referencePrice != null && trailingDistance != null
      ? side === "LONG"
        ? referencePrice - trailingDistance
        : referencePrice + trailingDistance
      : null;
  const stopInProfitZone = (value: number | null) =>
    value != null && entryPrice != null && (side === "LONG" ? value > entryPrice : value < entryPrice);
  const rawTrailingActive = stopInProfitZone(rawTrailingStop);
  const computedTrailingStop = rawTrailingActive
    ? rawTrailingStop
    : stopInProfitZone(computedFromPeak)
      ? computedFromPeak
      : null;
  const currentHitTrigger =
    currentPrice != null && tsTrigger != null
      ? side === "LONG"
        ? currentPrice >= tsTrigger
        : currentPrice <= tsTrigger
      : false;
  const trailingActive =
    rawTrailingActive ||
    (computedTrailingStop != null && (currentHitTrigger || tsTrigger == null));
  const beActivated = trade.break_even_activated === true || trade.break_even_triggered === true;
  const beStop = beActivated
    ? firstPositive(trade.break_even_at_price, snapshot.break_even_at_price, trade.stop_loss)
    : null;

  if (trailingActive && computedTrailingStop != null) {
    return {
      side,
      entryPrice,
      currentPrice,
      highestPrice,
      lowestPrice,
      tsTrigger,
      trailingDistance,
      trailingActive,
      rawTrailingStop,
      computedTrailingStop,
      hardStop,
      beStop,
      effectiveExitStop: computedTrailingStop,
      sourceUsed: rawTrailingActive ? "TRAILING_DB" : "TRAILING_LIVE_FALLBACK",
    };
  }

  if (beStop != null) {
    return { side, entryPrice, currentPrice, highestPrice, lowestPrice, tsTrigger, trailingDistance, trailingActive, rawTrailingStop, computedTrailingStop, hardStop, beStop, effectiveExitStop: beStop, sourceUsed: "BREAK_EVEN" };
  }

  return { side, entryPrice, currentPrice, highestPrice, lowestPrice, tsTrigger, trailingDistance, trailingActive, rawTrailingStop, computedTrailingStop, hardStop, beStop, effectiveExitStop: hardStop, sourceUsed: hardStop != null ? "STOP_LOSS" : "NONE" };
};

interface ActivationMarkers {
  breakEvenAt: number | null;
  trailingAt: number | null;
  peakLockAt: number | null;
}

// =============================================================================
// Vælg passende kline-interval ud fra trade-varighed
// =============================================================================
const pickInterval = (durationMs: number): { interval: string; ms: number } => {
  const minutes = durationMs / 60_000;
  if (minutes <= 180) return { interval: "1m", ms: 60_000 };
  if (minutes <= 720) return { interval: "5m", ms: 5 * 60_000 };
  if (minutes <= 60 * 24) return { interval: "15m", ms: 15 * 60_000 };
  if (minutes <= 60 * 24 * 7) return { interval: "1h", ms: 60 * 60_000 };
  return { interval: "4h", ms: 4 * 60 * 60_000 };
};

// =============================================================================
// Hovedkomponent — splitter til OpenTradeChart vs ClosedTradeChart
// =============================================================================
export const TradeChart = ({ trade }: TradeChartProps) => {
  const isClosed =
    trade?.status === "CLOSED" ||
    (trade?.status !== "OPEN" && (trade?.closed_at != null || trade?.exit_price != null));

  if (trade?.status === "OPEN" && (trade?.exit_price != null || trade?.close_reason != null || trade?.exit_reason != null || trade?.closed_at != null || trade?.timestamp_close != null)) {
    console.warn('OPEN_TRADE_HAS_EXIT_FIELDS_DATA_BUG', {
      symbol: trade.symbol,
      side: trade.side,
      position_id: trade.id,
      values: {
        exit_price: trade.exit_price,
        exit_reason: trade.exit_reason ?? trade.close_reason,
        closed_at: trade.closed_at,
        timestamp_close: trade.timestamp_close,
      },
    });
  }

  if (isClosed) return <ClosedTradeChart trade={trade} />;
  return <OpenTradeChart trade={trade} />;
};

// =============================================================================
// Hent exit_stop_history rækker for en specifik trade (UTC vindue)
// =============================================================================
const fetchExitStopHistory = async (
  trade: any,
  openTime: number,
  endTime: number,
): Promise<ExitStopHistoryRow[]> => {
  try {
    // Padding så vi får snapshot lige før entry og lidt efter exit
    const fromIso = new Date(openTime - 60_000).toISOString();
    const toIso = new Date(endTime + 60_000).toISOString();

    let query = (supabase as any)
      .from("exit_stop_history")
      .select(
        "recorded_at, active_stop, active_exit_rule, source, trailing_stop, stop_loss, break_even_price, peak_lock_stop, position_id, symbol",
      )
      .eq("symbol", trade.symbol)
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("recorded_at", { ascending: true })
      .limit(5000);

    // Hvis trade har et position_id (åben handel), filtrér yderligere
    if (trade.id && trade.status && trade.status !== "CLOSED") {
      query = query.eq("position_id", trade.id);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("[TradeChart] exit_stop_history fetch error:", error.message);
      return [];
    }
    return (data as ExitStopHistoryRow[]) || [];
  } catch (e) {
    console.warn("[TradeChart] exit_stop_history fetch exception:", e);
    return [];
  }
};

// =============================================================================
// Fælles chart-serie — læser kun faktiske trade-værdier, ingen lokal beregning
// =============================================================================
const buildSeries = (
  trade: any,
  klines: any[],
  openTime: number,
  history: ExitStopHistoryRow[] = [],
): {
  data: ChartRow[];
  exitStopSeries: ExitStopPoint[];
  triggers: TriggerLevels;
  markers: ActivationMarkers;
  tsDiagnostic: TsHistoryDiagnostic;
} => {
  const side = trade.side as "LONG" | "SHORT";

  // ---- Sortér historik efter tid (UTC) -----------------------------------
  const sortedHistory = [...(history || [])]
    .filter((h) => h && h.recorded_at)
    .map((h) => ({ ...h, _ts: new Date(h.recorded_at).getTime() }))
    .sort((a, b) => a._ts - b._ts);

  const hasHistorical = sortedHistory.length > 0;

  // Fallback: aktuelle DB-værdier (kun hvis historik mangler)
  const stopLossDb = toPositiveNumber(trade.stop_loss);
  const trailingStopDb = toPositiveNumber(trade.trailing_stop);
  const breakEvenTriggered = trade.break_even_triggered === true;
  const breakEvenAtPrice =
    breakEvenTriggered ? toPositiveNumber(trade.break_even_at_price) : null;
  const peakLockActivated = trade.peak_lock_activated === true;
  const peakLockStopPrice =
    peakLockActivated ? toPositiveNumber(trade.peak_lock_stop_price) : null;

  // Side-aware effective stop selection — mirror the rules used in PositionManager
  // Priority: active trailing > active break-even > hard stop loss
  // Validity per side:
  //   LONG  → protective stop must be BELOW entry (trailing/BE only counted when in profit zone)
  //   SHORT → protective stop must be ABOVE entry
  const entryPriceNum = toPositiveNumber(trade.entry_price);
  const isProfitZone = (v: number | null): boolean => {
    if (v == null || entryPriceNum == null) return false;
    return side === "LONG" ? v > entryPriceNum : v < entryPriceNum;
  };

  let fallbackSource: string = "NONE";
  let fallbackEffectiveStop: number | null = null;
  if (trailingStopDb != null && isProfitZone(trailingStopDb)) {
    fallbackEffectiveStop = trailingStopDb;
    fallbackSource = "TRAILING";
  } else if (breakEvenAtPrice != null && isProfitZone(breakEvenAtPrice)) {
    fallbackEffectiveStop = breakEvenAtPrice;
    fallbackSource = "BREAK_EVEN";
  } else if (peakLockStopPrice != null && isProfitZone(peakLockStopPrice)) {
    fallbackEffectiveStop = peakLockStopPrice;
    fallbackSource = "PEAK_LOCK";
  } else if (stopLossDb != null) {
    fallbackEffectiveStop = stopLossDb;
    fallbackSource = "STOP_LOSS";
  }

  const closeTime = trade.closed_at
    ? new Date(trade.closed_at).getTime()
    : Number.POSITIVE_INFINITY;

  const data: ChartRow[] = klines.map((k: any) => {
    const timestamp = k[0];
    const price = parseFloat(k[4]);
    const high = parseFloat(k[2]);
    const low = parseFloat(k[3]);
    const isPostExit = timestamp > closeTime;
    return {
      timestamp,
      time: new Date(timestamp).toLocaleTimeString("da-DK", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      price,
      high,
      low,
      exitStop: null,
      effectiveStop: null,
      trailingStop: null,
      breakEven: null,
      peakLockStop: null,
      entryMarker: null,
      exitMarker: null,
      isPostExit,
    };
  });

  const liveExitState = resolveLiveExitStopState(
    trade,
    data,
    openTime,
    isFinite(closeTime) ? closeTime : undefined,
  );
  fallbackEffectiveStop = liveExitState.effectiveExitStop;
  fallbackSource = liveExitState.sourceUsed;

  const ruleDistribution: Record<string, number> = {};
  const exitStopSeries: ExitStopPoint[] = [];

  if (hasHistorical) {
    // Byg uafhængig tidsserie direkte fra historik (egne timestamps)
    sortedHistory.forEach((s) => {
      const v = s.active_stop != null ? Number(s.active_stop) : null;
      if (v == null || !isFinite(v) || v <= 0) return;
      const rule = s.active_exit_rule || "NONE";
      exitStopSeries.push({
        timestamp: s._ts,
        exitStop: v,
        activeExitRule: rule,
      });
      ruleDistribution[rule] = (ruleDistribution[rule] || 0) + 1;
    });

    // Forlæng med en sidste "nu"-punkt så step-linjen rækker frem til seneste candle
    const lastCandleTs = data[data.length - 1]?.timestamp;
    const lastPt = exitStopSeries[exitStopSeries.length - 1];
    if (lastPt && lastCandleTs && lastCandleTs > lastPt.timestamp) {
      exitStopSeries.push({
        timestamp: Math.min(lastCandleTs, closeTime),
        exitStop: lastPt.exitStop,
        activeExitRule: lastPt.activeExitRule,
      });
    }

    const hasTrailingHistory = sortedHistory.some((s) => {
      const rule = String(s.active_exit_rule || "").toUpperCase();
      const source = String(s.source || "").toLowerCase();
      return rule === "TS" || rule === "TRAILING" || source === "trailing" || toPositiveNumber(s.trailing_stop) != null;
    });
    const needsShortLiveTrailingFallback =
      side === "SHORT" &&
      liveExitState.trailingActive &&
      liveExitState.computedTrailingStop != null &&
      !hasTrailingHistory;
    if (needsShortLiveTrailingFallback) {
      exitStopSeries.length = 0;
      const startTs = openTime;
      const endTs = isFinite(closeTime) ? closeTime : data[data.length - 1]?.timestamp ?? openTime;
      if (endTs > startTs) {
        exitStopSeries.push({ timestamp: startTs, exitStop: liveExitState.computedTrailingStop, activeExitRule: "TRAILING_LIVE_FALLBACK" });
        exitStopSeries.push({ timestamp: endTs, exitStop: liveExitState.computedTrailingStop, activeExitRule: "TRAILING_LIVE_FALLBACK" });
      }
      ruleDistribution.TRAILING_LIVE_FALLBACK = (ruleDistribution.TRAILING_LIVE_FALLBACK || 0) + exitStopSeries.length;
    }
  } else if (fallbackEffectiveStop != null) {
    // Ingen historik → flad linje fra entry til nu (eller close)
    const startTs = openTime;
    const endTs = isFinite(closeTime) ? closeTime : data[data.length - 1]?.timestamp ?? openTime;
    if (endTs > startTs) {
      exitStopSeries.push({ timestamp: startTs, exitStop: fallbackEffectiveStop, activeExitRule: `FALLBACK_${fallbackSource}` });
      exitStopSeries.push({ timestamp: endTs, exitStop: fallbackEffectiveStop, activeExitRule: `FALLBACK_${fallbackSource}` });
    }
  }

  const validForSide = (v: number | null, row: ChartRow): number | null => {
    if (v == null || !isFinite(v) || v <= 0) return null;
    if (side === "LONG" && v > row.high) return null;
    if (side === "SHORT" && v < row.low) return null;
    return v;
  };

  const latestInTradeIndex = data.reduce((latest, row, idx) => {
    if (row.timestamp < openTime || row.isPostExit) return latest;
    return idx;
  }, -1);

  if (latestInTradeIndex >= 0 && !hasHistorical) {
    const row = data[latestInTradeIndex];
    row.trailingStop = validForSide(liveExitState.computedTrailingStop ?? trailingStopDb, row);
    row.effectiveStop = validForSide(fallbackEffectiveStop, row);
    row.breakEven = validForSide(breakEvenAtPrice, row);
    row.peakLockStop = validForSide(peakLockStopPrice, row);
  } else if (latestInTradeIndex >= 0 && side === "SHORT" && liveExitState.trailingActive) {
    const row = data[latestInTradeIndex];
    row.trailingStop = validForSide(liveExitState.computedTrailingStop, row);
    row.effectiveStop = validForSide(liveExitState.effectiveExitStop, row);
    row.breakEven = validForSide(breakEvenAtPrice, row);
    row.peakLockStop = validForSide(peakLockStopPrice, row);
  }

  const firstHist = sortedHistory[0];
  const lastHist = sortedHistory[sortedHistory.length - 1];

  const renderExitStop = exitStopSeries.length > 0;
  const renderMode = hasHistorical ? "history-step" : renderExitStop ? "fallback-flat" : "none";
  const renderReason = renderExitStop
    ? hasHistorical
      ? `history.length=${sortedHistory.length}, mapped=${exitStopSeries.length}`
      : `no history, fallback to current effective stop=${fallbackEffectiveStop}`
    : `history.length=${sortedHistory.length}, fallbackStop=${fallbackEffectiveStop}`;

  const tsDiagnostic: TsHistoryDiagnostic = {
    hasHistorical,
    source: hasHistorical
      ? "exit_stop_history (faktisk logget pr. evaluering)"
      : trailingStopDb != null || stopLossDb != null
        ? "fallback: trade current values (ingen historik fundet)"
        : "ingen exit-stop data tilgængelig",
    pointCount: hasHistorical
      ? sortedHistory.length
      : fallbackEffectiveStop != null
        ? 1
        : 0,
    firstTs: firstHist?._ts ?? null,
    firstValue: firstHist?.active_stop != null ? Number(firstHist.active_stop) : null,
    lastTs: lastHist?._ts ?? null,
    lastValue: lastHist?.active_stop != null ? Number(lastHist.active_stop) : null,
    activationTs: null,
    isReconstructed: false,
    ruleDistribution,
    mappedExitStopPoints: exitStopSeries.length,
    renderExitStop,
    renderMode,
    renderReason: side === "SHORT" && liveExitState.trailingActive && liveExitState.sourceUsed === "TRAILING_LIVE_FALLBACK"
      ? `${renderReason}; SHORT live trailing fallback active=${liveExitState.computedTrailingStop}`
      : renderReason,
  };

  return {
    data,
    exitStopSeries,
    triggers: { breakEvenTrigger: null, trailingTrigger: liveExitState.tsTrigger, peakLockTrigger: null },
    markers: { breakEvenAt: null, trailingAt: null, peakLockAt: null },
    tsDiagnostic,
  };
};

// =============================================================================
// Tooltip + custom shapes — fælles for begge grafer
// =============================================================================
const CustomShape = (props: any) => {
  const { cx, cy, fill } = props;
  if (cx == null || cy == null) return null;
  const size = 8;
  return (
    <g>
      <line
        x1={cx - size}
        y1={cy - size}
        x2={cx + size}
        y2={cy + size}
        stroke={fill}
        strokeWidth={3}
      />
      <line
        x1={cx - size}
        y1={cy + size}
        x2={cx + size}
        y2={cy - size}
        stroke={fill}
        strokeWidth={3}
      />
    </g>
  );
};

const tooltipProps = {
  formatter: (value: any, name: any) => [
    typeof value === "number" ? formatPriceAdaptive(value) : String(value),
    name,
  ],
  labelFormatter: (value: any) =>
    typeof value === "number"
      ? new Date(value).toLocaleString("da-DK", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : String(value),
  contentStyle: {
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    padding: "12px",
  },
  labelStyle: {
    color: "hsl(var(--popover-foreground))",
    fontWeight: "bold" as const,
    marginBottom: "8px",
  },
  itemStyle: { color: "hsl(var(--popover-foreground))", padding: "4px 0" },
};

// =============================================================================
// Label-stack — render alle pris-labels som én SVG-overlay så de aldrig overlapper
// =============================================================================
interface PriceLabel {
  value: number;
  text: string;
  color: string;
  bold?: boolean;
  side?: "left" | "right"; // anker
}

const PriceLabelStack = (props: any) => {
  const { viewBox, labels, yMin, yMax } = props as {
    viewBox: { x: number; y: number; width: number; height: number };
    labels: PriceLabel[];
    yMin: number;
    yMax: number;
  };
  if (!viewBox || !labels || labels.length === 0) return null;
  const { x, y, width, height } = viewBox;

  // Konverter pris -> y-pixel
  const priceToY = (p: number) => {
    if (yMax === yMin) return y + height / 2;
    return y + height - ((p - yMin) / (yMax - yMin)) * height;
  };

  // Sorter labels og adskil i venstre/højre kolonne baseret på pris (skiftevis)
  // Sorteret high -> low. Lige indeks = højre, ulige = venstre.
  const sorted = [...labels].sort((a, b) => b.value - a.value);
  const ROW_H = 14; // min lodret afstand mellem labels
  const PADDING_X = 6;

  // Beregn ønsket y for hver label, og forskyd hvis de overlapper inden for samme kolonne
  const placeColumn = (items: typeof sorted) => {
    const placed = items
      .map((l) => ({ ...l, yIdeal: priceToY(l.value) }))
      .sort((a, b) => a.yIdeal - b.yIdeal);
    // Skub ned hvis for tæt på naboen ovenover
    for (let i = 1; i < placed.length; i++) {
      if (placed[i].yIdeal - placed[i - 1].yIdeal < ROW_H) {
        placed[i].yIdeal = placed[i - 1].yIdeal + ROW_H;
      }
    }
    // Hvis vi løber ud nederst, skub op fra bunden
    const bottom = y + height - 2;
    for (let i = placed.length - 1; i > 0; i--) {
      if (placed[i].yIdeal > bottom) placed[i].yIdeal = bottom - (placed.length - 1 - i) * ROW_H;
    }
    // Klem til top
    const top = y + 10;
    for (let i = 0; i < placed.length; i++) {
      if (placed[i].yIdeal < top) placed[i].yIdeal = top + i * ROW_H;
    }
    return placed;
  };

  const rightItems: PriceLabel[] = [];
  const leftItems: PriceLabel[] = [];
  sorted.forEach((l, i) => {
    if (l.side === "left") leftItems.push(l);
    else if (l.side === "right") rightItems.push(l);
    else (i % 2 === 0 ? rightItems : leftItems).push(l);
  });

  const rightPlaced = placeColumn(rightItems);
  const leftPlaced = placeColumn(leftItems);

  return (
    <g>
      {rightPlaced.map((l, i) => (
        <g key={`r-${i}`}>
          {/* lille forbinder-streg fra ideel y til faktisk position */}
          <line
            x1={x + width - 2}
            x2={x + width - 50}
            y1={priceToY(l.value)}
            y2={l.yIdeal}
            stroke={l.color}
            strokeOpacity={0.35}
            strokeWidth={1}
          />
          <text
            x={x + width - PADDING_X}
            y={l.yIdeal}
            fill={l.color}
            fontSize={10}
            fontWeight={l.bold ? "bold" : "normal"}
            textAnchor="end"
            style={{
              paintOrder: "stroke",
              stroke: "hsl(var(--background))",
              strokeWidth: 3,
              strokeLinejoin: "round",
            }}
          >
            {l.text}
          </text>
        </g>
      ))}
      {leftPlaced.map((l, i) => (
        <g key={`l-${i}`}>
          <line
            x1={x + 2}
            x2={x + 50}
            y1={priceToY(l.value)}
            y2={l.yIdeal}
            stroke={l.color}
            strokeOpacity={0.35}
            strokeWidth={1}
          />
          <text
            x={x + PADDING_X}
            y={l.yIdeal}
            fill={l.color}
            fontSize={10}
            fontWeight={l.bold ? "bold" : "normal"}
            textAnchor="start"
            style={{
              paintOrder: "stroke",
              stroke: "hsl(var(--background))",
              strokeWidth: 3,
              strokeLinejoin: "round",
            }}
          >
            {l.text}
          </text>
        </g>
      ))}
    </g>
  );
};

// =============================================================================
// 1) ÅBEN HANDEL — fra entry frem til nu
// =============================================================================
const OpenTradeChart = ({ trade }: TradeChartProps) => {
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [triggers, setTriggers] = useState<TriggerLevels>({
    breakEvenTrigger: null,
    trailingTrigger: null,
    peakLockTrigger: null,
  });
  const [markers, setMarkers] = useState<ActivationMarkers>({
    breakEvenAt: null,
    trailingAt: null,
    peakLockAt: null,
  });
  const [tsDiagnostic, setTsDiagnostic] = useState<TsHistoryDiagnostic | null>(null);
  const [exitStopSeries, setExitStopSeries] = useState<ExitStopPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const openTime = new Date(trade.opened_at).getTime();
        const now = Date.now();
        const duration = now - openTime;
        const { interval, ms } = pickInterval(duration);

        // Lidt padding før entry så grafen ikke starter knivskarpt på entry
        const startTime = openTime - ms * 5;
        const endTime = now;

        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${trade.symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1500`;
        const [klinesRes, historyRes] = await Promise.all([
          fetch(url),
          fetchExitStopHistory(trade, openTime, now),
        ]);
        if (!klinesRes.ok) throw new Error("Failed to fetch klines");
        const klines = await klinesRes.json();

        const { data, exitStopSeries, triggers, markers, tsDiagnostic } = buildSeries(trade, klines, openTime, historyRes);
        setExitStopSeries(exitStopSeries);

        // Find entry-punkt
        const entryIdx = data.reduce(
          (best, cur, idx) =>
            Math.abs(cur.timestamp - openTime) <
            Math.abs(data[best].timestamp - openTime)
              ? idx
              : best,
          0,
        );
        if (data[entryIdx]) {
          data[entryIdx].entryMarker = Number(trade.entry_price);
        }

        setChartData(data);
        setTriggers(triggers);
        setMarkers(markers);
        setTsDiagnostic(tsDiagnostic);
      } catch (e) {
        console.error("OpenTradeChart fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [trade]);

  return (
    <ChartShell
      loading={loading}
      chartData={chartData}
      exitStopSeries={exitStopSeries}
      trade={trade}
      triggers={triggers}
      markers={markers}
      tsDiagnostic={tsDiagnostic}
      mode="open"
    />
  );
};

// =============================================================================
// 2) LUKKET HANDEL — fra entry, fortsæt 10-20 candles efter exit
// =============================================================================
const ClosedTradeChart = ({ trade }: TradeChartProps) => {
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [triggers, setTriggers] = useState<TriggerLevels>({
    breakEvenTrigger: null,
    trailingTrigger: null,
    peakLockTrigger: null,
  });
  const [markers, setMarkers] = useState<ActivationMarkers>({
    breakEvenAt: null,
    trailingAt: null,
    peakLockAt: null,
  });
  const [tsDiagnostic, setTsDiagnostic] = useState<TsHistoryDiagnostic | null>(null);
  const [exitStopSeries, setExitStopSeries] = useState<ExitStopPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const openTime = new Date(trade.opened_at).getTime();
        const closeTime = new Date(trade.closed_at).getTime();
        const duration = closeTime - openTime;
        const { interval, ms } = pickInterval(duration);

        const POST_EXIT_CANDLES = 15;
        const PRE_ENTRY_CANDLES = 5;
        const startTime = openTime - ms * PRE_ENTRY_CANDLES;
        const endTime = Math.min(
          closeTime + ms * POST_EXIT_CANDLES,
          Date.now(),
        );

        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${trade.symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1500`;
        const [klinesRes, historyRes] = await Promise.all([
          fetch(url),
          fetchExitStopHistory(trade, openTime, closeTime),
        ]);
        if (!klinesRes.ok) throw new Error("Failed to fetch klines");
        const klines = await klinesRes.json();

        const { data, exitStopSeries, triggers, markers, tsDiagnostic } = buildSeries(trade, klines, openTime, historyRes);
        setExitStopSeries(exitStopSeries);

        // Entry marker
        const entryIdx = data.reduce(
          (best, cur, idx) =>
            Math.abs(cur.timestamp - openTime) <
            Math.abs(data[best].timestamp - openTime)
              ? idx
              : best,
          0,
        );
        if (data[entryIdx]) data[entryIdx].entryMarker = Number(trade.entry_price);

        // Exit marker
        const exitIdx = data.reduce(
          (best, cur, idx) =>
            Math.abs(cur.timestamp - closeTime) <
            Math.abs(data[best].timestamp - closeTime)
              ? idx
              : best,
          0,
        );
        if (data[exitIdx]) data[exitIdx].exitMarker = Number(trade.exit_price);

        setChartData(data);
        setTriggers(triggers);
        setMarkers(markers);
        setTsDiagnostic(tsDiagnostic);
      } catch (e) {
        console.error("ClosedTradeChart fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [trade]);

  return (
    <ChartShell
      loading={loading}
      chartData={chartData}
      exitStopSeries={exitStopSeries}
      trade={trade}
      triggers={triggers}
      markers={markers}
      tsDiagnostic={tsDiagnostic}
      mode="closed"
    />
  );
};

// =============================================================================
// Fælles render-shell — selve grafen
// =============================================================================
interface ChartShellProps {
  loading: boolean;
  chartData: ChartRow[];
  exitStopSeries: ExitStopPoint[];
  trade: any;
  triggers: TriggerLevels;
  markers: ActivationMarkers;
  tsDiagnostic: TsHistoryDiagnostic | null;
  mode: "open" | "closed";
}

const ChartShell = ({
  loading,
  chartData,
  exitStopSeries,
  trade,
  triggers,
  markers,
  tsDiagnostic,
  mode,
}: ChartShellProps) => {
  const isClosed = mode === "closed";
  const isMobile = useIsMobile();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [layoutDebug, setLayoutDebug] = useState<{
    viewportWidth: number;
    chartCardWidth: number;
    chartSvgWidth: number;
    bodyScrollWidth: number;
    hasHorizontalOverflow: boolean;
  } | null>(null);

  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const cardW = wrapperRef.current?.getBoundingClientRect().width ?? 0;
      const svg = wrapperRef.current?.querySelector("svg.recharts-surface");
      const svgW = (svg as SVGElement | null)?.getBoundingClientRect().width ?? 0;
      const bodyW = document.documentElement.scrollWidth;
      setLayoutDebug({
        viewportWidth: vw,
        chartCardWidth: Math.round(cardW),
        chartSvgWidth: Math.round(svgW),
        bodyScrollWidth: bodyW,
        hasHorizontalOverflow: bodyW > vw,
      });
    };
    update();
    const t = setTimeout(update, 250);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", update);
    };
  });

  // ---- Y-akse range -------------------------------------------------------
  const { yMin, yMax } = useMemo(() => {
    const entryPrice = Number(trade.entry_price);
    const priceValues = chartData
      .map((d) => d.price)
      .filter((p) => p != null && isFinite(p) && p > 0);

    const pool: number[] = [...priceValues];
    if (entryPrice > 0) pool.push(entryPrice);

    chartData.forEach((d) => {
      if (d.effectiveStop != null) pool.push(d.effectiveStop);
      if (d.trailingStop != null) pool.push(d.trailingStop);
      if (d.breakEven != null) pool.push(d.breakEven);
      if (d.peakLockStop != null) pool.push(d.peakLockStop);
    });
    exitStopSeries.forEach((p) => { if (isFinite(p.exitStop)) pool.push(p.exitStop); });

    // TS / peak fra DB (single value) — sikrer at en aktiv TS altid er i view
    const tsDb = trade.trailing_stop != null ? Number(trade.trailing_stop) : null;
    if (tsDb != null && isFinite(tsDb) && tsDb > 0) pool.push(tsDb);
    const pkDb = trade.peak_price != null ? Number(trade.peak_price) : null;
    if (pkDb != null && isFinite(pkDb) && pkDb > 0) pool.push(pkDb);

    // Stop loss og exit fra trade
    const stopLoss = Number(trade.stop_loss);
    if (stopLoss && isFinite(stopLoss) && stopLoss > 0) {
      pool.push(stopLoss);
    }
    if (isClosed && trade.exit_price && isFinite(trade.exit_price)) {
      pool.push(Number(trade.exit_price));
    }

    [triggers.breakEvenTrigger, triggers.trailingTrigger, triggers.peakLockTrigger].forEach(
      (t) => {
        if (t != null && isFinite(t)) pool.push(t);
      },
    );

    if (pool.length === 0) return { yMin: 0, yMax: 1 };
    const min = Math.min(...pool);
    const max = Math.max(...pool);
    const range = Math.max(max - min, entryPrice * 0.005);
    const padding = Math.max(range * 0.1, entryPrice * 0.003);
    return { yMin: min - padding, yMax: max + padding };
  }, [chartData, exitStopSeries, trade, triggers, isClosed]);

  // ---- Vis-flag for triggers (skal være kendt før priceLabels-memo) -------
  const showBeTrigger =
    markers.breakEvenAt == null && triggers.breakEvenTrigger != null;
  const showTsTrigger =
    markers.trailingAt == null && triggers.trailingTrigger != null;
  const showPlTrigger =
    markers.peakLockAt == null && triggers.peakLockTrigger != null;

  // ---- Saml alle pris-labels til én overlay-stak --------------------------
  const priceLabels = useMemo(() => {
    const out: PriceLabel[] = [];
    const entry = Number(trade.entry_price);
    if (entry > 0)
      out.push({
        value: entry,
        text: `📍 Entry $${formatPriceAdaptive(entry)}`,
        color: "#16a34a",
        bold: true,
      });

    const initSl = Number(trade.stop_loss);
    if (initSl > 0)
      out.push({
        value: initSl,
        text: `Initial SL $${formatPriceAdaptive(initSl)}`,
        color: "#dc2626",
      });

    if (showBeTrigger && triggers.breakEvenTrigger != null)
      out.push({
        value: triggers.breakEvenTrigger,
        text: `BE Trigger $${formatPriceAdaptive(triggers.breakEvenTrigger)}`,
        color: "#a855f7",
      });
    if (showTsTrigger && triggers.trailingTrigger != null)
      out.push({
        value: triggers.trailingTrigger,
        text: `TS Trigger $${formatPriceAdaptive(triggers.trailingTrigger)}`,
        color: "#ec4899",
      });
    if (showPlTrigger && triggers.peakLockTrigger != null)
      out.push({
        value: triggers.peakLockTrigger,
        text: `PL Trigger $${formatPriceAdaptive(triggers.peakLockTrigger)}`,
        color: "#06b6d4",
      });

    if (trade.peak_price && Number(trade.peak_price) > 0) {
      out.push({
        value: Number(trade.peak_price),
        text: `🔝 Peak $${formatPriceAdaptive(trade.peak_price)}`,
        color: "#0891b2",
      });
    }

    if (isClosed && trade.exit_price != null) {
      out.push({
        value: Number(trade.exit_price),
        text: `🚪 Exit $${formatPriceAdaptive(trade.exit_price)}`,
        color: "#dc2626",
        bold: true,
      });
    }

    const lastTs = [...chartData].reverse().find((d) => d.trailingStop != null)
      ?.trailingStop;
    if (lastTs != null)
      out.push({
        value: lastTs,
        text: `🎯 TS $${formatPriceAdaptive(lastTs)}`,
        color: "#ec4899",
        bold: true,
      });

    const lastEff = [...chartData].reverse().find((d) => d.effectiveStop != null)
      ?.effectiveStop;
    if (lastEff != null && lastEff !== lastTs)
      out.push({
        value: lastEff,
        text: `🛑 Aktiv $${formatPriceAdaptive(lastEff)}`,
        color: "#f97316",
        bold: true,
      });

    return out;
  }, [
    trade,
    triggers,
    showBeTrigger,
    showTsTrigger,
    showPlTrigger,
    chartData,
    isClosed,
  ]);

  if (loading) {
    return (
      <div className="h-[380px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (chartData.length === 0) {
    return (
      <div className="h-[380px] flex items-center justify-center text-muted-foreground text-sm">
        Ingen chart data tilgængelig
      </div>
    );
  }

  const entryPrice = Number(trade.entry_price);
  const exitPrice = isClosed && trade.exit_price != null ? Number(trade.exit_price) : null;
  const initialSlPrice = Number(trade.stop_loss);
  const peakPrice = trade.peak_price != null ? Number(trade.peak_price) : null;

  const openTime = trade.opened_at ? new Date(trade.opened_at).getTime() : null;
  const closeTime = isClosed && trade.closed_at ? new Date(trade.closed_at).getTime() : null;

  // ---- Hvilke serier har vi reelt data for? -----------------------------
  const hasExitStop = exitStopSeries.length > 0;
  const hasTrailing = chartData.some((d) => d.trailingStop != null);
  const hasBreakEven = chartData.some((d) => d.breakEven != null);
  const hasPeakLock = chartData.some((d) => d.peakLockStop != null);
  const hasEffective = chartData.some((d) => d.effectiveStop != null);
  const hasInitialSl = isFinite(initialSlPrice) && initialSlPrice > 0;
  const hasPeak = peakPrice != null && isFinite(peakPrice) && peakPrice > 0;
  const currentExitStop = exitStopSeries[exitStopSeries.length - 1]?.exitStop ?? null;
  const tsMissingHistory =
    trade.trailing_stop != null &&
    Number(trade.trailing_stop) > 0 &&
    tsDiagnostic?.hasHistorical === false;

  // Kun hide-fra-legend payload — Recharts viser ALT som default; vi
  // angiver i stedet eksplicit hvilke linjer der overhovedet renderes.

  // ---- X-akse ticks: vis kun start, entry, exit (hvis lukket) og slut --
  const firstTs = chartData[0]?.timestamp;
  const lastTs = chartData[chartData.length - 1]?.timestamp;
  const xTicks = Array.from(
    new Set(
      [firstTs, openTime, closeTime, lastTs].filter(
        (v): v is number => v != null && isFinite(v),
      ),
    ),
  ).sort((a, b) => a - b);

  const fmtTimeShort = (ts: number) =>
    new Date(ts).toLocaleString("da-DK", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });

  // ---- Custom tooltip ---------------------------------------------------
  const tradeSide = trade.side as "LONG" | "SHORT";
  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as ChartRow | undefined;
    if (!row) return null;
    const rawPct =
      entryPrice > 0 && isFinite(row.price)
        ? tradeSide === "SHORT"
          ? ((entryPrice - row.price) / entryPrice) * 100
          : ((row.price - entryPrice) / entryPrice) * 100
        : null;
    const pctFromEntry = rawPct != null && isFinite(rawPct) ? rawPct : null;
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
        <div className="font-semibold mb-1 text-popover-foreground">
          {fmtTimeShort(label)} UTC
        </div>
        <div className="space-y-0.5 text-popover-foreground">
          <div>
            <span className="text-muted-foreground">Pris:</span>{" "}
            <span className="font-mono">${formatPriceAdaptive(row.price)}</span>
            {pctFromEntry != null && (
              <span
                className={`ml-2 ${
                  pctFromEntry >= 0 ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                {pctFromEntry >= 0 ? "+" : ""}
                {pctFromEntry.toFixed(2)}%
              </span>
            )}
          </div>
          {row.entryMarker != null && (
            <div className="text-emerald-500">
              📍 Entry ${formatPriceAdaptive(row.entryMarker)}
            </div>
          )}
          {row.exitMarker != null && (
            <div className="text-rose-500">
              🚪 Exit ${formatPriceAdaptive(row.exitMarker)}
            </div>
          )}
          {row.exitStop != null && (
            <div className="text-orange-500">
              🛑 Exit Stop ${formatPriceAdaptive(row.exitStop)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-2">
      <div className="text-xs text-muted-foreground px-1">
        {isClosed
          ? `Lukket handel — viser 15 candles efter exit`
          : "Åben handel — opdateres med live prisudvikling"}
      </div>

      {tsMissingHistory && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          ⚠️ Historisk TS-data mangler — der vises kun aktuel stop-værdi som flad linje (ingen tidsserie i DB).
        </div>
      )}
      {/* Mobil-venligt: fuld bredde, aldrig vandret scroll */}
      <div
        ref={wrapperRef}
        className="h-[360px] w-full max-w-full min-w-0 overflow-hidden sm:h-[380px]"
        style={{ maxWidth: "100vw" }}
      >
        <ResponsiveContainer width="100%" height="100%" debounce={1}>

            <ComposedChart
              data={chartData}
              margin={
                isMobile
                  ? { top: 12, right: 6, left: 0, bottom: 20 }
                  : { top: 16, right: 12, left: 4, bottom: 24 }
              }
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={isMobile ? (xTicks?.length ? [xTicks[0], xTicks[xTicks.length - 1]] : undefined) : xTicks}
                tick={{ fontSize: 9 }}
                tickFormatter={fmtTimeShort}
                minTickGap={isMobile ? 80 : 40}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 9 }}
                tickFormatter={(v) => formatPriceAdaptive(v)}
                width={isMobile ? 40 : 64}
              />
              <Tooltip
                content={renderTooltip}
                wrapperStyle={{ maxWidth: "calc(100vw - 24px)", zIndex: 50 }}
              />
              <Legend
                wrapperStyle={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}
                content={({ payload }) => (
                  <div className="flex w-full max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-2 text-[10px] leading-4">
                    {payload?.map((item) => (
                      <div key={`${item.value}`} className="flex min-w-0 items-center gap-1">
                        <span
                          className="h-0.5 w-4 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="truncate">{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                iconType="line"
                iconSize={9}
              />

              {/* Pris — render FØR trailing stop så TS-linjen tegnes ovenpå */}
              <Line
                type="monotone"
                dataKey="price"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                name="💰 Pris"
                isAnimationActive={false}
              />

              {hasExitStop && (
                <Line
                  type="stepAfter"
                  data={exitStopSeries}
                  dataKey="exitStop"
                  xAxisId={0}
                  stroke="#f97316"
                  strokeWidth={2.5}
                  strokeDasharray="8 4"
                  dot={{ r: 2, fill: "#f97316" }}
                  name="🛑 Exit Stop"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}

              {/* Entry marker */}
              <Scatter
                dataKey="entryMarker"
                fill="#16a34a"
                shape={<CustomShape />}
                name="📍 Entry"
                isAnimationActive={false}
              />

              {isClosed && (
                <Scatter
                  dataKey="exitMarker"
                  fill="#dc2626"
                  shape={<CustomShape />}
                  name="🚪 Exit"
                  isAnimationActive={false}
                />
              )}

              {/* --- Reference-linjer (uden støjende labels) --- */}
              {entryPrice > 0 && (
                <ReferenceLine
                  y={entryPrice}
                  stroke="#16a34a"
                  strokeWidth={1}
                  strokeDasharray="6 4"
                  strokeOpacity={0.55}
                />
              )}
              {hasInitialSl && (
                <ReferenceLine
                  y={initialSlPrice}
                  stroke="#dc2626"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  strokeOpacity={0.45}
                />
              )}
              {hasPeak && (
                <ReferenceLine
                  y={peakPrice as number}
                  stroke="#0891b2"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  strokeOpacity={0.5}
                />
              )}
              {exitPrice != null && (
                <ReferenceLine
                  y={exitPrice}
                  stroke="#dc2626"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeOpacity={0.55}
                />
              )}
              {currentExitStop != null && (
                <ReferenceLine
                  y={currentExitStop}
                  stroke="#f97316"
                  strokeWidth={1}
                  strokeDasharray="8 4"
                  strokeOpacity={0.4}
                />
              )}

              {/* Lodret entry-streg */}
              {openTime != null && (
                <ReferenceLine
                  x={openTime}
                  stroke="#16a34a"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  strokeOpacity={0.5}
                />
              )}
              {/* Lodret exit-streg */}
              {closeTime != null && (
                <ReferenceLine
                  x={closeTime}
                  stroke="#dc2626"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  strokeOpacity={0.5}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
      </div>

      {layoutDebug && (
        <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
          📐 Layout: vw={layoutDebug.viewportWidth}px · card={layoutDebug.chartCardWidth}px · svg=
          {layoutDebug.chartSvgWidth}px · bodyScrollW={layoutDebug.bodyScrollWidth}px ·{" "}
          <span className={layoutDebug.hasHorizontalOverflow ? "text-destructive font-semibold" : "text-profit"}>
            overflow={String(layoutDebug.hasHorizontalOverflow)}
          </span>
        </div>
      )}

      {/* ===================== DEBUG PANEL (midlertidig) ===================== */}
      <ChartDebugPanel
        trade={trade}
        chartData={chartData}
        exitStopSeries={exitStopSeries}
        triggers={triggers}
        markers={markers}
        tsDiagnostic={tsDiagnostic}
        flags={{ hasTrailing, hasEffective, hasBreakEven, hasPeakLock, hasInitialSl, hasPeak, hasExitStop }}
        derived={{ entryPrice, exitPrice, initialSlPrice, peakPrice, openTime, closeTime }}
      />
    </div>
  );
};

// =============================================================================
// DEBUG PANEL — midlertidig diagnose af hvor hver linje kommer fra
// =============================================================================
const ChartDebugPanel = ({
  trade,
  chartData,
  exitStopSeries,
  triggers,
  markers,
  tsDiagnostic,
  flags,
  derived,
}: {
  trade: any;
  chartData: ChartRow[];
  exitStopSeries: ExitStopPoint[];
  triggers: TriggerLevels;
  markers: ActivationMarkers;
  tsDiagnostic: TsHistoryDiagnostic | null;
  flags: {
    hasTrailing: boolean;
    hasEffective: boolean;
    hasBreakEven: boolean;
    hasPeakLock: boolean;
    hasInitialSl: boolean;
    hasPeak: boolean;
    hasExitStop: boolean;
  };
  derived: {
    entryPrice: number;
    exitPrice: number | null;
    initialSlPrice: number;
    peakPrice: number | null;
    openTime: number | null;
    closeTime: number | null;
  };
}) => {
  const side = trade.side as "LONG" | "SHORT";
  const fmt = (v: any): any =>
    v == null ? (
      <span className="text-muted-foreground italic">null</span>
    ) : typeof v === "number" ? (
      <span className="font-mono">{formatPriceAdaptive(v)}</span>
    ) : typeof v === "boolean" ? (
      <span className={v ? "text-emerald-500" : "text-rose-500"}>{String(v)}</span>
    ) : (
      <span className="font-mono break-all">{String(v)}</span>
    );

  const summarize = (
    name: string,
    sourceField: string,
    values: (number | null)[],
    rendered: boolean,
    reason: string,
  ) => {
    const nn = values.filter((v): v is number => v != null && isFinite(v));
    return {
      name,
      sourceField,
      count: nn.length,
      first: nn[0] ?? null,
      last: nn[nn.length - 1] ?? null,
      min: nn.length ? Math.min(...nn) : null,
      max: nn.length ? Math.max(...nn) : null,
      rendered,
      reason,
    };
  };

  const tsVals = chartData.map((d) => d.trailingStop);
  const effVals = chartData.map((d) => d.effectiveStop);
  const beVals = chartData.map((d) => d.breakEven);
  const plVals = chartData.map((d) => d.peakLockStop);
  const hasTradeTrailingStop = trade.trailing_stop != null && isFinite(Number(trade.trailing_stop)) && Number(trade.trailing_stop) > 0;
  const hasTradeStopLoss = trade.stop_loss != null && isFinite(Number(trade.stop_loss)) && Number(trade.stop_loss) > 0;

  const series = [
    summarize("Pris", "klines[].close", chartData.map((d) => d.price), true, "altid"),
    summarize(
      "Exit Stop",
      "exit_stop_history.active_stop",
      exitStopSeries.map((p) => p.exitStop),
      flags.hasExitStop,
      flags.hasExitStop
        ? `step-linje fra exit_stop_history (N=${exitStopSeries.length})`
        : "ingen exit_stop_history rækker fundet",
    ),
    summarize(
      "Entry",
      "trade.entry_price",
      [derived.entryPrice],
      derived.entryPrice > 0,
      "DB",
    ),
    summarize(
      "Exit",
      "trade.exit_price",
      [derived.exitPrice],
      derived.exitPrice != null,
      "DB",
    ),
    summarize(
      "Trailing Stop",
      "trade.trailing_stop",
      tsVals,
      flags.hasTrailing,
      flags.hasTrailing
        ? "current-level på seneste in-trade candle"
        : "trade.trailing_stop mangler/ugyldig eller er side-ugyldig",
    ),
    summarize(
      "Aktiv Stop",
      "resolved current active stop from trade.trailing_stop / trade.stop_loss",
      effVals,
      flags.hasEffective,
      flags.hasEffective
        ? hasTradeTrailingStop
          ? "trade.trailing_stop prioriteret som aktuel stop"
          : "trade.stop_loss brugt som aktuel stop"
        : "ingen valid trade.stop_loss/trailing_stop",
    ),
    summarize(
      "Break-Even",
      "trade.break_even_triggered + trade.break_even_at_price",
      beVals,
      flags.hasBreakEven,
      flags.hasBreakEven
        ? "trade.break_even_triggered=true og price findes"
        : "Break-Even shown: false",
    ),
    summarize(
      "Peak-Lock",
      "trade.peak_lock_activated + trade.peak_lock_stop_price",
      plVals,
      flags.hasPeakLock,
      flags.hasPeakLock
        ? "trade.peak_lock_activated=true og price findes"
        : "Peak-Lock shown: false",
    ),
    summarize("Peak", "trade.peak_price", [derived.peakPrice], flags.hasPeak, "DB"),
    summarize(
      "Initial SL",
      "trade.stop_loss",
      [derived.initialSlPrice],
      flags.hasInitialSl,
      hasTradeStopLoss ? "DB" : "ingen valid stop_loss",
    ),
  ];

  const validate = (key: "trailingStop" | "effectiveStop" | "breakEven" | "peakLockStop") => {
    let invalid = 0;
    chartData.forEach((d) => {
      const v = (d as any)[key];
      if (v == null) return;
      if (side === "LONG" && v > d.high) invalid++;
      if (side === "SHORT" && v < d.low) invalid++;
    });
    return invalid;
  };

  const tsPointCount = tsVals.filter((v): v is number => v != null).length;
  const activePointCount = effVals.filter((v): v is number => v != null).length;
  const effEqualsExit =
    derived.exitPrice != null &&
    effVals.some((v) => v != null && Math.abs(v - (derived.exitPrice as number)) < 1e-12);
  const beShownButNotTriggered =
    flags.hasBreakEven && trade.break_even_triggered === false;
  const tsShownButNoInit =
    flags.hasTrailing &&
    trade.trailing_stop_initial_price == null &&
    trade.trailing_stop == null;

  const firstC = chartData[0];
  const lastC = chartData[chartData.length - 1];

  return (
    <details
      className="mt-3 w-full max-w-full min-w-0 overflow-hidden rounded-md border border-amber-500/40 bg-amber-500/5 text-[11px]"
      open
    >
      <summary className="cursor-pointer px-3 py-2 font-semibold text-amber-600 dark:text-amber-400">
        🐞 Chart Debug Panel (midlertidig)
      </summary>
      <div className="min-w-0 max-w-full space-y-4 overflow-hidden p-3">
        {(() => {
          const entry = derived.entryPrice;
          const currentPrice = chartData[chartData.length - 1]?.price ?? null;
          const hardStop = derived.initialSlPrice > 0 ? derived.initialSlPrice : null;
          const beStop = trade.break_even_triggered === true && trade.break_even_at_price != null
            ? Number(trade.break_even_at_price) : null;
          const trailingStopVal = trade.trailing_stop != null && Number(trade.trailing_stop) > 0
            ? Number(trade.trailing_stop) : null;
          const lastExit = exitStopSeries[exitStopSeries.length - 1];
          const effectiveExitStop = lastExit?.exitStop ?? null;
          const sourceUsed = lastExit?.activeExitRule ?? "NONE";
          const inProfit = (v: number | null) =>
            v != null && entry > 0 && (side === "LONG" ? v > entry : v < entry);
          const trailingActive = inProfit(trailingStopVal);
          return (
            <section className="min-w-0 rounded border border-orange-500/40 bg-orange-500/5 p-2">
              <div className="font-semibold mb-1 text-orange-600 dark:text-orange-400">
                0. Effective Exit Stop (side-aware)
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:break-all">
                <div>side: {fmt(side)}</div>
                <div>entryPrice: {fmt(entry)}</div>
                <div>currentPrice: {fmt(currentPrice)}</div>
                <div>hardStop: {fmt(hardStop)}</div>
                <div>beStop: {fmt(beStop)}</div>
                <div>trailingStop: {fmt(trailingStopVal)}</div>
                <div>effectiveExitStop: {fmt(effectiveExitStop)}</div>
                <div>trailingActive: {fmt(trailingActive)}</div>
                <div>sourceUsed: {fmt(sourceUsed)}</div>
              </div>
            </section>
          );
        })()}
        <section className="min-w-0">
          <div className="font-semibold mb-1">1. Trade raw values</div>
          <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:break-all">
            <div>side: {fmt(trade.side)}</div>
            <div>status: {fmt(trade.status)}</div>
            <div>entry_price: {fmt(trade.entry_price)}</div>
            <div>exit_price: {fmt(trade.exit_price)}</div>
            <div>stop_loss: {fmt(trade.stop_loss)}</div>
            <div>peak_price: {fmt(trade.peak_price)}</div>
            <div>low_price: {fmt(trade.low_price)}</div>
            <div>break_even_triggered: {fmt(trade.break_even_triggered)}</div>
            <div>break_even_at_price: {fmt(trade.break_even_at_price)}</div>
            <div>trailing_stop: {fmt(trade.trailing_stop)}</div>
            <div>trailing_stop_initial_price: {fmt(trade.trailing_stop_initial_price)}</div>
            <div>peak_lock_activated: {fmt(trade.peak_lock_activated)}</div>
            <div>peak_lock_stop_price: {fmt(trade.peak_lock_stop_price)}</div>
            <div>opened_at: {fmt(trade.opened_at)}</div>
            <div>closed_at: {fmt(trade.closed_at)}</div>
          </div>
          {trade.trailing_stop_exit_audit != null && (
            <div className="mt-1 break-all">
              trailing_stop_exit_audit:{" "}
              <span className="font-mono">
                {JSON.stringify(trade.trailing_stop_exit_audit)}
              </span>
            </div>
          )}
        </section>

        <section className="min-w-0">
          <div className="font-semibold mb-1">1b. Exit Stop historik diagnose</div>
          <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:break-all">
            <div>Har historik: {fmt(tsDiagnostic?.hasHistorical ?? false)}</div>
            <div>Source: <span className="font-mono">{tsDiagnostic?.source ?? "-"}</span></div>
            <div>Antal datapunkter: {fmt(tsDiagnostic?.pointCount ?? 0)}</div>
            <div>Rekonstrueret: {fmt(tsDiagnostic?.isReconstructed ?? false)}</div>
            <div>Første timestamp: <span className="font-mono">{tsDiagnostic?.firstTs ? new Date(tsDiagnostic.firstTs).toISOString() : "-"}</span></div>
            <div>Første active_stop: {fmt(tsDiagnostic?.firstValue ?? null)}</div>
            <div>Sidste timestamp: <span className="font-mono">{tsDiagnostic?.lastTs ? new Date(tsDiagnostic.lastTs).toISOString() : "-"}</span></div>
            <div>Sidste active_stop: {fmt(tsDiagnostic?.lastValue ?? null)}</div>
            <div className="sm:col-span-2">
              active_exit_rule fordeling:{" "}
              <span className="font-mono">
                {tsDiagnostic?.ruleDistribution && Object.keys(tsDiagnostic.ruleDistribution).length > 0
                  ? Object.entries(tsDiagnostic.ruleDistribution)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")
                  : "-"}
              </span>
            <div>mapped_exit_stop_points: {fmt(tsDiagnostic?.mappedExitStopPoints ?? 0)}</div>
            <div>render_exit_stop: {fmt(tsDiagnostic?.renderExitStop ?? false)}</div>
            <div>render_mode: <span className="font-mono">{tsDiagnostic?.renderMode ?? "-"}</span></div>
            <div className="sm:col-span-2">render_reason: <span className="font-mono">{tsDiagnostic?.renderReason ?? "-"}</span></div>
          </div>
          </div>
          <div className="text-muted-foreground mt-1">
            {tsDiagnostic?.hasHistorical
              ? "Exit Stop tegnes som step-funktion baseret på exit_stop_history (faktisk logget pr. evaluering)."
              : "Ingen historik fundet — Exit Stop tegnes som flad linje med aktuel værdi (kun nye trades får historik)."}
          </div>
        </section>
        <section className="min-w-0">
          <div className="font-semibold mb-1">2. Series summary</div>
          <div className="w-full max-w-full overflow-x-auto">
            <table className="min-w-[760px] text-[10px] border-collapse">
              <thead>
                <tr className="text-left border-b border-border/50">
                  <th className="pr-2 py-1">Serie</th>
                  <th className="pr-2">Source</th>
                  <th className="pr-2">N</th>
                  <th className="pr-2">First</th>
                  <th className="pr-2">Last</th>
                  <th className="pr-2">Min</th>
                  <th className="pr-2">Max</th>
                  <th className="pr-2">Vist?</th>
                  <th>Hvorfor</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.name} className="border-b border-border/20 align-top">
                    <td className="pr-2 py-0.5 whitespace-nowrap">{s.name}</td>
                    <td className="pr-2 text-muted-foreground max-w-[220px] whitespace-normal">{s.sourceField}</td>
                    <td className="pr-2 font-mono">{s.count}</td>
                    <td className="pr-2 font-mono">
                      {s.first != null ? formatPriceAdaptive(s.first) : "-"}
                    </td>
                    <td className="pr-2 font-mono">
                      {s.last != null ? formatPriceAdaptive(s.last) : "-"}
                    </td>
                    <td className="pr-2 font-mono">
                      {s.min != null ? formatPriceAdaptive(s.min) : "-"}
                    </td>
                    <td className="pr-2 font-mono">
                      {s.max != null ? formatPriceAdaptive(s.max) : "-"}
                    </td>
                    <td className={s.rendered ? "text-emerald-500" : "text-rose-500"}>
                      {String(s.rendered)}
                    </td>
                    <td className="text-muted-foreground max-w-[220px] whitespace-normal">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="min-w-0">
          <div className="font-semibold mb-1">3. Candle merge</div>
          <div>antal candles: <span className="font-mono">{chartData.length}</span></div>
          <div>første ts: {firstC ? new Date(firstC.timestamp).toISOString() : "-"}</div>
          <div>sidste ts: {lastC ? new Date(lastC.timestamp).toISOString() : "-"}</div>
          <div>
            trade-periode:{" "}
            {derived.openTime ? new Date(derived.openTime).toISOString() : "-"} →{" "}
            {derived.closeTime ? new Date(derived.closeTime).toISOString() : "(åben)"}
          </div>
          <div className="text-muted-foreground mt-1">
            BE/TS/PL/Aktiv Stop læses kun fra trade-felter. Aktuelle stop-niveauer vises kun på seneste in-trade candle.
          </div>
        </section>

        <section>
          <div className="font-semibold mb-1">4. Validation (side: {side})</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <div>trailingStop ugyldige: <span className="font-mono">{validate("trailingStop")}</span></div>
            <div>effectiveStop ugyldige: <span className="font-mono">{validate("effectiveStop")}</span></div>
            <div>breakEven ugyldige: <span className="font-mono">{validate("breakEven")}</span></div>
            <div>peakLockStop ugyldige: <span className="font-mono">{validate("peakLockStop")}</span></div>
          </div>
          <div className="text-muted-foreground mt-1">
            LONG: stop ≤ candle.high · SHORT: stop ≥ candle.low
          </div>
        </section>

        <section>
          <div className="font-semibold mb-1">5. Mistanke</div>
          <ul className="space-y-0.5">
            <li>Trailing Stop N: <span className="font-mono">{tsPointCount}</span></li>
            <li>Aktiv Stop N: <span className="font-mono">{activePointCount}</span></li>
            <li>Aktiv Stop = exit_price (exit-leak): {fmt(effEqualsExit)}</li>
            <li>
              ⚠️ BE vises men break_even_triggered=false: {fmt(beShownButNotTriggered)}
            </li>
            <li>
              ⚠️ TS vises men trailing_stop_initial_price=null & trailing_stop=null:{" "}
              {fmt(tsShownButNoInit)}
            </li>
          </ul>
        </section>

        <section>
          <div className="font-semibold mb-1">6. Konklusion</div>
          <div className="text-muted-foreground">
            Chartet bruger kun faktiske trade-felter til stop-linjer. Trailing Stop source: <code>trade.trailing_stop</code>. Aktiv Stop source: <code>trade.trailing_stop</code> hvis den findes, ellers <code>trade.stop_loss</code>. Break-Even shown: {String(flags.hasBreakEven)}. Peak-Lock shown: {String(flags.hasPeakLock)}.
          </div>
        </section>
      </div>
    </details>
  );
};
