// Pine Script v5 generator from slot indicator_config.
// Mirrors bot logic:
//  - StochRSI: per-side zone (oversold LONG / overbought SHORT) — primary, HARD by default
//  - MACD Histogram: SOFT, directional (hist > thr LONG, hist < -thr SHORT) — when macd_enabled
//  - MACD Histogram Momentum: SOFT, separate condition — when histogram_momentum_enabled
//  - MACD Direction: HARD — when macd_direction_enabled (same directional check)
//  - Higher Timeframe trend (EMA): toggleable hard/soft
//  - ATR% min filter: toggleable hard/soft
//  - signal_conditions_required = minimum SOFT conditions that must pass
//  - Exits: ATR SL, Hard SL%, Break-even (xATR), Trailing (xATR), Max-SL-after-MFE, Max duration

export interface SlotConfigLike {
  name?: string | null;
  scan_interval?: string | null;
  higher_trend_timeframe?: string | null;

  // toggles
  stochrsi_enabled?: boolean | null;
  macd_enabled?: boolean | null;
  macd_direction_enabled?: boolean | null;
  histogram_momentum_enabled?: boolean | null;
  histogram_momentum_periods?: number | null;
  atr_enabled?: boolean | null;
  higher_trend_enabled?: boolean | null;
  break_even_enabled?: boolean | null;
  trailing_stop_activation_enabled?: boolean | null;
  hard_sl_pct_enabled?: boolean | null;

  // hard/soft flags
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

  // Max SL after MFE
  max_sl_after_mfe_enabled?: boolean | null;
  max_sl_after_mfe_activate_pct?: number | null;
  max_sl_after_mfe_max_dist_pct?: number | null;

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

const tf = (s?: string | null, fallback = "60") => (s && TF_MAP[s]) || fallback;
const n = (v: number | null | undefined, fallback: number) =>
  v == null || !Number.isFinite(Number(v)) ? fallback : Number(v);
const b = (v: boolean | null | undefined, fallback = false) => (v == null ? fallback : !!v);

export function generatePineScript(
  cfg: SlotConfigLike,
  slotLabel = "Slot",
  slotNumber?: number,
): string {
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
  const histMomPeriods = n(cfg.histogram_momentum_periods, 3);

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
  const useMacdDir = b(cfg.macd_direction_enabled, false);
  const useHistMom = b(cfg.histogram_momentum_enabled, false);
  const useAtr = b(cfg.atr_enabled, true);
  const useHtf = b(cfg.higher_trend_enabled, false);
  const useBE = b(cfg.break_even_enabled, true);
  const useTrail = b(cfg.trailing_stop_activation_enabled, true);
  const useHardSl = b(cfg.hard_sl_pct_enabled, true);

  const useMfeCap = b(cfg.max_sl_after_mfe_enabled, false);
  const mfeActivatePct = n(cfg.max_sl_after_mfe_activate_pct, 1.3);
  const mfeMaxDistPct = n(cfg.max_sl_after_mfe_max_dist_pct, 0.8);

  // StochRSI hard by default (primary signal). Other filters: hard only if explicitly hard.
  const stochHard = b(cfg.stochrsi_hard_filter, true);
  const macdHard = b(cfg.macd_hard_filter, false);
  const atrHard = b(cfg.atr_hard_filter, false);
  const htfHard = b(cfg.higher_trend_hard_filter, false);

  const softRequired = n(cfg.signal_conditions_required, 1);

  const title = `${slotLabel} – ${cfg.name ?? "Strategy"}`.replace(/"/g, "'");

  // Header summary lines listing active gates
  const hardList: string[] = [];
  if (useStoch && stochHard) hardList.push("StochRSI");
  if (useMacdDir) hardList.push("MACD Direction");
  if (useMacd && macdHard) hardList.push("MACD Histogram");
  if (useHtf && htfHard) hardList.push("HTF Trend");
  if (useAtr && atrHard) hardList.push("ATR% min");
  if (useHardSl) hardList.push("Hard SL%");

  const softList: string[] = [];
  if (useStoch && !stochHard) softList.push("StochRSI");
  if (useMacd && !macdHard) softList.push("MACD Histogram");
  if (useHistMom) softList.push("MACD Histogram Momentum");
  if (useHtf && !htfHard) softList.push("HTF Trend");
  if (useAtr && !atrHard) softList.push("ATR% min");

  const slotNumStr = slotNumber != null ? String(slotNumber) : "?";

  return `//@version=5
// ====================================================================
// Auto-generated from Lovable slot config
//   Slot number     : ${slotNumStr}
//   Slot name       : ${slotLabel}
//   Source config   : ${cfg.name ?? "(unnamed)"}
//   Main TF         : ${mainTf}    HTF: ${htfTf}
//   Hard filters    : ${hardList.join(", ") || "(none)"}
//   Soft conditions : ${softList.join(", ") || "(none)"}
//   Required soft   : ${softRequired} / ${softList.length}
//   MFE cap         : ${useMfeCap ? `activate=${mfeActivatePct}% maxDist=${mfeMaxDistPct}%` : "off"}
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
i_useMacd       = input.bool(${useMacd},  "Use MACD histogram (soft)",     group="Indicators")
i_macdHard      = input.bool(${macdHard}, "MACD histogram is HARD filter", group="Indicators")
i_useMacdDir    = input.bool(${useMacdDir},"Use MACD direction (HARD)",    group="Indicators")
i_useHistMom    = input.bool(${useHistMom},"Use MACD Histogram Momentum (soft)", group="Indicators")
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
i_histMomLen    = input.int(${histMomPeriods}, "Histogram momentum periods", minval=2, group="MACD")

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

i_useMfeCap     = input.bool(${useMfeCap}, "Use Max SL after MFE", group="Max SL after MFE")
i_mfeActPct     = input.float(${mfeActivatePct}, "Activate at MFE %", step=0.05, group="Max SL after MFE")
i_mfeMaxDistPct = input.float(${mfeMaxDistPct}, "Max SL distance from entry %", step=0.05, group="Max SL after MFE")

i_maxDurMin     = input.int(${maxDurMin}, "Max duration minutes (0 = off)", minval=0, group="Time exit")

i_htfTf         = input.timeframe("${htfTf}", "Higher timeframe", group="HTF trend")
i_htfEmaLen     = input.int(50, "HTF EMA length", minval=1, group="HTF trend")

i_debugPlots    = input.bool(true, "Show debug bool plots", group="Debug")

// ---------- Date filter ----------
inDateRange = (time >= i_startDate) and (time <= i_endDate)

// ---------- Indicators ----------
// StochRSI = stochastic on RSI series
rsiSrc = ta.rsi(close, i_stochLen)
_kRaw  = ta.stoch(rsiSrc, rsiSrc, rsiSrc, i_stochLen)
kLine  = ta.sma(_kRaw, i_stochK)
dLine  = ta.sma(kLine, i_stochD)

[macdLine, signalLine, histLine] = ta.macd(close, i_macdFast, i_macdSlow, i_macdSignal)

// Histogram momentum: cur = hist[0]-hist[1], prev = hist[1]-hist[2]
curMom  = histLine - histLine[1]
prevMom = histLine[1] - histLine[2]

atrVal = ta.atr(i_atrLen)
atrPct = close > 0 ? (atrVal / close) * 100.0 : 0.0

htfEma = request.security(syminfo.tickerid, i_htfTf, ta.ema(close, i_htfEmaLen), barmerge.gaps_off, barmerge.lookahead_off)
htfBullish = close > htfEma
htfBearish = close < htfEma

// ---------- Per-condition pass flags ----------
longStochPassed  = not i_useStoch or (kLine < i_stochOSK and dLine < i_stochOSD)
shortStochPassed = not i_useStoch or (kLine > i_stochOBK and dLine > i_stochOBD)

// MACD Histogram (NON-directional soft): magnitude only — same for L/S
macdHistPassed     = not i_useMacd or (math.abs(histLine) > i_macdHistThr)
longMacdHistPassed  = macdHistPassed
shortMacdHistPassed = macdHistPassed

// MACD Histogram Momentum (NON-directional soft): strength of momentum change
macdMomPassed      = not i_useHistMom or (math.abs(curMom) > math.abs(prevMom))
longMacdMomPassed  = macdMomPassed
shortMacdMomPassed = macdMomPassed

// MACD Direction (HARD only when enabled): directional histogram check
longMacdDirPassed  = not i_useMacdDir or (histLine >  i_macdHistThr)
shortMacdDirPassed = not i_useMacdDir or (histLine < -i_macdHistThr)

longHtfPassed    = not i_useHtf    or htfBullish
shortHtfPassed   = not i_useHtf    or htfBearish

atrPassed        = not i_useAtrMin or (atrPct >= i_minAtrPct)

// ---------- Hard gates ----------
longHardGate  = (not i_useStoch or not i_stochHard or longStochPassed)  and (not i_useMacd or not i_macdHard or longMacdHistPassed)  and longMacdDirPassed  and (not i_useHtf or not i_htfHard or longHtfPassed)  and (not i_useAtrMin or not i_atrHard or atrPassed)
shortHardGate = (not i_useStoch or not i_stochHard or shortStochPassed) and (not i_useMacd or not i_macdHard or shortMacdHistPassed) and shortMacdDirPassed and (not i_useHtf or not i_htfHard or shortHtfPassed) and (not i_useAtrMin or not i_atrHard or atrPassed)

// ---------- Soft conditions (count only enabled+non-hard) ----------
longSoftCount =
     (i_useStoch  and not i_stochHard and longStochPassed     ? 1 : 0) +
     (i_useMacd   and not i_macdHard  and longMacdHistPassed  ? 1 : 0) +
     (i_useHistMom                    and longMacdMomPassed   ? 1 : 0) +
     (i_useHtf    and not i_htfHard   and longHtfPassed       ? 1 : 0) +
     (i_useAtrMin and not i_atrHard   and atrPassed           ? 1 : 0)

shortSoftCount =
     (i_useStoch  and not i_stochHard and shortStochPassed    ? 1 : 0) +
     (i_useMacd   and not i_macdHard  and shortMacdHistPassed ? 1 : 0) +
     (i_useHistMom                    and shortMacdMomPassed  ? 1 : 0) +
     (i_useHtf    and not i_htfHard   and shortHtfPassed      ? 1 : 0) +
     (i_useAtrMin and not i_atrHard   and atrPassed           ? 1 : 0)

softSlotCount =
     (i_useStoch  and not i_stochHard ? 1 : 0) +
     (i_useMacd   and not i_macdHard  ? 1 : 0) +
     (i_useHistMom                    ? 1 : 0) +
     (i_useHtf    and not i_htfHard   ? 1 : 0) +
     (i_useAtrMin and not i_atrHard   ? 1 : 0)

requiredSoft = math.min(i_softRequired, softSlotCount)
longSoftPassed  = longSoftCount  >= requiredSoft
shortSoftPassed = shortSoftCount >= requiredSoft

finalLongSignal  = i_allowLong  and inDateRange and longHardGate  and longSoftPassed
finalShortSignal = i_allowShort and inDateRange and shortHardGate and shortSoftPassed

// ---------- State ----------
var float entryPrice    = na
var float entryAtr      = na
var int   entryBarTime  = na
var float trailStop     = na
var float beStop        = na
var bool  beActive      = false
var float mfeStop       = na
var bool  mfeActive     = false

if strategy.position_size == 0
    entryPrice   := na
    entryAtr     := na
    entryBarTime := na
    trailStop    := na
    beStop       := na
    beActive     := false
    mfeStop      := na
    mfeActive    := false

// ---------- Entries ----------
if finalLongSignal and strategy.position_size <= 0
    strategy.entry("LONG", strategy.long)
if finalShortSignal and strategy.position_size >= 0
    strategy.entry("SHORT", strategy.short)

if strategy.position_size != 0 and na(entryPrice)
    entryPrice   := strategy.position_avg_price
    entryAtr     := atrVal
    entryBarTime := time

// ---------- Exits ----------
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

// Max SL after MFE: once MFE >= activate%, cap SL distance from entry to maxDist%
mfeLongPct  = isLong  and not na(entryPrice) ? (high - entryPrice) / entryPrice * 100.0 : na
mfeShortPct = isShort and not na(entryPrice) ? (entryPrice - low)  / entryPrice * 100.0 : na

if i_useMfeCap and isLong and not na(mfeLongPct) and mfeLongPct >= i_mfeActPct and not mfeActive
    mfeActive := true
    mfeStop   := entryPrice * (1 - i_mfeMaxDistPct / 100.0)
if i_useMfeCap and isShort and not na(mfeShortPct) and mfeShortPct >= i_mfeActPct and not mfeActive
    mfeActive := true
    mfeStop   := entryPrice * (1 + i_mfeMaxDistPct / 100.0)

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
    if mfeActive and not na(mfeStop)
        effectiveLong := na(effectiveLong) ? mfeStop : math.max(effectiveLong, mfeStop)
if isShort
    effectiveShort := atrSlShort
    if not na(hardSlShort)
        effectiveShort := na(effectiveShort) ? hardSlShort : math.min(effectiveShort, hardSlShort)
    if beActive and not na(beStop)
        effectiveShort := na(effectiveShort) ? beStop : math.min(effectiveShort, beStop)
    if not na(trailStop)
        effectiveShort := na(effectiveShort) ? trailStop : math.min(effectiveShort, trailStop)
    if mfeActive and not na(mfeStop)
        effectiveShort := na(effectiveShort) ? mfeStop : math.min(effectiveShort, mfeStop)

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
plot(mfeActive ? mfeStop : na,      "MFE-cap stop",        color=color.fuchsia,style=plot.style_linebr, linewidth=1)
plot(htfEma,                        "HTF EMA",             color=color.orange)

plotshape(finalLongSignal  and strategy.position_size <= 0, title="Long signal",  style=shape.triangleup,   location=location.belowbar, color=color.green, size=size.tiny)
plotshape(finalShortSignal and strategy.position_size >= 0, title="Short signal", style=shape.triangledown, location=location.abovebar, color=color.red,   size=size.tiny)

// Debug bool plots — Data Window
plot(i_debugPlots and longStochPassed       ? 1 : 0, "dbg longStochPassed",         display=display.data_window)
plot(i_debugPlots and shortStochPassed      ? 1 : 0, "dbg shortStochPassed",        display=display.data_window)
plot(i_debugPlots and longMacdHistPassed    ? 1 : 0, "dbg macdHistogramPassed L",   display=display.data_window)
plot(i_debugPlots and shortMacdHistPassed   ? 1 : 0, "dbg macdHistogramPassed S",   display=display.data_window)
plot(i_debugPlots and longMacdMomPassed     ? 1 : 0, "dbg macdHistogramMomentum L", display=display.data_window)
plot(i_debugPlots and shortMacdMomPassed    ? 1 : 0, "dbg macdHistogramMomentum S", display=display.data_window)
plot(i_debugPlots and longMacdDirPassed     ? 1 : 0, "dbg macdDirectionPassed L",   display=display.data_window)
plot(i_debugPlots and shortMacdDirPassed    ? 1 : 0, "dbg macdDirectionPassed S",   display=display.data_window)
plot(i_debugPlots and atrPassed             ? 1 : 0, "dbg atrPassed",               display=display.data_window)
plot(i_debugPlots and longHtfPassed         ? 1 : 0, "dbg longHtfPassed",           display=display.data_window)
plot(i_debugPlots and shortHtfPassed        ? 1 : 0, "dbg shortHtfPassed",          display=display.data_window)
plot(i_debugPlots and longSoftPassed        ? 1 : 0, "dbg softConditionsMet L",     display=display.data_window)
plot(i_debugPlots and shortSoftPassed       ? 1 : 0, "dbg softConditionsMet S",     display=display.data_window)
plot(i_debugPlots ? longSoftCount  : na,             "dbg longSoftCount",           display=display.data_window)
plot(i_debugPlots ? shortSoftCount : na,             "dbg shortSoftCount",          display=display.data_window)
plot(i_debugPlots ? requiredSoft   : na,             "dbg requiredSoft",            display=display.data_window)
plot(i_debugPlots and finalLongSignal       ? 1 : 0, "dbg finalLongSignal",         display=display.data_window)
plot(i_debugPlots and finalShortSignal      ? 1 : 0, "dbg finalShortSignal",        display=display.data_window)
`;
}
