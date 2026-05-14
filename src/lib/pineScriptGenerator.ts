// Pine Script v5 generator from slot indicator_config.
// MVP scope: StochRSI, MACD histogram, ATR SL, trailing stop, break-even,
// higher timeframe trend, LONG/SHORT. Other features are emitted as
// optional gated blocks so the script stays compilable.

export interface SlotConfigLike {
  // identity
  name?: string | null;
  scan_interval?: string | null;
  higher_trend_timeframe?: string | null;

  // toggles
  stochrsi_enabled?: boolean | null;
  macd_enabled?: boolean | null;
  atr_enabled?: boolean | null;
  higher_trend_enabled?: boolean | null;
  break_even_enabled?: boolean | null;
  trailing_stop_activation_enabled?: boolean | null;
  hard_sl_pct_enabled?: boolean | null;

  // StochRSI
  stochrsi_period?: number | null;
  stochrsi_k_period?: number | null;
  stochrsi_d_period?: number | null;
  stochrsi_oversold_k?: number | null;
  stochrsi_oversold_d?: number | null;
  stochrsi_overbought_k?: number | null;
  stochrsi_overbought_d?: number | null;

  // MACD
  macd_fast?: number | null;
  macd_slow?: number | null;
  macd_signal?: number | null;
  macd_histogram_threshold?: number | null;

  // ATR
  atr_period?: number | null;
  atr_stop_loss_multiplier?: number | null;
  atr_trailing_stop_multiplier?: number | null;
  trailing_stop_activation_atr?: number | null;
  break_even_atr?: number | null;
  break_even_atr_stop_offset?: number | null;

  // Hard SL %
  hard_sl_pct?: number | null;

  // Max duration
  max_position_duration_minutes?: number | null;

  // Required soft conditions
  signal_conditions_required?: number | null;
}

const TF_MAP: Record<string, string> = {
  "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
  "1h": "60", "2h": "120", "4h": "240", "6h": "360", "8h": "480", "12h": "720",
  "1d": "D", "1w": "W",
};

function tf(s?: string | null, fallback = "60"): string {
  if (!s) return fallback;
  return TF_MAP[s] ?? fallback;
}

function n(v: number | null | undefined, fallback: number): number {
  return v == null || !Number.isFinite(Number(v)) ? fallback : Number(v);
}

function b(v: boolean | null | undefined, fallback = false): boolean {
  return v == null ? fallback : !!v;
}

export function generatePineScript(cfg: SlotConfigLike, slotLabel = "Slot"): string {
  const mainTf = tf(cfg.scan_interval, "60");
  const htfTf = tf(cfg.higher_trend_timeframe, mainTf);

  const stochP = n(cfg.stochrsi_period, 14);
  const stochK = n(cfg.stochrsi_k_period, 3);
  const stochD = n(cfg.stochrsi_d_period, 3);
  const stochOSK = n(cfg.stochrsi_oversold_k, 20);
  const stochOSD = n(cfg.stochrsi_oversold_d, 20);
  const stochOBK = n(cfg.stochrsi_overbought_k, 80);
  const stochOBD = n(cfg.stochrsi_overbought_d, 80);

  const macdF = n(cfg.macd_fast, 12);
  const macdS = n(cfg.macd_slow, 26);
  const macdSig = n(cfg.macd_signal, 9);
  const macdHistThr = n(cfg.macd_histogram_threshold, 0);

  const atrP = n(cfg.atr_period, 14);
  const atrSlMult = n(cfg.atr_stop_loss_multiplier, 2);
  const atrTrailMult = n(cfg.atr_trailing_stop_multiplier, 2);
  const trailActAtr = n(cfg.trailing_stop_activation_atr, 1);
  const beAtr = n(cfg.break_even_atr, 1);
  const beOffset = n(cfg.break_even_atr_stop_offset, 0);

  const hardSlPct = n(cfg.hard_sl_pct, 3);
  const maxDurMin = n(cfg.max_position_duration_minutes, 0);

  const useStoch = b(cfg.stochrsi_enabled, true);
  const useMacd = b(cfg.macd_enabled, true);
  const useAtr = b(cfg.atr_enabled, true);
  const useHtf = b(cfg.higher_trend_enabled, true);
  const useBE = b(cfg.break_even_enabled, true);
  const useTrail = b(cfg.trailing_stop_activation_enabled, true);
  const useHardSl = b(cfg.hard_sl_pct_enabled, true);

  const title = `${slotLabel} – ${cfg.name ?? "Strategy"}`.replace(/"/g, "'");

  return `//@version=5
// ====================================================================
// Auto-generated from Lovable slot config
// Slot: ${slotLabel}
// Source config: ${cfg.name ?? "(unnamed)"}
// MVP features: StochRSI, MACD hist, ATR SL, Trailing, Break-even, HTF trend
// ====================================================================
strategy("${title}", overlay=true,
     pyramiding=0,
     default_qty_type=strategy.percent_of_equity,
     default_qty_value=10,
     initial_capital=10000,
     calc_on_every_tick=false,
     process_orders_on_close=true,
     commission_type=strategy.commission.percent,
     commission_value=0.04,
     slippage=2)

// ---------- Inputs ----------
i_startDate     = input.time(timestamp("2024-01-01 00:00 +0000"), "Start date", group="Backtest range")
i_endDate       = input.time(timestamp("2099-01-01 00:00 +0000"), "End date",   group="Backtest range")
i_allowLong     = input.bool(true,  "Allow LONG",  group="Direction")
i_allowShort    = input.bool(true,  "Allow SHORT", group="Direction")

i_useStoch      = input.bool(${useStoch}, "Use StochRSI", group="Indicators")
i_useMacd       = input.bool(${useMacd},  "Use MACD histogram", group="Indicators")
i_useHtf        = input.bool(${useHtf},   "Use higher timeframe trend", group="Indicators")

i_stochLen      = input.int(${stochP}, "StochRSI length", minval=1, group="StochRSI")
i_stochK        = input.int(${stochK}, "Stoch %K", minval=1, group="StochRSI")
i_stochD        = input.int(${stochD}, "Stoch %D", minval=1, group="StochRSI")
i_stochOSK      = input.float(${stochOSK}, "Oversold K",   group="StochRSI")
i_stochOSD      = input.float(${stochOSD}, "Oversold D",   group="StochRSI")
i_stochOBK      = input.float(${stochOBK}, "Overbought K", group="StochRSI")
i_stochOBD      = input.float(${stochOBD}, "Overbought D", group="StochRSI")

i_macdFast      = input.int(${macdF},   "MACD fast",   minval=1, group="MACD")
i_macdSlow      = input.int(${macdS},   "MACD slow",   minval=1, group="MACD")
i_macdSignal    = input.int(${macdSig}, "MACD signal", minval=1, group="MACD")
i_macdHistThr   = input.float(${macdHistThr}, "MACD hist threshold", step=0.0001, group="MACD")

i_atrLen        = input.int(${atrP}, "ATR length", minval=1, group="ATR / Stops")
i_atrSlMult     = input.float(${atrSlMult},   "ATR SL multiplier",      step=0.1, group="ATR / Stops")
i_atrTrailMult  = input.float(${atrTrailMult},"ATR Trailing multiplier",step=0.1, group="ATR / Stops")
i_trailActAtr   = input.float(${trailActAtr},"Trailing activation (xATR profit)", step=0.1, group="ATR / Stops")
i_useTrail      = input.bool(${useTrail}, "Use trailing stop", group="ATR / Stops")

i_useBE         = input.bool(${useBE},   "Use break-even", group="Break-even")
i_beAtr         = input.float(${beAtr},  "BE trigger (xATR profit)", step=0.1, group="Break-even")
i_beOffset      = input.float(${beOffset},"BE stop offset (xATR over entry)", step=0.05, group="Break-even")

i_useHardSl     = input.bool(${useHardSl}, "Use hard SL %", group="Hard SL")
i_hardSlPct     = input.float(${hardSlPct}, "Hard SL %", step=0.1, group="Hard SL")

i_maxDurMin     = input.int(${maxDurMin}, "Max duration minutes (0 = off)", minval=0, group="Time exit")

i_htfTf         = input.timeframe("${htfTf}", "Higher timeframe", group="HTF trend")
i_htfEmaLen     = input.int(50, "HTF EMA length", minval=1, group="HTF trend")

// ---------- Date filter ----------
inDateRange = (time >= i_startDate) and (time <= i_endDate)

// ---------- Indicators ----------
// StochRSI = Stoch applied to RSI series, then K/D smoothing
rsiSrc = ta.rsi(close, i_stochLen)
_kRaw  = ta.stoch(rsiSrc, rsiSrc, rsiSrc, i_stochLen)
kLine  = ta.sma(_kRaw, i_stochK)
dLine  = ta.sma(kLine, i_stochD)

[macdLine, signalLine, histLine] = ta.macd(close, i_macdFast, i_macdSlow, i_macdSignal)

atrVal = ta.atr(i_atrLen)

// HTF trend via EMA on higher timeframe
htfEma = request.security(syminfo.tickerid, i_htfTf, ta.ema(close, i_htfEmaLen), barmerge.gaps_off, barmerge.lookahead_off)
htfBullish = close > htfEma
htfBearish = close < htfEma

// ---------- Entry conditions ----------
stochLongOK  = not i_useStoch or (kLine < i_stochOSK and dLine < i_stochOSD)
stochShortOK = not i_useStoch or (kLine > i_stochOBK and dLine > i_stochOBD)

macdLongOK   = not i_useMacd or (histLine >  i_macdHistThr)
macdShortOK  = not i_useMacd or (histLine < -i_macdHistThr)

htfLongOK    = not i_useHtf or htfBullish
htfShortOK   = not i_useHtf or htfBearish

longCond  = i_allowLong  and inDateRange and stochLongOK  and macdLongOK  and htfLongOK
shortCond = i_allowShort and inDateRange and stochShortOK and macdShortOK and htfShortOK

// ---------- State for stops ----------
var float entryPrice    = na
var float entryAtr      = na
var int   entryBarTime  = na
var float trailStop     = na
var float beStop        = na
var bool  beActive      = false

if strategy.position_size == 0
    entryPrice   := na
    entryAtr     := na
    entryBarTime := na
    trailStop    := na
    beStop       := na
    beActive     := false

// ---------- Entries ----------
if longCond and strategy.position_size <= 0
    strategy.entry("LONG", strategy.long)

if shortCond and strategy.position_size >= 0
    strategy.entry("SHORT", strategy.short)

// ---------- Capture entry context on the first bar of a position ----------
justEntered = strategy.position_size != 0 and na(entryPrice)
if justEntered
    entryPrice   := strategy.position_avg_price
    entryAtr     := atrVal
    entryBarTime := time

// ---------- Exit logic ----------
isLong  = strategy.position_size > 0
isShort = strategy.position_size < 0

// Hard SL %
hardSlLong  = i_useHardSl and not na(entryPrice) ? entryPrice * (1 - i_hardSlPct / 100.0) : na
hardSlShort = i_useHardSl and not na(entryPrice) ? entryPrice * (1 + i_hardSlPct / 100.0) : na

// ATR SL (initial)
atrSlLong   = not na(entryPrice) and not na(entryAtr) ? entryPrice - i_atrSlMult * entryAtr : na
atrSlShort  = not na(entryPrice) and not na(entryAtr) ? entryPrice + i_atrSlMult * entryAtr : na

// Break-even
beTriggerLong  = not na(entryPrice) and not na(entryAtr) and (high - entryPrice) >= i_beAtr * entryAtr
beTriggerShort = not na(entryPrice) and not na(entryAtr) and (entryPrice - low)  >= i_beAtr * entryAtr

if i_useBE and isLong and beTriggerLong and not beActive
    beActive := true
    beStop   := entryPrice + i_beOffset * entryAtr
if i_useBE and isShort and beTriggerShort and not beActive
    beActive := true
    beStop   := entryPrice - i_beOffset * entryAtr

// Trailing stop activation: profit >= trailActAtr * entryAtr
trailActiveLong  = i_useTrail and not na(entryPrice) and not na(entryAtr) and (high - entryPrice) >= i_trailActAtr * entryAtr
trailActiveShort = i_useTrail and not na(entryPrice) and not na(entryAtr) and (entryPrice - low)  >= i_trailActAtr * entryAtr

if isLong and trailActiveLong
    candidate = high - i_atrTrailMult * atrVal
    trailStop := na(trailStop) ? candidate : math.max(trailStop, candidate)
if isShort and trailActiveShort
    candidate = low + i_atrTrailMult * atrVal
    trailStop := na(trailStop) ? candidate : math.min(trailStop, candidate)

// Compose effective stop (most protective)
float effectiveLong  = na
float effectiveShort = na
if isLong
    effectiveLong := atrSlLong
    if not na(hardSlLong)
        effectiveLong := na(effectiveLong) ? hardSlLong : math.max(effectiveLong, hardSlLong)
    if beActive and not na(beStop)
        effectiveLong := na(effectiveLong) ? beStop : math.max(effectiveLong, beStop)
    if not na(trailStop)
        effectiveLong := na(effectiveLong) ? trailStop : math.max(effectiveLong, trailStop)
if isShort
    effectiveShort := atrSlShort
    if not na(hardSlShort)
        effectiveShort := na(effectiveShort) ? hardSlShort : math.min(effectiveShort, hardSlShort)
    if beActive and not na(beStop)
        effectiveShort := na(effectiveShort) ? beStop : math.min(effectiveShort, beStop)
    if not na(trailStop)
        effectiveShort := na(effectiveShort) ? trailStop : math.min(effectiveShort, trailStop)

if isLong and not na(effectiveLong)
    strategy.exit("XL", from_entry="LONG", stop=effectiveLong)
if isShort and not na(effectiveShort)
    strategy.exit("XS", from_entry="SHORT", stop=effectiveShort)

// Max duration time-exit
if i_maxDurMin > 0 and strategy.position_size != 0 and not na(entryBarTime)
    if (time - entryBarTime) >= i_maxDurMin * 60 * 1000
        strategy.close_all(comment="TIME_EXIT")

// ---------- Plots ----------
plot(isLong  ? effectiveLong  : na, "Active Stop (LONG)",  color=color.red,    style=plot.style_linebr, linewidth=2)
plot(isShort ? effectiveShort : na, "Active Stop (SHORT)", color=color.red,    style=plot.style_linebr, linewidth=2)
plot(beActive ? beStop : na,        "Break-even",          color=color.yellow, style=plot.style_linebr, linewidth=1)
plot(trailStop,                     "Trailing stop",       color=color.aqua,   style=plot.style_linebr, linewidth=1)
plot(htfEma,                        "HTF EMA",             color=color.orange)

plotshape(longCond  and strategy.position_size <= 0, title="Long signal",  style=shape.triangleup,   location=location.belowbar, color=color.green, size=size.tiny)
plotshape(shortCond and strategy.position_size >= 0, title="Short signal", style=shape.triangledown, location=location.abovebar, color=color.red,   size=size.tiny)
`;
}
