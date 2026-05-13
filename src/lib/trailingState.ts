/**
 * SHARED SOURCE OF TRUTH for trailing stop activation and effective exit stop.
 *
 * Used by:
 *  - PositionManager (Live Position card in dashboard list)
 *  - TradeDetailsDialog (Live Position Status modal card)
 *  - TradeChart (Price chart Exit Stop line + debug panel)
 *
 * Strict rules (NO exceptions, no fallbacks elsewhere):
 *   - trailingActive REQUIRES a valid tsTrigger AND that the current price has
 *     crossed it (LONG: currentPrice >= tsTrigger, SHORT: currentPrice <= tsTrigger).
 *   - trade.trailing_stop existing in DB is NOT enough.
 *   - A computed/reconstructed trailing stop is NOT enough.
 *   - When trailingActive is false, effectiveExitStop falls back to BE level
 *     (if BE activated) or hardStop, never to a trailing value.
 */

export interface ChartRowLike {
  timestamp: number;
  high: number;
  low: number;
  price: number;
  isPostExit?: boolean;
}

export interface LiveExitStopState {
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
  trailingTriggerValid: boolean;
  trailingTriggerHit: boolean;
  trailingAllowedByTrigger: boolean;
  reasonIfTrailingInactive: string | null;
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

export const resolveLiveExitStopState = (
  trade: any,
  rows: ChartRowLike[] = [],
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

  // PRIMARY RULE: an existing valid trade.trailing_stop in DB means trailing has
  // already been activated by the backend. Treat it as the source of truth and
  // skip the trigger gate entirely.
  const dbTrailingValid = rawTrailingStop != null && Number.isFinite(rawTrailingStop);

  // Fallback STRICT trigger gate — only used when DB has no trailing_stop yet.
  const trailingTriggerValid = tsTrigger != null && Number.isFinite(tsTrigger);
  const trailingTriggerHit =
    trailingTriggerValid && currentPrice != null
      ? side === "LONG"
        ? currentPrice >= (tsTrigger as number)
        : currentPrice <= (tsTrigger as number)
      : false;
  const trailingAllowedByTrigger = trailingTriggerValid && trailingTriggerHit;
  const trailingActive =
    dbTrailingValid || (trailingAllowedByTrigger && computedTrailingStop != null);
  const reasonIfTrailingInactive = dbTrailingValid
    ? null
    : !trailingTriggerValid
      ? "NO_TS_TRIGGER"
      : !trailingTriggerHit
        ? "TRIGGER_NOT_HIT"
        : computedTrailingStop == null
          ? "NO_COMPUTED_STOP"
          : null;
  const beActivated = trade.break_even_activated === true || trade.break_even_triggered === true;
  const beStop = beActivated
    ? firstPositive(trade.break_even_at_price, snapshot.break_even_at_price, trade.stop_loss)
    : null;

  const debugFields = {
    trailingTriggerValid,
    trailingTriggerHit,
    trailingAllowedByTrigger,
    reasonIfTrailingInactive,
  };

  if (trailingActive) {
    const effectiveExitStop = dbTrailingValid
      ? (rawTrailingStop as number)
      : (computedTrailingStop as number);
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
      effectiveExitStop,
      sourceUsed: dbTrailingValid ? "TRADE_TRAILING_STOP" : "TRAILING_LIVE_FALLBACK",
      ...debugFields,
    };
  }

  if (beStop != null) {
    return {
      side, entryPrice, currentPrice, highestPrice, lowestPrice, tsTrigger,
      trailingDistance, trailingActive, rawTrailingStop, computedTrailingStop,
      hardStop, beStop, effectiveExitStop: beStop, sourceUsed: "BREAK_EVEN",
      ...debugFields,
    };
  }

  return {
    side, entryPrice, currentPrice, highestPrice, lowestPrice, tsTrigger,
    trailingDistance, trailingActive, rawTrailingStop, computedTrailingStop,
    hardStop, beStop, effectiveExitStop: hardStop,
    sourceUsed: hardStop != null ? "STOP_LOSS" : "NONE",
    ...debugFields,
  };
};
