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
  Customized,
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

// Diagnose af TS-historik (vises i debug + UI banner)
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
// Fælles chart-serie — læser kun faktiske trade-værdier, ingen lokal beregning
// =============================================================================
const buildSeries = (
  trade: any,
  klines: any[],
  openTime: number,
): {
  data: ChartRow[];
  triggers: TriggerLevels;
  markers: ActivationMarkers;
  tsDiagnostic: TsHistoryDiagnostic;
} => {
  const side = trade.side as "LONG" | "SHORT";

  const toPositiveNumber = (value: any): number | null => {
    const n = Number(value);
    return value != null && isFinite(n) && n > 0 ? n : null;
  };

  // ---- KUN FAKTISKE TRADE-VÆRDIER ----------------------------------------
  const stopLossDb = toPositiveNumber(trade.stop_loss);

  const breakEvenTriggered = trade.break_even_triggered === true;
  const breakEvenAtPrice =
    breakEvenTriggered ? toPositiveNumber(trade.break_even_at_price) : null;

  const trailingStopDb = toPositiveNumber(trade.trailing_stop);

  const peakLockActivated = trade.peak_lock_activated === true;
  const peakLockStopPrice =
    peakLockActivated ? toPositiveNumber(trade.peak_lock_stop_price) : null;

  // Aktiv Stop = mest beskyttende DB-værdi (LONG: max, SHORT: min)
  const stopCandidates = [
    stopLossDb,
    breakEvenAtPrice,
    trailingStopDb,
    peakLockStopPrice,
  ].filter((v): v is number => v != null);

  let effectiveStopDb: number | null = null;
  if (stopCandidates.length > 0) {
    effectiveStopDb =
      side === "LONG" ? Math.max(...stopCandidates) : Math.min(...stopCandidates);
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

  const validForSide = (v: number | null, row: ChartRow): number | null => {
    if (v == null || !isFinite(v) || v <= 0) return null;
    if (side === "LONG" && v > row.high) return null;
    if (side === "SHORT" && v < row.low) return null;
    return v;
  };

  // Tegn exitStop som FLAD linje over hele in-trade-vinduet (ingen rekonstruktion).
  // Dette repræsenterer "hvad ville lukke handlen lige nu" — den eneste sandhed vi har.
  if (effectiveStopDb != null) {
    data.forEach((row) => {
      if (row.timestamp >= openTime && !row.isPostExit) {
        // Side-validering: stop må ikke ligge på "forkert side" af candle
        // (LONG: stop > high → ugyldig; SHORT: stop < low → ugyldig).
        // Vi tillader stadig at vise den hvis den er korrekt placeret ift. close.
        const valid =
          side === "LONG" ? effectiveStopDb <= row.high * 1.5 : effectiveStopDb >= row.low * 0.5;
        if (valid) row.exitStop = effectiveStopDb;
      }
    });
  }

  const latestInTradeIndex = data.reduce((latest, row, idx) => {
    if (row.timestamp < openTime || row.isPostExit) return latest;
    return idx;
  }, -1);

  if (latestInTradeIndex >= 0) {
    const row = data[latestInTradeIndex];
    row.trailingStop = validForSide(trailingStopDb, row);
    row.effectiveStop = validForSide(effectiveStopDb, row);
    row.breakEven = validForSide(breakEvenAtPrice, row);
    row.peakLockStop = validForSide(peakLockStopPrice, row);
  }

  // ---- TS-historik diagnose ---------------------------------------------
  // Vi har INGEN historisk TS-tabel i DB. Kun current value på trade.trailing_stop.
  const tsDiagnostic: TsHistoryDiagnostic = {
    hasHistorical: false,
    source: trailingStopDb != null
      ? "trade.trailing_stop (kun current value — ingen historik i DB)"
      : "ingen TS-data tilgængelig",
    pointCount: trailingStopDb != null ? 1 : 0,
    firstTs: trailingStopDb != null && latestInTradeIndex >= 0 ? data[latestInTradeIndex].timestamp : null,
    firstValue: trailingStopDb,
    lastTs: trailingStopDb != null && latestInTradeIndex >= 0 ? data[latestInTradeIndex].timestamp : null,
    lastValue: trailingStopDb,
    activationTs: null, // ikke logget i DB
    isReconstructed: false, // vi rekonstruerer IKKE — vi viser kun current
  };

  return {
    data,
    triggers: {
      breakEvenTrigger: null,
      trailingTrigger: null,
      peakLockTrigger: null,
    },
    markers: {
      breakEvenAt: null,
      trailingAt: null,
      peakLockAt: null,
    },
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

        const { data, triggers, markers, tsDiagnostic } = buildSeries(trade, klines, openTime);

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

    const pool: number[] = [...priceValues];
    if (entryPrice > 0) pool.push(entryPrice);

    chartData.forEach((d) => {
      if (d.effectiveStop != null) pool.push(d.effectiveStop);
      if (d.trailingStop != null) pool.push(d.trailingStop);
      if (d.breakEven != null) pool.push(d.breakEven);
      if (d.peakLockStop != null) pool.push(d.peakLockStop);
    });

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
  }, [chartData, trade, triggers, isClosed]);

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
  const hasTrailing = chartData.some((d) => d.trailingStop != null);
  const hasBreakEven = chartData.some((d) => d.breakEven != null);
  const hasPeakLock = chartData.some((d) => d.peakLockStop != null);
  const hasEffective = chartData.some((d) => d.effectiveStop != null);
  const hasInitialSl = isFinite(initialSlPrice) && initialSlPrice > 0;
  const hasPeak = peakPrice != null && isFinite(peakPrice) && peakPrice > 0;
  const currentTrailingStop = [...chartData].reverse().find((d) => d.trailingStop != null)?.trailingStop ?? null;
  const currentEffectiveStop = [...chartData].reverse().find((d) => d.effectiveStop != null)?.effectiveStop ?? null;

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
  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as ChartRow | undefined;
    if (!row) return null;
    const pctFromEntry =
      entryPrice > 0 ? ((row.price - entryPrice) / entryPrice) * 100 : null;
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
          {row.effectiveStop != null && (
            <div className="text-orange-500">
              🛑 Aktiv Stop ${formatPriceAdaptive(row.effectiveStop)}
            </div>
          )}
          {row.trailingStop != null && (
            <div className="text-pink-500">
              🎯 TS ${formatPriceAdaptive(row.trailingStop)}
            </div>
          )}
          {row.breakEven != null && (
            <div className="text-purple-500">
              ⚖️ BE ${formatPriceAdaptive(row.breakEven)}
            </div>
          )}
          {row.peakLockStop != null && (
            <div className="text-cyan-500">
              🔒 Peak-Lock ${formatPriceAdaptive(row.peakLockStop)}
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

      {/* Mobil-venligt: fuld bredde, aldrig vandret scroll */}
      <div className="h-[400px] w-full max-w-full min-w-0 overflow-x-hidden sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%" debounce={1}>

            <ComposedChart
              data={chartData}
              margin={{ top: 16, right: 12, left: 4, bottom: 24 }}
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={xTicks}
                tick={{ fontSize: 9 }}
                tickFormatter={fmtTimeShort}
                minTickGap={40}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 9 }}
                tickFormatter={(v) => formatPriceAdaptive(v)}
                width={64}
              />
              <Tooltip content={renderTooltip} />
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

              {hasTrailing && (
                <Line
                  type="stepAfter"
                  dataKey="trailingStop"
                  stroke="#ec4899"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={{ r: 4, strokeWidth: 2 }}
                  name="🎯 Trailing Stop"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}

              {hasEffective && (
                <Line
                  type="stepAfter"
                  dataKey="effectiveStop"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  strokeDasharray="8 4"
                  dot={{ r: 4, strokeWidth: 2 }}
                  name="🛑 Aktiv Stop"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}

              {hasBreakEven && (
                <Line
                  type="stepAfter"
                  dataKey="breakEven"
                  stroke="#a855f7"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="⚖️ Break-Even"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}

              {hasPeakLock && (
                <Line
                  type="stepAfter"
                  dataKey="peakLockStop"
                  stroke="#06b6d4"
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                  dot={false}
                  name="🔒 Peak-Lock"
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
              {currentTrailingStop != null && (
                <ReferenceLine
                  y={currentTrailingStop}
                  stroke="#ec4899"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  strokeOpacity={0.75}
                />
              )}
              {currentEffectiveStop != null && currentEffectiveStop !== currentTrailingStop && (
                <ReferenceLine
                  y={currentEffectiveStop}
                  stroke="#f97316"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  strokeOpacity={0.75}
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

      {/* ===================== DEBUG PANEL (midlertidig) ===================== */}
      <ChartDebugPanel
        trade={trade}
        chartData={chartData}
        triggers={triggers}
        markers={markers}
        flags={{ hasTrailing, hasEffective, hasBreakEven, hasPeakLock, hasInitialSl, hasPeak }}
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
  triggers,
  markers,
  flags,
  derived,
}: {
  trade: any;
  chartData: ChartRow[];
  triggers: TriggerLevels;
  markers: ActivationMarkers;
  flags: {
    hasTrailing: boolean;
    hasEffective: boolean;
    hasBreakEven: boolean;
    hasPeakLock: boolean;
    hasInitialSl: boolean;
    hasPeak: boolean;
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
