// Pine Script v5 generator from slot indicator_config.
// Purpose: export the saved UI configuration as a TradingView strategy with
// strict boolean mapping, soft-count sanity validation, and runtime debug table.

export interface SlotConfigLike {
  name?: string | null;
  enabled?: boolean | null;
  scan_interval?: string | null;
  signal_timing_mode?: string | null;
  trend_timeframe?: string | null;
  trend_timeframe_enabled?: boolean | null;
  higher_trend_timeframe?: string | null;

  // Core indicator toggles
  ema_enabled?: boolean | null;
  rsi_enabled?: boolean | null;
  stochrsi_enabled?: boolean | null;
  pivot_points_enabled?: boolean | null;
  macd_enabled?: boolean | null;
  macd_direction_enabled?: boolean | null;
  macd_color_change_hard_filter?: boolean | null;
  histogram_momentum_enabled?: boolean | null;
  bb_enabled?: boolean | null;
  vwap_enabled?: boolean | null;
  atr_enabled?: boolean | null;
  adaptive_atr_enabled?: boolean | null;
  adx_enabled?: boolean | null;
  adaptive_adx_enabled?: boolean | null;
  volume_enabled?: boolean | null;
  higher_trend_enabled?: boolean | null;
  supertrend_enabled?: boolean | null;
  obv_enabled?: boolean | null;
  cci_enabled?: boolean | null;
  psar_enabled?: boolean | null;
  psar_trailing_enabled?: boolean | null;
  candle_momentum_enabled?: boolean | null;

  // Exit toggles
  auto_exit_enabled?: boolean | null;
  break_even_enabled?: boolean | null;
  break_even_ratchet_only?: boolean | null;
  break_even_atr_enabled?: boolean | null;
  break_even_profit_pct_enabled?: boolean | null;
  trailing_stop_activation_enabled?: boolean | null;
  peak_lock_enabled?: boolean | null;
  peak_lock_ratchet_only?: boolean | null;
  hard_sl_pct_enabled?: boolean | null;
  max_sl_after_mfe_enabled?: boolean | null;
  conditional_time_exit_enabled?: boolean | null;

  // Hard/soft flags
  ema_hard_filter?: boolean | null;
  ema_trend_hard_filter?: boolean | null;
  rsi_hard_filter?: boolean | null;
  stochrsi_hard_filter?: boolean | null;
  pivot_points_hard_filter?: boolean | null;
  macd_hard_filter?: boolean | null;
  bb_hard_filter?: boolean | null;
  vwap_hard_filter?: boolean | null;
  atr_hard_filter?: boolean | null;
  adx_hard_filter?: boolean | null;
  volume_hard_filter?: boolean | null;
  higher_trend_hard_filter?: boolean | null;
  supertrend_hard_filter?: boolean | null;
  obv_hard_filter?: boolean | null;
  cci_hard_filter?: boolean | null;
  psar_hard_filter?: boolean | null;
  candle_momentum_hard_filter?: boolean | null;

  // EMA / RSI / StochRSI
  ema_fast?: number | null;
  ema_medium?: number | null;
  ema_slow?: number | null;
  ema_medium_trend?: number | null;
  min_ema_spread_percent?: number | null;
  max_ema_spread_percent?: number | null;
  rsi_period?: number | null;
  rsi_min_long?: number | null;
  rsi_max_short?: number | null;
  rsi_zone_width?: number | null;
  rsi_momentum_periods?: number | null;
  stochrsi_period?: number | null;
  stochrsi_k_period?: number | null;
  stochrsi_d_period?: number | null;
  stochrsi_oversold?: number | null;
  stochrsi_overbought?: number | null;
  stochrsi_oversold_k?: number | null;
  stochrsi_oversold_d?: number | null;
  stochrsi_overbought_k?: number | null;
  stochrsi_overbought_d?: number | null;
  stochrsi_long_mode?: string | null;
  stochrsi_short_mode?: string | null;
  rollover_d_min_long?: number | null;
  rollover_d_min_short?: number | null;

  // MACD / BB / VWAP / ATR / ADX / Volume
  macd_fast?: number | null;
  macd_slow?: number | null;
  macd_signal?: number | null;
  macd_histogram_threshold?: number | null;
  histogram_momentum_periods?: number | null;
  bb_period?: number | null;
  bb_std_dev?: number | null;
  vwap_period?: number | null;
  atr_period?: number | null;
  atr_base_min?: number | null;
  atr_floor?: number | null;
  atr_ceiling?: number | null;
  atr_stop_loss_multiplier?: number | null;
  atr_trailing_stop_multiplier?: number | null;
  trailing_stop_activation_atr?: number | null;
  min_atr_percent?: number | null;
  adx_period?: number | null;
  adx_floor?: number | null;
  adx_ceiling?: number | null;
  adx_base_min?: number | null;
  volume_avg_period?: number | null;
  volume_multiplier?: number | null;
  volume_mode_short?: string | null;
  volume_multiplier_short?: number | null;

  // Other indicators
  pivot_points_lookback?: number | null;
  pivot_points_near_threshold?: number | null;
  supertrend_period?: number | null;
  supertrend_multiplier?: number | null;
  obv_lookback?: number | null;
  cci_period?: number | null;
  cci_overbought?: number | null;
  cci_oversold?: number | null;
  psar_af_start?: number | null;
  psar_af_increment?: number | null;
  psar_af_max?: number | null;
  min_candle_body_percent?: number | null;

  // Exits / risk
  hard_sl_pct?: number | null;
  break_even_atr?: number | null;
  break_even_atr_stop_offset?: number | null;
  break_even_profit_pct_trigger?: number | null;
  break_even_profit_pct_stop_over_entry?: number | null;
  peak_lock_activate_profit_pct?: number | null;
  peak_lock_distance_pct?: number | null;
  peak_lock_min_profit_floor_pct?: number | null;
  max_sl_after_mfe_activate_pct?: number | null;
  max_sl_after_mfe_max_dist_pct?: number | null;
  max_position_duration_minutes?: number | null;
  signal_conditions_required?: number | null;
}

const TF_MAP: Record<string, string> = {
  "1m": "1", "3m": "3", "5m": "5", "10m": "10", "15m": "15", "30m": "30",
  "1h": "60", "2h": "120", "4h": "240", "6h": "360", "8h": "480", "12h": "720",
  "1d": "D", "3d": "3D", "1w": "W", "1M": "M",
};

const tf = (s?: string | null, fallback = "60") => (s && TF_MAP[s]) || fallback;
const n = (v: number | null | undefined, fallback: number) =>
  v == null || !Number.isFinite(Number(v)) ? fallback : Number(v);
const strictBool = (v: boolean | null | undefined) => v === true;
const q = (s?: string | null) => (s ?? "").replace(/"/g, "'");
const onOff = (v: boolean) => (v ? "true" : "false");

interface RuleDef {
  key: string;
  label: string;
  enabled: boolean;
  hard: boolean;
  soft: boolean;
}

const listLabels = (rules: RuleDef[], predicate: (rule: RuleDef) => boolean) => {
  const labels = rules.filter(predicate).map((rule) => rule.label);
  return labels.length ? labels.join(", ") : "(none)";
};

export function generatePineScript(
  cfg: SlotConfigLike,
  slotLabel = "Slot",
  slotNumber?: number,
  meta?: { slotId?: string | null; configId?: string | null },
): string {
  const mainTf = tf(cfg.scan_interval, "60");
  const trendTf = tf(cfg.trend_timeframe, mainTf);
  const htfTf = tf(cfg.higher_trend_timeframe, mainTf);

  const slotIdStr = meta?.slotId ?? "(unknown)";
  const configIdStr = meta?.configId ?? (cfg as any)?.id ?? "(unknown)";
  // FNV-1a 32-bit hash over the full config JSON — lets you verify export matches UI.
  const cfgJson = JSON.stringify(cfg, Object.keys(cfg as object).sort());
  let cfgHash = 0x811c9dc5;
  for (let i = 0; i < cfgJson.length; i++) {
    cfgHash ^= cfgJson.charCodeAt(i);
    cfgHash = (cfgHash + ((cfgHash << 1) + (cfgHash << 4) + (cfgHash << 7) + (cfgHash << 8) + (cfgHash << 24))) >>> 0;
  }
  const cfgHashStr = cfgHash.toString(16).padStart(8, "0");

  // Strict UI boolean mapping: only a saved true exports as true. null/undefined/false export as false.
  const useStrategy = strictBool(cfg.enabled);
  const useEma = strictBool(cfg.ema_enabled);
  const useRsi = strictBool(cfg.rsi_enabled);
  const useStoch = strictBool(cfg.stochrsi_enabled);
  const usePivot = strictBool(cfg.pivot_points_enabled);
  const useMacd = strictBool(cfg.macd_enabled);
  const useMacdDir = useMacd && strictBool(cfg.macd_direction_enabled);
  const useMacdColor = useMacd && strictBool(cfg.macd_color_change_hard_filter);
  const useHistMom = useMacd && strictBool(cfg.histogram_momentum_enabled);
  const useBb = strictBool(cfg.bb_enabled);
  const useVwap = strictBool(cfg.vwap_enabled);
  const useAtr = strictBool(cfg.atr_enabled);
  const useAdaptiveAtr = useAtr && strictBool(cfg.adaptive_atr_enabled);
  const useAdx = strictBool(cfg.adx_enabled);
  const useAdaptiveAdx = useAdx && strictBool(cfg.adaptive_adx_enabled);
  const useVolume = strictBool(cfg.volume_enabled);
  const useTrendTf = strictBool(cfg.trend_timeframe_enabled);
  const useHtf = strictBool(cfg.higher_trend_enabled);
  const useSupertrend = strictBool(cfg.supertrend_enabled);
  const useObv = strictBool(cfg.obv_enabled);
  const useCci = strictBool(cfg.cci_enabled);
  const usePsar = strictBool(cfg.psar_enabled);
  const usePsarTrail = usePsar && strictBool(cfg.psar_trailing_enabled);
  const useCandle = strictBool(cfg.candle_momentum_enabled);

  const autoExit = strictBool(cfg.auto_exit_enabled);
  const useBE = autoExit && strictBool(cfg.break_even_enabled);
  const useBEAtr = useBE && strictBool(cfg.break_even_atr_enabled);
  const useBEProfit = useBE && strictBool(cfg.break_even_profit_pct_enabled);
  const beRatchet = useBE && strictBool(cfg.break_even_ratchet_only);
  const useTrail = autoExit && useAtr && strictBool(cfg.trailing_stop_activation_enabled);
  const usePeak = autoExit && strictBool(cfg.peak_lock_enabled);
  const peakRatchet = usePeak && strictBool(cfg.peak_lock_ratchet_only);
  const useHardSl = autoExit && strictBool(cfg.hard_sl_pct_enabled);
  const useMfeCap = autoExit && strictBool(cfg.max_sl_after_mfe_enabled);
  const useConditionalTimeExit = autoExit && strictBool(cfg.conditional_time_exit_enabled);

  const emaHard = useEma && strictBool(cfg.ema_hard_filter);
  const emaTrendHard = useEma && strictBool(cfg.ema_trend_hard_filter);
  const rsiHard = useRsi && strictBool(cfg.rsi_hard_filter);
  const stochHard = useStoch && strictBool(cfg.stochrsi_hard_filter);
  const pivotHard = usePivot && strictBool(cfg.pivot_points_hard_filter);
  const macdHard = useMacd && strictBool(cfg.macd_hard_filter);
  const bbHard = useBb && strictBool(cfg.bb_hard_filter);
  const vwapHard = useVwap && strictBool(cfg.vwap_hard_filter);
  const atrHard = useAtr && strictBool(cfg.atr_hard_filter);
  const adxHard = useAdx && strictBool(cfg.adx_hard_filter);
  const volumeHard = useVolume && strictBool(cfg.volume_hard_filter);
  const htfHard = useHtf && strictBool(cfg.higher_trend_hard_filter);
  const supertrendHard = useSupertrend && strictBool(cfg.supertrend_hard_filter);
  const obvHard = useObv && strictBool(cfg.obv_hard_filter);
  const cciHard = useCci && strictBool(cfg.cci_hard_filter);
  const psarHard = usePsar && strictBool(cfg.psar_hard_filter);
  const candleHard = useCandle && strictBool(cfg.candle_momentum_hard_filter);

  const volumeModeShort = (cfg.volume_mode_short ?? "OFF").toUpperCase();
  const volumeShortSoft = useVolume && volumeModeShort === "SOFT";
  const volumeShortHard = useVolume && volumeModeShort === "HARD";

  const rules: RuleDef[] = [
    { key: "ema_trend", label: "EMA Trend", enabled: useEma, hard: emaTrendHard, soft: useEma && !emaTrendHard },
    { key: "rsi", label: "RSI Momentum", enabled: useRsi, hard: rsiHard, soft: useRsi && !rsiHard },
    { key: "stochrsi", label: "StochRSI", enabled: useStoch, hard: stochHard, soft: useStoch && !stochHard },
    { key: "macd_histogram", label: "MACD Histogram", enabled: useMacd, hard: macdHard, soft: useMacd && !macdHard },
    { key: "macd_momentum", label: "MACD Histogram Momentum", enabled: useHistMom, hard: false, soft: useHistMom },
    { key: "bb", label: "Bollinger Bands", enabled: useBb, hard: bbHard, soft: useBb && !bbHard },
    { key: "volume_long", label: "Volume LONG", enabled: useVolume, hard: volumeHard, soft: useVolume && !volumeHard },
    { key: "volume_short", label: `Volume SHORT ${volumeModeShort}`, enabled: useVolume && volumeModeShort !== "OFF", hard: volumeShortHard, soft: volumeShortSoft },
    { key: "pivot", label: "Pivot Points", enabled: usePivot, hard: pivotHard, soft: usePivot && !pivotHard },
    { key: "vwap", label: "VWAP", enabled: useVwap, hard: vwapHard, soft: useVwap && !vwapHard },
    { key: "supertrend", label: "Supertrend", enabled: useSupertrend, hard: supertrendHard, soft: useSupertrend && !supertrendHard },
    { key: "obv", label: "OBV", enabled: useObv, hard: obvHard, soft: useObv && !obvHard },
    { key: "cci", label: "CCI", enabled: useCci, hard: cciHard, soft: useCci && !cciHard },
    { key: "psar", label: "PSAR", enabled: usePsar, hard: psarHard, soft: usePsar && !psarHard },
    { key: "candle", label: "Candle Momentum", enabled: useCandle, hard: candleHard, soft: useCandle && !candleHard },
    { key: "htf", label: "HTF Trend", enabled: useHtf, hard: htfHard, soft: useHtf && !htfHard },
    { key: "atr", label: "ATR% min", enabled: useAtr, hard: atrHard, soft: useAtr && !atrHard },
    { key: "adx", label: "ADX", enabled: useAdx, hard: adxHard, soft: useAdx && !adxHard },
  ];

  const activeSoftCount = rules.filter((rule) => rule.soft).length;
  const requestedSoft = Math.max(0, Math.floor(n(cfg.signal_conditions_required, 0)));
  const effectiveSoft = Math.min(requestedSoft, activeSoftCount);
  const softWarning = requestedSoft > activeSoftCount
    ? `WARNING: Requested soft ${requestedSoft} > active soft ${activeSoftCount}; clamped to ${effectiveSoft}.`
    : "none";

  const title = `${slotLabel} – ${cfg.name ?? "Strategy"}`.replace(/"/g, "'");
  const slotNumStr = slotNumber != null ? String(slotNumber) : "?";

  const emaFast = n(cfg.ema_fast, 9);
  const emaMedium = n(cfg.ema_medium, 21);
  const emaSlow = n(cfg.ema_slow, 50);
  const emaSpreadMin = n(cfg.min_ema_spread_percent, 0.2);
  const emaSpreadMax = n(cfg.max_ema_spread_percent, 0);
  const rsiP = n(cfg.rsi_period, 14);
  const rsiMinLong = n(cfg.rsi_min_long, 30);
  const rsiMaxShort = n(cfg.rsi_max_short, 70);
  const rsiZoneWidth = n(cfg.rsi_zone_width, 5);
  const rsiMomPeriods = n(cfg.rsi_momentum_periods, 3);
  const stochP = n(cfg.stochrsi_period, 14);
  const stochK = n(cfg.stochrsi_k_period, 3);
  const stochD = n(cfg.stochrsi_d_period, 3);
  const stochOSK = n(cfg.stochrsi_oversold_k ?? cfg.stochrsi_oversold, 20);
  const stochOSD = n(cfg.stochrsi_oversold_d ?? cfg.stochrsi_oversold, 20);
  const stochOBK = n(cfg.stochrsi_overbought_k ?? cfg.stochrsi_overbought, 80);
  const stochOBD = n(cfg.stochrsi_overbought_d ?? cfg.stochrsi_overbought, 80);
  const stochLongMode = q(cfg.stochrsi_long_mode || "REVERSAL_ROLLOVER");
  const stochShortMode = q(cfg.stochrsi_short_mode || "REVERSAL_ROLLOVER");
  const macdF = n(cfg.macd_fast, 12);
  const macdS = n(cfg.macd_slow, 26);
  const macdSig = n(cfg.macd_signal, 9);
  const macdHistThr = n(cfg.macd_histogram_threshold, 0);
  const histMomPeriods = n(cfg.histogram_momentum_periods, 3);
  const bbPeriod = n(cfg.bb_period, 20);
  const bbStd = n(cfg.bb_std_dev, 2);
  const vwapPeriod = n(cfg.vwap_period, 50);
  const atrP = n(cfg.atr_period, 14);
  const minAtrPct = n(cfg.min_atr_percent, 0);
  const atrBase = n(cfg.atr_base_min, 1);
  const atrFloor = n(cfg.atr_floor, minAtrPct);
  const atrCeiling = n(cfg.atr_ceiling, 999);
  const atrSlMult = n(cfg.atr_stop_loss_multiplier, 2);
  const atrTrailMult = n(cfg.atr_trailing_stop_multiplier, 1.5);
  const trailActAtr = n(cfg.trailing_stop_activation_atr, 1);
  const adxP = n(cfg.adx_period, 14);
  const adxFloor = n(cfg.adx_floor, 20);
  const adxCeiling = n(cfg.adx_ceiling, 40);
  const volPeriod = n(cfg.volume_avg_period, 20);
  const volMultLong = n(cfg.volume_multiplier, 1.2);
  const volMultShort = n(cfg.volume_multiplier_short, 0.5);
  const pivotLookback = n(cfg.pivot_points_lookback, 24);
  const pivotThreshold = n(cfg.pivot_points_near_threshold, 0.002);
  const superPeriod = n(cfg.supertrend_period, 10);
  const superMult = n(cfg.supertrend_multiplier, 3);
  const obvLookback = n(cfg.obv_lookback, 5);
  const cciPeriod = n(cfg.cci_period, 20);
  const cciOverbought = n(cfg.cci_overbought, 100);
  const cciOversold = n(cfg.cci_oversold, -100);
  const psarStart = n(cfg.psar_af_start, 0.02);
  const psarInc = n(cfg.psar_af_increment, 0.02);
  const psarMax = n(cfg.psar_af_max, 0.2);
  const candleBodyPct = n(cfg.min_candle_body_percent, 0.15);
  const beAtr = n(cfg.break_even_atr, 1);
  const beOffset = n(cfg.break_even_atr_stop_offset, 0);
  const beProfitTrigger = n(cfg.break_even_profit_pct_trigger, 1.5);
  const beProfitStop = n(cfg.break_even_profit_pct_stop_over_entry, 0.1);
  const peakAct = n(cfg.peak_lock_activate_profit_pct, 0.6);
  const peakDist = n(cfg.peak_lock_distance_pct, 0.35);
  const peakFloor = n(cfg.peak_lock_min_profit_floor_pct, 0.15);
  const hardSlPct = n(cfg.hard_sl_pct, 3);
  const mfeActivatePct = n(cfg.max_sl_after_mfe_activate_pct, 0.6);
  const mfeMaxDistPct = n(cfg.max_sl_after_mfe_max_dist_pct, 1);
  const maxDurMin = n(cfg.max_position_duration_minutes, 0);

  const GENERATOR_VERSION = "v6.3-verify-header";
  const GENERATED_AT = new Date().toISOString();
  return `//@version=6
// ====================================================================
// LOVABLE PINE EXPORT — verify this matches your UI before backtesting
// --------------------------------------------------------------------
// Generator version              : ${GENERATOR_VERSION}
// Generated at (UTC)             : ${GENERATED_AT}
// Slot number                    : ${slotNumStr}
// Slot id                        : ${slotIdStr}
// Slot name                      : ${slotLabel}
// Config id                      : ${configIdStr}
// Config name                    : ${cfg.name ?? "(unnamed)"}
// Config hash (FNV-1a)           : ${cfgHashStr}
// Scan TF / Trend TF / HTF       : ${mainTf} / ${trendTf} / ${htfTf}
// Trend TF enabled               : ${onOff(useTrendTf)}    HTF enabled: ${onOff(useHtf)}
// Strategy enabled               : ${onOff(useStrategy)}
// Hard filters                   : ${listLabels(rules, (r) => r.enabled && r.hard)}${useMacdDir ? ", MACD Direction" : ""}${useMacdColor ? ", MACD Color Change" : ""}
// Soft conditions counted        : ${listLabels(rules, (r) => r.soft)}
// Requested / Active / Effective Soft : ${requestedSoft} / ${activeSoftCount} / ${effectiveSoft}
// Soft clamp warning             : ${softWarning}
// Exits active                   : auto=${onOff(autoExit)}, hardSL=${onOff(useHardSl)}, atrSL=${onOff(autoExit && useAtr)}, BE=${onOff(useBE)}, trailing=${onOff(useTrail)}, peakLock=${onOff(usePeak)}, mfeCap=${onOff(useMfeCap)}, timeExit=${onOff(autoExit && maxDurMin > 0)}, conditionalTime=${onOff(useConditionalTimeExit)}
// --------------------------------------------------------------------
// UI TOGGLE MAP (true means saved UI state was true; no boolean fallback)
//   ema=${onOff(useEma)}, rsi=${onOff(useRsi)}, stochrsi=${onOff(useStoch)}, macd=${onOff(useMacd)}, macdDirection=${onOff(useMacdDir)}, macdColorChange=${onOff(useMacdColor)}, macdHistogramMomentum=${onOff(useHistMom)}
//   atr=${onOff(useAtr)}, adaptiveAtr=${onOff(useAdaptiveAtr)}, htfTrend=${onOff(useHtf)}, adx=${onOff(useAdx)}, adaptiveAdx=${onOff(useAdaptiveAdx)}, volume=${onOff(useVolume)}
//   bb=${onOff(useBb)}, pivot=${onOff(usePivot)}, vwap=${onOff(useVwap)}, supertrend=${onOff(useSupertrend)}, obv=${onOff(useObv)}, cci=${onOff(useCci)}, psar=${onOff(usePsar)}, candleMomentum=${onOff(useCandle)}
//   breakEven=${onOff(useBE)}, breakEvenATR=${onOff(useBEAtr)}, breakEvenProfitPct=${onOff(useBEProfit)}, trailing=${onOff(useTrail)}, peakLock=${onOff(usePeak)}, mfeCap=${onOff(useMfeCap)}, conditionalExit=${onOff(useConditionalTimeExit)}
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

// ---------- Inputs: strict UI defaults ----------
i_startDate     = input.time(timestamp("2000-01-01 00:00 +0000"), "Start date", group="Backtest range")
i_endDate       = input.time(timestamp("2099-01-01 00:00 +0000"), "End date", group="Backtest range")
i_allowLong     = input.bool(true,  "Allow LONG",  group="Direction")
i_allowShort    = input.bool(true,  "Allow SHORT", group="Direction")
i_strategyOn    = input.bool(${useStrategy}, "Strategy enabled from UI", group="UI mapping")

i_useEma        = input.bool(${useEma}, "EMA enabled", group="UI mapping")
i_emaTrendHard  = input.bool(${emaTrendHard}, "EMA Trend HARD", group="UI mapping")
i_useRsi        = input.bool(${useRsi}, "RSI enabled", group="UI mapping")
i_rsiHard       = input.bool(${rsiHard}, "RSI HARD", group="UI mapping")
i_useStoch      = input.bool(${useStoch}, "StochRSI enabled", group="UI mapping")
i_stochHard     = input.bool(${stochHard}, "StochRSI HARD", group="UI mapping")
i_useMacd       = input.bool(${useMacd}, "MACD Histogram enabled", group="UI mapping")
i_macdHard      = input.bool(${macdHard}, "MACD Histogram HARD", group="UI mapping")
i_useMacdDir    = input.bool(${useMacdDir}, "MACD Direction HARD", group="UI mapping")
i_useMacdColor  = input.bool(${useMacdColor}, "MACD Color Change HARD", group="UI mapping")
i_useHistMom    = input.bool(${useHistMom}, "MACD Histogram Momentum SOFT", group="UI mapping")
i_useBb         = input.bool(${useBb}, "Bollinger Bands enabled", group="UI mapping")
i_bbHard        = input.bool(${bbHard}, "Bollinger Bands HARD", group="UI mapping")
i_usePivot      = input.bool(${usePivot}, "Pivot Points enabled", group="UI mapping")
i_pivotHard     = input.bool(${pivotHard}, "Pivot Points HARD", group="UI mapping")
i_useVwap       = input.bool(${useVwap}, "VWAP enabled", group="UI mapping")
i_vwapHard      = input.bool(${vwapHard}, "VWAP HARD", group="UI mapping")
i_useAtr        = input.bool(${useAtr}, "ATR enabled", group="UI mapping")
i_atrHard       = input.bool(${atrHard}, "ATR min HARD", group="UI mapping")
i_useAdaptiveAtr = input.bool(${useAdaptiveAtr}, "Adaptive ATR enabled", group="UI mapping")
i_useAdx        = input.bool(${useAdx}, "ADX enabled", group="UI mapping")
i_adxHard       = input.bool(${adxHard}, "ADX HARD", group="UI mapping")
i_useAdaptiveAdx = input.bool(${useAdaptiveAdx}, "Adaptive ADX enabled", group="UI mapping")
i_useVolume     = input.bool(${useVolume}, "Volume LONG enabled", group="UI mapping")
i_volumeHard    = input.bool(${volumeHard}, "Volume LONG HARD", group="UI mapping")
i_volumeModeShort = input.string("${q(volumeModeShort)}", "Volume SHORT mode", options=["OFF", "SOFT", "HARD"], group="UI mapping")
i_useHtf        = input.bool(${useHtf}, "HTF Trend enabled", group="UI mapping")
i_htfHard       = input.bool(${htfHard}, "HTF Trend HARD", group="UI mapping")
i_useSupertrend = input.bool(${useSupertrend}, "Supertrend enabled", group="UI mapping")
i_superHard     = input.bool(${supertrendHard}, "Supertrend HARD", group="UI mapping")
i_useObv        = input.bool(${useObv}, "OBV enabled", group="UI mapping")
i_obvHard       = input.bool(${obvHard}, "OBV HARD", group="UI mapping")
i_useCci        = input.bool(${useCci}, "CCI enabled", group="UI mapping")
i_cciHard       = input.bool(${cciHard}, "CCI HARD", group="UI mapping")
i_usePsar       = input.bool(${usePsar}, "PSAR enabled", group="UI mapping")
i_psarHard      = input.bool(${psarHard}, "PSAR HARD", group="UI mapping")
i_useCandle     = input.bool(${useCandle}, "Candle Momentum enabled", group="UI mapping")
i_candleHard    = input.bool(${candleHard}, "Candle Momentum HARD", group="UI mapping")
i_requestedSoft = input.int(${requestedSoft}, "Requested soft conditions", minval=0, group="UI mapping")

// ---------- Legacy compatibility toggles (regression isolation) ----------
// All default OFF. Enable individually to A/B test pre-v6-fix behavior.
i_legacyAdxMode      = input.bool(false, "Legacy ADX mode (ta.dmi on chart TF wrapped in request.security)", group="Legacy compatibility")
i_legacyTiebreakMode = input.bool(false, "Legacy tie-break mode (no tie-break: rawLong/rawShort pass independently)", group="Legacy compatibility")
i_legacyStochMode    = input.bool(false, "Legacy StochRSI mode (zone-only, no cross requirement in REVERSAL modes)", group="Legacy compatibility")

i_emaFast       = input.int(${emaFast}, "EMA fast", minval=1, group="EMA / RSI")
i_emaMedium     = input.int(${emaMedium}, "EMA medium", minval=1, group="EMA / RSI")
i_emaSlow       = input.int(${emaSlow}, "EMA slow", minval=1, group="EMA / RSI")
i_minEmaSpread  = input.float(${emaSpreadMin}, "Min EMA spread %", step=0.01, group="EMA / RSI")
i_maxEmaSpread  = input.float(${emaSpreadMax}, "Max EMA spread % (0=off)", step=0.01, group="EMA / RSI")
i_rsiLen        = input.int(${rsiP}, "RSI period", minval=1, group="EMA / RSI")
i_rsiMinLong    = input.float(${rsiMinLong}, "RSI min LONG", group="EMA / RSI")
i_rsiMaxShort   = input.float(${rsiMaxShort}, "RSI max SHORT", group="EMA / RSI")
i_rsiZoneWidth  = input.float(${rsiZoneWidth}, "RSI zone width", group="EMA / RSI")
i_rsiMomLen     = input.int(${rsiMomPeriods}, "RSI momentum periods", minval=2, group="EMA / RSI")

i_stochLen      = input.int(${stochP}, "StochRSI length", minval=1, group="StochRSI")
i_stochK        = input.int(${stochK}, "Stoch %K", minval=1, group="StochRSI")
i_stochD        = input.int(${stochD}, "Stoch %D", minval=1, group="StochRSI")
i_stochLongMode = input.string("${stochLongMode}", "LONG mode", options=["ZONE_ONLY", "REVERSAL_ROLLOVER", "REVERSAL_OVERSOLD"], group="StochRSI")
i_stochShortMode = input.string("${stochShortMode}", "SHORT mode", options=["ZONE_ONLY", "REVERSAL_ROLLOVER", "REVERSAL_OVERBOUGHT"], group="StochRSI")
i_stochOSK      = input.float(${stochOSK}, "Oversold K (LONG)", group="StochRSI")
i_stochOSD      = input.float(${stochOSD}, "Oversold D (LONG)", group="StochRSI")
i_stochOBK      = input.float(${stochOBK}, "Overbought K (SHORT)", group="StochRSI")
i_stochOBD      = input.float(${stochOBD}, "Overbought D (SHORT)", group="StochRSI")

i_macdFast      = input.int(${macdF}, "MACD fast", minval=1, group="MACD")
i_macdSlow      = input.int(${macdS}, "MACD slow", minval=1, group="MACD")
i_macdSignal    = input.int(${macdSig}, "MACD signal", minval=1, group="MACD")
i_macdHistThr   = input.float(${macdHistThr}, "MACD histogram threshold", step=0.0001, group="MACD")
i_histMomLen    = input.int(${histMomPeriods}, "Histogram momentum periods", minval=2, group="MACD")

i_bbLen         = input.int(${bbPeriod}, "BB period", minval=1, group="Secondary indicators")
i_bbStd         = input.float(${bbStd}, "BB std dev", step=0.1, group="Secondary indicators")
i_vwapLen       = input.int(${vwapPeriod}, "VWAP rolling period", minval=1, group="Secondary indicators")
i_pivotLookback = input.int(${pivotLookback}, "Pivot lookback", minval=2, group="Secondary indicators")
i_pivotThreshold = input.float(${pivotThreshold}, "Pivot near threshold", step=0.0001, group="Secondary indicators")
i_superLen      = input.int(${superPeriod}, "Supertrend ATR period", minval=1, group="Secondary indicators")
i_superMult     = input.float(${superMult}, "Supertrend multiplier", step=0.1, group="Secondary indicators")
i_obvLookback   = input.int(${obvLookback}, "OBV lookback", minval=1, group="Secondary indicators")
i_cciLen        = input.int(${cciPeriod}, "CCI period", minval=1, group="Secondary indicators")
i_cciOB         = input.float(${cciOverbought}, "CCI overbought", group="Secondary indicators")
i_cciOS         = input.float(${cciOversold}, "CCI oversold", group="Secondary indicators")
i_psarStart     = input.float(${psarStart}, "PSAR AF start", step=0.001, group="Secondary indicators")
i_psarInc       = input.float(${psarInc}, "PSAR AF increment", step=0.001, group="Secondary indicators")
i_psarMax       = input.float(${psarMax}, "PSAR AF max", step=0.01, group="Secondary indicators")
i_minBodyPct    = input.float(${candleBodyPct}, "Min candle body %", step=0.01, group="Secondary indicators")

i_atrLen        = input.int(${atrP}, "ATR length", minval=1, group="ATR / ADX / Volume")
i_minAtrPct     = input.float(${minAtrPct}, "Min ATR %", step=0.01, group="ATR / ADX / Volume")
i_atrBase       = input.float(${atrBase}, "Adaptive ATR base %", step=0.01, group="ATR / ADX / Volume")
i_atrFloor      = input.float(${atrFloor}, "Adaptive ATR floor %", step=0.01, group="ATR / ADX / Volume")
i_atrCeiling    = input.float(${atrCeiling}, "Adaptive ATR ceiling %", step=0.01, group="ATR / ADX / Volume")
i_adxLen        = input.int(${adxP}, "ADX period", minval=1, group="ATR / ADX / Volume")
i_adxFloor      = input.float(${adxFloor}, "ADX min", step=0.1, group="ATR / ADX / Volume")
i_adxCeiling    = input.float(${adxCeiling}, "ADX max", step=0.1, group="ATR / ADX / Volume")
i_volLen        = input.int(${volPeriod}, "Volume average period", minval=1, group="ATR / ADX / Volume")
i_volMultLong   = input.float(${volMultLong}, "Volume multiplier LONG", step=0.01, group="ATR / ADX / Volume")
i_volMultShort  = input.float(${volMultShort}, "Volume multiplier SHORT", step=0.01, group="ATR / ADX / Volume")

i_autoExit      = input.bool(${autoExit}, "Auto exit enabled", group="Exits")
i_useHardSl     = input.bool(${useHardSl}, "Use hard SL %", group="Exits")
i_hardSlPct     = input.float(${hardSlPct}, "Hard SL %", step=0.1, group="Exits")
i_atrSlMult     = input.float(${atrSlMult}, "ATR SL multiplier", step=0.1, group="Exits")
i_useTrail      = input.bool(${useTrail}, "Use ATR trailing", group="Exits")
i_atrTrailMult  = input.float(${atrTrailMult}, "ATR trailing multiplier", step=0.1, group="Exits")
i_trailActAtr   = input.float(${trailActAtr}, "Trailing activation xATR", step=0.1, group="Exits")
i_useBE         = input.bool(${useBE}, "Use break-even", group="Exits")
i_beRatchet     = input.bool(${beRatchet}, "BE ratchet only", group="Exits")
i_useBEAtr      = input.bool(${useBEAtr}, "BE ATR mode", group="Exits")
i_beAtr         = input.float(${beAtr}, "BE trigger xATR", step=0.1, group="Exits")
i_beOffset      = input.float(${beOffset}, "BE offset xATR", step=0.05, group="Exits")
i_useBEProfit   = input.bool(${useBEProfit}, "BE profit % mode", group="Exits")
i_beProfitTrigger = input.float(${beProfitTrigger}, "BE profit trigger %", step=0.05, group="Exits")
i_beProfitStop  = input.float(${beProfitStop}, "BE stop over entry %", step=0.05, group="Exits")
i_usePeak       = input.bool(${usePeak}, "Use peak-lock", group="Exits")
i_peakActPct    = input.float(${peakAct}, "Peak-lock activate %", step=0.05, group="Exits")
i_peakDistPct   = input.float(${peakDist}, "Peak-lock distance %", step=0.05, group="Exits")
i_peakFloorPct  = input.float(${peakFloor}, "Peak-lock min floor %", step=0.05, group="Exits")
i_peakRatchet   = input.bool(${peakRatchet}, "Peak-lock ratchet only", group="Exits")
i_useMfeCap     = input.bool(${useMfeCap}, "Use Max SL after MFE", group="Exits")
i_mfeActPct     = input.float(${mfeActivatePct}, "MFE cap activate %", step=0.05, group="Exits")
i_mfeMaxDistPct = input.float(${mfeMaxDistPct}, "MFE cap max distance %", step=0.05, group="Exits")
i_maxDurMin     = input.int(${maxDurMin}, "Max duration minutes (0=off)", minval=0, group="Exits")
i_condTimeExit  = input.bool(${useConditionalTimeExit}, "Conditional time exit", group="Exits")

i_htfTf         = input.timeframe("${htfTf}", "Higher timeframe", group="Timeframes")
i_trendTf       = input.timeframe("${trendTf}", "Trend timeframe", group="Timeframes")
i_debugPlots    = input.bool(true, "Show debug plots", group="Debug")
i_debugTable    = input.bool(true, "Show validation table", group="Debug")

// ---------- Helpers ----------
f_on(x) => x ? "true" : "false"
f_pass(x) => x ? "✅" : "❌"
f_add(enabled, txt) => enabled ? txt : ""
f_supertrend(_period, _mult) =>
    [st, dir] = ta.supertrend(_mult, _period)
    [st, dir]

// ---------- Date filter ----------
inDateRange = (time >= i_startDate) and (time <= i_endDate)

// ---------- Indicators ----------
// EMA trend computed on Trend TF (i_trendTf) — matches bot's medium-trend logic
emaFastLine   = request.security(syminfo.tickerid, i_trendTf, ta.ema(close, i_emaFast),   barmerge.gaps_off, barmerge.lookahead_off)
emaMediumLine = request.security(syminfo.tickerid, i_trendTf, ta.ema(close, i_emaMedium), barmerge.gaps_off, barmerge.lookahead_off)
emaSlowLine   = request.security(syminfo.tickerid, i_trendTf, ta.ema(close, i_emaSlow),   barmerge.gaps_off, barmerge.lookahead_off)
trendClose    = request.security(syminfo.tickerid, i_trendTf, close,        barmerge.gaps_off, barmerge.lookahead_off)
trendClosePrev= request.security(syminfo.tickerid, i_trendTf, close[1],     barmerge.gaps_off, barmerge.lookahead_off)
emaTrendLong  = emaFastLine > emaMediumLine and emaMediumLine > emaSlowLine and trendClose > trendClosePrev
emaTrendShort = emaFastLine < emaMediumLine and emaMediumLine < emaSlowLine and trendClose < trendClosePrev
emaSpreadPct  = trendClose > 0 ? math.abs(emaFastLine - emaSlowLine) / trendClose * 100.0 : 0.0
emaSpreadPassed = not i_useEma or ((emaSpreadPct >= i_minEmaSpread) and (i_maxEmaSpread <= 0 or emaSpreadPct <= i_maxEmaSpread))

rsiLine = ta.rsi(close, i_rsiLen)
rsiRising = ta.rising(rsiLine, i_rsiMomLen)
rsiFalling = ta.falling(rsiLine, i_rsiMomLen)
rsiCrossUpMin = ta.crossover(rsiLine, i_rsiMinLong)
rsiCrossDownMax = ta.crossunder(rsiLine, i_rsiMaxShort)
rsiLongPassed = not i_useRsi or ((rsiLine >= i_rsiMinLong and rsiLine <= i_rsiMinLong + i_rsiZoneWidth) or (rsiCrossUpMin and rsiRising))
rsiShortPassed = not i_useRsi or ((rsiLine <= i_rsiMaxShort and rsiLine >= i_rsiMaxShort - i_rsiZoneWidth) or (rsiCrossDownMax and rsiFalling))

// StochRSI = stochastic on RSI series, not price stochastic
rsiSrc = ta.rsi(close, i_stochLen)
_kRaw  = ta.stoch(rsiSrc, rsiSrc, rsiSrc, i_stochLen)
kLine  = ta.sma(_kRaw, i_stochK)
dLine  = ta.sma(kLine, i_stochD)
stochLongInZone = kLine <= i_stochOSK or dLine <= i_stochOSD
stochShortInZone = kLine >= i_stochOBK or dLine >= i_stochOBD
stochCrossUp = kLine[1] < dLine[1] and kLine >= dLine
stochCrossDown = kLine[1] > dLine[1] and kLine <= dLine
longStochCrossOrZone  = i_legacyStochMode ? stochLongInZone  : (stochCrossUp   and stochLongInZone)
shortStochCrossOrZone = i_legacyStochMode ? stochShortInZone : (stochCrossDown and stochShortInZone)
longStochRaw  = i_stochLongMode  == "ZONE_ONLY" ? stochLongInZone  : longStochCrossOrZone
shortStochRaw = i_stochShortMode == "ZONE_ONLY" ? stochShortInZone : shortStochCrossOrZone
longStochPassed = not i_useStoch or longStochRaw
shortStochPassed = not i_useStoch or shortStochRaw

[macdLine, signalLine, histLine] = ta.macd(close, i_macdFast, i_macdSlow, i_macdSignal)
macdHistPassed = not i_useMacd or (math.abs(histLine) > i_macdHistThr)
macdMomNow = histLine - histLine[1]
macdMomPrev = histLine[i_histMomLen - 1] - histLine[i_histMomLen]
macdMomPassed = not i_useHistMom or (math.abs(macdMomNow) > math.abs(macdMomPrev))
longMacdDirPassed = not i_useMacdDir or (i_useMacd and macdLine > signalLine)
shortMacdDirPassed = not i_useMacdDir or (i_useMacd and macdLine < signalLine)
longMacdColorPassed = not i_useMacdColor or (i_useMacd and histLine > 0 and histLine[1] <= 0)
shortMacdColorPassed = not i_useMacdColor or (i_useMacd and histLine < 0 and histLine[1] >= 0)

bbBasis = ta.sma(close, i_bbLen)
bbDev = i_bbStd * ta.stdev(close, i_bbLen)
bbUpper = bbBasis + bbDev
bbLower = bbBasis - bbDev
bbLongPassed = not i_useBb or close <= bbLower * 1.01
bbShortPassed = not i_useBb or close >= bbUpper * 0.99

rollingVwap = math.sum(hlc3 * volume, i_vwapLen) / math.sum(volume, i_vwapLen)
vwapLongPassed = not i_useVwap or close > rollingVwap
vwapShortPassed = not i_useVwap or close < rollingVwap

pivotHigh = ta.highest(high, i_pivotLookback)
pivotLow = ta.lowest(low, i_pivotLookback)
nearResistance = math.abs(close - pivotHigh) / close < i_pivotThreshold
nearSupport = math.abs(close - pivotLow) / close < i_pivotThreshold
pivotLongPassed = not i_usePivot or not nearResistance
pivotShortPassed = not i_usePivot or not nearSupport

[superValue, superDir] = f_supertrend(i_superLen, i_superMult)
superLongPassed = not i_useSupertrend or superDir < 0
superShortPassed = not i_useSupertrend or superDir > 0

obvLine = ta.obv
obvLongPassed = not i_useObv or obvLine > obvLine[i_obvLookback]
obvShortPassed = not i_useObv or obvLine < obvLine[i_obvLookback]

cciLine = ta.cci(hlc3, i_cciLen)
cciLongPassed = not i_useCci or cciLine > i_cciOS
cciShortPassed = not i_useCci or cciLine < i_cciOB

psarLine = ta.sar(i_psarStart, i_psarInc, i_psarMax)
psarLongPassed = not i_usePsar or close > psarLine
psarShortPassed = not i_usePsar or close < psarLine

bodyPct = open > 0 ? math.abs(close - open) / open * 100.0 : 0.0
candlePassed = not i_useCandle or bodyPct >= i_minBodyPct

atrVal = ta.atr(i_atrLen)
atrPct = close > 0 ? (atrVal / close) * 100.0 : 0.0
volAvg = ta.sma(volume, i_volLen)
volRatio = volAvg > 0 ? volume / volAvg : 0.0
atrAdaptiveThreshold = i_useAdaptiveAtr ? math.min(math.max(i_atrBase * volRatio, i_atrFloor), i_atrCeiling) : i_minAtrPct
atrPassed = not i_useAtr or (atrPct >= atrAdaptiveThreshold and (not i_useAdaptiveAtr or atrPct <= i_atrCeiling))

// ADX: new mode computes ta.dmi directly inside request.security (DMI state on higher TF).
// Legacy mode reproduces pre-v6-fix behavior: ta.dmi on chart TF, then wrap raw adx in request.security.
[diPlusChart, diMinusChart, adxRawChart] = ta.dmi(i_adxLen, i_adxLen)
[diPlusTf, diMinusTf, adxTfNew] = request.security(syminfo.tickerid, i_trendTf, ta.dmi(i_adxLen, i_adxLen), barmerge.gaps_off, barmerge.lookahead_off)
adxTfLegacy = request.security(syminfo.tickerid, i_trendTf, adxRawChart, barmerge.gaps_off, barmerge.lookahead_off)
adxVal = i_legacyAdxMode ? adxTfLegacy : adxTfNew
adxPassed = not i_useAdx or (adxVal >= i_adxFloor and adxVal <= i_adxCeiling)

volumeLongPassed = not i_useVolume or volRatio >= i_volMultLong
volumeShortPassed = i_volumeModeShort == "OFF" or volRatio >= i_volMultShort

htfEma = request.security(syminfo.tickerid, i_htfTf, ta.ema(close, 50), barmerge.gaps_off, barmerge.lookahead_off)
htfBullish = close > htfEma
htfBearish = close < htfEma
longHtfPassed = not i_useHtf or htfBullish
shortHtfPassed = not i_useHtf or htfBearish

// ---------- Soft conditions: count only active soft conditions ----------
softSlotCount =
     (i_useEma and not i_emaTrendHard ? 1 : 0) +
     (i_useRsi and not i_rsiHard ? 1 : 0) +
     (i_useStoch and not i_stochHard ? 1 : 0) +
     (i_useMacd and not i_macdHard ? 1 : 0) +
     (i_useHistMom ? 1 : 0) +
     (i_useBb and not i_bbHard ? 1 : 0) +
     (i_useVolume and not i_volumeHard ? 1 : 0) +
     (i_useVolume and i_volumeModeShort == "SOFT" ? 1 : 0) +
     (i_usePivot and not i_pivotHard ? 1 : 0) +
     (i_useVwap and not i_vwapHard ? 1 : 0) +
     (i_useSupertrend and not i_superHard ? 1 : 0) +
     (i_useObv and not i_obvHard ? 1 : 0) +
     (i_useCci and not i_cciHard ? 1 : 0) +
     (i_usePsar and not i_psarHard ? 1 : 0) +
     (i_useCandle and not i_candleHard ? 1 : 0) +
     (i_useHtf and not i_htfHard ? 1 : 0) +
     (i_useAtr and not i_atrHard ? 1 : 0) +
     (i_useAdx and not i_adxHard ? 1 : 0)

requiredSoft = math.min(i_requestedSoft, softSlotCount)
softClampWarning = i_requestedSoft > softSlotCount

longSoftCount =
     (i_useEma and not i_emaTrendHard and emaTrendLong ? 1 : 0) +
     (i_useRsi and not i_rsiHard and rsiLongPassed ? 1 : 0) +
     (i_useStoch and not i_stochHard and longStochPassed ? 1 : 0) +
     (i_useMacd and not i_macdHard and macdHistPassed ? 1 : 0) +
     (i_useHistMom and macdMomPassed ? 1 : 0) +
     (i_useBb and not i_bbHard and bbLongPassed ? 1 : 0) +
     (i_useVolume and not i_volumeHard and volumeLongPassed ? 1 : 0) +
     (i_useVolume and i_volumeModeShort == "SOFT" and volumeShortPassed ? 1 : 0) +
     (i_usePivot and not i_pivotHard and pivotLongPassed ? 1 : 0) +
     (i_useVwap and not i_vwapHard and vwapLongPassed ? 1 : 0) +
     (i_useSupertrend and not i_superHard and superLongPassed ? 1 : 0) +
     (i_useObv and not i_obvHard and obvLongPassed ? 1 : 0) +
     (i_useCci and not i_cciHard and cciLongPassed ? 1 : 0) +
     (i_usePsar and not i_psarHard and psarLongPassed ? 1 : 0) +
     (i_useCandle and not i_candleHard and candlePassed ? 1 : 0) +
     (i_useHtf and not i_htfHard and longHtfPassed ? 1 : 0) +
     (i_useAtr and not i_atrHard and atrPassed ? 1 : 0) +
     (i_useAdx and not i_adxHard and adxPassed ? 1 : 0)

shortSoftCount =
     (i_useEma and not i_emaTrendHard and emaTrendShort ? 1 : 0) +
     (i_useRsi and not i_rsiHard and rsiShortPassed ? 1 : 0) +
     (i_useStoch and not i_stochHard and shortStochPassed ? 1 : 0) +
     (i_useMacd and not i_macdHard and macdHistPassed ? 1 : 0) +
     (i_useHistMom and macdMomPassed ? 1 : 0) +
     (i_useBb and not i_bbHard and bbShortPassed ? 1 : 0) +
     (i_useVolume and not i_volumeHard and volumeLongPassed ? 1 : 0) +
     (i_useVolume and i_volumeModeShort == "SOFT" and volumeShortPassed ? 1 : 0) +
     (i_usePivot and not i_pivotHard and pivotShortPassed ? 1 : 0) +
     (i_useVwap and not i_vwapHard and vwapShortPassed ? 1 : 0) +
     (i_useSupertrend and not i_superHard and superShortPassed ? 1 : 0) +
     (i_useObv and not i_obvHard and obvShortPassed ? 1 : 0) +
     (i_useCci and not i_cciHard and cciShortPassed ? 1 : 0) +
     (i_usePsar and not i_psarHard and psarShortPassed ? 1 : 0) +
     (i_useCandle and not i_candleHard and candlePassed ? 1 : 0) +
     (i_useHtf and not i_htfHard and shortHtfPassed ? 1 : 0) +
     (i_useAtr and not i_atrHard and atrPassed ? 1 : 0) +
     (i_useAdx and not i_adxHard and adxPassed ? 1 : 0)

longSoftPassed = longSoftCount >= requiredSoft
shortSoftPassed = shortSoftCount >= requiredSoft

// ---------- Hard gates ----------
longHardGate =
     (not i_useEma or emaSpreadPassed) and
     (not i_useEma or not i_emaTrendHard or emaTrendLong) and
     (not i_useRsi or not i_rsiHard or rsiLongPassed) and
     (not i_useStoch or not i_stochHard or longStochPassed) and
     (not i_useMacd or not i_macdHard or macdHistPassed) and
     longMacdDirPassed and longMacdColorPassed and
     (not i_useBb or not i_bbHard or bbLongPassed) and
     (not i_useVolume or not i_volumeHard or volumeLongPassed) and
     (i_volumeModeShort != "HARD" or volumeShortPassed) and
     (not i_usePivot or not i_pivotHard or pivotLongPassed) and
     (not i_useVwap or not i_vwapHard or vwapLongPassed) and
     (not i_useSupertrend or not i_superHard or superLongPassed) and
     (not i_useObv or not i_obvHard or obvLongPassed) and
     (not i_useCci or not i_cciHard or cciLongPassed) and
     (not i_usePsar or not i_psarHard or psarLongPassed) and
     (not i_useCandle or not i_candleHard or candlePassed) and
     (not i_useHtf or not i_htfHard or longHtfPassed) and
     (not i_useAtr or not i_atrHard or atrPassed) and
     (not i_useAdx or not i_adxHard or adxPassed)

shortHardGate =
     (not i_useEma or emaSpreadPassed) and
     (not i_useEma or not i_emaTrendHard or emaTrendShort) and
     (not i_useRsi or not i_rsiHard or rsiShortPassed) and
     (not i_useStoch or not i_stochHard or shortStochPassed) and
     (not i_useMacd or not i_macdHard or macdHistPassed) and
     shortMacdDirPassed and shortMacdColorPassed and
     (not i_useBb or not i_bbHard or bbShortPassed) and
     (not i_useVolume or not i_volumeHard or volumeLongPassed) and
     (i_volumeModeShort != "HARD" or volumeShortPassed) and
     (not i_usePivot or not i_pivotHard or pivotShortPassed) and
     (not i_useVwap or not i_vwapHard or vwapShortPassed) and
     (not i_useSupertrend or not i_superHard or superShortPassed) and
     (not i_useObv or not i_obvHard or obvShortPassed) and
     (not i_useCci or not i_cciHard or cciShortPassed) and
     (not i_usePsar or not i_psarHard or psarShortPassed) and
     (not i_useCandle or not i_candleHard or candlePassed) and
     (not i_useHtf or not i_htfHard or shortHtfPassed) and
     (not i_useAtr or not i_atrHard or atrPassed) and
     (not i_useAdx or not i_adxHard or adxPassed)

rawLongSignal = i_strategyOn and i_allowLong and inDateRange and longHardGate and longSoftPassed
rawShortSignal = i_strategyOn and i_allowShort and inDateRange and shortHardGate and shortSoftPassed
finalLongSignal = rawLongSignal and not rawShortSignal ? true : rawLongSignal and rawShortSignal and longSoftCount > shortSoftCount
finalShortSignal = rawShortSignal and not rawLongSignal ? true : rawLongSignal and rawShortSignal and shortSoftCount > longSoftCount

// ---------- Regression debug: hard blockers and backtest-period counters ----------
longStochHardBlock = i_useStoch and i_stochHard and not longStochPassed
shortStochHardBlock = i_useStoch and i_stochHard and not shortStochPassed
volumeLongHardBlock = i_useVolume and i_volumeHard and not volumeLongPassed
volumeShortHardBlock = i_volumeModeShort == "HARD" and not volumeShortPassed
longVwapHardBlock = i_useVwap and i_vwapHard and not vwapLongPassed
shortVwapHardBlock = i_useVwap and i_vwapHard and not vwapShortPassed
candleHardBlock = i_useCandle and i_candleHard and not candlePassed
atrHardBlock = i_useAtr and i_atrHard and not atrPassed
emaSpreadHardBlock = i_useEma and not emaSpreadPassed
longHtfHardBlock = i_useHtf and i_htfHard and not longHtfPassed
shortHtfHardBlock = i_useHtf and i_htfHard and not shortHtfPassed

var int longHardGateBars = 0
var int shortHardGateBars = 0
var int longSoftPassedBars = 0
var int shortSoftPassedBars = 0
var int rawLongSignalBars = 0
var int rawShortSignalBars = 0
var int finalLongSignalBars = 0
var int finalShortSignalBars = 0
var int longStochBlockBars = 0
var int shortStochBlockBars = 0
var int volumeLongBlockBars = 0
var int volumeShortBlockBars = 0
var int longVwapBlockBars = 0
var int shortVwapBlockBars = 0
var int candleBlockBars = 0
var int atrBlockBars = 0
var int emaSpreadBlockBars = 0
var int longHtfBlockBars = 0
var int shortHtfBlockBars = 0

if inDateRange and barstate.isconfirmed
    longHardGateBars := longHardGateBars + (longHardGate ? 1 : 0)
    shortHardGateBars := shortHardGateBars + (shortHardGate ? 1 : 0)
    longSoftPassedBars := longSoftPassedBars + (longSoftPassed ? 1 : 0)
    shortSoftPassedBars := shortSoftPassedBars + (shortSoftPassed ? 1 : 0)
    rawLongSignalBars := rawLongSignalBars + (rawLongSignal ? 1 : 0)
    rawShortSignalBars := rawShortSignalBars + (rawShortSignal ? 1 : 0)
    finalLongSignalBars := finalLongSignalBars + (finalLongSignal ? 1 : 0)
    finalShortSignalBars := finalShortSignalBars + (finalShortSignal ? 1 : 0)
    longStochBlockBars := longStochBlockBars + (longStochHardBlock ? 1 : 0)
    shortStochBlockBars := shortStochBlockBars + (shortStochHardBlock ? 1 : 0)
    volumeLongBlockBars := volumeLongBlockBars + (volumeLongHardBlock ? 1 : 0)
    volumeShortBlockBars := volumeShortBlockBars + (volumeShortHardBlock ? 1 : 0)
    longVwapBlockBars := longVwapBlockBars + (longVwapHardBlock ? 1 : 0)
    shortVwapBlockBars := shortVwapBlockBars + (shortVwapHardBlock ? 1 : 0)
    candleBlockBars := candleBlockBars + (candleHardBlock ? 1 : 0)
    atrBlockBars := atrBlockBars + (atrHardBlock ? 1 : 0)
    emaSpreadBlockBars := emaSpreadBlockBars + (emaSpreadHardBlock ? 1 : 0)
    longHtfBlockBars := longHtfBlockBars + (longHtfHardBlock ? 1 : 0)
    shortHtfBlockBars := shortHtfBlockBars + (shortHtfHardBlock ? 1 : 0)

longTopHardBlocker = "none"
longTopHardBlockerCount = 0
if longStochBlockBars > longTopHardBlockerCount
    longTopHardBlocker := "StochRSI"
    longTopHardBlockerCount := longStochBlockBars
if volumeLongBlockBars > longTopHardBlockerCount
    longTopHardBlocker := "Volume LONG"
    longTopHardBlockerCount := volumeLongBlockBars
if volumeShortBlockBars > longTopHardBlockerCount
    longTopHardBlocker := "Volume SHORT"
    longTopHardBlockerCount := volumeShortBlockBars
if longVwapBlockBars > longTopHardBlockerCount
    longTopHardBlocker := "VWAP"
    longTopHardBlockerCount := longVwapBlockBars
if candleBlockBars > longTopHardBlockerCount
    longTopHardBlocker := "Candle"
    longTopHardBlockerCount := candleBlockBars
if atrBlockBars > longTopHardBlockerCount
    longTopHardBlocker := "ATR"
    longTopHardBlockerCount := atrBlockBars
if emaSpreadBlockBars > longTopHardBlockerCount
    longTopHardBlocker := "EMA Spread"
    longTopHardBlockerCount := emaSpreadBlockBars
if longHtfBlockBars > longTopHardBlockerCount
    longTopHardBlocker := "HTF"
    longTopHardBlockerCount := longHtfBlockBars

shortTopHardBlocker = "none"
shortTopHardBlockerCount = 0
if shortStochBlockBars > shortTopHardBlockerCount
    shortTopHardBlocker := "StochRSI"
    shortTopHardBlockerCount := shortStochBlockBars
if volumeLongBlockBars > shortTopHardBlockerCount
    shortTopHardBlocker := "Volume LONG"
    shortTopHardBlockerCount := volumeLongBlockBars
if volumeShortBlockBars > shortTopHardBlockerCount
    shortTopHardBlocker := "Volume SHORT"
    shortTopHardBlockerCount := volumeShortBlockBars
if shortVwapBlockBars > shortTopHardBlockerCount
    shortTopHardBlocker := "VWAP"
    shortTopHardBlockerCount := shortVwapBlockBars
if candleBlockBars > shortTopHardBlockerCount
    shortTopHardBlocker := "Candle"
    shortTopHardBlockerCount := candleBlockBars
if atrBlockBars > shortTopHardBlockerCount
    shortTopHardBlocker := "ATR"
    shortTopHardBlockerCount := atrBlockBars
if emaSpreadBlockBars > shortTopHardBlockerCount
    shortTopHardBlocker := "EMA Spread"
    shortTopHardBlockerCount := emaSpreadBlockBars
if shortHtfBlockBars > shortTopHardBlockerCount
    shortTopHardBlocker := "HTF"
    shortTopHardBlockerCount := shortHtfBlockBars

longFinalWhy = finalLongSignal ? "PASS" : not i_strategyOn ? "strategy off" : not i_allowLong ? "long disabled" : not inDateRange ? "date range" : not longHardGate ? "hard gate" : not longSoftPassed ? "soft deficit" : rawLongSignal and rawShortSignal and longSoftCount <= shortSoftCount ? "tie lost" : "no raw"
shortFinalWhy = finalShortSignal ? "PASS" : not i_strategyOn ? "strategy off" : not i_allowShort ? "short disabled" : not inDateRange ? "date range" : not shortHardGate ? "hard gate" : not shortSoftPassed ? "soft deficit" : rawLongSignal and rawShortSignal and shortSoftCount <= longSoftCount ? "tie lost" : "no raw"
longAggregateWhy = finalLongSignalBars > 0 ? "final ok" : longHardGateBars == 0 ? "hard never true: " + longTopHardBlocker + " (" + str.tostring(longTopHardBlockerCount) + ")" : longSoftPassedBars == 0 ? "soft never true" : rawLongSignalBars == 0 ? "strategy/allow/date" : "tie-break lost"
shortAggregateWhy = finalShortSignalBars > 0 ? "final ok" : shortHardGateBars == 0 ? "hard never true: " + shortTopHardBlocker + " (" + str.tostring(shortTopHardBlockerCount) + ")" : shortSoftPassedBars == 0 ? "soft never true" : rawShortSignalBars == 0 ? "strategy/allow/date" : "tie-break lost"

// ---------- State ----------
var float entryPrice = na
var float entryAtr = na
var int entryBarTime = na
var float trailStop = na
var bool trailActive = false
var float beStop = na
var bool beActive = false
var float peakPrice = na
var float peakStop = na
var bool peakActive = false
var float mfeStop = na
var bool mfeActive = false

if strategy.position_size == 0
    entryPrice := na
    entryAtr := na
    entryBarTime := na
    trailStop := na
    trailActive := false
    beStop := na
    beActive := false
    peakPrice := na
    peakStop := na
    peakActive := false
    mfeStop := na
    mfeActive := false

// ---------- Entries ----------
if finalLongSignal and strategy.position_size <= 0
    strategy.entry("LONG", strategy.long)
if finalShortSignal and strategy.position_size >= 0
    strategy.entry("SHORT", strategy.short)

if strategy.position_size != 0 and na(entryPrice)
    entryPrice := strategy.position_avg_price
    entryAtr := atrVal
    entryBarTime := time
    peakPrice := strategy.position_size > 0 ? high : low

isLong = strategy.position_size > 0
isShort = strategy.position_size < 0
if isLong
    peakPrice := na(peakPrice) ? high : math.max(peakPrice, high)
if isShort
    peakPrice := na(peakPrice) ? low : math.min(peakPrice, low)

// ---------- Exits ----------
hardSlLong = i_autoExit and i_useHardSl and not na(entryPrice) ? entryPrice * (1 - i_hardSlPct / 100.0) : na
hardSlShort = i_autoExit and i_useHardSl and not na(entryPrice) ? entryPrice * (1 + i_hardSlPct / 100.0) : na
atrSlLong = i_autoExit and i_useAtr and not na(entryPrice) and not na(entryAtr) ? entryPrice - i_atrSlMult * entryAtr : na
atrSlShort = i_autoExit and i_useAtr and not na(entryPrice) and not na(entryAtr) ? entryPrice + i_atrSlMult * entryAtr : na

beAtrTriggerLong = i_useBE and i_useBEAtr and not na(entryPrice) and not na(entryAtr) and (high - entryPrice) >= i_beAtr * entryAtr
beAtrTriggerShort = i_useBE and i_useBEAtr and not na(entryPrice) and not na(entryAtr) and (entryPrice - low) >= i_beAtr * entryAtr
bePctTriggerLong = i_useBE and i_useBEProfit and not na(entryPrice) and high >= entryPrice * (1 + i_beProfitTrigger / 100.0)
bePctTriggerShort = i_useBE and i_useBEProfit and not na(entryPrice) and low <= entryPrice * (1 - i_beProfitTrigger / 100.0)

if isLong and (beAtrTriggerLong or bePctTriggerLong)
    candidateAtr = beAtrTriggerLong ? entryPrice + i_beOffset * entryAtr : na
    candidatePct = bePctTriggerLong ? entryPrice * (1 + i_beProfitStop / 100.0) : na
    candidate = na(candidateAtr) ? candidatePct : na(candidatePct) ? candidateAtr : math.max(candidateAtr, candidatePct)
    beStop := na(beStop) or not i_beRatchet ? candidate : math.max(beStop, candidate)
    beActive := true
if isShort and (beAtrTriggerShort or bePctTriggerShort)
    candidateAtr = beAtrTriggerShort ? entryPrice - i_beOffset * entryAtr : na
    candidatePct = bePctTriggerShort ? entryPrice * (1 - i_beProfitStop / 100.0) : na
    candidate = na(candidateAtr) ? candidatePct : na(candidatePct) ? candidateAtr : math.min(candidateAtr, candidatePct)
    beStop := na(beStop) or not i_beRatchet ? candidate : math.min(beStop, candidate)
    beActive := true

trailActiveLong = i_autoExit and i_useTrail and not na(entryPrice) and not na(entryAtr) and (high - entryPrice) >= i_trailActAtr * entryAtr
trailActiveShort = i_autoExit and i_useTrail and not na(entryPrice) and not na(entryAtr) and (entryPrice - low) >= i_trailActAtr * entryAtr
if isLong and trailActiveLong
    candidate = high - i_atrTrailMult * atrVal
    trailStop := na(trailStop) ? candidate : math.max(trailStop, candidate)
    trailActive := true
if isShort and trailActiveShort
    candidate = low + i_atrTrailMult * atrVal
    trailStop := na(trailStop) ? candidate : math.min(trailStop, candidate)
    trailActive := true

peakProfitPctLong = isLong and not na(entryPrice) and not na(peakPrice) ? (peakPrice - entryPrice) / entryPrice * 100.0 : na
peakProfitPctShort = isShort and not na(entryPrice) and not na(peakPrice) ? (entryPrice - peakPrice) / entryPrice * 100.0 : na
if i_autoExit and i_usePeak and isLong and not na(peakProfitPctLong) and peakProfitPctLong >= i_peakActPct
    candidateTrail = peakPrice * (1 - i_peakDistPct / 100.0)
    candidateFloor = entryPrice * (1 + i_peakFloorPct / 100.0)
    candidate = math.max(candidateTrail, candidateFloor)
    peakStop := na(peakStop) or not i_peakRatchet ? candidate : math.max(peakStop, candidate)
    peakActive := true
if i_autoExit and i_usePeak and isShort and not na(peakProfitPctShort) and peakProfitPctShort >= i_peakActPct
    candidateTrail = peakPrice * (1 + i_peakDistPct / 100.0)
    candidateFloor = entryPrice * (1 - i_peakFloorPct / 100.0)
    candidate = math.min(candidateTrail, candidateFloor)
    peakStop := na(peakStop) or not i_peakRatchet ? candidate : math.min(peakStop, candidate)
    peakActive := true

mfeLongPct = isLong and not na(entryPrice) ? (high - entryPrice) / entryPrice * 100.0 : na
mfeShortPct = isShort and not na(entryPrice) ? (entryPrice - low) / entryPrice * 100.0 : na
if i_autoExit and i_useMfeCap and not beActive and isLong and not na(mfeLongPct) and mfeLongPct >= i_mfeActPct
    mfeStop := entryPrice * (1 - i_mfeMaxDistPct / 100.0)
    mfeActive := true
if i_autoExit and i_useMfeCap and not beActive and isShort and not na(mfeShortPct) and mfeShortPct >= i_mfeActPct
    mfeStop := entryPrice * (1 + i_mfeMaxDistPct / 100.0)
    mfeActive := true

psarTrailLong = i_autoExit and ${onOff(usePsarTrail)} and isLong and not na(psarLine) and psarLine < close ? psarLine : na
psarTrailShort = i_autoExit and ${onOff(usePsarTrail)} and isShort and not na(psarLine) and psarLine > close ? psarLine : na

float effectiveLong = na
float effectiveShort = na
if i_autoExit and isLong
    effectiveLong := atrSlLong
    if not na(hardSlLong)
        effectiveLong := na(effectiveLong) ? hardSlLong : math.max(effectiveLong, hardSlLong)
    if mfeActive and not na(mfeStop)
        effectiveLong := na(effectiveLong) ? mfeStop : math.max(effectiveLong, mfeStop)
    if beActive and not na(beStop)
        effectiveLong := na(effectiveLong) ? beStop : math.max(effectiveLong, beStop)
    if peakActive and not na(peakStop)
        effectiveLong := na(effectiveLong) ? peakStop : math.max(effectiveLong, peakStop)
    if trailActive and not na(trailStop)
        effectiveLong := na(effectiveLong) ? trailStop : math.max(effectiveLong, trailStop)
    if not na(psarTrailLong)
        effectiveLong := na(effectiveLong) ? psarTrailLong : math.max(effectiveLong, psarTrailLong)
if i_autoExit and isShort
    effectiveShort := atrSlShort
    if not na(hardSlShort)
        effectiveShort := na(effectiveShort) ? hardSlShort : math.min(effectiveShort, hardSlShort)
    if mfeActive and not na(mfeStop)
        effectiveShort := na(effectiveShort) ? mfeStop : math.min(effectiveShort, mfeStop)
    if beActive and not na(beStop)
        effectiveShort := na(effectiveShort) ? beStop : math.min(effectiveShort, beStop)
    if peakActive and not na(peakStop)
        effectiveShort := na(effectiveShort) ? peakStop : math.min(effectiveShort, peakStop)
    if trailActive and not na(trailStop)
        effectiveShort := na(effectiveShort) ? trailStop : math.min(effectiveShort, trailStop)
    if not na(psarTrailShort)
        effectiveShort := na(effectiveShort) ? psarTrailShort : math.min(effectiveShort, psarTrailShort)

if isLong and not na(effectiveLong)
    strategy.exit("XL", from_entry="LONG", stop=effectiveLong)
if isShort and not na(effectiveShort)
    strategy.exit("XS", from_entry="SHORT", stop=effectiveShort)

timeExitDue = i_autoExit and i_maxDurMin > 0 and strategy.position_size != 0 and not na(entryBarTime) and (time - entryBarTime) >= i_maxDurMin * 60 * 1000
timeExitAllowed = not i_condTimeExit or (not trailActive and not peakActive and not beActive and math.abs(histLine) <= math.abs(histLine[1]))
if timeExitDue and timeExitAllowed
    strategy.close_all(comment=i_condTimeExit ? "CONDITIONAL_TIME_EXIT" : "TIME_EXIT")

// ---------- Plots ----------
plot(isLong ? effectiveLong : na, "Active Stop LONG", color=color.red, style=plot.style_linebr, linewidth=2)
plot(isShort ? effectiveShort : na, "Active Stop SHORT", color=color.red, style=plot.style_linebr, linewidth=2)
plot(beActive ? beStop : na, "Break-even", color=color.yellow, style=plot.style_linebr)
plot(trailActive ? trailStop : na, "Trailing stop", color=color.aqua, style=plot.style_linebr)
plot(peakActive ? peakStop : na, "Peak-lock", color=color.lime, style=plot.style_linebr)
plot(mfeActive ? mfeStop : na, "MFE cap", color=color.fuchsia, style=plot.style_linebr)
plot(i_useHtf ? htfEma : na, "HTF EMA", color=color.orange)
plot(i_usePsar ? psarLine : na, "PSAR", color=color.gray)
plotshape(finalLongSignal and strategy.position_size <= 0, title="Long signal", style=shape.triangleup, location=location.belowbar, color=color.green, size=size.tiny)
plotshape(finalShortSignal and strategy.position_size >= 0, title="Short signal", style=shape.triangledown, location=location.abovebar, color=color.red, size=size.tiny)

// Debug bool plots — Data Window (open Data Window in TV to inspect per-bar values)
// Regression diff from pre-fix Pine: ta.sum→math.sum, ta.adx→request.security(... ta.dmi ...), RSI cross calls hoisted.
plot(i_debugPlots ? longSoftCount : na, "dbg longSoftCount", display=display.data_window)
plot(i_debugPlots ? shortSoftCount : na, "dbg shortSoftCount", display=display.data_window)
plot(i_debugPlots ? softSlotCount : na, "dbg activeSoftConditions", display=display.data_window)
plot(i_debugPlots ? requiredSoft : na, "dbg requiredSoft", display=display.data_window)
plot(i_debugPlots ? i_requestedSoft : na, "dbg requestedSoftInput", display=display.data_window)
plot(i_debugPlots and softClampWarning ? 1 : 0, "dbg softClampWarning", display=display.data_window)
plot(i_debugPlots and rawLongSignal ? 1 : 0, "dbg rawLongSignal", display=display.data_window)
plot(i_debugPlots and rawShortSignal ? 1 : 0, "dbg rawShortSignal", display=display.data_window)
plot(i_debugPlots and longHardGate ? 1 : 0, "dbg longHardGate", display=display.data_window)
plot(i_debugPlots and shortHardGate ? 1 : 0, "dbg shortHardGate", display=display.data_window)
plot(i_debugPlots and longSoftPassed ? 1 : 0, "dbg longSoftPassed", display=display.data_window)
plot(i_debugPlots and shortSoftPassed ? 1 : 0, "dbg shortSoftPassed", display=display.data_window)
plot(i_debugPlots and finalLongSignal ? 1 : 0, "dbg finalLongSignal", display=display.data_window)
plot(i_debugPlots and finalShortSignal ? 1 : 0, "dbg finalShortSignal", display=display.data_window)
plot(i_debugPlots and longStochPassed ? 1 : 0, "dbg longStochPassed", display=display.data_window)
plot(i_debugPlots and shortStochPassed ? 1 : 0, "dbg shortStochPassed", display=display.data_window)
plot(i_debugPlots and volumeLongPassed ? 1 : 0, "dbg volumeLongPassed", display=display.data_window)
plot(i_debugPlots and volumeShortPassed ? 1 : 0, "dbg volumeShortPassed", display=display.data_window)
plot(i_debugPlots and vwapLongPassed ? 1 : 0, "dbg vwapLongPassed", display=display.data_window)
plot(i_debugPlots and vwapShortPassed ? 1 : 0, "dbg vwapShortPassed", display=display.data_window)
plot(i_debugPlots and candlePassed ? 1 : 0, "dbg candlePassed", display=display.data_window)
plot(i_debugPlots and atrPassed ? 1 : 0, "dbg atrPassed", display=display.data_window)
plot(i_debugPlots and emaSpreadPassed ? 1 : 0, "dbg emaSpreadPassed", display=display.data_window)
plot(i_debugPlots and longHtfPassed ? 1 : 0, "dbg longHtfPassed", display=display.data_window)
plot(i_debugPlots and shortHtfPassed ? 1 : 0, "dbg shortHtfPassed", display=display.data_window)
plot(i_debugPlots and adxPassed ? 1 : 0, "dbg adxPassed", display=display.data_window)
plot(i_debugPlots ? adxVal : na, "dbg adxValTrendTf", display=display.data_window)
plot(i_debugPlots ? adxRawChart : na, "dbg adxRawChartTf", display=display.data_window)
plot(i_debugPlots ? atrPct : na, "dbg atrPct", display=display.data_window)
plot(i_debugPlots ? emaSpreadPct : na, "dbg emaSpreadPct", display=display.data_window)
plot(i_debugPlots and macdHistPassed ? 1 : 0, "dbg macdHistogramPassed", display=display.data_window)
plot(i_debugPlots and macdMomPassed ? 1 : 0, "dbg macdHistogramMomentumPassed", display=display.data_window)

// ---------- Runtime validation table ----------
activeFilters =
     f_add(i_useEma, "EMA ") + f_add(i_useRsi, "RSI ") + f_add(i_useStoch, "StochRSI ") + f_add(i_useMacd, "MACD ") +
     f_add(i_useHistMom, "HistMom ") + f_add(i_useAtr, "ATR ") + f_add(i_useHtf, "HTF ") + f_add(i_useAdx, "ADX ") +
     f_add(i_useVolume, "Volume ") + f_add(i_useBb, "BB ") + f_add(i_usePivot, "Pivot ") + f_add(i_useVwap, "VWAP ") +
     f_add(i_useSupertrend, "Supertrend ") + f_add(i_useObv, "OBV ") + f_add(i_useCci, "CCI ") + f_add(i_usePsar, "PSAR ") + f_add(i_useCandle, "Candle ")

longBlockers =
     f_add(i_useEma and not emaSpreadPassed, "EMA spread ") + f_add(i_useEma and i_emaTrendHard and not emaTrendLong, "EMA trend ") +
     f_add(i_useRsi and i_rsiHard and not rsiLongPassed, "RSI ") + f_add(i_useStoch and i_stochHard and not longStochPassed, "StochRSI ") +
     f_add(i_useMacd and i_macdHard and not macdHistPassed, "MACD hist ") + f_add(i_useMacdDir and not longMacdDirPassed, "MACD dir ") + f_add(i_useMacdColor and not longMacdColorPassed, "MACD color ") +
     f_add(i_useBb and i_bbHard and not bbLongPassed, "BB ") + f_add(i_useVolume and i_volumeHard and not volumeLongPassed, "Volume L ") + f_add(i_volumeModeShort == "HARD" and not volumeShortPassed, "Volume S ") +
     f_add(i_usePivot and i_pivotHard and not pivotLongPassed, "Pivot ") + f_add(i_useVwap and i_vwapHard and not vwapLongPassed, "VWAP ") +
     f_add(i_useSupertrend and i_superHard and not superLongPassed, "Supertrend ") + f_add(i_useObv and i_obvHard and not obvLongPassed, "OBV ") + f_add(i_useCci and i_cciHard and not cciLongPassed, "CCI ") +
     f_add(i_usePsar and i_psarHard and not psarLongPassed, "PSAR ") + f_add(i_useCandle and i_candleHard and not candlePassed, "Candle ") + f_add(i_useHtf and i_htfHard and not longHtfPassed, "HTF ") +
     f_add(i_useAtr and i_atrHard and not atrPassed, "ATR ") + f_add(i_useAdx and i_adxHard and not adxPassed, "ADX ")

shortBlockers =
     f_add(i_useEma and not emaSpreadPassed, "EMA spread ") + f_add(i_useEma and i_emaTrendHard and not emaTrendShort, "EMA trend ") +
     f_add(i_useRsi and i_rsiHard and not rsiShortPassed, "RSI ") + f_add(i_useStoch and i_stochHard and not shortStochPassed, "StochRSI ") +
     f_add(i_useMacd and i_macdHard and not macdHistPassed, "MACD hist ") + f_add(i_useMacdDir and not shortMacdDirPassed, "MACD dir ") + f_add(i_useMacdColor and not shortMacdColorPassed, "MACD color ") +
     f_add(i_useBb and i_bbHard and not bbShortPassed, "BB ") + f_add(i_useVolume and i_volumeHard and not volumeLongPassed, "Volume L ") + f_add(i_volumeModeShort == "HARD" and not volumeShortPassed, "Volume S ") +
     f_add(i_usePivot and i_pivotHard and not pivotShortPassed, "Pivot ") + f_add(i_useVwap and i_vwapHard and not vwapShortPassed, "VWAP ") +
     f_add(i_useSupertrend and i_superHard and not superShortPassed, "Supertrend ") + f_add(i_useObv and i_obvHard and not obvShortPassed, "OBV ") + f_add(i_useCci and i_cciHard and not cciShortPassed, "CCI ") +
     f_add(i_usePsar and i_psarHard and not psarShortPassed, "PSAR ") + f_add(i_useCandle and i_candleHard and not candlePassed, "Candle ") + f_add(i_useHtf and i_htfHard and not shortHtfPassed, "HTF ") +
      f_add(i_useAtr and i_atrHard and not atrPassed, "ATR ") + f_add(i_useAdx and i_adxHard and not adxPassed, "ADX ")

var table dbg = table.new(position.top_right, 4, 18, border_width=1)
if i_debugTable and barstate.islast
    table.cell(dbg, 0, 0, "Regression Debug", bgcolor=color.new(color.blue, 75), text_color=color.white)
    table.cell(dbg, 1, 0, "LONG", bgcolor=color.new(color.blue, 75), text_color=color.white)
    table.cell(dbg, 2, 0, "SHORT", bgcolor=color.new(color.blue, 75), text_color=color.white)
    table.cell(dbg, 3, 0, "Meta", bgcolor=color.new(color.blue, 75), text_color=color.white)
    table.cell(dbg, 0, 1, "Current signals")
    table.cell(dbg, 1, 1, "raw=" + f_pass(rawLongSignal) + " final=" + f_pass(finalLongSignal), text_color=finalLongSignal ? color.lime : color.white)
    table.cell(dbg, 2, 1, "raw=" + f_pass(rawShortSignal) + " final=" + f_pass(finalShortSignal), text_color=finalShortSignal ? color.lime : color.white)
    table.cell(dbg, 3, 1, rawLongSignal and rawShortSignal ? "tie-break" : "")
    table.cell(dbg, 0, 2, "Gates")
    table.cell(dbg, 1, 2, "hard=" + f_pass(longHardGate) + " soft=" + f_pass(longSoftPassed), text_color=longHardGate and longSoftPassed ? color.lime : color.red)
    table.cell(dbg, 2, 2, "hard=" + f_pass(shortHardGate) + " soft=" + f_pass(shortSoftPassed), text_color=shortHardGate and shortSoftPassed ? color.lime : color.red)
    table.cell(dbg, 3, 2, "strategy=" + f_on(i_strategyOn))
    table.cell(dbg, 0, 3, "Soft count")
    table.cell(dbg, 1, 3, str.tostring(longSoftCount) + "/" + str.tostring(requiredSoft))
    table.cell(dbg, 2, 3, str.tostring(shortSoftCount) + "/" + str.tostring(requiredSoft))
    table.cell(dbg, 3, 3, "requested=" + str.tostring(i_requestedSoft) + " active=" + str.tostring(softSlotCount))
    table.cell(dbg, 0, 4, "Current why")
    table.cell(dbg, 1, 4, longFinalWhy, text_color=finalLongSignal ? color.lime : color.yellow)
    table.cell(dbg, 2, 4, shortFinalWhy, text_color=finalShortSignal ? color.lime : color.yellow)
    table.cell(dbg, 3, 4, softClampWarning ? "soft clamped" : "")
    table.cell(dbg, 0, 5, "Hard blockers")
    table.cell(dbg, 1, 5, longBlockers == "" ? "none" : longBlockers, text_color=longBlockers == "" ? color.lime : color.red)
    table.cell(dbg, 2, 5, shortBlockers == "" ? "none" : shortBlockers, text_color=shortBlockers == "" ? color.lime : color.red)
    table.cell(dbg, 3, 5, "ADX TF=" + str.tostring(adxVal, "#.##"))
    table.cell(dbg, 0, 6, "Backtest why")
    table.cell(dbg, 1, 6, longAggregateWhy, text_color=finalLongSignalBars > 0 ? color.lime : color.yellow)
    table.cell(dbg, 2, 6, shortAggregateWhy, text_color=finalShortSignalBars > 0 ? color.lime : color.yellow)
    table.cell(dbg, 3, 6, "pre-fix diff: VWAP/ADX/RSI")
    table.cell(dbg, 0, 7, "Bars hardGate")
    table.cell(dbg, 1, 7, str.tostring(longHardGateBars))
    table.cell(dbg, 2, 7, str.tostring(shortHardGateBars))
    table.cell(dbg, 3, 7, "in date range")
    table.cell(dbg, 0, 8, "Bars softPassed")
    table.cell(dbg, 1, 8, str.tostring(longSoftPassedBars))
    table.cell(dbg, 2, 8, str.tostring(shortSoftPassedBars))
    table.cell(dbg, 3, 8, "required=" + str.tostring(requiredSoft))
    table.cell(dbg, 0, 9, "Bars raw/final")
    table.cell(dbg, 1, 9, str.tostring(rawLongSignalBars) + "/" + str.tostring(finalLongSignalBars))
    table.cell(dbg, 2, 9, str.tostring(rawShortSignalBars) + "/" + str.tostring(finalShortSignalBars))
    table.cell(dbg, 3, 9, "raw/final")
    table.cell(dbg, 0, 10, "Top hard blocker")
    table.cell(dbg, 1, 10, longTopHardBlocker + " " + str.tostring(longTopHardBlockerCount), text_color=longTopHardBlockerCount > 0 ? color.red : color.lime)
    table.cell(dbg, 2, 10, shortTopHardBlocker + " " + str.tostring(shortTopHardBlockerCount), text_color=shortTopHardBlockerCount > 0 ? color.red : color.lime)
    table.cell(dbg, 3, 10, "only if gate=0")
    table.cell(dbg, 0, 11, "Block: StochRSI")
    table.cell(dbg, 1, 11, f_on(longStochHardBlock) + " / " + str.tostring(longStochBlockBars))
    table.cell(dbg, 2, 11, f_on(shortStochHardBlock) + " / " + str.tostring(shortStochBlockBars))
    table.cell(dbg, 3, 11, "K=" + str.tostring(kLine, "#.##") + " D=" + str.tostring(dLine, "#.##"))
    table.cell(dbg, 0, 12, "Block: Volume")
    table.cell(dbg, 1, 12, "L=" + f_on(volumeLongHardBlock) + " / " + str.tostring(volumeLongBlockBars))
    table.cell(dbg, 2, 12, "S=" + f_on(volumeShortHardBlock) + " / " + str.tostring(volumeShortBlockBars))
    table.cell(dbg, 3, 12, "ratio=" + str.tostring(volRatio, "#.##"))
    table.cell(dbg, 0, 13, "Block: VWAP")
    table.cell(dbg, 1, 13, f_on(longVwapHardBlock) + " / " + str.tostring(longVwapBlockBars))
    table.cell(dbg, 2, 13, f_on(shortVwapHardBlock) + " / " + str.tostring(shortVwapBlockBars))
    table.cell(dbg, 3, 13, close > rollingVwap ? "close>vwap" : "close<=vwap")
    table.cell(dbg, 0, 14, "Block: Candle / ATR")
    table.cell(dbg, 1, 14, "C=" + f_on(candleHardBlock) + " A=" + f_on(atrHardBlock))
    table.cell(dbg, 2, 14, "C=" + str.tostring(candleBlockBars) + " A=" + str.tostring(atrBlockBars))
    table.cell(dbg, 3, 14, "ATR%=" + str.tostring(atrPct, "#.####"))
    table.cell(dbg, 0, 15, "Block: EMA / HTF")
    table.cell(dbg, 1, 15, "EMA=" + f_on(emaSpreadHardBlock) + " HTF=" + f_on(longHtfHardBlock))
    table.cell(dbg, 2, 15, "EMA=" + f_on(emaSpreadHardBlock) + " HTF=" + f_on(shortHtfHardBlock))
    table.cell(dbg, 3, 15, "spread=" + str.tostring(emaSpreadPct, "#.####"))
    table.cell(dbg, 0, 16, "ADX MTF")
    table.cell(dbg, 1, 16, "trend=" + str.tostring(adxVal, "#.##"))
    table.cell(dbg, 2, 16, "chart=" + str.tostring(adxRawChart, "#.##"))
    table.cell(dbg, 3, 16, "passed=" + f_on(adxPassed))
    table.cell(dbg, 0, 17, "Date / filters")
    table.cell(dbg, 1, 17, "date=" + f_pass(inDateRange) + " allow=" + f_on(i_allowLong))
    table.cell(dbg, 2, 17, "date=" + f_pass(inDateRange) + " allow=" + f_on(i_allowShort))
    table.cell(dbg, 3, 17, activeFilters)
`;
}
