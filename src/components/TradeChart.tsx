import { useEffect, useMemo, useState } from "react";
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
} from "recharts";
import { Loader2 } from "lucide-react";

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
  effectiveStop: number | null;
  trailingStop: number | null;
  breakEven: number | null;
  peakLockStop: number | null;
  entryMarker: number | null;
  exitMarker: number | null;
  // Marker for "post-exit" så vi visuelt kan adskille perioden
  isPostExit: boolean;
}

interface TriggerLevels {
  breakEvenTrigger: number | null;
  trailingTrigger: number | null;
  peakLockTrigger: number | null;
}

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
    trade?.closed_at != null ||
    trade?.exit_price != null;

  if (isClosed) return <ClosedTradeChart trade={trade} />;
  return <OpenTradeChart trade={trade} />;
};

// =============================================================================
// Fælles indikator-rekonstruktion (BE / TS / Peak-Lock niveauer over tid)
// =============================================================================
const buildSeries = (
  trade: any,
  klines: any[],
  openTime: number,
): {
  data: ChartRow[];
  triggers: TriggerLevels;
  markers: ActivationMarkers;
} => {
  const entryPrice = Number(trade.entry_price);
  const side = trade.side as "LONG" | "SHORT";
  const stopLoss = Number(trade.stop_loss);

  const snap = trade.indicators_snapshot ?? {};

  const atrValue = Number(snap.atr) || entryPrice * 0.01;
  const atrTrailingMultiplier =
    Number(snap.atr_trailing_stop_multiplier) ||
    Number(snap.trailing_stop_atr_multiplier) ||
    1.8;
  const atrTrailingDistance = atrValue * atrTrailingMultiplier;

  const trailingActivationEnabled = snap.trailing_stop_activation_enabled ?? true;
  const trailingActivationAtr = Number(snap.trailing_stop_activation_atr) || 1.0;

  const breakEvenAtr = Number(snap.break_even_atr) || 1.5;
  const breakEvenStopOffset =
    (Number(snap.break_even_atr_stop_offset) || 0) * atrValue;

  const peakLockEnabled = snap.peak_lock_enabled ?? false;
  const peakLockActivateProfitPct =
    Number(snap.peak_lock_activate_profit_pct) || 0.6;
  const peakLockDistancePct = Number(snap.peak_lock_distance_pct) || 0.35;
  const peakLockMinProfitFloorPct =
    Number(snap.peak_lock_min_profit_floor_pct) || 0.15;
  const peakLockRatchetOnly = snap.peak_lock_ratchet_only ?? true;

  const trailingStopDb =
    trade.trailing_stop != null ? Number(trade.trailing_stop) : null;
  const peakPriceDb =
    trade.peak_price != null ? Number(trade.peak_price) : null;

  let peakPrice = entryPrice;
  let currentStopLoss = isFinite(stopLoss) && stopLoss > 0 ? stopLoss : entryPrice;
  let breakEvenActivated = false;
  let peakLockActivated = false;
  let peakLockStopValue: number | null = null;

  let breakEvenActivatedAt: number | null = null;
  let trailingStopActivatedAt: number | null = null;
  let peakLockActivatedAt: number | null = null;

  const closeTime = trade.closed_at
    ? new Date(trade.closed_at).getTime()
    : Number.POSITIVE_INFINITY;

  const data: ChartRow[] = klines.map((k: any) => {
    const timestamp = k[0];
    const price = parseFloat(k[4]);
    const high = parseFloat(k[2]);
    const low = parseFloat(k[3]);

    let trailingStop: number | null = null;
    let effectiveStop: number | null = null;

    const isPostExit = timestamp > closeTime;
    const inTradeWindow = timestamp >= openTime && !isPostExit;

    if (inTradeWindow) {
      effectiveStop = currentStopLoss;

      const profitInAtr =
        side === "LONG"
          ? (price - entryPrice) / atrValue
          : (entryPrice - price) / atrValue;
      const isInProfit = profitInAtr > 0;

      // ---- Break-Even ------------------------------------------------------
      if (!breakEvenActivated) {
        const beDistance = breakEvenAtr * atrValue;
        const beReached =
          side === "LONG"
            ? price >= entryPrice + beDistance
            : price <= entryPrice - beDistance;

        if (beReached) {
          const beStop =
            side === "LONG"
              ? Math.max(entryPrice + breakEvenStopOffset, entryPrice)
              : Math.min(entryPrice - breakEvenStopOffset, entryPrice);
          currentStopLoss = beStop;
          breakEvenActivated = true;
          breakEvenActivatedAt = timestamp;
          effectiveStop = currentStopLoss;
        }
      }

      // ---- Peak price ------------------------------------------------------
      if (side === "LONG") {
        if (price > peakPrice) peakPrice = price;
        if (peakPriceDb != null && peakPriceDb > peakPrice) peakPrice = peakPriceDb;
      } else {
        if (price < peakPrice) peakPrice = price;
        if (peakPriceDb != null && peakPriceDb > 0 && peakPriceDb < peakPrice)
          peakPrice = peakPriceDb;
      }

      // ---- Trailing Stop ---------------------------------------------------
      const trailingActive =
        (trailingStopDb != null && isFinite(trailingStopDb) && trailingStopDb > 0) ||
        (breakEvenActivated &&
          isInProfit &&
          (!trailingActivationEnabled || profitInAtr >= trailingActivationAtr));

      if (trailingActive) {
        if (trailingStopActivatedAt == null) trailingStopActivatedAt = timestamp;

        const calcTs =
          side === "LONG"
            ? peakPrice - atrTrailingDistance
            : peakPrice + atrTrailingDistance;
        const inProfitZone =
          side === "LONG" ? calcTs > entryPrice : calcTs < entryPrice;
        const improves =
          side === "LONG" ? calcTs > currentStopLoss : calcTs < currentStopLoss;

        if (inProfitZone && improves) trailingStop = calcTs;
        else trailingStop = null;

        effectiveStop = currentStopLoss;
        if (trailingStop != null) {
          effectiveStop =
            side === "LONG"
              ? Math.max(effectiveStop, trailingStop)
              : Math.min(effectiveStop, trailingStop);
        }
      }

      // ---- Peak-Lock -------------------------------------------------------
      if (peakLockEnabled && breakEvenActivated) {
        const profitPct =
          side === "LONG"
            ? ((price - entryPrice) / entryPrice) * 100
            : ((entryPrice - price) / entryPrice) * 100;

        if (profitPct >= peakLockActivateProfitPct) {
          if (peakLockActivatedAt == null) peakLockActivatedAt = timestamp;
          peakLockActivated = true;

          const plStop =
            side === "LONG"
              ? peakPrice * (1 - peakLockDistancePct / 100)
              : peakPrice * (1 + peakLockDistancePct / 100);
          const floorStop =
            side === "LONG"
              ? entryPrice * (1 + peakLockMinProfitFloorPct / 100)
              : entryPrice * (1 - peakLockMinProfitFloorPct / 100);

          const candidate =
            side === "LONG" ? Math.max(plStop, floorStop) : Math.min(plStop, floorStop);
          peakLockStopValue = candidate;

          const newStop =
            side === "LONG"
              ? Math.max(currentStopLoss, candidate)
              : Math.min(currentStopLoss, candidate);

          if (peakLockRatchetOnly) {
            const shouldRatchet =
              side === "LONG" ? newStop > currentStopLoss : newStop < currentStopLoss;
            if (shouldRatchet) currentStopLoss = newStop;
          } else {
            currentStopLoss = newStop;
          }
          effectiveStop = currentStopLoss;
        }
      }
    }

    return {
      timestamp,
      time: new Date(timestamp).toLocaleTimeString("da-DK", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      price,
      high,
      low,
      effectiveStop,
      trailingStop,
      breakEven: !isPostExit && breakEvenActivated ? entryPrice : null,
      peakLockStop: !isPostExit && peakLockActivated ? peakLockStopValue : null,
      entryMarker: null,
      exitMarker: null,
      isPostExit,
    };
  });

  // Triggere (faste niveauer)
  const triggers: TriggerLevels = {
    breakEvenTrigger:
      side === "LONG"
        ? entryPrice + breakEvenAtr * atrValue
        : entryPrice - breakEvenAtr * atrValue,
    trailingTrigger: trailingActivationEnabled
      ? side === "LONG"
        ? entryPrice + trailingActivationAtr * atrValue
        : entryPrice - trailingActivationAtr * atrValue
      : null,
    peakLockTrigger: peakLockEnabled
      ? side === "LONG"
        ? entryPrice * (1 + peakLockActivateProfitPct / 100)
        : entryPrice * (1 - peakLockActivateProfitPct / 100)
      : null,
  };

  return {
    data,
    triggers,
    markers: {
      breakEvenAt: breakEvenActivatedAt,
      trailingAt: trailingStopActivatedAt,
      peakLockAt: peakLockActivatedAt,
    },
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
// Hjælper — beregn smart label-placering for trigger-linjer (undgå overlap)
// =============================================================================
const assignLabelPositions = (
  levels: { value: number; key: string }[],
): Record<string, "insideTopLeft" | "insideTopRight" | "insideBottomLeft" | "insideBottomRight" | "insideLeft" | "insideRight"> => {
  // Sorter efter pris og fordel labels skiftevis venstre/højre + top/bottom
  const sorted = [...levels].sort((a, b) => b.value - a.value);
  const out: Record<string, any> = {};
  const positions: Array<
    "insideTopLeft" | "insideTopRight" | "insideLeft" | "insideRight" | "insideBottomLeft" | "insideBottomRight"
  > = [
    "insideTopLeft",
    "insideTopRight",
    "insideLeft",
    "insideRight",
    "insideBottomLeft",
    "insideBottomRight",
  ];
  sorted.forEach((lvl, i) => {
    out[lvl.key] = positions[i % positions.length];
  });
  return out;
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
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch klines");
        const klines = await res.json();

        const { data, triggers, markers } = buildSeries(trade, klines, openTime);

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
      trade={trade}
      triggers={triggers}
      markers={markers}
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
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch klines");
        const klines = await res.json();

        const { data, triggers, markers } = buildSeries(trade, klines, openTime);

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
      trade={trade}
      triggers={triggers}
      markers={markers}
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
  trade: any;
  triggers: TriggerLevels;
  markers: ActivationMarkers;
  mode: "open" | "closed";
}

const ChartShell = ({
  loading,
  chartData,
  trade,
  triggers,
  markers,
  mode,
}: ChartShellProps) => {
  const isClosed = mode === "closed";

  // ---- Y-akse range -------------------------------------------------------
  const { yMin, yMax } = useMemo(() => {
    const entryPrice = Number(trade.entry_price);
    const priceValues = chartData
      .map((d) => d.price)
      .filter((p) => p != null && isFinite(p) && p > 0);

    let pool: number[] = [...priceValues];
    if (entryPrice > 0) pool.push(entryPrice);

    // EffectiveStop kun hvis tæt på prisen (max 3x rangen)
    if (priceValues.length > 0) {
      const pMin = Math.min(...priceValues);
      const pMax = Math.max(...priceValues);
      const range = Math.max(pMax - pMin, entryPrice * 0.005);
      const maxDist = range * 3;

      chartData.forEach((d) => {
        if (d.effectiveStop != null && Math.abs(d.effectiveStop - entryPrice) <= maxDist) {
          pool.push(d.effectiveStop);
        }
        if (d.trailingStop != null && Math.abs(d.trailingStop - entryPrice) <= maxDist) {
          pool.push(d.trailingStop);
        }
      });
    }

    // Stop loss og exit hvis inden for 10%
    const stopLoss = Number(trade.stop_loss);
    if (stopLoss && isFinite(stopLoss) && stopLoss > 0) {
      const distPct = (Math.abs(stopLoss - entryPrice) / entryPrice) * 100;
      if (distPct <= 12) pool.push(stopLoss);
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
  }, [chartData, trade, triggers, isClosed]);

  // ---- Smart label-placering for trigger-linjer ---------------------------
  const labelPositions = useMemo(() => {
    const lvls: { value: number; key: string }[] = [];
    if (trade.entry_price)
      lvls.push({ value: Number(trade.entry_price), key: "entry" });
    const initialSL =
      trade.indicators_snapshot?.original_stop_loss ?? trade.stop_loss;
    if (initialSL) lvls.push({ value: Number(initialSL), key: "initialSl" });
    if (triggers.breakEvenTrigger != null)
      lvls.push({ value: triggers.breakEvenTrigger, key: "beTrigger" });
    if (triggers.trailingTrigger != null)
      lvls.push({ value: triggers.trailingTrigger, key: "tsTrigger" });
    if (triggers.peakLockTrigger != null)
      lvls.push({ value: triggers.peakLockTrigger, key: "plTrigger" });
    if (isClosed && trade.exit_price)
      lvls.push({ value: Number(trade.exit_price), key: "exit" });
    return assignLabelPositions(lvls);
  }, [trade, triggers, isClosed]);

  if (loading) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        Ingen chart data tilgængelig
      </div>
    );
  }

  // Vis kun BE/TS trigger-linjer hvis de IKKE allerede er aktiverede
  const showBeTrigger = markers.breakEvenAt == null && triggers.breakEvenTrigger != null;
  const showTsTrigger = markers.trailingAt == null && triggers.trailingTrigger != null;
  const showPlTrigger = markers.peakLockAt == null && triggers.peakLockTrigger != null;

  const initialSlPrice =
    trade.indicators_snapshot?.original_stop_loss ?? trade.stop_loss;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground px-1">
        {isClosed
          ? `Lukket handel — viser ${15} candles efter exit`
          : "Åben handel — opdateres med live prisudvikling"}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) =>
              new Date(v).toLocaleTimeString("da-DK", {
                hour: "2-digit",
                minute: "2-digit",
              })
            }
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => formatPriceAdaptive(v)}
            width={95}
          />
          <Tooltip {...tooltipProps} />
          <Legend
            wrapperStyle={{
              paddingTop: "16px",
              fontSize: "13px",
              fontWeight: 600,
            }}
            iconType="line"
          />

          {/* Pris */}
          <Line
            type="monotone"
            dataKey="price"
            stroke="#2563eb"
            strokeWidth={3}
            dot={false}
            name="💰 Pris"
            isAnimationActive={false}
          />

          {/* Trailing Stop */}
          <Line
            type="stepAfter"
            dataKey="trailingStop"
            stroke="#ec4899"
            strokeWidth={3}
            strokeDasharray="6 3"
            dot={false}
            name="🎯 Trailing Stop"
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Aktiv stop */}
          <Line
            type="stepAfter"
            dataKey="effectiveStop"
            stroke="#f97316"
            strokeWidth={4}
            strokeDasharray="8 4"
            dot={false}
            name="🛑 Aktiv Stop"
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Break-Even */}
          <Line
            type="stepAfter"
            dataKey="breakEven"
            stroke="#a855f7"
            strokeWidth={2.5}
            strokeDasharray="4 4"
            dot={false}
            name="⚖️ Break-Even"
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Peak-Lock */}
          <Line
            type="stepAfter"
            dataKey="peakLockStop"
            stroke="#06b6d4"
            strokeWidth={2.5}
            strokeDasharray="3 2"
            dot={false}
            name="🔒 Peak-Lock"
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Entry marker */}
          <Scatter
            dataKey="entryMarker"
            fill="#16a34a"
            shape={<CustomShape />}
            name="📍 Entry"
            isAnimationActive={false}
          />

          {/* Exit marker (kun lukket) */}
          {isClosed && (
            <Scatter
              dataKey="exitMarker"
              fill="#dc2626"
              shape={<CustomShape />}
              name="🚪 Exit"
              isAnimationActive={false}
            />
          )}

          {/* Entry pris-linje */}
          <ReferenceLine
            y={Number(trade.entry_price)}
            stroke="#16a34a"
            strokeWidth={1.5}
            strokeDasharray="10 5"
            strokeOpacity={0.7}
            label={{
              value: `Entry $${formatPriceAdaptive(trade.entry_price)}`,
              fill: "#16a34a",
              fontSize: 11,
              fontWeight: "bold",
              position: labelPositions.entry ?? "insideTopRight",
            }}
          />

          {/* Initial Stop Loss */}
          {initialSlPrice && Number(initialSlPrice) > 0 && (
            <ReferenceLine
              y={Number(initialSlPrice)}
              stroke="#dc2626"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              strokeOpacity={0.55}
              label={{
                value: `Initial SL $${formatPriceAdaptive(initialSlPrice)}`,
                fill: "#dc2626",
                fontSize: 10,
                fontWeight: "bold",
                position: labelPositions.initialSl ?? "insideBottomRight",
              }}
            />
          )}

          {/* BE Trigger (kun hvis ikke aktiveret endnu) */}
          {showBeTrigger && (
            <ReferenceLine
              y={triggers.breakEvenTrigger as number}
              stroke="#a855f7"
              strokeWidth={1.25}
              strokeDasharray="2 4"
              strokeOpacity={0.55}
              label={{
                value: `BE Trigger $${formatPriceAdaptive(triggers.breakEvenTrigger)}`,
                fill: "#a855f7",
                fontSize: 10,
                fontWeight: "normal",
                position: labelPositions.beTrigger ?? "insideTopLeft",
              }}
            />
          )}

          {/* TS Trigger (kun hvis ikke aktiveret endnu) */}
          {showTsTrigger && (
            <ReferenceLine
              y={triggers.trailingTrigger as number}
              stroke="#ec4899"
              strokeWidth={1.25}
              strokeDasharray="2 4"
              strokeOpacity={0.55}
              label={{
                value: `TS Trigger $${formatPriceAdaptive(triggers.trailingTrigger)}`,
                fill: "#ec4899",
                fontSize: 10,
                fontWeight: "normal",
                position: labelPositions.tsTrigger ?? "insideTopRight",
              }}
            />
          )}

          {/* Peak-Lock Trigger (kun hvis ikke aktiveret endnu) */}
          {showPlTrigger && (
            <ReferenceLine
              y={triggers.peakLockTrigger as number}
              stroke="#06b6d4"
              strokeWidth={1.25}
              strokeDasharray="2 4"
              strokeOpacity={0.55}
              label={{
                value: `PL Trigger $${formatPriceAdaptive(triggers.peakLockTrigger)}`,
                fill: "#06b6d4",
                fontSize: 10,
                fontWeight: "normal",
                position: labelPositions.plTrigger ?? "insideBottomLeft",
              }}
            />
          )}

          {/* Peak price (kun hvis data findes) */}
          {trade.peak_price && Number(trade.peak_price) > 0 && (
            <ReferenceLine
              y={Number(trade.peak_price)}
              stroke="#0891b2"
              strokeWidth={1}
              strokeDasharray="1 3"
              strokeOpacity={0.5}
              label={{
                value: `Peak $${formatPriceAdaptive(trade.peak_price)}`,
                fill: "#0891b2",
                fontSize: 10,
                fontWeight: "normal",
                position: "insideRight",
              }}
            />
          )}

          {/* Exit pris-linje (kun lukket) */}
          {isClosed && trade.exit_price != null && (
            <ReferenceLine
              y={Number(trade.exit_price)}
              stroke="#dc2626"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              strokeOpacity={0.65}
              label={{
                value: `Exit $${formatPriceAdaptive(trade.exit_price)}`,
                fill: "#dc2626",
                fontSize: 11,
                fontWeight: "bold",
                position: labelPositions.exit ?? "insideTopRight",
              }}
            />
          )}

          {/* Lodret Exit-streg så post-exit zone er tydelig */}
          {isClosed && trade.closed_at && (
            <ReferenceLine
              x={new Date(trade.closed_at).getTime()}
              stroke="#dc2626"
              strokeWidth={1.5}
              strokeDasharray="2 4"
              strokeOpacity={0.6}
              label={{
                value: "EXIT",
                fill: "#dc2626",
                fontSize: 10,
                fontWeight: "bold",
                position: "insideTop",
              }}
            />
          )}

          {/* Aktiveringsmarkører (lodret) */}
          {markers.breakEvenAt != null && (
            <ReferenceLine
              x={markers.breakEvenAt}
              stroke="#a855f7"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              strokeOpacity={0.7}
              label={{
                value: "⚖️ BE",
                fill: "#a855f7",
                fontSize: 10,
                fontWeight: "bold",
                position: "insideTop",
              }}
            />
          )}
          {markers.trailingAt != null && (
            <ReferenceLine
              x={markers.trailingAt}
              stroke="#ec4899"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              strokeOpacity={0.7}
              label={{
                value: "🎯 TS",
                fill: "#ec4899",
                fontSize: 10,
                fontWeight: "bold",
                position: "insideTop",
              }}
            />
          )}
          {markers.peakLockAt != null && (
            <ReferenceLine
              x={markers.peakLockAt}
              stroke="#06b6d4"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              strokeOpacity={0.7}
              label={{
                value: "🔒 PL",
                fill: "#06b6d4",
                fontSize: 10,
                fontWeight: "bold",
                position: "insideTop",
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
