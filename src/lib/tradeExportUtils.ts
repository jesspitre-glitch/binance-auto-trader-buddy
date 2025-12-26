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
  const filterModeSettings = snap.filter_mode_settings || {
    ema_hard_filter: snap.ema_hard_filter ?? true,
    rsi_hard_filter: snap.rsi_hard_filter ?? true,
    stochrsi_hard_filter: snap.stochrsi_hard_filter ?? false,
    macd_hard_filter: snap.macd_hard_filter ?? false,
    bb_hard_filter: snap.bb_hard_filter ?? false,
    vwap_hard_filter: snap.vwap_hard_filter ?? false,
    atr_hard_filter: snap.atr_hard_filter ?? true,
    adx_hard_filter: snap.adx_hard_filter ?? true,
    volume_hard_filter: snap.volume_hard_filter ?? true,
    pivot_points_hard_filter: snap.pivot_points_hard_filter ?? false,
    higher_trend_hard_filter: snap.higher_trend_hard_filter ?? true,
  };

  return {
    // 🔴 SCHEMA VERSION & VALIDATION
    schema_version: schemaVersion,
    is_legacy: isLegacy,
    schema_error: hasSchemaError,
    schema_error_reason: schemaErrorReason,

    // 🔴 UNIQUE IDENTIFIERS
    trade_id: tradeId,
    signal_id: signalId,
    
    // 🔴 FILTER MODE SETTINGS (hard=blokerer trades, soft=bidrager til score)
    filter_modes: filterModeSettings,

    // Core trade data
    symbol: t.symbol,
    side: t.side,
    entry_price: +t.entry_price,
    exit_price: +t.exit_price,
    pnl_abs: +(t.pnl?.toFixed(6) || 0),
    pnl_pct: +(t.pnl_percent?.toFixed(6) || 0),
    duration_seconds: durationSec,
    exit_reason: exitReason,

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
    ADX_value: snap.adx != null ? +Number(snap.adx).toFixed(4) : null,
    ADX_filter_passed: adxFilterPassed,
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

    // Trend data
    trend_medium: trendMedium,
    trend_higher: trendHigher,

    // Timestamps
    timestamp_open: openedAt.toISOString(),
    timestamp_close: closedAt.toISOString()
  };
};

export const compressTradeData = (trades: any[]) => {
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
