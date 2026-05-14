// Pine Script v5 generator from slot indicator_config.
// Mirrors bot logic: hard vs soft filters, signal_conditions_required count,
// per-side StochRSI zones, ATR% min, HTF trend.

export interface SlotConfigLike {
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

  // hard-filter flags (when false → soft condition)
  stochrsi_hard_filter?: boolean | null;
  macd_hard_filter?: boolean | null;
  atr_hard_filter?: boolean | null;
  higher_trend_hard_filter?: boolean | null;

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
  min_atr_percent?: number | null;

  // Hard SL %
  hard_sl_pct?: number | null;

  // Max duration
  max_position_duration_minutes?: number | null;

  // Soft conditions count
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
  const minAtrPct = n(cfg.min_atr_percent, 0);

  const hardSlPct = n(cfg.hard_sl_pct, 3);
  const maxDurMin = n(cfg.max_position_duration_minutes, 0);

  const useStoch = b(cfg.stochrsi_enabled, true);
  const useMacd = b(cfg.macd_enabled, true);
  const useAtr = b(cfg.atr_enabled, true);
  const useHtf = b(cfg.higher_trend_enabled, true);
  const useBE = b(cfg.break_even_enabled, true);
  const useTrail = b(cfg.trailing_stop_activation_enabled, true);
  const useHardSl = b(cfg.hard_sl_pct_enabled, true);

  // Hard vs soft filter flags. Default: soft (false) — only block if explicitly hard.
  const stochHard = b(cfg.stochrsi_hard_filter, true); // StochRSI is the primary signal — hard by default
  const macdHard = b(cfg.macd_hard_filter, false);
  const atrHard = b(cfg.atr_hard_filter, false);
  const htfHard = b(cfg.higher_trend_hard_filter, false);

  const softRequired = n(cfg.signal_conditions_required, 1);

  const title = `${slotLabel} – ${cfg.name ?? "Strategy"}`.replace(/"/g, "'");

  return `//@version=5
// ====================================================================
// Auto-generated from Lovable slot config
// Slot: ${slotLabel}
// Source config: ${cfg.name ?? "(unnamed)"}
// Mirrors bot: hard/soft filters, signal_conditions_required = ${softRequired}
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
i_startDate     = input.time(timestamp("2000-01-01 00:00 +0000"), "Start date", group="Backtest range")
i_endDate       = input.time(timestamp("2099-01-01 00:00 +0000"), "End date",   group="Backtest range")
i_allowLong     = input.bool(true,  "Allow LONG",  group="Direction")
i_allowShort    = input.bool(true,  "Allow SHORT", group="Direction")

i_useStoch      = input.bool(${useStoch}, "Use StochRSI",                  group="Indicators")
i_stochHard     = input.bool(${stochHard},"StochRSI is HARD filter",       group="Indicators")
i_useMacd       = input.bool(${useMacd},  "Use MACD histogram",            group="Indicators")
i_macdHard      = input.bool(${macdHard}, "MACD is HARD filter",           group="Indicators")
i_useHtf        = input.bool(${useHtf},   "Use higher timeframe trend",    group="Indicators")
i_htfHard       = input.bool(${htfHard},  "HTF trend is HARD filter",      group="Indicators")
i_useAtrMin     = input.bool(${useAtr},   "Use ATR% minimum filter",       group="Indicators")
i_atrHard       = input.bool(${atrHard},  "ATR min is HARD filter",        group="Indicators")
i_softRequired  = input.int(${softRequired}, "Soft conditions required (count)", minval=0, group="Indicators")

i_stochLen      = input.int(${stochP}, "StochRSI length", minval=1, group="StochRSI")
i_stochK        = input.int(${stochK}, "Stoch %K", minval=1, group="StochRSI")
i_stochD        = input.int(${stochD}, "Stoch %D", minval=1, group="StochRSI")
i_stochOSK      = input.float(${stochOSK}, "Oversold K (LONG)",     group="StochRSI")
i_stochOSD      = input.float(${stochOSD}, "Oversold D (LONG)",     group="StochRSI")
i_stochOBK      = input.float(${stochOBK}, "Overbought K (SHORT)",  group="StochRSI")
i_stochOBD      = input.float(${stochOBD}, "Overbought D (SHORT)",  group="StochRSI")

i_macdFast      = input.int(${macdF},   "MACD fast",   minval=1, group="MACD")
i_macdSlow      = input.int(${macdS},   "MACD slow",   minval=1, group="MACD")
i_macdSignal    = input.int(${macdSig}, "MACD signal", minval=1, group="MACD")
i_macdHistThr   = input.float(${macdHistThr}, "MACD hist threshold", step=0.0001, group="MACD")

i_atrLen        = input.int(${atrP}, "ATR length", minval=1, group="ATR / Stops")
i_minAtrPct     = input.float(${minAtrPct}, "Min ATR %", step=0.05, group="ATR / Stops")
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

i_debugPlots    = input.bool(true, "Show debug bool plots", group="Debug")

// ---------- Date filter ----------
inDateRange = (time >= i_startDate) and (time <= i_endDate)

// ---------- Indicators ----------
// StochRSI = stochastic applied to RSI series
rsiSrc = ta.rsi(close, i_stochLen)
_kRaw  = ta.stoch(rsiSrc, rsiSrc, rsiSrc, i_stochLen)
kLine  = ta.sma(_kRaw, i_stochK)
dLine  = ta.sma(kLine, i_stochD)

[macdLine, signalLine, histLine] = ta.macd(close, i_macdFast, i_macdSlow, i_macdSignal)

atrVal = ta.atr(i_atrLen)
atrPct = close > 0 ? (atrVal / close) * 100.0 : 0.0

// HTF trend via EMA on higher timeframe
htfEma = request.security(syminfo.tickerid, i_htfTf, ta.ema(close, i_htfEmaLen), barmerge.gaps_off, barmerge.lookahead_off)
htfBullish = close > htfEma
htfBearish = close < htfEma

// ---------- Per-condition pass flags ----------
// StochRSI: per-side zones
longStochPassed  = not i_useStoch or (kLine < i_stochOSK and dLine < i_stochOSD)
shortStochPassed = not i_useStoch or (kLine > i_stochOBK and dLine > i_stochOBD)

// MACD histogram per side
longMacdPassed   = not i_useMacd or (histLine >  i_macdHistThr)
shortMacdPassed  = not i_useMacd or (histLine < -i_macdHistThr)

// HTF trend per side
longHtfPassed    = not i_useHtf or htfBullish
shortHtfPassed   = not i_useHtf or htfBearish

// ATR min filter (side-agnostic)
atrPassed        = not i_useAtrMin or (atrPct >= i_minAtrPct)

// ---------- Hard vs soft gates ----------
// Hard gate: must pass if filter is enabled AND marked hard. If soft, hard gate is true.
longHardGate  = (not i_useStoch or not i_stochHard or longStochPassed) and (not i_useMacd or not i_macdHard or longMacdPassed) and (not i_useHtf or not i_htfHard or longHtfPassed) and (not i_useAtrMin or not i_atrHard or atrPassed)
shortHardGate = (not i_useStoch or not i_stochHard or shortStochPassed) and (not i_useMacd or not i_macdHard or shortMacdPassed) and (not i_useHtf or not i_htfHard or shortHtfPassed) and (not i_useAtrMin or not i_atrHard or atrPassed)

// Soft conditions: count only conditions that are enabled AND NOT hard
longSoftCount =
     (i_useStoch  and not i_stochHard and longStochPassed  ? 1 : 0) +
     (i_useMacd   and not i_macdHard  and longMacdPassed   ? 1 : 0) +
     (i_useHtf    and not i_htfHard   and longHtfPassed    ? 1 : 0) +
     (i_useAtrMin and not i_atrHard   and atrPassed        ? 1 : 0)

shortSoftCount =
     (i_useStoch  and not i_stochHard and shortStochPassed ? 1 : 0) +
     (i_useMacd   and not i_macdHard  and shortMacdPassed  ? 1 : 0) +
     (i_useHtf    and not i_htfHard   and shortHtfPassed   ? 1 : 0) +
     (i_useAtrMin and not i_atrHard   and atrPassed        ? 1 : 0)

// Number of available soft slots (enabled and not hard)
softSlotCount =
     (i_useStoch  and not i_stochHard ? 1 : 0) +
     (i_useMacd   and not i_macdHard  ? 1 : 0) +
     (i_useHtf    and not i_htfHard   ? 1 : 0) +
     (i_useAtrMin and not i_atrHard   ? 1 : 0)

requiredSoft = math.min(i_softRequired, softSlotCount)
longSoftPassed  = longSoftCount  >= requiredSoft
shortSoftPassed = shortSoftCount >= requiredSoft

finalLongSignal  = i_allowLong  and inDateRange and longHardGate  and longSoftPassed
finalShortSignal = i_allowShort and inDateRange and shortHardGate and shortSoftPassed

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
if finalLongSignal and strategy.position_size <= 0
    strategy.entry("LONG", strategy.long)

if finalShortSignal and strategy.position_size >= 0
    strategy.entry("SHORT", strategy.short)

justEntered = strategy.position_size != 0 and na(entryPrice)
if justEntered
    entryPrice   := strategy.position_avg_price
    entryAtr     := atrVal
    entryBarTime := time

// ---------- Exit logic ----------
isLong  = strategy.position_size > 0
isShort = strategy.position_size < 0

hardSlLong  = i_useHardSl and not na(entryPrice) ? entryPrice * (1 - i_hardSlPct / 100.0) : na
hardSlShort = i_useHardSl and not na(entryPrice) ? entryPrice * (1 + i_hardSlPct / 100.0) : na

atrSlLong   = not na(entryPrice) and not na(entryAtr) ? entryPrice - i_atrSlMult * entryAtr : na
atrSlShort  = not na(entryPrice) and not na(entryAtr) ? entryPrice + i_atrSlMult * entryAtr : na

beTriggerLong  = not na(entryPrice) and not na(entryAtr) and (high - entryPrice) >= i_beAtr * entryAtr
beTriggerShort = not na(entryPrice) and not na(entryAtr) and (entryPrice - low)  >= i_beAtr * entryAtr

if i_useBE and isLong and beTriggerLong and not beActive
    beActive := true
    beStop   := entryPrice + i_beOffset * entryAtr
if i_useBE and isShort and beTriggerShort and not beActive
    beActive := true
    beStop   := entryPrice - i_beOffset * entryAtr

trailActiveLong  = i_useTrail and not na(entryPrice) and not na(entryAtr) and (high - entryPrice) >= i_trailActAtr * entryAtr
trailActiveShort = i_useTrail and not na(entryPrice) and not na(entryAtr) and (entryPrice - low)  >= i_trailActAtr * entryAtr

if isLong and trailActiveLong
    candidate = high - i_atrTrailMult * atrVal
    trailStop := na(trailStop) ? candidate : math.max(trailStop, candidate)
if isShort and trailActiveShort
    candidate = low + i_atrTrailMult * atrVal
    trailStop := na(trailStop) ? candidate : math.min(trailStop, candidate)

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

if i_maxDurMin > 0 and strategy.position_size != 0 and not na(entryBarTime)
    if (time - entryBarTime) >= i_maxDurMin * 60 * 1000
        strategy.close_all(comment="TIME_EXIT")

// ---------- Plots ----------
plot(isLong  ? effectiveLong  : na, "Active Stop (LONG)",  color=color.red,    style=plot.style_linebr, linewidth=2)
plot(isShort ? effectiveShort : na, "Active Stop (SHORT)", color=color.red,    style=plot.style_linebr, linewidth=2)
plot(beActive ? beStop : na,        "Break-even",          color=color.yellow, style=plot.style_linebr, linewidth=1)
plot(trailStop,                     "Trailing stop",       color=color.aqua,   style=plot.style_linebr, linewidth=1)
plot(htfEma,                        "HTF EMA",             color=color.orange)

plotshape(finalLongSignal  and strategy.position_size <= 0, title="Long signal",  style=shape.triangleup,   location=location.belowbar, color=color.green, size=size.tiny)
plotshape(finalShortSignal and strategy.position_size >= 0, title="Short signal", style=shape.triangledown, location=location.abovebar, color=color.red,   size=size.tiny)

// Debug bool plots (toggle via i_debugPlots) — visible in Data Window
plot(i_debugPlots and longStochPassed   ? 1 : 0, "dbg longStochPassed",   display=display.data_window)
plot(i_debugPlots and shortStochPassed  ? 1 : 0, "dbg shortStochPassed",  display=display.data_window)
plot(i_debugPlots and longMacdPassed    ? 1 : 0, "dbg longMacdPassed",    display=display.data_window)
plot(i_debugPlots and shortMacdPassed   ? 1 : 0, "dbg shortMacdPassed",   display=display.data_window)
plot(i_debugPlots and atrPassed         ? 1 : 0, "dbg atrPassed",         display=display.data_window)
plot(i_debugPlots and longHtfPassed     ? 1 : 0, "dbg longHtfPassed",     display=display.data_window)
plot(i_debugPlots and shortHtfPassed    ? 1 : 0, "dbg shortHtfPassed",    display=display.data_window)
plot(i_debugPlots and longSoftPassed    ? 1 : 0, "dbg longSoftPassed",    display=display.data_window)
plot(i_debugPlots and shortSoftPassed   ? 1 : 0, "dbg shortSoftPassed",   display=display.data_window)
plot(i_debugPlots ? longSoftCount  : na,         "dbg longSoftCount",     display=display.data_window)
plot(i_debugPlots ? shortSoftCount : na,         "dbg shortSoftCount",    display=display.data_window)
plot(i_debugPlots ? requiredSoft   : na,         "dbg requiredSoft",      display=display.data_window)
plot(i_debugPlots and finalLongSignal   ? 1 : 0, "dbg finalLongSignal",   display=display.data_window)
plot(i_debugPlots and finalShortSignal  ? 1 : 0, "dbg finalShortSignal",  display=display.data_window)
`;
}
