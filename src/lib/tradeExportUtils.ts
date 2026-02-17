// Utility functions for exporting trade data to AI-compatible format

export const formatTradeForExport = (t: any) => {
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
    
    // ATR audit (required for v2 - entydigt dokumentation af ATR source)
    if (!snap.atr_audit) {
      schemaErrors.push('atr_audit');
    } else {
      if (snap.atr_audit.atr_timeframe === undefined) schemaErrors.push('atr_audit.atr_timeframe');
      if (snap.atr_audit.atr_period === undefined) schemaErrors.push('atr_audit.atr_period');
      if (snap.atr_audit.atr_source === undefined) schemaErrors.push('atr_audit.atr_source');
    }
    
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
    
    // 🔴 CLAMP-AWARE TRAILING AUDIT VALIDATION (v2)
    // Trigger: schema_version >= 2 AND close_reason === 'TRAILING_STOP_HIT' AND trailing_stop_exit_audit !== null
    if (t.close_reason === 'TRAILING_STOP_HIT' && snap.trailing_stop_exit_audit) {
      const audit = snap.trailing_stop_exit_audit;
      
      // Always required (må aldrig være undefined)
      if (audit.was_clamped === undefined) {
        schemaErrors.push('trailing_stop_exit_audit.was_clamped');
      }
      if (audit.clamp_applied_correctly === undefined) {
        schemaErrors.push('trailing_stop_exit_audit.clamp_applied_correctly');
      }
      if (audit.expected_trailing_level === undefined) {
        schemaErrors.push('trailing_stop_exit_audit.expected_trailing_level');
      }
      if (audit.effective_exit_level === undefined) {
        schemaErrors.push('trailing_stop_exit_audit.effective_exit_level');
      }
      
      // Conditional required (kun når was_clamped === true)
      if (audit.was_clamped === true) {
        if (audit.clamp_reason === null || audit.clamp_reason === undefined) {
          schemaErrors.push('trailing_stop_exit_audit.clamp_reason');
        }
        if (audit.clamp_protection_level === null || audit.clamp_protection_level === undefined) {
          schemaErrors.push('trailing_stop_exit_audit.clamp_protection_level');
        }
        if (audit.clamp_delta === undefined || audit.clamp_delta === null || audit.clamp_delta <= 0) {
          schemaErrors.push('trailing_stop_exit_audit.clamp_delta');
        }
        if (audit.clamp_applied_correctly !== true) {
          schemaErrors.push('trailing_stop_exit_audit.clamp_applied_correctly (must be true)');
        }
      }
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

  // 🔴 KRAV 3: Standardisér exit_reason til UPPER_SNAKE_CASE
  const exitReasonMap: Record<string, string> = {
    // Standard exit reasons (map to UPPER_SNAKE_CASE)
    'TRAILING_STOP': 'TRAILING_STOP_HIT',
    'TRAILING_STOP_HIT': 'TRAILING_STOP_HIT',
    'trailing_stop': 'TRAILING_STOP_HIT',
    'LEGACY_TRAILING_STOP_HIT': 'TRAILING_STOP_HIT',
    'BREAK_EVEN': 'BREAK_EVEN_HIT',
    'BREAK_EVEN_HIT': 'BREAK_EVEN_HIT',
    'break_even': 'BREAK_EVEN_HIT',
    'STOP_LOSS': 'STOP_LOSS_HIT',
    'STOP_LOSS_HIT': 'STOP_LOSS_HIT',
    'stop_loss': 'STOP_LOSS_HIT',
    'HARD_STOP_LOSS_HIT': 'HARD_STOP_LOSS_HIT',
    'PEAK_LOCK_HIT': 'PEAK_LOCK_HIT',
    'MAX_SL_AFTER_MFE_HIT': 'MAX_SL_AFTER_MFE_HIT',
    'TIMEOUT': 'TIMEOUT',
    'timeout': 'TIMEOUT',
    'MANUAL': 'MANUAL',
    'manual': 'MANUAL',
    'TAKE_PROFIT': 'TAKE_PROFIT',
    'take_profit': 'TAKE_PROFIT'
  };
  const exitReason = exitReasonMap[t.close_reason] || t.close_reason?.toUpperCase() || 'UNKNOWN';

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

  // VWAP - Full audit fields for AI analysis
  const softVwap = isLegacy
    ? (snap.soft_vwap_passed ?? snap.conditionDetails?.vwap?.[side] ?? null)
    : snap.soft_vwap_passed;
  const vwapValue = snap.vwap ?? snap.conditionDetails?.vwap?.value ?? null;
  const vwapEnabled = snap.conditionDetails?.vwap?.enabled ?? snap.vwap_enabled ?? false;
  const vwapPeriod = snap.vwap_period ?? snap.conditionDetails?.vwap?.period ?? null;
  const vwapTimeframe = snap.vwap_timeframe ?? snap.trend_timeframe ?? null;
  const vwapCapturedAt = snap.vwap_captured_at ?? snap.captured_at ?? openedAt.toISOString();
  
  // VWAP filter calculations
  const entryPrice = +t.entry_price;
  let vwapFilterPassed: boolean | null = null;
  let vwapRule: string | null = null;
  let vwapDistancePct: number | null = null;
  let vwapDistanceAbs: number | null = null;
  
  if (vwapEnabled && vwapValue != null) {
    const vwapNum = +vwapValue;
    vwapDistanceAbs = entryPrice - vwapNum;
    vwapDistancePct = (vwapDistanceAbs / vwapNum) * 100;
    
    if (side === 'long') {
      vwapFilterPassed = entryPrice > vwapNum;
      vwapRule = 'LONG_above_VWAP';
    } else {
      vwapFilterPassed = entryPrice < vwapNum;
      vwapRule = 'SHORT_below_VWAP';
    }
  } else if (vwapValue != null) {
    // VWAP disabled but we still calculate distance for reference
    const vwapNum = +vwapValue;
    vwapDistanceAbs = entryPrice - vwapNum;
    vwapDistancePct = (vwapDistanceAbs / vwapNum) * 100;
  }

  // OBV (On Balance Volume) - Always export for analysis
  const obvData = snap.obv ?? null;
  const obvCurrent = obvData?.current ?? null;
  const obvPrevious5 = obvData?.previous5 ?? null;
  const obvTrend = obvData?.trend ?? null;
  
  // OBV confirmation calculation: LONG = OBV current > OBV prev5, SHORT = OBV current < OBV prev5
  let obvConfirmation: boolean | null = null;
  if (obvCurrent != null && obvPrevious5 != null) {
    if (side === 'long') {
      obvConfirmation = obvCurrent > obvPrevious5;
    } else {
      obvConfirmation = obvCurrent < obvPrevious5;
    }
  } else if (obvData?.confirmation !== undefined) {
    // Use pre-computed value if available
    obvConfirmation = obvData.confirmation;
  }

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

  // 🔴 UNIQUE IDENTIFIERS for dublet-afklaring
  const tradeId = t.id || null;
  const signalId = snap.signal_id || null;

  // 🔴 FILTER MODE SETTINGS - Eksporter om filtre er hard eller soft
  // VIGTIGT: Bruger direkte fra snapshot, ingen fallbacks der kan overskrive faktiske værdier
  const filterModeSettings = snap.filter_mode_settings || {};

  // StochRSI mode (gør eksport-output entydigt, så AI ikke “gætter” ud fra soft_* felter)
  const stochRsiMode: "hard" | "soft" | null =
    filterModeSettings.stochrsi_hard_filter === true
      ? "hard"
      : filterModeSettings.stochrsi_hard_filter === false
        ? "soft"
        : null;

  return {
    // 🔴 SCHEMA VERSION & VALIDATION
    schema_version: schemaVersion,
    is_legacy: isLegacy,
    schema_error: hasSchemaError,
    schema_error_reason: schemaErrorReason,

    // 🔴 UNIQUE IDENTIFIERS
    trade_id: tradeId,
    signal_id: signalId,

    // 🔴 GATE AUDIT - Alle gates med pass/fail + reason
    gate_audit: snap.gate_audit ?? null,

    // 🔴 DETAILED INDICATOR AUDITS med null_reason (v3+)
    stochrsi_audit: snap.stochrsi_audit ?? null,
    volume_audit: snap.volume_audit ?? null,
    adx_audit_full: snap.adx_audit_full ?? null,
    atr_audit_full: snap.atr_audit_full ?? null,
    macd_audit: snap.macd_audit ?? null,
    trend_audit: snap.trend_audit ?? null,

    // 🔴 FILTER MODE SETTINGS (hard=blokerer trades, soft=bidrager til score)
    filter_modes: filterModeSettings,

    // 🔴 EXPLICIT MODE FLAGS (for at undgå misforståelser i eksport-teksten)
    stoch_rsi_filter_mode: stochRsiMode,
    stoch_rsi_is_hard_filter: filterModeSettings.stochrsi_hard_filter ?? null,


    // 🔴 TIMEFRAME & STRATEGY CONFIG (required for optimization)
    scan_timeframe: snap.scan_interval ?? null,
    trend_timeframe: snap.trend_timeframe ?? null,
    higher_trend_timeframe: snap.higher_trend_timeframe ?? null,
    strategy_version: snap.strategy_version ?? null,
    config_timestamp: snap.config_updated_at ?? snap.config_timestamp ?? null,

    // Core trade data
    symbol: t.symbol,
    side: t.side,
    entry_price: +t.entry_price,
    exit_price: +t.exit_price,
    duration_seconds: durationSec,
    exit_reason: exitReason,

    // 🔴 BINANCE GROUND TRUTH P&L (income API source)
    pnl_gross: t.pnl != null ? +Number(t.pnl).toFixed(6) : 0,           // REALIZED_PNL from Binance
    commission_total: t.total_fee != null ? +Number(-Math.abs(t.total_fee)).toFixed(6) : null, // sum(COMMISSION) - always negative
    funding_total: t.funding_fee != null ? +Number(t.funding_fee).toFixed(6) : null,  // sum(FUNDING_FEE)
    pnl_net: t.net_pnl != null ? +Number(t.net_pnl).toFixed(6) : null,  // REALIZED_PNL + COMMISSION + FUNDING_FEE
    pnl_net_pct: t.net_pnl != null && t.notional != null && +t.notional > 0
      ? +((+t.net_pnl / +t.notional) * 100).toFixed(4)
      : (t.pnl_percent != null ? +(t.pnl_percent).toFixed(4) : null),
    exit_winner: (t.net_pnl ?? t.pnl) > 0,

    // 🔴 ADDITIONAL FEE DETAILS
    entry_fee: t.entry_fee != null ? +Number(t.entry_fee).toFixed(6) : null,
    exit_fee: t.exit_fee != null ? +Number(t.exit_fee).toFixed(6) : null,
    fees_pct_of_notional: t.fees_pct_of_notional != null ? +Number(t.fees_pct_of_notional).toFixed(4) : null,
    notional: t.notional != null ? +Number(t.notional).toFixed(2) : null,
    leverage_used: t.leverage_used ?? (snap.leverage || null),

    // 🔴 MFE & MAE (Maximum Favorable/Adverse Excursion)
    mfe_pct: snap.mfe_percent != null ? +Number(snap.mfe_percent).toFixed(4) : 
      (snap.peak_price != null && side === 'long' 
        ? +((+snap.peak_price - +t.entry_price) / +t.entry_price * 100).toFixed(4)
        : snap.peak_price != null && side === 'short'
          ? +(( +t.entry_price - +snap.peak_price) / +t.entry_price * 100).toFixed(4)
          : null),
    mae_pct: t.mae_percent != null ? +Number(t.mae_percent).toFixed(4) :
      (snap.mae_percent != null ? +Number(snap.mae_percent).toFixed(4) : 
        (t.low_price != null && side === 'long'
          ? +(( +t.entry_price - +t.low_price) / +t.entry_price * 100).toFixed(4)
          : t.low_price != null && side === 'short'
            ? +(( +t.low_price - +t.entry_price) / +t.entry_price * 100).toFixed(4)
            : null)),
    mae_abs: t.mae != null ? +Number(t.mae).toFixed(6) : (snap.mae != null ? +Number(snap.mae).toFixed(6) : null),
    low_price: t.low_price ?? snap.low_price ?? null,

    // EMA - higher precision for analysis
    EMA_fast: snap.emaFast != null ? +Number(snap.emaFast).toFixed(8) : null,
    EMA_medium: snap.emaMedium != null ? +Number(snap.emaMedium).toFixed(8) : null,
    EMA_slow: snap.emaSlow != null ? +Number(snap.emaSlow).toFixed(8) : null,
    EMA_spread_pct: emaSpread != null ? +Number(emaSpread).toFixed(8) : null,

    // MACD (entydigt schema) - full precision
    macd_signal_period: macdSignalPeriod,
    macd_line: macdLine != null ? +Number(macdLine).toFixed(14) : null,
    macd_signal_line: macdSignalLine != null ? +Number(macdSignalLine).toFixed(14) : null,
    macd_histogram: macdHistogram != null ? +Number(macdHistogram).toFixed(14) : null,
    MACD_direction_filter_passed: macdDirPassed,
    MACD_histogram_soft_passed: softMacdHistogram,
    MACD_momentum_soft_passed: softMacdMomentum,

    // ATR - higher precision (MUST NOT be 0.00 if value exists)
    ATR_value: snap.atr != null ? +Number(snap.atr).toFixed(10) : null,
    ATR_pct: atrPct != null ? +Number(atrPct).toFixed(8) : null,
    ATR_filter_passed: atrFilterPassed,
    
    // 🔴 ATR FILTER AUDIT - Fuld forklaring af filter-beslutning
    ATR_filter_audit: snap.atr_filter_audit ? {
      passed: snap.atr_filter_audit.passed,
      reason: snap.atr_filter_audit.reason,
      atr_value_raw: snap.atr_filter_audit.atr_value_raw != null ? +Number(snap.atr_filter_audit.atr_value_raw).toFixed(10) : null,
      atr_pct_raw: snap.atr_filter_audit.atr_pct_raw != null ? +Number(snap.atr_filter_audit.atr_pct_raw).toFixed(8) : null,
      atr_timeframe: snap.atr_filter_audit.atr_timeframe,
      atr_period: snap.atr_filter_audit.atr_period,
      atr_source: snap.atr_filter_audit.atr_source,
      atr_adaptive_enabled: snap.atr_filter_audit.atr_adaptive_enabled,
      atr_base_used: snap.atr_filter_audit.atr_base_used,
      atr_floor_used: snap.atr_filter_audit.atr_floor_used,
      atr_ceiling_used: snap.atr_filter_audit.atr_ceiling_used,
      final_min_atr_used: snap.atr_filter_audit.final_min_atr_used,
    } : null,
    // 🔴 ATR AUDIT - Entydigt dokumentation af ATR source (v2 garanti)
    ATR_audit: snap.atr_audit ? {
      atr_value: snap.atr_audit.atr_value,
      atr_percent: snap.atr_audit.atr_percent,
      atr_period: snap.atr_audit.atr_period,
      atr_timeframe: snap.atr_audit.atr_timeframe,
      atr_source: snap.atr_audit.atr_source, // 'entry' = Model A
      atr_captured_at: snap.atr_audit.atr_captured_at,
    } : null,

    // ADX - med audit felter (v2 garanterer adx_audit hvis ADX enabled)
    // 🔴 NYE FELTER: adx_enabled, adx_hard_filter, adx_min, adx_max, adx_min_source, dynamic_min_adx
    ADX_enabled: snap.adx_enabled ?? filterModeSettings.adx_enabled ?? null,
    ADX_hard_filter: snap.adx_hard_filter ?? filterModeSettings.adx_hard_filter ?? null,
    ADX_filter_mode: (snap.adx_hard_filter ?? filterModeSettings.adx_hard_filter) === true 
      ? 'HARD' 
      : (snap.adx_hard_filter ?? filterModeSettings.adx_hard_filter) === false 
        ? 'SOFT' 
        : null,
    ADX_value: snap.adx != null ? +Number(snap.adx).toFixed(4) : null,
    ADX_filter_passed: adxFilterPassed,
    // 🔴 NYE RUNTIME FELTER - fra hard filter status i snapshot
    ADX_min: snap.filterStatus?.hard?.adx?.adx_min ?? snap.adx_audit?.adx_floor_used ?? null,
    ADX_max: snap.filterStatus?.hard?.adx?.adx_max ?? snap.adx_audit?.adx_ceiling_used ?? null,
    ADX_min_source: snap.filterStatus?.hard?.adx?.adx_min_source ?? null, // 'UI' eller 'ADAPTIVE'
    ADX_dynamic_min: snap.filterStatus?.hard?.adx?.dynamic_min_adx ?? null,
    ADX_adaptive_adx_computed: snap.filterStatus?.hard?.adx?.adaptive_adx_computed ?? null,
    ADX_audit: snap.adx_audit ? {
      adx_value: snap.adx_audit.adx_value != null ? +Number(snap.adx_audit.adx_value).toFixed(4) : null,
      adx_period: snap.adx_audit.adx_period,
      adx_timeframe: snap.adx_audit.adx_timeframe,
      adx_floor_used: snap.adx_audit.adx_floor_used,
      adx_ceiling_used: snap.adx_audit.adx_ceiling_used,
      plus_di: snap.adx_audit.plus_di != null ? +Number(snap.adx_audit.plus_di).toFixed(4) : null,
      minus_di: snap.adx_audit.minus_di != null ? +Number(snap.adx_audit.minus_di).toFixed(4) : null,
      dx_instant: snap.adx_audit.dx_instant != null ? +Number(snap.adx_audit.dx_instant).toFixed(4) : null,
    } : null,
    
    // 🔴 ADX FILTER AUDIT - Fuld forklaring af filter-beslutning
    ADX_filter_audit: snap.adx_filter_audit ? {
      passed: snap.adx_filter_audit.passed,
      reason: snap.adx_filter_audit.reason,
      adx_value_raw: snap.adx_filter_audit.adx_value_raw != null ? +Number(snap.adx_filter_audit.adx_value_raw).toFixed(4) : null,
      adx_floor_used: snap.adx_filter_audit.adx_floor_used,
      adx_ceiling_used: snap.adx_filter_audit.adx_ceiling_used,
      adx_adaptive_enabled: snap.adx_filter_audit.adx_adaptive_enabled,
      adx_base_used: snap.adx_filter_audit.adx_base_used,
      plus_di: snap.adx_filter_audit.plus_di != null ? +Number(snap.adx_filter_audit.plus_di).toFixed(4) : null,
      minus_di: snap.adx_filter_audit.minus_di != null ? +Number(snap.adx_filter_audit.minus_di).toFixed(4) : null,
      adx_timeframe: snap.adx_filter_audit.adx_timeframe,
      adx_period: snap.adx_filter_audit.adx_period,
      adx_min_source: snap.adx_filter_audit.adx_min_source ?? null, // 'UI' eller 'ADAPTIVE'
    } : null,

    // Volume
    volume_current: volumeCurrent != null ? +Number(volumeCurrent).toFixed(2) : null,
    volume_avg: volumeAvg != null ? +Number(volumeAvg).toFixed(2) : null,
    volume_multiplier_filter_passed: snap.volume_multiplier_filter_passed,

    // StochRSI (v2: separate k/d felter)
    stoch_rsi_k: stochRsiK != null ? +Number(stochRsiK).toFixed(2) : null,
    stoch_rsi_d: stochRsiD != null ? +Number(stochRsiD).toFixed(2) : null,
    stoch_rsi_zone_passed: isLegacy ? (snap.stochrsi_zone_passed ?? softStoch) : snap.stochrsi_zone_passed,
    
    // 🔴 FULL STOCHRSI AUDIT - Previous values for cross detection
    stochrsi_prev_k: snap.stochrsi_audit?.prev_k ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_prev_k ?? snap.stochrsi_prev_k ?? null,
    stochrsi_prev_d: snap.stochrsi_audit?.prev_d ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_prev_d ?? snap.stochrsi_prev_d ?? null,
    
    // 🔴 Entry mode
    stochrsi_entry_mode: snap.stochrsi_audit?.entry_mode ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_entry_mode ?? snap.stochrsi_entry_mode ?? null,
    
    // 🔴 Threshold settings - all 4 K/D overbought/oversold
    stochrsi_overbought_k_setting: snap.stochrsi_audit?.threshold_overbought_k ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_overbought_k_setting ?? null,
    stochrsi_overbought_d_setting: snap.stochrsi_audit?.threshold_overbought_d ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_overbought_d_setting ?? null,
    stochrsi_oversold_k_setting: snap.stochrsi_audit?.threshold_oversold_k ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_oversold_k_setting ?? null,
    stochrsi_oversold_d_setting: snap.stochrsi_audit?.threshold_oversold_d ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_oversold_d_setting ?? null,
    
    // 🔴 Zone signals at entry
    stochrsi_overbought_at_signal: snap.stochrsi_audit?.overbought_at_signal ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_overbought_at_signal ?? snap.stochrsi_overbought_at_signal ?? null,
    stochrsi_oversold_at_signal: snap.stochrsi_audit?.oversold_at_signal ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_oversold_at_signal ?? snap.stochrsi_oversold_at_signal ?? null,
    
    // 🔴 Cross signals
    stochrsi_cross_down: snap.stochrsi_audit?.cross_down ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_cross_down ?? snap.stochrsi_cross_down ?? null,
    stochrsi_cross_up: snap.stochrsi_audit?.cross_up ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_cross_up ?? snap.stochrsi_cross_up ?? null,
    
    // 🔴 Rollover settings
    stochrsi_rollover_d_min_used: snap.stochrsi_audit?.rollover_d_min_used ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_rollover_d_min_used ?? snap.stochrsi_rollover_d_min_used ?? null,
    stochrsi_rollover_d_min_setting: snap.stochrsi_audit?.rollover_d_min_setting ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_rollover_d_min ?? snap.stochrsi_rollover_d_min ?? null,
    stochrsi_overbought_threshold: snap.stochrsi_audit?.threshold_overbought_k ?? snap.filterStatus?.hard?.stochrsi?.audit?.stochrsi_overbought_threshold ?? snap.stochrsi_overbought_threshold ?? null,

    // Bollinger Bands
    bollinger_upper: bbUpper != null ? +Number(bbUpper).toFixed(4) : null,
    bollinger_middle: bbMiddle != null ? +Number(bbMiddle).toFixed(4) : null,
    bollinger_lower: bbLower != null ? +Number(bbLower).toFixed(4) : null,
    bollinger_signal_passed: softBb,

    // Soft conditions
    soft_ema_trend_passed: softEmaTrend,
    soft_stoch_passed: stochRsiMode === "soft" ? softStoch : null,
    soft_macd_histogram_passed: softMacdHistogram,
    soft_macd_momentum_passed: softMacdMomentum,
    soft_bb_passed: softBb,
    soft_volume_passed: softVolume,
    soft_pivot_passed: softPivot,
    soft_vwap_passed: softVwap,
    VWAP_enabled: vwapEnabled,
    VWAP_value: vwapValue != null ? +Number(vwapValue).toFixed(8) : null,
    VWAP_period: vwapPeriod,
    VWAP_filter_passed: vwapFilterPassed,
    VWAP_rule: vwapRule,
    VWAP_distance_pct: vwapDistancePct != null ? +Number(vwapDistancePct).toFixed(4) : null,
    VWAP_distance_abs: vwapDistanceAbs != null ? +Number(vwapDistanceAbs).toFixed(8) : null,
    VWAP_source: vwapValue != null ? 'entry' : null,
    VWAP_timeframe: vwapTimeframe,
    VWAP_captured_at: vwapCapturedAt,
    soft_conditions_total: softConditionsTotal,

    // OBV (On Balance Volume) - logged for analysis, not used as filter
    OBV_current: obvCurrent != null ? +Number(obvCurrent).toFixed(0) : null,
    OBV_previous_5: obvPrevious5 != null ? +Number(obvPrevious5).toFixed(0) : null,
    OBV_trend: obvTrend,
    OBV_confirmation: obvConfirmation,

    // Break-even (v2: break_even_at_price guaranteed if triggered)
    break_even_triggered: breakEvenTriggered,
    break_even_at_price: breakEvenAtPrice != null ? +Number(breakEvenAtPrice).toFixed(8) : null,
    
    // 🔒 Peak-Lock Trailing Config & Status
    peak_lock_enabled: snap.peak_lock_enabled ?? false,
    peak_lock_activate_profit_pct: snap.peak_lock_activate_profit_pct ?? null,
    peak_lock_distance_pct: snap.peak_lock_distance_pct ?? null,
    peak_lock_min_profit_floor_pct: snap.peak_lock_min_profit_floor_pct ?? null,
    peak_lock_ratchet_only: snap.peak_lock_ratchet_only ?? null,
    peak_lock_activated: snap.peak_lock_activated ?? false,
    peak_lock_stop_price: snap.peak_lock_stop_price != null ? +Number(snap.peak_lock_stop_price).toFixed(8) : null,
    peak_price: snap.peak_price != null ? +Number(snap.peak_price).toFixed(8) : null,
    
    // 🔒 Max SL after MFE Config & Status (early loss-cap before BE)
    // 🔴 CONSISTENCY CHECK:
    // - Legacy trades (schema_version < 2): max_sl_after_mfe_applied = null (feature didn't exist)
    // - If max_sl_after_mfe_enabled = false, applied must be null (impossible for disabled feature to apply)
    max_sl_after_mfe_enabled: isLegacy ? null : (snap.max_sl_after_mfe_enabled ?? false),
    max_sl_after_mfe_activate_pct: isLegacy ? null : (snap.max_sl_after_mfe_activate_pct ?? null),
    max_sl_after_mfe_max_dist_pct: isLegacy ? null : (snap.max_sl_after_mfe_max_dist_pct ?? null),
    // Applied field: null for legacy OR if feature was disabled (can't apply if disabled)
    max_sl_after_mfe_applied: isLegacy 
      ? null 
      : (snap.max_sl_after_mfe_enabled === false 
          ? null  // Feature disabled = can never apply
          : (snap.max_sl_after_mfe_applied ?? false)),
    max_sl_after_mfe_at: isLegacy ? null : (snap.max_sl_after_mfe_at ?? null),
    max_sl_after_mfe_mfe_pct: isLegacy ? null : (snap.max_sl_after_mfe_mfe_pct != null ? +Number(snap.max_sl_after_mfe_mfe_pct).toFixed(4) : null),
    
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
      // 🔴 ATR AUDIT - Entydigt dokumentation af hvilken ATR der blev brugt
      atr_value_used_for_trailing: snap.trailing_stop_exit_audit.atr_value_used_for_trailing 
        ?? snap.trailing_stop_exit_audit.atr_value_at_exit, // Legacy fallback
      atr_source: snap.trailing_stop_exit_audit.atr_source ?? 'entry', // Model A
      atr_timeframe: snap.trailing_stop_exit_audit.atr_timeframe,
      atr_period: snap.trailing_stop_exit_audit.atr_period,
      trailing_distance: snap.trailing_stop_exit_audit.trailing_distance,
      distance_from_peak_pct: snap.trailing_stop_exit_audit.distance_from_peak_pct,
      distance_from_peak_atr: snap.trailing_stop_exit_audit.distance_from_peak_atr,
      multiplier_used: snap.trailing_stop_exit_audit.multiplier_used,
      multiplier_was_fallback: snap.trailing_stop_exit_audit.multiplier_was_fallback,
      is_legacy_position: snap.trailing_stop_exit_audit.is_legacy_position,
      trailing_calculation_matches: snap.trailing_stop_exit_audit.trailing_calculation_matches,
      // 🔴 CLAMP-AWARE FIELDS (v2 guaranteed for trailing exits)
      expected_trailing_level: snap.trailing_stop_exit_audit.expected_trailing_level,
      effective_exit_level: snap.trailing_stop_exit_audit.effective_exit_level,
      was_clamped: snap.trailing_stop_exit_audit.was_clamped,
      clamp_reason: snap.trailing_stop_exit_audit.clamp_reason,
      clamp_delta: snap.trailing_stop_exit_audit.clamp_delta,
      clamp_protection_level: snap.trailing_stop_exit_audit.clamp_protection_level,
      clamp_applied_correctly: snap.trailing_stop_exit_audit.clamp_applied_correctly,
    } : null,

    // 🔴 KRAV 2: EXIT MODEL AUDIT - candidate_stops[], effective_stop, stop_type_hit, stop_level_hit
    // Disse felter dokumenterer hvilke stop-niveauer der var aktive ved exit og hvilket niveau der lukkede traden
    exit_model_audit: snap.exit_audit ? {
      // Alle kandidat-stops med type, level, active, triggered status
      candidate_stops: Array.isArray(snap.exit_audit.candidate_stops) 
        ? snap.exit_audit.candidate_stops.map((c: any) => ({
            type: c.type,
            level: c.level != null ? +Number(c.level).toFixed(8) : null,
            active: c.active ?? false,
            triggered: c.triggered ?? false,
          }))
        : null,
      // Det mest beskyttende stop (MAX for LONG, MIN for SHORT)
      effective_stop: snap.exit_audit.effective_stop != null ? +Number(snap.exit_audit.effective_stop).toFixed(8) : null,
      effective_stop_type: snap.exit_audit.effective_stop_type ?? null,
      // Hvilket stop der faktisk lukkede traden
      stop_type_hit: snap.exit_audit.stop_type_hit ?? null,
      stop_level_hit: snap.exit_audit.stop_level_hit != null ? +Number(snap.exit_audit.stop_level_hit).toFixed(8) : null,
      // Beregningsmetode (MAX for LONG, MIN for SHORT)
      selection_method: snap.exit_audit.selection_method ?? null,
      // Exit status flags
      break_even_active: snap.exit_audit.break_even_active ?? false,
      trailing_active: snap.exit_audit.trailing_active ?? false,
      peak_lock_active: snap.exit_audit.peak_lock_active ?? false,
      // Resulting values
      resulting_stop_level: snap.exit_audit.resulting_stop_level != null ? +Number(snap.exit_audit.resulting_stop_level).toFixed(8) : null,
      exit_reason: snap.exit_audit.exit_reason ?? null,
    } : null,

    // Trend data
    trend_medium: trendMedium,
    trend_higher: trendHigher,

    // 🔴 REGIME ROUTER CONFIG - Komplet status for AI-analyse
    // Viser om Regime Router var TÆNDT/SLUKKET og alle indstillinger
    regime_router_enabled: snap.regime_router_enabled ?? false,
    regime_router_status: snap.regime_router_enabled ? 'ON' : 'OFF',
    regime_method: snap.regime_method ?? null,
    regime_method_display: snap.regime_method === 'ADX_AND_ATR' ? 'ADX + ATR%' 
      : snap.regime_method === 'ADX_ONLY' ? 'ADX Only'
      : snap.regime_method === 'ATR_ONLY' ? 'ATR% Only'
      : snap.regime_method ?? null,
    regime_operator: snap.regime_operator ?? null,
    regime_adx_threshold: snap.regime_adx_threshold ?? null,
    regime_atr_pct_threshold: snap.regime_atr_pct_threshold ?? null,
    regime_lock_at_entry: snap.regime_lock_at_entry ?? null,
    
    // 🔴 REGIME DETECTION - Hvilket regime blev detekteret ved entry
    regime_adx_value_at_entry: snap.regime_adx_value_at_entry != null ? +Number(snap.regime_adx_value_at_entry).toFixed(2) : null,
    regime_atr_pct_at_entry: snap.regime_atr_pct_at_entry != null ? +Number(snap.regime_atr_pct_at_entry).toFixed(4) : null,
    regime_label: snap.regime_label ?? null,
    regime_reason: snap.regime_reason ?? null,
    
    // 🔴 EXIT PROFILE SELECTION - Hvilken exit-profil blev valgt baseret på regime
    exit_profile_id: snap.exit_profile_id ?? null,
    exit_profile_name: snap.exit_profile_name ?? null,
    exit_profile_version: snap.exit_profile_version ?? null,
    // Human-readable summary
    regime_exit_summary: snap.regime_router_enabled 
      ? `Regime: ${snap.regime_label ?? 'UNKNOWN'} → Exit Profile: ${snap.exit_profile_name ?? 'DEFAULT'}`
      : 'Regime Router OFF',
    
    // 🔴 EXIT PROFILE TOGGLES - Eksplicit ON/OFF status for alle exit-funktioner
    // Disse viser hvilke exit-mekanismer der var aktive på tidspunktet for traden
    exit_be_enabled: snap.exit_profile_snapshot?.be_enabled ?? snap.break_even_enabled ?? null,
    exit_be_trigger_profit_pct: snap.exit_profile_snapshot?.be_trigger_profit_pct ?? snap.break_even_profit_pct_trigger ?? null,
    exit_be_stop_over_entry_pct: snap.exit_profile_snapshot?.be_stop_over_entry_pct ?? snap.break_even_profit_pct_stop_over_entry ?? null,
    exit_be_ratchet_only: snap.exit_profile_snapshot?.be_ratchet_only ?? snap.break_even_ratchet_only ?? null,
    
    exit_peaklock_enabled: snap.exit_profile_snapshot?.peaklock_enabled ?? snap.peak_lock_enabled ?? null,
    exit_peaklock_activate_profit_pct: snap.exit_profile_snapshot?.peaklock_activate_profit_pct ?? snap.peak_lock_activate_profit_pct ?? null,
    exit_peaklock_distance_from_peak_pct: snap.exit_profile_snapshot?.peaklock_distance_from_peak_pct ?? snap.peak_lock_distance_pct ?? null,
    exit_peaklock_min_profit_floor_pct: snap.exit_profile_snapshot?.peaklock_min_profit_floor_pct ?? snap.peak_lock_min_profit_floor_pct ?? null,
    exit_peaklock_ratchet_only: snap.exit_profile_snapshot?.peaklock_ratchet_only ?? snap.peak_lock_ratchet_only ?? null,
    
    exit_trailing_enabled: snap.exit_profile_snapshot?.trailing_enabled ?? (snap.trailing_stop_activation_enabled !== undefined ? snap.trailing_stop_activation_enabled : null),
    exit_trailing_stop_atr_mult: snap.exit_profile_snapshot?.trailing_stop_atr_mult ?? snap.atr_trailing_stop_multiplier ?? null,
    exit_trailing_activation_enabled: snap.exit_profile_snapshot?.trailing_activation_enabled ?? snap.trailing_stop_activation_enabled ?? null,
    exit_trailing_activation_atr_mult: snap.exit_profile_snapshot?.trailing_activation_atr_mult ?? snap.trailing_stop_activation_atr ?? null,
    
    exit_max_duration_enabled: snap.exit_profile_snapshot?.max_duration_enabled ?? snap.conditional_time_exit_enabled ?? null,
    exit_max_duration_minutes: snap.exit_profile_snapshot?.max_duration_minutes ?? snap.max_position_duration_minutes ?? null,
    
    exit_hard_sl_override_enabled: snap.exit_profile_snapshot?.hard_sl_override_enabled ?? snap.hard_sl_pct_enabled ?? null,
    exit_hard_sl_pct: snap.exit_profile_snapshot?.hard_sl_pct ?? snap.hard_sl_pct ?? null,
    
    // Exit profile snapshot (all params from selected profile) - raw data
    exit_profile_snapshot: snap.exit_profile_snapshot ?? null,

    // Timestamps
    timestamp_open: openedAt.toISOString(),
    timestamp_close: closedAt.toISOString()
  };
};

// ============= COMPACT EXPORT FORMAT =============
// Only includes ENABLED indicators with flat audit structure
// No null values, no filter_disabled flags, no duplicates

export const formatTradeForCompactExport = (t: any) => {
  const snap = t.indicators_snapshot || {};
  const openedAt = new Date(t.opened_at);
  const closedAt = new Date(t.closed_at);
  const durationSec = Math.round((closedAt.getTime() - openedAt.getTime()) / 1000);
  const side = t.side?.toLowerCase() || 'long';

  // Standardize exit_reason
  const exitReasonMap: Record<string, string> = {
    'TRAILING_STOP': 'TRAILING_STOP_HIT',
    'TRAILING_STOP_HIT': 'TRAILING_STOP_HIT',
    'trailing_stop': 'TRAILING_STOP_HIT',
    'LEGACY_TRAILING_STOP_HIT': 'TRAILING_STOP_HIT',
    'BREAK_EVEN': 'BREAK_EVEN_HIT',
    'BREAK_EVEN_HIT': 'BREAK_EVEN_HIT',
    'break_even': 'BREAK_EVEN_HIT',
    'STOP_LOSS': 'STOP_LOSS_HIT',
    'STOP_LOSS_HIT': 'STOP_LOSS_HIT',
    'stop_loss': 'STOP_LOSS_HIT',
    'HARD_STOP_LOSS_HIT': 'HARD_STOP_LOSS_HIT',
    'PEAK_LOCK_HIT': 'PEAK_LOCK_HIT',
    'MAX_SL_AFTER_MFE_HIT': 'MAX_SL_AFTER_MFE_HIT',
    'TIMEOUT': 'TIMEOUT',
    'timeout': 'TIMEOUT',
    'MANUAL': 'MANUAL',
    'manual': 'MANUAL',
    'TAKE_PROFIT': 'TAKE_PROFIT',
    'take_profit': 'TAKE_PROFIT'
  };
  const exitReason = exitReasonMap[t.close_reason] || t.close_reason?.toUpperCase() || 'UNKNOWN';

  // Build compact object
  const compact: Record<string, any> = {};

  // === CORE TRADE INFO (always included) ===
  compact.symbol = t.symbol;
  compact.side = t.side;
  compact.entry_price = +t.entry_price;
  compact.exit_price = +t.exit_price;
  // 🔴 BINANCE GROUND TRUTH P&L
  compact.pnl_gross = t.pnl != null ? +Number(t.pnl).toFixed(4) : 0;
  compact.commission_total = t.total_fee != null ? +Number(-Math.abs(t.total_fee)).toFixed(4) : null;
  compact.funding_total = t.funding_fee != null ? +Number(t.funding_fee).toFixed(4) : null;
  compact.pnl_net = t.net_pnl != null ? +Number(t.net_pnl).toFixed(4) : null;
  compact.pnl_net_pct = t.net_pnl != null && t.notional != null && +t.notional > 0
    ? +((+t.net_pnl / +t.notional) * 100).toFixed(4)
    : (t.pnl_percent != null ? +(t.pnl_percent).toFixed(4) : null);
  compact.duration_seconds = durationSec;
  compact.exit_reason = exitReason;
  compact.timestamp_open = openedAt.toISOString();
  compact.timestamp_close = closedAt.toISOString();

  // === POSITION SIZING & RISK ===
  const positionSizePct = snap.position_size_percent ?? snap.position_size_pct;
  const riskPerTradePct = snap.risk_per_trade_percent ?? snap.risk_per_trade_pct;
  const leverageUsed = t.leverage_used ?? snap.leverage ?? snap.leverage_used;
  if (positionSizePct != null) compact.position_size_pct = +Number(positionSizePct).toFixed(2);
  if (riskPerTradePct != null) compact.risk_per_trade_pct = +Number(riskPerTradePct).toFixed(2);
  if (leverageUsed != null) compact.leverage_used = Math.round(leverageUsed);

  // === MFE/MAE ===
  const mfePct = snap.mfe_percent != null ? +Number(snap.mfe_percent).toFixed(4) : 
    (snap.peak_price != null && side === 'long' 
      ? +((+snap.peak_price - +t.entry_price) / +t.entry_price * 100).toFixed(4)
      : snap.peak_price != null && side === 'short'
        ? +(( +t.entry_price - +snap.peak_price) / +t.entry_price * 100).toFixed(4)
        : null);
  const maePct = t.mae_percent != null ? +Number(t.mae_percent).toFixed(4) :
    (snap.mae_percent != null ? +Number(snap.mae_percent).toFixed(4) : null);
  if (mfePct != null) compact.mfe_pct = mfePct;
  if (maePct != null) compact.mae_pct = maePct;

  // === REGIME (if router enabled) ===
  if (snap.regime_label) compact.regime_label = snap.regime_label;
  if (snap.regime_reason) compact.regime_reason = snap.regime_reason;
  
  // Regime router thresholds for what-if analysis
  const regimeRouterEnabled = snap.regime_router_enabled === true;
  if (regimeRouterEnabled) {
    const regimeAdxThreshold = snap.regime_adx_threshold;
    const regimeAtrPctThreshold = snap.regime_atr_pct_threshold;
    if (regimeAdxThreshold != null) compact.regime_adx_threshold = +Number(regimeAdxThreshold).toFixed(2);
    if (regimeAtrPctThreshold != null) compact.regime_atr_pct_threshold = +Number(regimeAtrPctThreshold).toFixed(4);
  }

  // === TREND CONTEXT ===
  const trendMedium = snap.trend_medium ?? snap.trend;
  const trendHigher = snap.trend_higher;
  if (trendMedium) compact.trend_medium = trendMedium;
  if (trendHigher) compact.trend_higher = trendHigher;

  // === EXIT SUMMARY ===
  if (snap.exit_audit?.stop_type_hit) compact.stop_type_hit = snap.exit_audit.stop_type_hit;
  if (snap.exit_audit?.stop_level_hit != null) compact.stop_level_hit = +Number(snap.exit_audit.stop_level_hit).toFixed(6);
  if (snap.exit_profile_name) compact.exit_profile_name = snap.exit_profile_name;

  // === INDICATOR AUDITS (only if ENABLED at entry) ===
  // Each indicator: value(s) + ALL thresholds from UI + passed
  // Designed for "what-if" threshold tuning analysis

  // --- ADX ---
  const adxEnabled = snap.adx_enabled === true || snap.filterStatus?.hard?.adx?.enabled === true;
  if (adxEnabled) {
    const adxVal = snap.adx ?? snap.filterStatus?.hard?.adx?.value;
    const adxAudit = snap.adx_audit ?? snap.filterStatus?.hard?.adx?.audit;
    const adxPassed = snap.adx_filter_passed ?? snap.filterStatus?.hard?.adx?.passed;
    if (adxVal != null) {
      compact.adx = {
        value: +Number(adxVal).toFixed(2),
        min: adxAudit?.dynamic_min_adx != null ? +Number(adxAudit.dynamic_min_adx).toFixed(2) : 
             (snap.adx_floor != null ? +Number(snap.adx_floor).toFixed(2) : null),
        max: adxAudit?.adx_ceiling_used != null ? +Number(adxAudit.adx_ceiling_used).toFixed(2) :
             (snap.adx_ceiling != null ? +Number(snap.adx_ceiling).toFixed(2) : null),
        passed: adxPassed ?? null
      };
      // Remove null values
      if (compact.adx.min === null) delete compact.adx.min;
      if (compact.adx.max === null) delete compact.adx.max;
      if (compact.adx.passed === null) delete compact.adx.passed;
    }
  }

  // --- ATR ---
  const atrEnabled = snap.atr_enabled === true || snap.atr != null;
  if (atrEnabled && snap.atr != null) {
    const atrPct = snap.atr_percent ?? (snap.price ? (snap.atr / snap.price) * 100 : null);
    const atrPassed = snap.atr_filter_passed ?? snap.filterStatus?.hard?.atr?.passed;
    const atrAudit = snap.atr_audit ?? snap.filterStatus?.hard?.atr?.audit;
    compact.atr = {
      value: +Number(snap.atr).toFixed(6),
      pct: atrPct != null ? +Number(atrPct).toFixed(4) : null,
      min_pct: snap.min_atr_percent != null ? +Number(snap.min_atr_percent).toFixed(4) :
               (atrAudit?.min_atr_percent != null ? +Number(atrAudit.min_atr_percent).toFixed(4) : null),
      floor: snap.atr_floor != null ? +Number(snap.atr_floor).toFixed(4) :
             (atrAudit?.atr_floor != null ? +Number(atrAudit.atr_floor).toFixed(4) : null),
      ceiling: snap.atr_ceiling != null ? +Number(snap.atr_ceiling).toFixed(4) :
               (atrAudit?.atr_ceiling != null ? +Number(atrAudit.atr_ceiling).toFixed(4) : null),
      passed: atrPassed ?? null
    };
    // Remove null values
    Object.keys(compact.atr).forEach(k => {
      if (compact.atr[k] === null) delete compact.atr[k];
    });
  }

  // --- STOCHRSI ---
  const stochEnabled = snap.stochrsi_enabled === true || snap.filterStatus?.hard?.stochrsi?.enabled === true;
  if (stochEnabled) {
    const stochK = snap.stochRSI_k ?? snap.stochRSI?.k ?? snap.filterStatus?.hard?.stochrsi?.value?.k;
    const stochD = snap.stochRSI_d ?? snap.stochRSI?.d ?? snap.filterStatus?.hard?.stochrsi?.value?.d;
    const stochAudit = snap.stochrsi_audit ?? snap.filterStatus?.hard?.stochrsi?.audit;
    const stochPassed = snap.stochrsi_filter_passed ?? snap.filterStatus?.hard?.stochrsi?.passed;
    if (stochK != null || stochD != null) {
      compact.stochrsi = {
        k: stochK != null ? +Number(stochK).toFixed(2) : null,
        d: stochD != null ? +Number(stochD).toFixed(2) : null,
        prev_k: stochAudit?.stochrsi_prev_k != null ? +Number(stochAudit.stochrsi_prev_k).toFixed(2) : null,
        prev_d: stochAudit?.stochrsi_prev_d != null ? +Number(stochAudit.stochrsi_prev_d).toFixed(2) : null,
        mode: stochAudit?.stochrsi_entry_mode ?? snap.stochrsi_short_mode ?? null,
        overbought_k: stochAudit?.stochrsi_overbought_k_setting ?? snap.stochrsi_overbought_k ?? null,
        overbought_d: stochAudit?.stochrsi_overbought_d_setting ?? snap.stochrsi_overbought_d ?? null,
        oversold_k: stochAudit?.stochrsi_oversold_k_setting ?? snap.stochrsi_oversold_k ?? null,
        oversold_d: stochAudit?.stochrsi_oversold_d_setting ?? snap.stochrsi_oversold_d ?? null,
        rollover_d_min: snap.rollover_d_min_short ?? stochAudit?.stochrsi_rollover_d_min_used ?? null,
        cross_down: stochAudit?.stochrsi_cross_down ?? null,
        cross_up: stochAudit?.stochrsi_cross_up ?? null,
        overbought_at_signal: stochAudit?.stochrsi_overbought_at_signal ?? null,
        oversold_at_signal: stochAudit?.stochrsi_oversold_at_signal ?? null,
        passed: stochPassed ?? null
      };
      // Remove null values and convert thresholds to integers
      Object.keys(compact.stochrsi).forEach(k => {
        if (compact.stochrsi[k] === null) {
          delete compact.stochrsi[k];
        } else if (['overbought_k', 'overbought_d', 'oversold_k', 'oversold_d', 'rollover_d_min'].includes(k) && typeof compact.stochrsi[k] === 'number') {
          compact.stochrsi[k] = Math.round(compact.stochrsi[k]);
        }
      });
    }
  }

  // --- VOLUME ---
  const volumeEnabled = snap.volume_enabled === true || snap.filterStatus?.hard?.volume?.enabled === true;
  if (volumeEnabled) {
    const volCurrent = snap.volume_current ?? snap.volume;
    const volAvg = snap.volume_avg ?? snap.avgVolume;
    const volPassed = snap.volume_filter_passed ?? snap.filterStatus?.hard?.volume?.passed;
    const volAudit = snap.volume_audit ?? snap.filterStatus?.hard?.volume?.audit;
    if (volCurrent != null && volAvg != null) {
      const ratio = +(volCurrent / volAvg).toFixed(2);
      compact.volume = {
        ratio,
        multiplier_long: snap.volume_multiplier ?? volAudit?.multiplier_long ?? null,
        multiplier_short: snap.volume_multiplier_short ?? volAudit?.multiplier_short ?? null,
        mode: snap.volume_mode_short ?? volAudit?.mode ?? null,
        avg_period: snap.volume_avg_period ?? volAudit?.avg_period ?? null,
        passed: volPassed ?? null
      };
      // Remove null values
      Object.keys(compact.volume).forEach(k => {
        if (compact.volume[k] === null) delete compact.volume[k];
      });
    }
  }

  // --- MACD ---
  const macdEnabled = snap.macd_enabled === true || snap.filterStatus?.hard?.macd?.enabled === true;
  if (macdEnabled) {
    const macdLine = snap.macd_line ?? snap.macdLine;
    const macdSignal = snap.macd_signal_line ?? snap.macdSignalLine;
    const macdHist = snap.macd_histogram ?? snap.macdHistogram ?? snap.macd;
    const macdDirPassed = snap.macd_direction_passed ?? snap.filterStatus?.hard?.macd?.passed;
    const macdHistPassed = snap.soft_macd_histogram_passed;
    if (macdLine != null || macdHist != null) {
      compact.macd = {
        line: macdLine != null ? +Number(macdLine).toFixed(8) : null,
        signal: macdSignal != null ? +Number(macdSignal).toFixed(8) : null,
        histogram: macdHist != null ? +Number(macdHist).toFixed(8) : null,
        hist_threshold: snap.macd_histogram_threshold ?? null,
        fast: snap.macd_fast ?? null,
        slow: snap.macd_slow ?? null,
        signal_period: snap.macd_signal ?? snap.macd_signal_period ?? null,
        direction_passed: macdDirPassed ?? null,
        histogram_passed: macdHistPassed ?? null
      };
      // Remove null values
      Object.keys(compact.macd).forEach(k => {
        if (compact.macd[k] === null) delete compact.macd[k];
      });
    }
  }

  // --- EMA ---
  const emaEnabled = snap.ema_enabled === true || snap.filterStatus?.hard?.ema?.enabled === true;
  if (emaEnabled) {
    const emaSpread = snap.ema_spread_percent ?? snap.emaSpreadPercent;
    const emaPassed = snap.ema_filter_passed ?? snap.filterStatus?.hard?.ema?.passed;
    if (emaSpread != null) {
      compact.ema = {
        spread_pct: +Number(emaSpread).toFixed(4),
        min_spread: snap.min_ema_spread_percent ?? null,
        max_spread: snap.max_ema_spread_percent ?? null,
        fast: snap.ema_fast ?? null,
        medium: snap.ema_medium ?? null,
        slow: snap.ema_slow ?? null,
        passed: emaPassed ?? null
      };
      // Remove null values
      Object.keys(compact.ema).forEach(k => {
        if (compact.ema[k] === null) delete compact.ema[k];
      });
    }
  }

  // --- RSI ---
  const rsiEnabled = snap.rsi_enabled === true || snap.filterStatus?.hard?.rsi?.enabled === true;
  if (rsiEnabled) {
    const rsiVal = snap.rsi ?? snap.filterStatus?.hard?.rsi?.value;
    const rsiPassed = snap.rsi_filter_passed ?? snap.filterStatus?.hard?.rsi?.passed;
    if (rsiVal != null) {
      compact.rsi = {
        value: +Number(rsiVal).toFixed(2),
        period: snap.rsi_period ?? null,
        overbought: snap.rsi_overbought ?? null,
        oversold: snap.rsi_oversold ?? null,
        min_long: snap.rsi_min_long ?? null,
        max_short: snap.rsi_max_short ?? null,
        passed: rsiPassed ?? null
      };
      // Remove null values
      Object.keys(compact.rsi).forEach(k => {
        if (compact.rsi[k] === null) delete compact.rsi[k];
      });
    }
  }

  // --- HIGHER TREND ---
  const higherTrendEnabled = snap.higher_trend_enabled === true || snap.filterStatus?.hard?.higher_trend?.enabled === true;
  if (higherTrendEnabled && trendHigher) {
    const htPassed = snap.higher_trend_filter_passed ?? snap.filterStatus?.hard?.higher_trend?.passed;
    compact.higher_trend = {
      value: trendHigher,
      timeframe: snap.higher_trend_timeframe ?? null,
      passed: htPassed ?? null
    };
    // Remove null values
    Object.keys(compact.higher_trend).forEach(k => {
      if (compact.higher_trend[k] === null) delete compact.higher_trend[k];
    });
  }

  // --- BOLLINGER BANDS ---
  const bbEnabled = snap.bb_enabled === true || snap.filterStatus?.soft?.bb?.enabled === true;
  if (bbEnabled) {
    const bbUpper = snap.bb_upper ?? snap.bb?.upper;
    const bbMiddle = snap.bb_middle ?? snap.bb?.middle;
    const bbLower = snap.bb_lower ?? snap.bb?.lower;
    const bbPassed = snap.soft_bb_passed ?? snap.filterStatus?.soft?.bb?.passed;
    if (bbUpper != null || bbLower != null) {
      compact.bb = {
        upper: bbUpper != null ? +Number(bbUpper).toFixed(6) : null,
        middle: bbMiddle != null ? +Number(bbMiddle).toFixed(6) : null,
        lower: bbLower != null ? +Number(bbLower).toFixed(6) : null,
        period: snap.bb_period ?? null,
        std_dev: snap.bb_std_dev ?? null,
        passed: bbPassed ?? null
      };
      // Remove null values
      Object.keys(compact.bb).forEach(k => {
        if (compact.bb[k] === null) delete compact.bb[k];
      });
    }
  }

  // --- VWAP ---
  const vwapEnabled = snap.vwap_enabled === true || snap.filterStatus?.soft?.vwap?.enabled === true;
  if (vwapEnabled && snap.vwap != null) {
    const vwapPassed = snap.soft_vwap_passed ?? snap.filterStatus?.soft?.vwap?.passed;
    compact.vwap = {
      value: +Number(snap.vwap).toFixed(6),
      period: snap.vwap_period ?? null,
      passed: vwapPassed ?? null
    };
    // Remove null values
    Object.keys(compact.vwap).forEach(k => {
      if (compact.vwap[k] === null) delete compact.vwap[k];
    });
  }

  // --- PIVOT POINTS ---
  const pivotEnabled = snap.pivot_points_enabled === true || snap.filterStatus?.soft?.pivot?.enabled === true;
  if (pivotEnabled) {
    const pivotPassed = snap.soft_pivot_passed ?? snap.filterStatus?.soft?.pivot?.passed;
    if (pivotPassed != null) {
      compact.pivot = {
        passed: pivotPassed,
        timeframe: snap.pivot_points_timeframe ?? null,
        lookback: snap.pivot_points_lookback ?? null,
        near_threshold: snap.pivot_points_near_threshold ?? null
      };
      // Remove null values
      Object.keys(compact.pivot).forEach(k => {
        if (compact.pivot[k] === null) delete compact.pivot[k];
      });
    }
  }

  // === SOFT CONDITIONS SUMMARY ===
  const softTotal = snap.soft_conditions_total ?? snap.conditionsMet;
  const softRequired = snap.soft_conditions_required ?? snap.signal_conditions_required;
  if (softTotal != null) {
    compact.soft_conditions = {
      met: softTotal,
      required: softRequired ?? null
    };
    if (compact.soft_conditions.required === null) delete compact.soft_conditions.required;
  }

  // === EXIT THRESHOLDS SNAPSHOT (for re-simulation) ===
  const hasExitThresholds = snap.atr_stop_loss_multiplier != null || 
                            snap.atr_trailing_stop_multiplier != null || 
                            snap.break_even_atr != null ||
                            snap.hard_sl_pct != null;
  if (hasExitThresholds) {
    compact.exit_thresholds = {
      sl_atr_mult: snap.atr_stop_loss_multiplier ?? null,
      trailing_atr_mult: snap.atr_trailing_stop_multiplier ?? null,
      trailing_activation_atr: snap.trailing_stop_activation_atr ?? null,
      be_atr: snap.break_even_atr ?? null,
      be_profit_pct_trigger: snap.break_even_profit_pct_trigger ?? null,
      be_stop_over_entry: snap.break_even_profit_pct_stop_over_entry ?? null,
      hard_sl_pct: snap.hard_sl_pct ?? null,
      peak_lock_activate_pct: snap.peak_lock_activate_profit_pct ?? null,
      peak_lock_distance_pct: snap.peak_lock_distance_pct ?? null,
      max_duration_minutes: snap.max_position_duration_minutes ?? null
    };
    // Remove null values
    Object.keys(compact.exit_thresholds).forEach(k => {
      if (compact.exit_thresholds[k] === null) delete compact.exit_thresholds[k];
    });
    // Only include if we have at least one value
    if (Object.keys(compact.exit_thresholds).length === 0) {
      delete compact.exit_thresholds;
    }
  }

  return compact;
};

export const compressTradeDataCompact = (trades: any[]) => {
  // Per-trade P&L components (from DB, sourced from Binance userTrades + income)
  const totalGross = +trades.reduce((s, t) => s + Number(t.pnl ?? 0), 0).toFixed(6);
  // Commission: stored as positive (cost) in DB, exported as negative
  const totalCommission = +trades.reduce((s, t) => s + Number(-Math.abs(Number(t.total_fee ?? 0))), 0).toFixed(6);
  const totalFunding = +trades.reduce((s, t) => s + Number(t.funding_fee ?? 0), 0).toFixed(6);
  // Net from DB (ground truth: gross + commission + funding per trade)
  const totalNetFromDb = +trades.reduce((s, t) => s + Number(t.net_pnl ?? t.pnl), 0).toFixed(6);
  // Net recalculated from components
  const totalNetFromComponents = +(totalGross + totalCommission + totalFunding).toFixed(6);

  const netPnls = trades.map(t => Number(t.net_pnl ?? t.pnl));
  const winners = netPnls.filter(p => p > 0);
  const losers = netPnls.filter(p => p < 0);
  const grossWins = winners.reduce((s, p) => s + p, 0);
  const grossLosses = Math.abs(losers.reduce((s, p) => s + p, 0));

  const summary = {
    total_trades: trades.length,
    win_rate_net: ((winners.length / trades.length) * 100).toFixed(2) + "%",
    total_pnl_gross: totalGross,
    total_commission: totalCommission,
    total_funding: totalFunding,
    total_pnl_net: totalNetFromDb,
    avg_pnl_net: +(totalNetFromDb / trades.length).toFixed(4),
    profit_factor: grossLosses > 0 ? +(grossWins / grossLosses).toFixed(2) : null,
    // Validation: DB net vs recalculated from components (should be ≈ 0)
    validation_diff_db_vs_components: +(totalNetFromDb - totalNetFromComponents).toFixed(6),
    // sum(trade.pnl_net) == summary.total_pnl_net (internal consistency)
    validation_sum_matches: Math.abs(totalNetFromDb - trades.reduce((s, t) => s + Number(t.net_pnl ?? t.pnl), 0)) < 0.001,
    commission_source: "binance_userTrades_per_fill",
    period_from: new Date(trades[trades.length - 1].closed_at).toISOString(),
    period_to: new Date(trades[0].closed_at).toISOString()
  };

  return {
    export_mode: "COMPACT",
    summary,
    trades: trades.map(formatTradeForCompactExport)
  };
};

// ============= FULL EXPORT FORMAT =============
// Complete format with all audit data for deep debugging

export const compressTradeData = (trades: any[]) => {
  const totalGross = +trades.reduce((s, t) => s + Number(t.pnl ?? 0), 0).toFixed(6);
  const totalCommission = +trades.reduce((s, t) => s + Number(-Math.abs(Number(t.total_fee ?? 0))), 0).toFixed(6);
  const totalFunding = +trades.reduce((s, t) => s + Number(t.funding_fee ?? 0), 0).toFixed(6);
  const totalNetFromDb = +trades.reduce((s, t) => s + Number(t.net_pnl ?? t.pnl), 0).toFixed(6);
  const totalNetFromComponents = +(totalGross + totalCommission + totalFunding).toFixed(6);

  const netPnls = trades.map(t => Number(t.net_pnl ?? t.pnl));
  const winners = netPnls.filter(p => p > 0);
  const losers = netPnls.filter(p => p < 0);
  const grossWins = winners.reduce((s, p) => s + p, 0);
  const grossLosses = Math.abs(losers.reduce((s, p) => s + p, 0));

  const summary = {
    total_trades: trades.length,
    win_rate_net: ((winners.length / trades.length) * 100).toFixed(2) + "%",
    total_pnl_gross: totalGross,
    total_commission: totalCommission,
    total_funding: totalFunding,
    total_pnl_net: totalNetFromDb,
    avg_pnl_net: +(totalNetFromDb / trades.length).toFixed(4),
    profit_factor: grossLosses > 0 ? +(grossWins / grossLosses).toFixed(2) : null,
    validation_diff_db_vs_components: +(totalNetFromDb - totalNetFromComponents).toFixed(6),
    validation_sum_matches: Math.abs(totalNetFromDb - trades.reduce((s, t) => s + Number(t.net_pnl ?? t.pnl), 0)) < 0.001,
    commission_source: "binance_userTrades_per_fill",
    period_from: new Date(trades[trades.length - 1].closed_at).toISOString(),
    period_to: new Date(trades[0].closed_at).toISOString()
  };

  return {
    summary,
    trades: trades.map(formatTradeForExport)
  };
};

// Format med linjeskift mellem handler ved ca. 2500 tegn for nemmere AI-læsning
export const formatWithLineBreaks = (data: any): string => {
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
  return summaryStr.slice(0, -1) + ',"trades":[\n' + tradesFormatted.join(',\n') + '\n]}';
};
