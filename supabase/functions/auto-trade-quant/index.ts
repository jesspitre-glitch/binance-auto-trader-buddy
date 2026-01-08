import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IndicatorConfig {
  ema_enabled: boolean;
  ema_fast: number;
  ema_medium: number;
  ema_slow: number;
  ema_medium_trend: number;
  min_ema_spread_percent: number;
  max_ema_spread_percent?: number;
  ema_hard_filter?: boolean;
  rsi_enabled: boolean;
  rsi_period: number;
  rsi_min_long: number;
  rsi_max_short: number;
  rsi_zone_width: number;
  rsi_momentum_periods: number;
  rsi_hard_filter?: boolean;
  stochrsi_enabled: boolean;
  stochrsi_period: number;
  stochrsi_k_period: number;
  stochrsi_d_period: number;
  stochrsi_overbought: number;
  stochrsi_oversold: number;
  stochrsi_overbought_k?: number;
  stochrsi_overbought_d?: number;
  stochrsi_oversold_k?: number;
  stochrsi_oversold_d?: number;
  stochrsi_short_mode?: string;
  rollover_d_min_short?: number;
  stochrsi_hard_filter?: boolean;
  pivot_points_enabled: boolean;
  pivot_points_timeframe: string;
  pivot_points_lookback: number;
  pivot_points_near_threshold: number;
  pivot_points_hard_filter?: boolean;
  macd_enabled: boolean;
  macd_fast: number;
  macd_slow: number;
  macd_signal: number;
  macd_histogram_threshold: number;
  macd_direction_enabled: boolean;
  macd_color_change_hard_filter: boolean;
  macd_hard_filter?: boolean;
  histogram_momentum_enabled: boolean;
  histogram_momentum_periods: number;
  bb_enabled: boolean;
  bb_period: number;
  bb_std_dev: number;
  bb_hard_filter?: boolean;
  atr_enabled: boolean;
  atr_period: number;
  min_atr: number;
  min_atr_percent: number;
  adaptive_atr_enabled?: boolean;
  atr_base_min?: number;
  atr_floor?: number;
  atr_ceiling?: number;
  atr_stop_loss_multiplier: number;
  atr_take_profit_multiplier: number;
  atr_trailing_stop_multiplier: number;
  break_even_atr: number;
  atr_hard_filter?: boolean;
  adx_enabled: boolean;
  adx_period: number;
  adx_threshold: number;
  adaptive_adx_enabled?: boolean;
  adx_base_min?: number;
  adx_floor?: number;
  adx_ceiling?: number;
  adx_hard_filter?: boolean;
  volume_enabled: boolean;
  volume_avg_period: number;
  volume_multiplier: number;
  volume_hard_filter?: boolean;
  signal_conditions_required: number;
  position_size_percent: number;
  risk_per_trade_percent: number;
  max_open_positions: number;
  max_exposure_percent: number;
  daily_loss_limit_percent: number;
  max_position_duration_minutes: number;
  leverage: number;
  scan_interval: string;
  trend_timeframe: string;
  higher_trend_enabled: boolean;
  higher_trend_timeframe: string;
  higher_trend_hard_filter?: boolean;
  klines_limit: number;
  // VWAP
  vwap_enabled?: boolean;
  vwap_period?: number;
  vwap_hard_filter?: boolean;
}

// Calculate strategy identifier from ALL config parameters using SHA-256 hash
async function getStrategyIdentifier(config: any): Promise<string> {
  // Extract ALL strategy parameters (excluding metadata like id, user_id, timestamps, name)
  // CRITICAL: This list MUST include every config field that affects trading behavior!
  const strategyParams = {
    // EMA settings
    ema_enabled: config.ema_enabled,
    ema_fast: config.ema_fast,
    ema_medium: config.ema_medium,
    ema_slow: config.ema_slow,
    ema_medium_trend: config.ema_medium_trend,
    ema_trend_hard_filter: config.ema_trend_hard_filter,
    min_ema_spread_percent: config.min_ema_spread_percent,
    max_ema_spread_percent: config.max_ema_spread_percent,
    // RSI settings
    rsi_enabled: config.rsi_enabled,
    rsi_period: config.rsi_period,
    rsi_min_long: config.rsi_min_long,
    rsi_max_short: config.rsi_max_short,
    rsi_zone_width: config.rsi_zone_width,
    rsi_momentum_periods: config.rsi_momentum_periods,
    rsi_overbought: config.rsi_overbought,
    rsi_oversold: config.rsi_oversold,
    // StochRSI settings
    stochrsi_enabled: config.stochrsi_enabled,
    stochrsi_period: config.stochrsi_period,
    stochrsi_k_period: config.stochrsi_k_period,
    stochrsi_d_period: config.stochrsi_d_period,
    stochrsi_overbought: config.stochrsi_overbought,
    stochrsi_oversold: config.stochrsi_oversold,
    stochrsi_short_mode: config.stochrsi_short_mode,
    rollover_d_min_short: config.rollover_d_min_short,
    // Pivot Points settings
    pivot_points_enabled: config.pivot_points_enabled,
    pivot_points_timeframe: config.pivot_points_timeframe,
    pivot_points_lookback: config.pivot_points_lookback,
    pivot_points_near_threshold: config.pivot_points_near_threshold,
    // MACD settings
    macd_enabled: config.macd_enabled,
    macd_fast: config.macd_fast,
    macd_slow: config.macd_slow,
    macd_signal: config.macd_signal,
    macd_histogram_threshold: config.macd_histogram_threshold,
    macd_direction_enabled: config.macd_direction_enabled,
    macd_color_change_hard_filter: config.macd_color_change_hard_filter,
    histogram_momentum_enabled: config.histogram_momentum_enabled,
    histogram_momentum_periods: config.histogram_momentum_periods,
    // Bollinger Bands settings
    bb_enabled: config.bb_enabled,
    bb_period: config.bb_period,
    bb_std_dev: config.bb_std_dev,
    // ATR settings
    atr_enabled: config.atr_enabled,
    atr_period: config.atr_period,
    min_atr: config.min_atr,
    min_atr_percent: config.min_atr_percent,
    adaptive_atr_enabled: config.adaptive_atr_enabled,
    atr_base_min: config.atr_base_min,
    atr_floor: config.atr_floor,
    atr_ceiling: config.atr_ceiling,
    atr_stop_loss_multiplier: config.atr_stop_loss_multiplier,
    atr_take_profit_multiplier: config.atr_take_profit_multiplier,
    atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier,
    break_even_atr: config.break_even_atr,
    trailing_stop_activation_enabled: config.trailing_stop_activation_enabled,
    trailing_stop_activation_atr: config.trailing_stop_activation_atr,
    // ADX settings
    adx_enabled: config.adx_enabled,
    adx_period: config.adx_period,
    adx_threshold: config.adx_threshold,
    adaptive_adx_enabled: config.adaptive_adx_enabled,
    adx_base_min: config.adx_base_min,
    adx_floor: config.adx_floor,
    adx_ceiling: config.adx_ceiling,
    // Volume settings
    volume_enabled: config.volume_enabled,
    volume_avg_period: config.volume_avg_period,
    volume_multiplier: config.volume_multiplier,
    // Candle momentum
    candle_momentum_enabled: config.candle_momentum_enabled,
    min_candle_body_percent: config.min_candle_body_percent,
    // Signal & position settings
    signal_conditions_required: config.signal_conditions_required,
    position_size_percent: config.position_size_percent,
    risk_per_trade_percent: config.risk_per_trade_percent,
    max_open_positions: config.max_open_positions,
    max_exposure_percent: config.max_exposure_percent,
    daily_loss_limit_percent: config.daily_loss_limit_percent,
    max_position_duration_minutes: config.max_position_duration_minutes,
    auto_exit_enabled: config.auto_exit_enabled,
    leverage: config.leverage,
    // Timeframe & scan settings
    scan_interval: config.scan_interval,
    trend_timeframe: config.trend_timeframe,
    higher_trend_enabled: config.higher_trend_enabled,
    higher_trend_timeframe: config.higher_trend_timeframe,
    klines_limit: config.klines_limit,
  };
  
  // Sort keys to ensure consistent hashing regardless of object property order
  const sortedJson = JSON.stringify(strategyParams, Object.keys(strategyParams).sort());
  
  // Hash using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(sortedJson);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}


// Determine trend direction from medium timeframe using EMA
function analyzeMediumTrend(klines: any[], config: IndicatorConfig): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const closes = klines.map(k => k.close);
  const currentPrice = closes[closes.length - 1];
  
  // Calculate EMA for medium trend analysis (f.eks. EMA50)
  const emaMediumTrend = calculateEMA(closes, config.ema_medium_trend);
  const currentEmaMediumTrend = emaMediumTrend[emaMediumTrend.length - 1];
  const previousEmaMediumTrend = emaMediumTrend[emaMediumTrend.length - 2];
  
  // Tjek EMA retning
  const emaIsRising = currentEmaMediumTrend > previousEmaMediumTrend;
  const emaIsFalling = currentEmaMediumTrend < previousEmaMediumTrend;
  
  // LONG kun hvis: Pris > EMA OG EMA er stigende
  if (currentPrice > currentEmaMediumTrend && emaIsRising) return 'BULLISH';
  
  // SHORT kun hvis: Pris < EMA OG EMA er faldende
  if (currentPrice < currentEmaMediumTrend && emaIsFalling) return 'BEARISH';
  
  return 'NEUTRAL';
}

// Determine trend direction from higher timeframe using EMA alignment
function analyzeHigherTrend(klines: any[], config: IndicatorConfig): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const closes = klines.map(k => k.close);
  const currentPrice = closes[closes.length - 1];
  
  // Calculate EMAs for trend analysis
  const emaFast = calculateEMA(closes, config.ema_fast);
  const emaMedium = calculateEMA(closes, config.ema_medium);
  const emaSlow = calculateEMA(closes, config.ema_slow);
  
  const emaFastCurrent = emaFast[emaFast.length - 1];
  const emaMediumCurrent = emaMedium[emaMedium.length - 1];
  const emaSlowCurrent = emaSlow[emaSlow.length - 1];
  
  // LONG kun hvis: Fast > Medium > Slow (bullish alignment)
  if (emaFastCurrent > emaMediumCurrent && emaMediumCurrent > emaSlowCurrent) return 'BULLISH';
  
  // SHORT kun hvis: Fast < Medium < Slow (bearish alignment)
  if (emaFastCurrent < emaMediumCurrent && emaMediumCurrent < emaSlowCurrent) return 'BEARISH';
  
  return 'NEUTRAL';
}

// Technical indicator calculations
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  
  return ema;
}

function calculateRSI(prices: number[], period: number): number {
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateStochRSI(prices: number[], rsiPeriod: number, kPeriod: number, dPeriod: number): { k: number, d: number } {
  // Calculate RSI values for all available prices
  const rsiValues: number[] = [];
  for (let i = rsiPeriod; i < prices.length; i++) {
    const slice = prices.slice(i - rsiPeriod, i + 1);
    rsiValues.push(calculateRSI(slice, rsiPeriod));
  }
  
  // Need enough RSI values: rsiPeriod for stochastic + kPeriod for K smoothing + dPeriod for D smoothing
  const minRequired = rsiPeriod + kPeriod + dPeriod;
  if (rsiValues.length < minRequired) {
    console.log(`StochRSI: Not enough data. Have ${rsiValues.length} RSI values, need ${minRequired}`);
    return { k: 50, d: 50 };
  }
  
  // Calculate raw StochRSI for each RSI value (using rsiPeriod lookback)
  const rawStochRSI: number[] = [];
  for (let i = rsiPeriod - 1; i < rsiValues.length; i++) {
    const lookback = rsiValues.slice(i - rsiPeriod + 1, i + 1);
    const maxRSI = Math.max(...lookback);
    const minRSI = Math.min(...lookback);
    const currentRSI = rsiValues[i];
    const stoch = maxRSI !== minRSI ? ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100 : 50;
    rawStochRSI.push(stoch);
  }
  
  // K = SMA of raw StochRSI over kPeriod
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < rawStochRSI.length; i++) {
    const kSlice = rawStochRSI.slice(i - kPeriod + 1, i + 1);
    const kSMA = kSlice.reduce((a, b) => a + b, 0) / kPeriod;
    kValues.push(kSMA);
  }
  
  if (kValues.length < dPeriod) {
    console.log(`StochRSI: Not enough K values for D. Have ${kValues.length}, need ${dPeriod}`);
    return { k: kValues[kValues.length - 1] ?? 50, d: kValues[kValues.length - 1] ?? 50 };
  }
  
  // D = SMA of K over dPeriod
  const dSlice = kValues.slice(-dPeriod);
  const d = dSlice.reduce((a, b) => a + b, 0) / dPeriod;
  const k = kValues[kValues.length - 1];
  
  console.log(`StochRSI BEREGNING: rawStochRSI_count=${rawStochRSI.length}, K_count=${kValues.length}, K=${k.toFixed(2)}, D=${d.toFixed(2)}`);
  
  return { k, d };
}

function calculateMACD(prices: number[], fastPeriod: number, slowPeriod: number, signalPeriod: number) {
  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);
  const macdLine = emaFast.map((val, i) => val - emaSlow[i]);
  const signalLine = calculateEMA(macdLine, signalPeriod);
  const histogram = macdLine.map((val, i) => val - signalLine[i]);
  
  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram: histogram[histogram.length - 1],
  };
}

function calculateATR(high: number[], low: number[], close: number[], period: number): number {
  const tr: number[] = [];
  
  for (let i = 1; i < high.length; i++) {
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  
  return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateBollingerBands(prices: number[], period: number, stdDev: number) {
  const sma = prices.slice(-period).reduce((a, b) => a + b, 0) / period;
  const variance = prices.slice(-period).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  return {
    upper: sma + (stdDev * std),
    middle: sma,
    lower: sma - (stdDev * std),
  };
}

// OBV (On Balance Volume) - Measures buying/selling pressure
// OBV = previous OBV + volume (if close > previous close)
// OBV = previous OBV - volume (if close < previous close)
// OBV = previous OBV (if close = previous close)
interface OBVResult {
  current: number;
  previous5: number;
  trend: 'up' | 'down' | 'flat';
  confirmation: boolean; // true if OBV direction matches signal direction
}

function calculateOBV(closes: number[], volumes: number[], side: 'LONG' | 'SHORT'): OBVResult | null {
  if (closes.length < 7 || volumes.length < 7) {
    return null;
  }
  
  // Calculate OBV for all periods
  const obvValues: number[] = [0]; // Start with 0
  
  for (let i = 1; i < closes.length; i++) {
    const prevOBV = obvValues[i - 1];
    const closeChange = closes[i] - closes[i - 1];
    
    if (closeChange > 0) {
      obvValues.push(prevOBV + volumes[i]);
    } else if (closeChange < 0) {
      obvValues.push(prevOBV - volumes[i]);
    } else {
      obvValues.push(prevOBV);
    }
  }
  
  const current = obvValues[obvValues.length - 1];
  const previous5 = obvValues[obvValues.length - 6]; // 5 periods ago
  
  // Determine trend
  let trend: 'up' | 'down' | 'flat';
  const obvChange = current - previous5;
  const threshold = Math.abs(previous5) * 0.01; // 1% tolerance for flat
  
  if (obvChange > threshold) {
    trend = 'up';
  } else if (obvChange < -threshold) {
    trend = 'down';
  } else {
    trend = 'flat';
  }
  
  // Confirmation: LONG is true if OBV current > OBV previous 5
  // SHORT is true if OBV current < OBV previous 5
  let confirmation: boolean;
  if (side === 'LONG') {
    confirmation = current > previous5;
  } else {
    confirmation = current < previous5;
  }
  
  return {
    current,
    previous5,
    trend,
    confirmation
  };
}

// VWAP = Σ(Typical Price × Volume) / Σ(Volume)
// Typical Price = (High + Low + Close) / 3
function calculateVWAP(highs: number[], lows: number[], closes: number[], volumes: number[], period: number): number | null {
  if (highs.length < period || volumes.length < period) {
    return null;
  }
  
  let sumTPV = 0; // Sum of (Typical Price × Volume)
  let sumVolume = 0;
  
  const startIdx = Math.max(0, highs.length - period);
  
  for (let i = startIdx; i < highs.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    const volume = volumes[i];
    
    if (volume > 0) {
      sumTPV += typicalPrice * volume;
      sumVolume += volume;
    }
  }
  
  if (sumVolume === 0) {
    return null;
  }
  
  return sumTPV / sumVolume;
}

function calculateADX(high: number[], low: number[], close: number[], period: number): { adx: number, plusDI: number, minusDI: number, dx: number } {
  const tr: number[] = [];
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  
  // Calculate True Range and Directional Movement
  for (let i = 1; i < high.length; i++) {
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    tr.push(Math.max(hl, hc, lc));
    
    const highDiff = high[i] - high[i - 1];
    const lowDiff = low[i - 1] - low[i];
    
    dmPlus.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    dmMinus.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
  }
  
  if (tr.length < period * 2) {
    // Ikke nok data til at beregne smoothed ADX
    return { adx: 50, plusDI: 50, minusDI: 50, dx: 50 };
  }
  
  // Calculate smoothed TR, +DM, -DM using Wilder's smoothing (EMA-like)
  let smoothedTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedDMPlus = dmPlus.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedDMMinus = dmMinus.slice(0, period).reduce((a, b) => a + b, 0);
  
  const dxValues: number[] = [];
  
  for (let i = period; i < tr.length; i++) {
    // Wilder's smoothing: smoothed = prev - (prev/period) + current
    smoothedTR = smoothedTR - (smoothedTR / period) + tr[i];
    smoothedDMPlus = smoothedDMPlus - (smoothedDMPlus / period) + dmPlus[i];
    smoothedDMMinus = smoothedDMMinus - (smoothedDMMinus / period) + dmMinus[i];
    
    // Calculate +DI and -DI
    const plusDI = (smoothedDMPlus / smoothedTR) * 100;
    const minusDI = (smoothedDMMinus / smoothedTR) * 100;
    
    // Calculate DX
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push(dx);
  }
  
  // Calculate ADX as smoothed average of DX values (Wilder's smoothing)
  if (dxValues.length < period) {
    const lastDX = dxValues[dxValues.length - 1] || 50;
    return { adx: lastDX, plusDI: 50, minusDI: 50, dx: lastDX };
  }
  
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
  }
  
  // Return current values for audit
  const lastPlusDI = (smoothedDMPlus / smoothedTR) * 100;
  const lastMinusDI = (smoothedDMMinus / smoothedTR) * 100;
  const lastDX = dxValues[dxValues.length - 1];
  
  return { adx, plusDI: lastPlusDI, minusDI: lastMinusDI, dx: lastDX };
}

// Cache for symbol filters and USDC symbols to reduce API calls
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
let symbolFiltersCache: { data: Record<string, SymbolFilters>, timestamp: number } | null = null;
let usdcSymbolsCache: { data: string[], timestamp: number } | null = null;

async function fetchAllUSDCSymbols(): Promise<string[]> {
  // Return cached data if still fresh
  if (usdcSymbolsCache && Date.now() - usdcSymbolsCache.timestamp < CACHE_DURATION_MS) {
    console.log(`Using cached USDC symbols (age: ${Date.now() - usdcSymbolsCache.timestamp}ms)`);
    return usdcSymbolsCache.data;
  }

  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange info: ${response.status}`);
    }
    
    const data = await response.json();
    const usdcSymbols = data.symbols
      .filter((s: any) => 
        s.quoteAsset === 'USDC' && 
        s.status === 'TRADING' &&
        s.contractType === 'PERPETUAL'
      )
      .map((s: any) => s.symbol);
    
    console.log(`Found ${usdcSymbols.length} USDC perpetual futures pairs`);
    console.log(`USDC pairs: ${usdcSymbols.slice(0, 20).join(', ')}${usdcSymbols.length > 20 ? '...' : ''}`);
    
    // Check specifically for TIAUSDC
    if (usdcSymbols.includes('TIAUSDC')) {
      console.log('✅ TIAUSDC is in the list');
    } else {
      console.log('❌ TIAUSDC NOT in the list - checking why...');
      const tiaSymbol = data.symbols.find((s: any) => s.symbol === 'TIAUSDC');
      if (tiaSymbol) {
        console.log('TIAUSDC exists but filtered out:', JSON.stringify(tiaSymbol));
      } else {
        console.log('TIAUSDC does not exist in Binance API response');
      }
    }
    
    // Update cache
    usdcSymbolsCache = {
      data: usdcSymbols,
      timestamp: Date.now()
    };
    
    return usdcSymbols;
  } catch (error) {
    console.error('Error fetching USDC symbols:', error);
    // Return cached data if available, even if stale
    if (usdcSymbolsCache) {
      console.log('Using stale cache due to API error');
      return usdcSymbolsCache.data;
    }
    // Fallback to known pairs if API fails
    return ['BTCUSDC', 'ETHUSDC', 'BNBUSDC', 'SOLUSDC'];
  }
}

// Rate limiting and retry logic for Binance API
async function fetchKlines(symbol: string, interval: string, limit: number, retries = 3) {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 418) {
        // Rate limit hit - wait longer before retry
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(`Rate limit hit for ${symbol}, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        console.error('Binance API response:', data);
        throw new Error(`Invalid Binance response for ${symbol}: ${JSON.stringify(data)}`);
      }
      
      return data.map((k: any) => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error(`Failed to fetch klines for ${symbol} after ${retries} retries`);
}


// Binance filters
type SymbolFilters = { stepSize: number; minQty: number; tickSize: number };

function getPrecisionFromStep(step: number): number {
  // Handle scientific notation and decimals
  const s = step.toString();
  if (s.includes('e-')) {
    const p = parseInt(s.split('e-')[1], 10);
    return p;
  }
  const parts = s.split('.');
  return parts[1] ? parts[1].length : 0;
}

async function fetchSymbolFilters(): Promise<Record<string, SymbolFilters>> {
  // Return cached data if still fresh
  if (symbolFiltersCache && Date.now() - symbolFiltersCache.timestamp < CACHE_DURATION_MS) {
    console.log(`Using cached symbol filters (age: ${Date.now() - symbolFiltersCache.timestamp}ms)`);
    return symbolFiltersCache.data;
  }

  const map: Record<string, SymbolFilters> = {};
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    if (!response.ok) {
      // Return cached data if API fails
      if (symbolFiltersCache) {
        console.log('Using stale filter cache due to API error');
        return symbolFiltersCache.data;
      }
      return map;
    }
    const data = await response.json();
    for (const s of data.symbols) {
      if (s.quoteAsset !== 'USDC' || s.status !== 'TRADING' || s.contractType !== 'PERPETUAL') continue;
      const lot = s.filters.find((f: any) => f.filterType === 'LOT_SIZE');
      const price = s.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
      if (!lot || !price) continue;
      map[s.symbol] = {
        stepSize: parseFloat(lot.stepSize),
        minQty: parseFloat(lot.minQty),
        tickSize: parseFloat(price.tickSize),
      };
    }
    
    // Update cache
    symbolFiltersCache = {
      data: map,
      timestamp: Date.now()
    };
    
  } catch (e) {
    console.error('Failed to fetch symbol filters', e);
    // Return cached data if available
    if (symbolFiltersCache) {
      console.log('Using stale filter cache due to exception');
      return symbolFiltersCache.data;
    }
  }
  return map;
}

// Calculate Pivot Points
function calculatePivotPoints(high: number, low: number, close: number) {
  const pp = (high + low + close) / 3;
  const r1 = (2 * pp) - low;
  const s1 = (2 * pp) - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (high - pp);
  
  return { pp, r1, s1, r2, s2, r3, s3 };
}

function analyzeSignal(klines: any[], trendKlines: any[], config: IndicatorConfig) {
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);
  const currentPrice = closes[closes.length - 1];
  
  // Calculate indicators only if enabled
  console.log(`Indicator config: EMA=${config.ema_enabled}, RSI=${config.rsi_enabled}, StochRSI=${config.stochrsi_enabled}, MACD=${config.macd_enabled}, BB=${config.bb_enabled}, ATR=${config.atr_enabled}, ADX=${config.adx_enabled}`);
  console.log(`📊 RSI Config fra DB: min_long=${config.rsi_min_long}, max_short=${config.rsi_max_short}, zone_width=${config.rsi_zone_width}`);
  
  // BEREGN ALLE INDICATORS FØRST (så de kan vises i UI selv når filtre fejler)
  const emaFast = config.ema_enabled ? calculateEMA(closes, config.ema_fast) : null;
  const emaMedium = config.ema_enabled ? calculateEMA(closes, config.ema_medium) : null;
  const emaSlow = config.ema_enabled ? calculateEMA(closes, config.ema_slow) : null;
  const emaFastCurrent = emaFast ? emaFast[emaFast.length - 1] : null;
  const emaMediumCurrent = emaMedium ? emaMedium[emaMedium.length - 1] : null;
  const emaSlowCurrent = emaSlow ? emaSlow[emaSlow.length - 1] : null;
  
  const rsiCurrent = config.rsi_enabled ? calculateRSI(closes, config.rsi_period) : null;
  
  // Dynamisk antal RSI-værdier baseret på rsi_momentum_periods
  const rsiMomentumPeriods = config.rsi_momentum_periods ?? 3;
  const rsiHistory: number[] = [];
  
  if (config.rsi_enabled && rsiMomentumPeriods > 1) {
    for (let i = 0; i < rsiMomentumPeriods; i++) {
      const slice = closes.slice(0, closes.length - i);
      rsiHistory.push(calculateRSI(slice, config.rsi_period));
    }
  }
  
  const stochRSI = config.stochrsi_enabled 
    ? calculateStochRSI(closes, config.stochrsi_period, config.stochrsi_k_period, config.stochrsi_d_period)
    : null;
  
  if (!config.stochrsi_enabled) {
    console.log(`StochRSI DISABLED - set to null`);
  }
  
  const macd = config.macd_enabled 
    ? calculateMACD(closes, config.macd_fast, config.macd_slow, config.macd_signal)
    : null;
  const macdPrevious = config.macd_enabled 
    ? calculateMACD(closes.slice(0, -1), config.macd_fast, config.macd_slow, config.macd_signal)
    : null;
  
  // 🔴 KRITISK: ATR skal ALTID beregnes for exit-logik (SL, break-even, trailing stop)
  // atr_enabled kontrollerer kun om ATR bruges som HARD FILTER, ikke om den beregnes
  const atr = calculateATR(highs, lows, closes, config.atr_period);
  const bb = config.bb_enabled ? calculateBollingerBands(closes, config.bb_period, config.bb_std_dev) : null;
  
  // VWAP beregning (hvis enabled)
  const vwapPeriod = config.vwap_period ?? 50;
  const vwap = config.vwap_enabled ? calculateVWAP(highs, lows, closes, volumes, vwapPeriod) : null;
  
  if (config.vwap_enabled) {
    console.log(`📊 VWAP: ${vwap !== null ? vwap.toFixed(6) : 'null'} (periode: ${vwapPeriod}), Price: ${currentPrice.toFixed(6)}`);
    if (vwap !== null) {
      console.log(`   Price ${currentPrice > vwap ? '>' : '<'} VWAP → ${currentPrice > vwap ? 'BULLISH bias (LONG favored)' : 'BEARISH bias (SHORT favored)'}`);
    }
  }
  
  // ADX beregnes på TREND timeframe, ikke scan interval
  const trendHighs = trendKlines.map(k => k.high);
  const trendLows = trendKlines.map(k => k.low);
  const trendCloses = trendKlines.map(k => k.close);
  const adxResult = config.adx_enabled ? calculateADX(trendHighs, trendLows, trendCloses, config.adx_period) : null;
  const adx = adxResult?.adx ?? null; // Udtræk kun adx-værdien for kompatibilitet
  
  // 🔴 FIX: Volume tri-state - eksplicit null/NaN håndtering
  const rawAvgVolume = config.volume_enabled
    ? volumes.slice(-config.volume_avg_period).reduce((a, b) => a + b, 0) / config.volume_avg_period
    : null;
  // Konvertér NaN/undefined/0 til null for konsistent tri-state logik
  const avgVolume = (rawAvgVolume == null || !Number.isFinite(rawAvgVolume) || rawAvgVolume === 0) ? null : rawAvgVolume;
  
  const rawCurrentVolume = config.volume_enabled ? volumes[volumes.length - 1] : null;
  const currentVolume = (rawCurrentVolume == null || !Number.isFinite(rawCurrentVolume)) ? null : rawCurrentVolume;
  
  // ════════════════════════════════════════════════════════════════
  // 📋 EVALUERING AF ALLE FILTRE (HÅRDE + BLØDE)
  // ════════════════════════════════════════════════════════════════
  
  const filterStatus = {
    hard: {
      emaSpread: { passed: true, value: '', reason: '' },
      atr: { passed: true, value: '', reason: '', atr_floor_used: null as number | null, atr_floor_source: '', atr_floor_passed_boolean: false, effective_min_atr_percent_used: null as number | null },
      adx: { passed: true, value: '', reason: '' },
      // 🔴 FIX: Volume tri-state - passed: null=disabled/no-data, true/false=evaluated
      volume: { passed: null as boolean | null, value: '', reason: '' },
      // 🔴 FIX: long/short kan være null (disabled), true (passed), false (failed)
      macdDirection: { passed: true, long: null as boolean | null, short: null as boolean | null, reason: '', value: '' },
      macdColorChange: { passed: true, long: null as boolean | null, short: null as boolean | null, reason: '' },
      rsiMomentum: { passed: true, long: null as boolean | null, short: null as boolean | null, reason: '' },
      // 🔴 StochRSI hard filter - kan konfigureres som hard/soft i UI
      stochrsi: { passed: true, long: null as boolean | null, short: null as boolean | null, value: '', reason: '' },
    },
    soft: {
      emaAlignment: { long: false, short: false },
      macd: { long: false, short: false },
      // 🔴 FIX: Volume soft condition tri-state
      volume: { long: null as boolean | null, short: null as boolean | null },
    }
  };
  
  console.log(`\n📊 EVALUERER ALLE FILTRE:`);
  
  // ═══════════════════════════════════════════════
  // 🔴 HÅRDE FILTRE (Blokerer trade)
  // ═══════════════════════════════════════════════
  
  // 1️⃣ EMA SPREAD
  let emaSpreadPercent = 0;
  if (config.ema_enabled && emaFastCurrent !== null && emaSlowCurrent !== null) {
    const emaSpread = Math.abs(emaFastCurrent - emaSlowCurrent);
    emaSpreadPercent = (emaSpread / currentPrice) * 100;
    filterStatus.hard.emaSpread.value = `${emaSpreadPercent.toFixed(3)}%`;
    
    // Check minimum spread (sidelæns marked filter)
    if (emaSpreadPercent < config.min_ema_spread_percent) {
      filterStatus.hard.emaSpread.passed = false;
      filterStatus.hard.emaSpread.reason = `${emaSpreadPercent.toFixed(3)}% < ${config.min_ema_spread_percent}% (sidelæns marked)`;
    }
    
    // Check maximum spread (overextended trend filter) - only if max is set and > 0
    const maxSpread = config.max_ema_spread_percent ?? 0;
    if (maxSpread > 0 && emaSpreadPercent > maxSpread) {
      filterStatus.hard.emaSpread.passed = false;
      filterStatus.hard.emaSpread.reason = `${emaSpreadPercent.toFixed(3)}% > ${maxSpread}% (overextended trend - for sen entry)`;
    }
  }
  
  // 2️⃣ ATR (KUN ATR% check - raw ATR er deprecated)
  if (config.atr_enabled && atr !== null) {
    filterStatus.hard.atr.value = atr.toFixed(6);
    
    // FAILSAFE: Log advarsel hvis min_atr (raw) er sat - den ignoreres nu
    if (config.min_atr && config.min_atr > 0) {
      console.log(`   ⚠️ ADVARSEL: min_atr (raw) = ${config.min_atr} er sat men IGNORERES. Brug kun min_atr_percent!`);
    }
    
    if (atr === 0) {
      filterStatus.hard.atr.passed = false;
      filterStatus.hard.atr.reason = 'ATR = 0 (kan ikke beregne stop-loss)';
    }
    
    // KUN ATR% check - raw ATR check er FJERNET
    const atrPercent = (atr / currentPrice) * 100;
    
    // ═══════════════════════════════════════════════════════════════════
    // ATR FILTER VERIFICATION LOG - Alle UI værdier + computed værdier
    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n   📋 ATR FILTER UI VALUES READ (råt fra config):`);
    console.log(`      ui_min_atr_percent: ${config.min_atr_percent}`);
    console.log(`      ui_adaptive_enabled: ${config.adaptive_atr_enabled}`);
    console.log(`      ui_adaptive_floor_percent: ${config.atr_floor}`);
    console.log(`      ui_adaptive_base_percent: ${config.atr_base_min}`);
    console.log(`      ui_adaptive_ceiling_percent: ${config.atr_ceiling}`);
    console.log(`      ui_atr_period: ${config.atr_period}`);
    
    // ─────────────────────────────────────────
    // ATR filter (ATR%) — UI-driven, STRICT ENFORCEMENT
    // ─────────────────────────────────────────

    const ui_min_atr_percent = config.min_atr_percent;
    const ui_adaptive_enabled = config.adaptive_atr_enabled === true;
    const ui_adaptive_floor_percent = config.atr_floor;
    const ui_adaptive_base_percent = config.atr_base_min;
    const ui_adaptive_ceiling_percent = config.atr_ceiling;
    const ui_atr_period = config.atr_period;
    const ui_atr_timeframe = config.scan_interval;

    console.log(`ATR FILTER UI VALUES READ`);
    console.log(`  ui_min_atr_percent: ${ui_min_atr_percent}`);
    console.log(`  ui_adaptive_enabled: ${ui_adaptive_enabled}`);
    console.log(`  ui_adaptive_floor_percent: ${ui_adaptive_floor_percent}`);
    console.log(`  ui_adaptive_base_percent: ${ui_adaptive_base_percent}`);
    console.log(`  ui_adaptive_ceiling_percent: ${ui_adaptive_ceiling_percent}`);
    console.log(`  ui_atr_period: ${ui_atr_period}`);
    console.log(`  ui_atr_timeframe: ${ui_atr_timeframe}`);

    const volumeCurrentValid = typeof currentVolume === 'number' && Number.isFinite(currentVolume);
    const volumeAvgValid = typeof avgVolume === 'number' && Number.isFinite(avgVolume) && avgVolume > 0;

    let adaptive_threshold_computed: number | null = null;
    let effective_min_atr_percent_used: number | null = null;
    let atr_floor_used: number | null = null;
    let atr_floor_source: string = 'none';

    if (ui_adaptive_enabled) {
      // 🔴 KRAV: Floor er ALTID minimum uanset volume
      const floorOk = typeof ui_adaptive_floor_percent === 'number' && Number.isFinite(ui_adaptive_floor_percent);
      const ceilingOk = typeof ui_adaptive_ceiling_percent === 'number' && Number.isFinite(ui_adaptive_ceiling_percent);

      if (!floorOk) {
        // Ingen gyldig floor → kan ikke evaluere
        adaptive_threshold_computed = null;
        effective_min_atr_percent_used = null;
        atr_floor_source = 'adaptive_floor_invalid';
      } else {
        atr_floor_used = ui_adaptive_floor_percent;
        atr_floor_source = 'adaptive';
        
        // 🔴 FIX: Når volume mangler, brug FLOOR direkte - IKKE atrPercent som proxy!
        // Tidligere bug: atrPercent som proxy → self-referential check → ALTID pass
        if (
          volumeCurrentValid &&
          volumeAvgValid &&
          typeof ui_adaptive_base_percent === 'number' &&
          Number.isFinite(ui_adaptive_base_percent)
        ) {
          // Volume tilgængelig: beregn adaptiv threshold
          adaptive_threshold_computed = ui_adaptive_base_percent * (currentVolume / avgVolume);
          
          if (ceilingOk) {
            // Clamp til [floor, ceiling]
            adaptive_threshold_computed = Math.min(
              Math.max(adaptive_threshold_computed, ui_adaptive_floor_percent),
              ui_adaptive_ceiling_percent
            );
          } else {
            // Ingen ceiling → brug max af floor og computed
            adaptive_threshold_computed = Math.max(adaptive_threshold_computed, ui_adaptive_floor_percent);
          }
          
          // Effective = max(floor, adaptive_computed)
          effective_min_atr_percent_used = Math.max(ui_adaptive_floor_percent, adaptive_threshold_computed);
        } else {
          // 🔴 KRITISK FIX: Volume mangler → brug FLOOR direkte, IKKE atrPercent!
          adaptive_threshold_computed = ui_adaptive_floor_percent;
          effective_min_atr_percent_used = ui_adaptive_floor_percent;
          atr_floor_source = 'adaptive_floor_no_volume';
        }
      }
    } else {
      // STATIC MODE: Brug KUN min_atr_percent (ingen adaptive)
      const minOk = typeof ui_min_atr_percent === 'number' && Number.isFinite(ui_min_atr_percent);
      if (minOk) {
        effective_min_atr_percent_used = ui_min_atr_percent;
        atr_floor_used = ui_min_atr_percent;
        atr_floor_source = 'manual';
      } else {
        effective_min_atr_percent_used = null;
        atr_floor_source = 'manual_invalid';
      }
    }

    // 🔴 STRICT ENFORCEMENT: ATR_filter_passed = (atr_percent >= floor) - INGEN "fallback-true"
    const atr_floor_passed_boolean = 
      effective_min_atr_percent_used !== null &&
      Number.isFinite(atrPercent) &&
      atrPercent >= effective_min_atr_percent_used;

    const atrFilterPassed = atr_floor_passed_boolean;

    console.log(`ATR FILTER EFFECTIVE`);
    console.log(`  atr_percent_raw: ${atrPercent.toFixed(4)}%`);
    console.log(
      `  adaptive_threshold_computed: ${
        adaptive_threshold_computed === null ? 'null' : `${adaptive_threshold_computed.toFixed(4)}%`
      }`
    );
    console.log(
      `  effective_min_atr_percent_used: ${
        effective_min_atr_percent_used === null ? 'null' : `${effective_min_atr_percent_used.toFixed(4)}%`
      }`
    );
    console.log(`  atr_floor_used: ${atr_floor_used === null ? 'null' : `${atr_floor_used.toFixed(4)}%`}`);
    console.log(`  atr_floor_source: ${atr_floor_source}`);
    console.log(`  atr_floor_passed_boolean: ${atr_floor_passed_boolean}`);
    console.log(`  ATR_filter_passed: ${atrFilterPassed}`);
    console.log(`  volume_current: ${volumeCurrentValid ? currentVolume : null}`);
    console.log(`  volume_avg: ${volumeAvgValid ? avgVolume : null}`);

    // 🔴 Gem ATR floor audit data til filterStatus for snapshot
    filterStatus.hard.atr.atr_floor_used = atr_floor_used;
    filterStatus.hard.atr.atr_floor_source = atr_floor_source;
    filterStatus.hard.atr.atr_floor_passed_boolean = atr_floor_passed_boolean;
    filterStatus.hard.atr.effective_min_atr_percent_used = effective_min_atr_percent_used;

    if (effective_min_atr_percent_used === null) {
      filterStatus.hard.atr.passed = false;
      filterStatus.hard.atr.reason = `ATR config missing/invalid (adaptive=${ui_adaptive_enabled}, source=${atr_floor_source})`;
      console.log(`   ❌ ATR% BLOKERER: config missing/invalid (source=${atr_floor_source})`);
    } else if (!atrFilterPassed) {
      filterStatus.hard.atr.passed = false;
      filterStatus.hard.atr.reason = `ATR% ${atrPercent.toFixed(4)}% < ${effective_min_atr_percent_used.toFixed(4)}% (floor_source=${atr_floor_source})`;
      console.log(`   ❌ ATR% BLOKERER: ${atrPercent.toFixed(4)}% < ${effective_min_atr_percent_used.toFixed(4)}% (floor=${atr_floor_used?.toFixed(4)}%, source=${atr_floor_source})`);
    } else {
      console.log(`   ✅ ATR% PASSERER: ${atrPercent.toFixed(4)}% >= ${effective_min_atr_percent_used.toFixed(4)}%`);
    }

    console.log(`   ═══════════════════════════════════════════════════════════════════\n`);
  }
  
  // 3️⃣ ADX (med min/max range og optional adaptive threshold)
  if (config.adx_enabled && adx !== null) {
    filterStatus.hard.adx.value = adx.toFixed(2);
    
    // Brug adx_floor som minimum og adx_ceiling som maximum
    const adxMin = config.adx_floor ?? 20;
    const adxMax = config.adx_ceiling ?? 40;
    
    // Hvis adaptive er enabled, beregn dynamisk minimum inden for floor/ceiling
    let dynamicMinADX = adxMin;
    
    if (config.adaptive_adx_enabled && config.adx_base_min && atr !== null) {
      const currentATRPercent = (atr / currentPrice) * 100;
      const atrPeriod = config.atr_period || 14;
      let avgATRPercent = currentATRPercent;
      
      if (closes.length >= atrPeriod) {
        const atrValues = [];
        for (let i = closes.length - atrPeriod; i < closes.length; i++) {
          const tr = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - (i > 0 ? closes[i - 1] : closes[i])),
            Math.abs(lows[i] - (i > 0 ? closes[i - 1] : closes[i]))
          );
          atrValues.push((tr / closes[i]) * 100);
        }
        avgATRPercent = atrValues.reduce((sum, val) => sum + val, 0) / atrValues.length;
      }
      
      if (avgATRPercent > 0) {
        const atrRatio = currentATRPercent / avgATRPercent;
        dynamicMinADX = config.adx_base_min * atrRatio;
        
        // Clamp til floor/ceiling
        if (dynamicMinADX < adxMin) dynamicMinADX = adxMin;
        if (dynamicMinADX > adxMax) dynamicMinADX = adxMax;
        
        console.log(`   🔄 Adaptive ADX: Base=${config.adx_base_min} × ATR%(${atrRatio.toFixed(2)}) = ${dynamicMinADX.toFixed(2)} (min=${adxMin}, max=${adxMax})`);
      }
    }
    
    // Tjek ADX er inden for min/max range
    // 🔴 ADX Min er HÅRDT filter - blokerer trades med for lav trend
    if (adx < dynamicMinADX) {
      filterStatus.hard.adx.passed = false;
      filterStatus.hard.adx.reason = `ADX_BELOW_MIN: ${adx.toFixed(2)} < ${dynamicMinADX.toFixed(2)}`;
      console.log(`   ❌ ADX HARD BLOCK: ${adx.toFixed(2)} < ${dynamicMinADX.toFixed(2)} (under minimum)`);
    }
    // 🔴 ADX Max er HÅRDT filter - blokerer trades med for høj volatilitet
    if (adx > adxMax) {
      filterStatus.hard.adx.passed = false;
      filterStatus.hard.adx.reason = `ADX_ABOVE_MAX: ${adx.toFixed(2)} > ${adxMax.toFixed(2)}`;
      console.log(`   ❌ ADX HARD BLOCK: ${adx.toFixed(2)} > ${adxMax.toFixed(2)} (over maximum)`);
    }
  }
  
  // 4️⃣ VOLUME - TRI-STATE LOGIK
  // null = disabled eller manglende data (ikke evalueret)
  // true = opfylder krav
  // false = fejler krav
  if (config.volume_enabled !== true) {
    // Volume er slukket - ikke evalueret
    filterStatus.hard.volume.passed = null;
    filterStatus.hard.volume.reason = 'Volume disabled';
    filterStatus.soft.volume.long = null;
    filterStatus.soft.volume.short = null;
    console.log(`   📊 Volume: ⚪ DISABLED (tri-state: null)`);
  } else if (currentVolume === null || avgVolume === null) {
    // Data mangler - ikke evalueret
    filterStatus.hard.volume.passed = null;
    filterStatus.hard.volume.reason = `Data mangler: current=${currentVolume}, avg=${avgVolume}`;
    filterStatus.soft.volume.long = null;
    filterStatus.soft.volume.short = null;
    console.log(`   📊 Volume: ⚪ NULL DATA (tri-state: null) - current=${currentVolume}, avg=${avgVolume}`);
  } else {
    // Evaluer volume multiplier hard filter
    const volumeRatio = currentVolume / avgVolume;
    const requiredVolume = avgVolume * config.volume_multiplier;
    filterStatus.hard.volume.value = `${volumeRatio.toFixed(2)}x (${(volumeRatio * 100).toFixed(0)}%)`;
    
    console.log(`   📊 Volume Check:`);
    console.log(`      Current: ${currentVolume.toFixed(2)}`);
    console.log(`      Average: ${avgVolume.toFixed(2)}`);
    console.log(`      Ratio: ${volumeRatio.toFixed(2)} (${(volumeRatio * 100).toFixed(0)}%)`);
    console.log(`      Required Multiplier: ${config.volume_multiplier}x (${(config.volume_multiplier * 100).toFixed(0)}%)`);
    console.log(`      Required Volume: ${requiredVolume.toFixed(2)}`);
    
    if (volumeRatio < config.volume_multiplier) {
      filterStatus.hard.volume.passed = false;
      filterStatus.hard.volume.reason = `Ratio ${volumeRatio.toFixed(2)}x (${(volumeRatio * 100).toFixed(0)}%) < ${config.volume_multiplier}x required (current: ${currentVolume.toFixed(2)}, avg: ${avgVolume.toFixed(2)})`;
      console.log(`      ❌ BLOKERET: ${volumeRatio.toFixed(2)}x < ${config.volume_multiplier}x`);
    } else {
      filterStatus.hard.volume.passed = true;
      console.log(`      ✅ OPFYLDT: ${volumeRatio.toFixed(2)}x >= ${config.volume_multiplier}x`);
    }
    
    // Soft volume condition (current > avg)
    const highVolume = currentVolume > avgVolume;
    filterStatus.soft.volume.long = highVolume;
    filterStatus.soft.volume.short = highVolume;
  }
  
  // 5️⃣ MACD RETNINGS-FILTER (HÅRDT FILTER - blokerer trades mod MACD retning)
  // ⚠️ VIGTIGT: Dette er et RETNINGS-SPECIFIKT filter og evalueres IKKE i hardFiltersPass
  // Det blokerer kun i longSignal/shortSignal baseret på retning
  // 🔴 REGEL: LONG kræver macdLine > signalLine, SHORT kræver macdLine < signalLine
  let macdLongOK = true;
  let macdShortOK = true;
  
  // Gem MACD værdier for audit
  const macdLine = macd?.macd ?? null;
  const macdSignalLine = macd?.signal ?? null;
  const macdHistogram = macd?.histogram ?? null;
  
  if (config.macd_direction_enabled) {
    // 🚨 KRITISK FIX: Tjek kun om MACD er tilgængelig, ikke om MACD indicator er enabled
    // Hvis direction filter er enabled MEN MACD værdi mangler, bloker ALT for sikkerhed
    if (config.macd_enabled && macd && macdLine !== null && macdSignalLine !== null) {
      // 🚨 HÅRDT RETNINGSFILTER (SIDE-BASERET, ALDRIG AND):
      // LONG: macdLine > signalLine (bullish crossover/above)
      // SHORT: macdLine < signalLine (bearish crossover/below)
      macdLongOK = macdLine > macdSignalLine;
      macdShortOK = macdLine < macdSignalLine;
      
      filterStatus.hard.macdDirection.long = macdLongOK;
      filterStatus.hard.macdDirection.short = macdShortOK;
      filterStatus.hard.macdDirection.value = `macdLine=${macdLine.toFixed(6)}, signalLine=${macdSignalLine.toFixed(6)}`;
      
      if (macdLine === macdSignalLine) {
        // Ekstremt sjældent: MACD præcis på signal-linjen
        filterStatus.hard.macdDirection.reason = `MACD præcis på signal-linjen`;
      }
    } else {
      // MACD direction filter ER aktiveret men MACD værdi mangler - BLOKER ALT
      macdLongOK = false;
      macdShortOK = false;
      filterStatus.hard.macdDirection.long = false;
      filterStatus.hard.macdDirection.short = false;
      filterStatus.hard.macdDirection.reason = `MACD direction filter aktiveret men MACD værdi mangler (macd_enabled=${config.macd_enabled})`;
      console.log(`⚠️ ${filterStatus.hard.macdDirection.reason}`);
    }
  } else {
    // Filter er deaktiveret - alle retninger tilladt (null = not evaluated)
    filterStatus.hard.macdDirection.long = null;
    filterStatus.hard.macdDirection.short = null;
  }
  
  // 6️⃣ MACD COLOR CHANGE FILTER (HÅRDT FILTER - kræver farveskift i histogram)
  let macdColorChangeLongOK = true;
  let macdColorChangeShortOK = true;
  
  if (config.macd_color_change_hard_filter) {
    if (config.macd_enabled && macd && macdPrevious) {
      // LONG: Histogram skal skifte fra rød til grøn (negativ til positiv)
      const histogramRedToGreen = macdPrevious.histogram <= 0 && macd.histogram > 0;
      macdColorChangeLongOK = histogramRedToGreen;
      
      // SHORT: Histogram skal skifte fra grøn til rød (positiv til negativ)
      const histogramGreenToRed = macdPrevious.histogram >= 0 && macd.histogram < 0;
      macdColorChangeShortOK = histogramGreenToRed;
      
      filterStatus.hard.macdColorChange.long = macdColorChangeLongOK;
      filterStatus.hard.macdColorChange.short = macdColorChangeShortOK;
      
      if (!macdColorChangeLongOK && !macdColorChangeShortOK) {
        filterStatus.hard.macdColorChange.passed = false;
        filterStatus.hard.macdColorChange.reason = `Intet farveskift: Prev=${macdPrevious.histogram.toFixed(6)}, Cur=${macd.histogram.toFixed(6)}`;
      }
      
      console.log(`   🎨 MACD Farveskift: Prev=${macdPrevious.histogram.toFixed(6)}, Cur=${macd.histogram.toFixed(6)}`);
      console.log(`      LONG (rød→grøn): ${histogramRedToGreen ? '✅' : '❌'}`);
      console.log(`      SHORT (grøn→rød): ${histogramGreenToRed ? '✅' : '❌'}`);
    } else {
      // MACD color change filter ER aktiveret men MACD værdi mangler - BLOKER ALT
      macdColorChangeLongOK = false;
      macdColorChangeShortOK = false;
      filterStatus.hard.macdColorChange.long = false;
      filterStatus.hard.macdColorChange.short = false;
      filterStatus.hard.macdColorChange.reason = `MACD color change filter aktiveret men MACD værdi mangler`;
      console.log(`⚠️ ${filterStatus.hard.macdColorChange.reason}`);
    }
  } else {
    // Filter er deaktiveret - null = not evaluated
    filterStatus.hard.macdColorChange.long = null;
    filterStatus.hard.macdColorChange.short = null;
  }
  
  // 7️⃣ RSI MOMENTUM (Hård regel)
  let rsiLongOK = true;
  let rsiShortOK = true;
  
  if (config.rsi_enabled && rsiCurrent !== null && rsiHistory.length >= config.rsi_momentum_periods) {
    // Zones
    const rsiInLongZone = rsiCurrent >= config.rsi_min_long && rsiCurrent < (config.rsi_min_long + config.rsi_zone_width);
    const rsiInShortZone = rsiCurrent <= config.rsi_max_short && rsiCurrent > (config.rsi_max_short - config.rsi_zone_width);
    
    // Momentum
    const rsiRising = rsiHistory.slice(-config.rsi_momentum_periods).every((val, i, arr) => i === 0 || val > arr[i - 1]);
    const rsiFalling = rsiHistory.slice(-config.rsi_momentum_periods).every((val, i, arr) => i === 0 || val < arr[i - 1]);
    
    // Crossover detection
    const rsiLongCrossover = rsiHistory[1] < config.rsi_min_long && rsiCurrent >= config.rsi_min_long;
    const rsiShortCrossover = rsiHistory[1] > config.rsi_max_short && rsiCurrent <= config.rsi_max_short;
    
    // Long OK: in zone OR (just crossed AND has momentum)
    rsiLongOK = rsiInLongZone || (rsiLongCrossover && rsiRising);
    
    // Short OK: in zone OR (just crossed AND has momentum)
    rsiShortOK = rsiInShortZone || (rsiShortCrossover && rsiFalling);
    
    filterStatus.hard.rsiMomentum.long = rsiLongOK;
    filterStatus.hard.rsiMomentum.short = rsiShortOK;
    
    if (!rsiLongOK && !rsiShortOK) {
      filterStatus.hard.rsiMomentum.passed = false;
      filterStatus.hard.rsiMomentum.reason = `RSI ${rsiCurrent.toFixed(2)} - ingen gyldig retning (zone eller momentum fejlede)`;
    }
  } else {
    // RSI disabled - null = not evaluated
    filterStatus.hard.rsiMomentum.long = null;
    filterStatus.hard.rsiMomentum.short = null;
  }
  
  // ═══════════════════════════════════════════════
  // 🟡 BLØDE FILTRE (Signal betingelser)
  // ═══════════════════════════════════════════════
  
  // 7️⃣ EMA ALIGNMENT
  if (config.ema_enabled && emaFast && emaMedium && emaSlow && emaFastCurrent !== null && emaMediumCurrent !== null && emaSlowCurrent !== null) {
    // LONG: Hurtig > Medium > Slow
    filterStatus.soft.emaAlignment.long = emaFastCurrent > emaMediumCurrent && emaMediumCurrent > emaSlowCurrent && currentPrice > closes[closes.length - 2];
    
    // SHORT: Hurtig < Medium < Slow
    filterStatus.soft.emaAlignment.short = emaFastCurrent < emaMediumCurrent && emaMediumCurrent < emaSlowCurrent && currentPrice < closes[closes.length - 2];
  }
  
  // 8️⃣ MACD
  if (config.macd_enabled && macd && macd.histogram !== null) {
    // LONG: MACD histogram over threshold
    filterStatus.soft.macd.long = macd.histogram > config.macd_histogram_threshold;
    
    // SHORT: MACD histogram under negative threshold
    filterStatus.soft.macd.short = macd.histogram < -config.macd_histogram_threshold;
  }
  
  // ═══════════════════════════════════════════════
  // 📋 LOG ALLE RESULTATER
  // ═══════════════════════════════════════════════
  
  console.log(`\n🔴 HÅRDE FILTRE (blokerer trade):`);
  console.log(`   📏 EMA Spread: ${filterStatus.hard.emaSpread.passed ? '✅' : '❌'} ${filterStatus.hard.emaSpread.value} ${filterStatus.hard.emaSpread.reason ? `- ${filterStatus.hard.emaSpread.reason}` : ''}`);
  console.log(`   📊 ATR: ${filterStatus.hard.atr.passed ? '✅' : '❌'} ${filterStatus.hard.atr.value} ${filterStatus.hard.atr.reason ? `- ${filterStatus.hard.atr.reason}` : ''}`);
  console.log(`   📈 ADX: ${filterStatus.hard.adx.passed ? '✅' : '❌'} ${filterStatus.hard.adx.value} ${filterStatus.hard.adx.reason ? `- ${filterStatus.hard.adx.reason}` : ''}`);
  console.log(`   🔊 Volume: ${filterStatus.hard.volume.passed ? '✅' : '❌'} ${filterStatus.hard.volume.value} ${filterStatus.hard.volume.reason ? `- ${filterStatus.hard.volume.reason}` : ''}`);
  console.log(`   📐 MACD Retning: ${filterStatus.hard.macdDirection.passed ? '✅' : '❌'} Long: ${filterStatus.hard.macdDirection.long ? '✅' : '❌'} Short: ${filterStatus.hard.macdDirection.short ? '✅' : '❌'} ${filterStatus.hard.macdDirection.reason ? `- ${filterStatus.hard.macdDirection.reason}` : ''}`);
  console.log(`   🎨 MACD Farveskift: ${filterStatus.hard.macdColorChange.passed ? '✅' : '❌'} Long: ${filterStatus.hard.macdColorChange.long ? '✅' : '❌'} Short: ${filterStatus.hard.macdColorChange.short ? '✅' : '❌'} ${filterStatus.hard.macdColorChange.reason ? `- ${filterStatus.hard.macdColorChange.reason}` : ''}`);
  console.log(`   🎯 RSI Momentum: ${filterStatus.hard.rsiMomentum.passed ? '✅' : '❌'} Long: ${filterStatus.hard.rsiMomentum.long ? '✅' : '❌'} Short: ${filterStatus.hard.rsiMomentum.short ? '✅' : '❌'} ${filterStatus.hard.rsiMomentum.reason ? `- ${filterStatus.hard.rsiMomentum.reason}` : ''}\n`);
  console.log(`   📐 EMA Alignment: Long: ${filterStatus.soft.emaAlignment.long ? '✅' : '❌'} Short: ${filterStatus.soft.emaAlignment.short ? '✅' : '❌'}`);
  console.log(`   📉 MACD: Long: ${filterStatus.soft.macd.long ? '✅' : '❌'} Short: ${filterStatus.soft.macd.short ? '✅' : '❌'}`);
  
  // ═══════════════════════════════════════════════
  // 🟡 EVALUÉR BLØDE FILTRE (ALTID - uanset hårde filtre)
  // ═══════════════════════════════════════════════
  
  // Calculate Pivot Points only if enabled
  const pivotPoints = config.pivot_points_enabled ? (() => {
    const pivotHigh = Math.max(...highs.slice(-config.pivot_points_lookback));
    const pivotLow = Math.min(...lows.slice(-config.pivot_points_lookback));
    const pivotClose = closes[closes.length - (config.pivot_points_lookback + 1)] || closes[0];
    return calculatePivotPoints(pivotHigh, pivotLow, pivotClose);
  })() : null;
  
  // Build conditions arrays dynamically based on enabled indicators
  const longConditions: boolean[] = [];
  const shortConditions: boolean[] = [];
  const conditionDetails: any = {
    ema: { enabled: config.ema_enabled, long: null, short: null },
    rsi: { enabled: config.rsi_enabled, long: null, short: null },
    stochRSI: { enabled: config.stochrsi_enabled, long: null, short: null },
    macd: { enabled: config.macd_enabled, long: null, short: null },
    bb: { enabled: config.bb_enabled, long: null, short: null },
    volume: { enabled: config.volume_enabled, long: null, short: null },
    pivotPoints: { enabled: config.pivot_points_enabled, long: null, short: null },
    vwap: { enabled: config.vwap_enabled ?? false, long: null, short: null, value: vwap }
  };
  
  // EMA Trend (hvis enabled)
  if (config.ema_enabled && emaFast && emaMedium && emaSlow && emaFastCurrent !== null && emaMediumCurrent !== null && emaSlowCurrent !== null) {
    // LONG: Hurtig > Medium > Slow og prisen stiger
    const emaLongTrend = emaFastCurrent > emaMediumCurrent && emaMediumCurrent > emaSlowCurrent && currentPrice > closes[closes.length - 2];
    longConditions.push(emaLongTrend);
    conditionDetails.ema.long = emaLongTrend;
    
    // SHORT: Hurtig < Medium < Slow og prisen falder
    const emaShortTrend = emaFastCurrent < emaMediumCurrent && emaMediumCurrent < emaSlowCurrent && currentPrice < closes[closes.length - 2];
    shortConditions.push(emaShortTrend);
    conditionDetails.ema.short = emaShortTrend;
  }
  
  // RSI er nu en hård regel som filtrerer før evaluering
  // Ingen flexible conditions her længere
  
  // StochRSI (hvis enabled) - kan være HARD eller SOFT filter baseret på config
  if (config.stochrsi_enabled && stochRSI) {
    // Get thresholds - use new K/D specific thresholds, falling back to legacy values
    const oversoldK = config.stochrsi_oversold_k ?? config.stochrsi_oversold ?? 20;
    const oversoldD = config.stochrsi_oversold_d ?? config.stochrsi_oversold ?? 20;
    const overboughtK = config.stochrsi_overbought_k ?? config.stochrsi_overbought ?? 80;
    const overboughtD = config.stochrsi_overbought_d ?? config.stochrsi_overbought ?? 80;
    const shortMode = config.stochrsi_short_mode ?? 'REVERSAL_OVERBOUGHT';
    const rolloverDMin = config.rollover_d_min_short ?? 50;
    
    // LONG: K <= oversold_k AND D <= oversold_d (UNCHANGED)
    const stochRSILong = stochRSI.k <= oversoldK && stochRSI.d <= oversoldD;
    
    // SHORT: Afhænger af SHORT_MODE
    let stochRSIShort = false;
    let shortConditionType: 'DIRECT' | 'ROLLOVER' | 'CONTINUATION' | 'NONE' = 'NONE';
    let kWasOverbought = false;
    let kIsFalling = false;
    const kHistory: number[] = [stochRSI.k];
    const rolloverLookback = 5;
    
    if (shortMode === 'REVERSAL_OVERBOUGHT') {
      // MODE A: REVERSAL_OVERBOUGHT (nuværende adfærd)
      // Betingelse 1 (DIRECT): K >= overbought_k AND D >= overbought_d
      const shortDirect = stochRSI.k >= overboughtK && stochRSI.d >= overboughtD;
      
      // Betingelse 2 (ROLLOVER): K har været >= overbought_k inden for X candles, K falder nu, D >= rollover_d_min
      if (closes.length >= config.stochrsi_period + config.stochrsi_k_period + config.stochrsi_d_period + rolloverLookback) {
        for (let offset = 1; offset <= rolloverLookback; offset++) {
          const slicedCloses = closes.slice(0, closes.length - offset);
          if (slicedCloses.length >= config.stochrsi_period + config.stochrsi_k_period + config.stochrsi_d_period) {
            const prevStochRSI = calculateStochRSI(slicedCloses, config.stochrsi_period, config.stochrsi_k_period, config.stochrsi_d_period);
            kHistory.push(prevStochRSI.k);
            if (prevStochRSI.k >= overboughtK) {
              kWasOverbought = true;
            }
          }
        }
      }
      
      // K is falling if current K < previous K
      if (kHistory.length >= 2) {
        kIsFalling = stochRSI.k < kHistory[1];
      }
      
      // Rollover SHORT: K var overbought inden for lookback, K falder nu, D >= rollover_d_min (lavere krav end overboughtD)
      const dMeetsRolloverMin = stochRSI.d >= rolloverDMin;
      const shortRollover = kWasOverbought && kIsFalling && dMeetsRolloverMin;
      
      // Final SHORT signal: DIRECT ELLER ROLLOVER
      stochRSIShort = shortDirect || shortRollover;
      shortConditionType = shortDirect ? 'DIRECT' : (shortRollover ? 'ROLLOVER' : 'NONE');
      
      console.log(`   📊 StochRSI SHORT_MODE=${shortMode}`);
      console.log(`   📊 StochRSI Values: K=${stochRSI.k.toFixed(2)}, D=${stochRSI.d.toFixed(2)}`);
      console.log(`   📊 StochRSI SHORT Thresholds: OverboughtK=${overboughtK}, OverboughtD=${overboughtD}, RolloverDMin=${rolloverDMin}`);
      console.log(`   📊 StochRSI SHORT DIRECT: K>=${overboughtK} (${stochRSI.k >= overboughtK}), D>=${overboughtD} (${stochRSI.d >= overboughtD}) → ${shortDirect ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   📊 StochRSI SHORT ROLLOVER: K_was_overbought_last_${rolloverLookback}=${kWasOverbought}, K_falling=${kIsFalling}, D>=${rolloverDMin} (${dMeetsRolloverMin}) → ${shortRollover ? '✅ PASS' : '❌ FAIL'}`);
      
    } else if (shortMode === 'CONTINUATION_OVERSOLD') {
      // MODE B: CONTINUATION_OVERSOLD (continuation SHORT i bear-trend)
      // SHORT når: K <= oversold_k AND D <= oversold_d (symmetrisk med LONG)
      const shortContinuation = stochRSI.k <= oversoldK && stochRSI.d <= oversoldD;
      stochRSIShort = shortContinuation;
      shortConditionType = shortContinuation ? 'CONTINUATION' : 'NONE';
      
      console.log(`   📊 StochRSI SHORT_MODE=${shortMode}`);
      console.log(`   📊 StochRSI Values: K=${stochRSI.k.toFixed(2)}, D=${stochRSI.d.toFixed(2)}`);
      console.log(`   📊 StochRSI SHORT CONTINUATION: K<=${oversoldK} (${stochRSI.k <= oversoldK}), D<=${oversoldD} (${stochRSI.d <= oversoldD}) → ${shortContinuation ? '✅ PASS' : '❌ FAIL'}`);
    }
    
    console.log(`   📊 StochRSI LONG: K<=${oversoldK}, D<=${oversoldD} → ${stochRSILong ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   📊 StochRSI SHORT FINAL: ${stochRSIShort ? '✅ PASS' : '❌ FAIL'} (SHORT_MODE=${shortMode}, SHORT_TYPE=${shortConditionType})`);
    if (kHistory.length > 1 && shortMode === 'REVERSAL_OVERBOUGHT') {
      console.log(`   📊 StochRSI K-history (last ${kHistory.length}): ${kHistory.map(k => k.toFixed(2)).join(' → ')}`);
    }
    
    // Gem i filterStatus.hard for hard filter evaluering
    filterStatus.hard.stochrsi.long = stochRSILong;
    filterStatus.hard.stochrsi.short = stochRSIShort;
    filterStatus.hard.stochrsi.value = `K=${stochRSI.k.toFixed(2)}, D=${stochRSI.d.toFixed(2)}, SHORT_MODE=${shortMode}, SHORT_TYPE=${shortConditionType}`;
    
    // Hvis stochrsi_hard_filter=true, evaluér som hard filter
    if (config.stochrsi_hard_filter === true) {
      // For hard filter: mindst én retning skal passe
      if (!stochRSILong && !stochRSIShort) {
        filterStatus.hard.stochrsi.passed = false;
        filterStatus.hard.stochrsi.reason = shortMode === 'REVERSAL_OVERBOUGHT' 
          ? `K=${stochRSI.k.toFixed(2)}, D=${stochRSI.d.toFixed(2)} - LONG kræver K<=${oversoldK} AND D<=${oversoldD}, SHORT kræver K>=${overboughtK} AND D>=${overboughtD} (direkte) ELLER rollover (D>=${rolloverDMin})`
          : `K=${stochRSI.k.toFixed(2)}, D=${stochRSI.d.toFixed(2)} - LONG kræver K<=${oversoldK} AND D<=${oversoldD}, SHORT (continuation) kræver K<=${oversoldK} AND D<=${oversoldD}`;
      }
      console.log(`   📊 StochRSI (HARD): Long: ${stochRSILong ? '✅' : '❌'}, Short: ${stochRSIShort ? '✅' : '❌'} (${shortConditionType})`);
    } else {
      console.log(`   📊 StochRSI (SOFT): Long: ${stochRSILong ? '✅' : '❌'}, Short: ${stochRSIShort ? '✅' : '❌'} (${shortConditionType})`);
      
      // 🔴 FIX: Kun tilføj til soft conditions hvis det IKKE er hard filter
      // Ellers tælles det dobbelt (som hard OG soft)
      longConditions.push(stochRSILong);
      shortConditions.push(stochRSIShort);
    }
    
    // Gem altid i conditionDetails til visning
    conditionDetails.stochRSI.long = stochRSILong;
    conditionDetails.stochRSI.short = stochRSIShort;
  } else if (config.stochrsi_enabled && !stochRSI) {
    filterStatus.hard.stochrsi.passed = false;
    filterStatus.hard.stochrsi.reason = 'StochRSI enabled men data mangler';
  }
  
  // 🟢 MACD SOFT CONDITIONS - SEPARATE POINTS (følger UI)
  // Når både MACD Histogram og Histogram Momentum er tændt, giver de HVER 1 point
  let softMacdHistogramLong = false;
  let softMacdHistogramShort = false;
  let softMacdMomentumLong = false;
  let softMacdMomentumShort = false;
  
  if (config.macd_enabled && macd) {
    // 🔴 FIX: MACD Histogram soft point - rent niveau-check, ikke farveskift
    // LONG: histogram > threshold (positiv momentum)
    // SHORT: histogram < -threshold (negativ momentum)
    softMacdHistogramLong = macd.histogram > config.macd_histogram_threshold;
    softMacdHistogramShort = macd.histogram < -config.macd_histogram_threshold;
    
    // Push MACD Histogram som separat soft condition (1 point)
    longConditions.push(softMacdHistogramLong);
    shortConditions.push(softMacdHistogramShort);
    conditionDetails.macd.long = softMacdHistogramLong;
    conditionDetails.macd.short = softMacdHistogramShort;
    
    console.log(`   📊 MACD Histogram (1 point): Long: ${softMacdHistogramLong ? '✅' : '❌'} Short: ${softMacdHistogramShort ? '✅' : '❌'}`);
    console.log(`      Histogram=${macd.histogram.toFixed(6)}, Threshold=${config.macd_histogram_threshold}`);
    console.log(`      LONG check: ${macd.histogram.toFixed(6)} > ${config.macd_histogram_threshold} = ${softMacdHistogramLong}`);
    console.log(`      SHORT check: ${macd.histogram.toFixed(6)} < -${config.macd_histogram_threshold} = ${softMacdHistogramShort}`);
    
    // Histogram Momentum - separat 1 point (kun hvis enabled i UI)
    if (config.histogram_momentum_enabled && macdPrevious && closes.length >= config.histogram_momentum_periods + 2) {
      const histograms: number[] = [];
      for (let i = 0; i < config.histogram_momentum_periods + 1; i++) {
        const idx = closes.length - 1 - i;
        if (idx >= 0) {
          const m = calculateMACD(closes.slice(0, idx + 1), config.macd_fast, config.macd_slow, config.macd_signal);
          histograms.unshift(m.histogram);
        }
      }
      
      let currentMomentum = 0;
      let previousMomentum = 0;
      
      if (histograms.length >= 3) {
        currentMomentum = histograms[histograms.length - 1] - histograms[histograms.length - 2];
        previousMomentum = histograms[histograms.length - 2] - histograms[histograms.length - 3];
        
        // 🔴 FIX: Separat momentum evaluering
        softMacdMomentumLong = currentMomentum > previousMomentum && currentMomentum > 0;
        softMacdMomentumShort = currentMomentum < previousMomentum && currentMomentum < 0;
      }
      
      // Push MACD Histogram Momentum som separat soft condition (1 point)
      longConditions.push(softMacdMomentumLong);
      shortConditions.push(softMacdMomentumShort);
      
      conditionDetails.histogramMomentum = {
        long: softMacdMomentumLong,
        short: softMacdMomentumShort,
        currentMomentum,
        previousMomentum,
      };
      
      console.log(`   📊 MACD Momentum (1 point): Long: ${softMacdMomentumLong ? '✅' : '❌'} Short: ${softMacdMomentumShort ? '✅' : '❌'}`);
      console.log(`      cur=${currentMomentum.toFixed(6)}, prev=${previousMomentum.toFixed(6)}`);
      console.log(`      histogram_momentum_periods: ${config.histogram_momentum_periods}`);
    }
  }
  
  // Bollinger Bands (hvis enabled)
  if (config.bb_enabled && bb) {
    // LONG: Pris nær nedre bånd (køb når billigt)
    const nearLowerBand = currentPrice <= bb.lower * 1.01; // Inden for 1% af nedre bånd
    longConditions.push(nearLowerBand);
    conditionDetails.bb.long = nearLowerBand;
    
    // SHORT: Pris nær øvre bånd (sælg når dyrt)
    const nearUpperBand = currentPrice >= bb.upper * 0.99; // Inden for 1% af øvre bånd
    shortConditions.push(nearUpperBand);
    conditionDetails.bb.short = nearUpperBand;
  }
  
  // ADX er nu et HÅRDT filter - checket sker tidligt i funktionen
  // Ingen condition push nødvendig her
  
  // Volume soft condition - bruger tri-state fra filterStatus (sat i volume hard filter sektionen)
  // Kun tilføj til conditions array hvis der er en faktisk boolean (ikke null)
  if (filterStatus.soft.volume.long !== null) {
    longConditions.push(filterStatus.soft.volume.long);
    conditionDetails.volume.long = filterStatus.soft.volume.long;
  }
  if (filterStatus.soft.volume.short !== null) {
    shortConditions.push(filterStatus.soft.volume.short);
    conditionDetails.volume.short = filterStatus.soft.volume.short;
  }
  
  // Pivot Points - Blokerer trades nær key levels (hvis enabled)
  if (config.pivot_points_enabled && pivotPoints) {
    const nearResistance = (
      Math.abs(currentPrice - pivotPoints.r1) / currentPrice < config.pivot_points_near_threshold ||
      Math.abs(currentPrice - pivotPoints.r2) / currentPrice < config.pivot_points_near_threshold
    );
    
    const nearSupport = (
      Math.abs(currentPrice - pivotPoints.s1) / currentPrice < config.pivot_points_near_threshold ||
      Math.abs(currentPrice - pivotPoints.s2) / currentPrice < config.pivot_points_near_threshold
    );
    
    // LONG blokeres hvis tæt på resistance
    const longPivotOk = !nearResistance;
    longConditions.push(longPivotOk);
    conditionDetails.pivotPoints.long = longPivotOk;
    
    // SHORT blokeres hvis tæt på support
    const shortPivotOk = !nearSupport;
    shortConditions.push(shortPivotOk);
    conditionDetails.pivotPoints.short = shortPivotOk;
  }
  
  // VWAP Soft Condition (hvis enabled)
  // LONG: Price > VWAP (bullish bias)
  // SHORT: Price < VWAP (bearish bias)
  if (config.vwap_enabled && vwap !== null) {
    const vwapLong = currentPrice > vwap;
    const vwapShort = currentPrice < vwap;
    
    longConditions.push(vwapLong);
    shortConditions.push(vwapShort);
    
    conditionDetails.vwap.long = vwapLong;
    conditionDetails.vwap.short = vwapShort;
    
    console.log(`   📊 VWAP (1 point): Long: ${vwapLong ? '✅' : '❌'} Short: ${vwapShort ? '✅' : '❌'}`);
    console.log(`      Price=${currentPrice.toFixed(6)}, VWAP=${vwap.toFixed(6)}`);
  }
  
  const requiredConditions = config.signal_conditions_required;
  const longConditionsMet = longConditions.filter(c => c).length;
  const shortConditionsMet = shortConditions.filter(c => c).length;

  // 🚨 FINAL SIGNAL BESLUTNING - Bløde betingelser + MACD hårde filtre
  // MACD retningsfilter blokerer ALLE trades i forkert retning (evalueret FØR bløde betingelser)
  // MACD farveskift filter blokerer trades hvis histogram ikke skifter farve i trade retningen
  const longSignal = longConditionsMet >= requiredConditions && macdLongOK && macdColorChangeLongOK; // LONG kræver macdLine > signalLine OG rød→grøn skift (hvis aktiveret)
  const shortSignal = shortConditionsMet >= requiredConditions && macdShortOK && macdColorChangeShortOK; // SHORT kræver macdLine < signalLine OG grøn→rød skift (hvis aktiveret)
  
  // Calculate conditions met for signal strength
  const conditionsMet = Math.max(longConditionsMet, shortConditionsMet);
  
  // Determine final signal side for logging
  const finalSide = longSignal ? 'LONG' : shortSignal ? 'SHORT' : 'NONE';
  
  // 🔎 MACD DIRECTION AUDIT LOG (verificerer side-baseret logik)
  // Denne log viser præcis hvad der bestemmer MACD_direction_filter_passed
  // KUN LOG NÅR side er LONG eller SHORT (ikke NONE) for at vise faktiske entry-evalueringer
  const macdDirectionFilterPassed = config.macd_direction_enabled
    ? (finalSide === 'LONG' ? macdLongOK : finalSide === 'SHORT' ? macdShortOK : null)
    : null;
  const macdColorChangeFilterPassed = config.macd_color_change_hard_filter
    ? (finalSide === 'LONG' ? macdColorChangeLongOK : finalSide === 'SHORT' ? macdColorChangeShortOK : null)
    : null;
  
  // Kun log MACD audit når der er et faktisk signal (LONG eller SHORT)
  if (finalSide === 'LONG' || finalSide === 'SHORT') {
    console.log(`\n🔎 MACD DIRECTION AUDIT (ENTRY EVALUATION):`);
    console.log(`   side: ${finalSide}`);
    console.log(`   ─────────────────────────────────────────`);
    console.log(`   macd_signal_period (config): ${config.macd_signal}`);
    console.log(`   macd_line (runtime): ${macdLine !== null ? macdLine.toFixed(6) : 'null'}`);
    console.log(`   macd_signal_line (runtime): ${macdSignalLine !== null ? macdSignalLine.toFixed(6) : 'null'}`);
    console.log(`   macd_histogram (runtime): ${macdHistogram !== null ? macdHistogram.toFixed(6) : 'null'}`);
    console.log(`   ─────────────────────────────────────────`);
    console.log(`   macd_direction_enabled: ${config.macd_direction_enabled}`);
    console.log(`   longOk (macdLine > signalLine): ${macdLongOK} (${macdLine?.toFixed(6)} > ${macdSignalLine?.toFixed(6)})`);
    console.log(`   shortOk (macdLine < signalLine): ${macdShortOK} (${macdLine?.toFixed(6)} < ${macdSignalLine?.toFixed(6)})`);
    console.log(`   MACD_direction_filter_passed: ${macdDirectionFilterPassed}`);
    console.log(`   MACD_color_change_passed: ${macdColorChangeFilterPassed}`);
    console.log(`   ─────────────────────────────────────────`);
    console.log(`   REGLER (macdLine vs signalLine):`);
    console.log(`     A: LONG + longOk=true (macdLine > signalLine) -> passed=true`);
    console.log(`     B: SHORT + shortOk=true (macdLine < signalLine) -> passed=true`);
    console.log(`     C: LONG + longOk=false (macdLine <= signalLine) -> passed=false`);
    console.log(`     D: SHORT + shortOk=false (macdLine >= signalLine) -> passed=false`);
    console.log(`   ─────────────────────────────────────────`);
    console.log(`   AKTUEL CASE: ${finalSide === 'LONG' ? (macdLongOK ? 'A (LONG passed)' : 'C (LONG blocked)') : (macdShortOK ? 'B (SHORT passed)' : 'D (SHORT blocked)')}`);
    console.log(``);
  }
  
  // ═══════════════════════════════════════════════
  // 🚫 CHECK: BLOKERER HÅRDE FILTRE?
  // ═══════════════════════════════════════════════
  
  // Kun check enabled filters (MACD retning evalueres IKKE her - den er retnings-specifik)
  // 🔴 FIX: Volume tri-state - null betyder "ikke evalueret", tæller som bestået
  // (hvis volume er disabled eller data mangler, blokerer den IKKE trades)
  const volumeHardPassed = filterStatus.hard.volume.passed === null || filterStatus.hard.volume.passed === true;
  
  // 🔴 StochRSI hard filter - RETNINGSSPECIFIK! 
  // LONG kræver K og D i oversold zone (<15), SHORT kræver K og D i overbought zone (>85)
  // Den gamle logik tillod trades hvis bare én zone var opfyldt - FORKERT!
  let stochrsiHardPassed = true;
  if (config.stochrsi_enabled && config.stochrsi_hard_filter === true) {
    // Tjek retningsspecifikt: LONG skal have oversold, SHORT skal have overbought
    const oversoldK = config.stochrsi_oversold_k ?? config.stochrsi_oversold ?? 20;
    const oversoldD = config.stochrsi_oversold_d ?? config.stochrsi_oversold ?? 20;
    const overboughtK = config.stochrsi_overbought_k ?? config.stochrsi_overbought ?? 80;
    const overboughtD = config.stochrsi_overbought_d ?? config.stochrsi_overbought ?? 80;
    
    if (finalSide === 'LONG') {
      stochrsiHardPassed = filterStatus.hard.stochrsi.long === true;
      if (!stochrsiHardPassed) {
        console.log(`   🚫 StochRSI HARD BLOKERER LONG: ${filterStatus.hard.stochrsi.value} - kræver K<=${oversoldK} AND D<=${oversoldD}`);
      }
    } else if (finalSide === 'SHORT') {
      stochrsiHardPassed = filterStatus.hard.stochrsi.short === true;
      if (!stochrsiHardPassed) {
        console.log(`   🚫 StochRSI HARD BLOKERER SHORT: ${filterStatus.hard.stochrsi.value} - kræver K>=${overboughtK} AND D>=${overboughtD}`);
      }
    }
    // For NONE signal (ingen retning bestemt endnu), tjek om mindst én retning er mulig
    else {
      stochrsiHardPassed = filterStatus.hard.stochrsi.long === true || filterStatus.hard.stochrsi.short === true;
    }
  }
  
  const hardFiltersPass = 
    (!config.ema_enabled || filterStatus.hard.emaSpread.passed) &&
    (!config.atr_enabled || filterStatus.hard.atr.passed) &&
    (!config.adx_enabled || filterStatus.hard.adx.passed) &&
    volumeHardPassed &&
    stochrsiHardPassed &&
    (!config.rsi_enabled || filterStatus.hard.rsiMomentum.passed);
  
  if (!hardFiltersPass) {
    console.log(`\n⚠️ HÅRDE FILTRE FEJLEDE - Men fortsætter evaluering for prioritering\n`);
  } else {
    console.log(`\n✅ ALLE HÅRDE FILTRE PASSERET\n`);
  }
  
  // 🔍 ULTRA-DETALJERET SIGNAL LOGGING MED VÆRDIER & THRESHOLDS
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`📊 SIGNAL EVALUERING - Betingelser påkrævet: ${requiredConditions}`);
  console.log(`═══════════════════════════════════════════\n`);
  
  // RÅ ARRAYS
  console.log(`🔢 RÅ longConditions ARRAY: [${longConditions.map(c => c ? 'TRUE' : 'FALSE').join(', ')}]`);
  console.log(`🔢 RÅ shortConditions ARRAY: [${shortConditions.map(c => c ? 'TRUE' : 'FALSE').join(', ')}]\n`);
  
  // EMA DETALJERET
  if (config.ema_enabled && emaFastCurrent !== null && emaMediumCurrent !== null && emaSlowCurrent !== null) {
    console.log(`📈 EMA:`);
    console.log(`   Values: Fast=${emaFastCurrent.toFixed(4)}, Medium=${emaMediumCurrent.toFixed(4)}, Slow=${emaSlowCurrent.toFixed(4)}`);
    console.log(`   Price: Current=${currentPrice.toFixed(4)}, Previous=${closes[closes.length - 2].toFixed(4)}`);
    console.log(`   LONG (Fast>Med>Slow && Price↑): ${emaFastCurrent > emaMediumCurrent} && ${emaMediumCurrent > emaSlowCurrent} && ${currentPrice > closes[closes.length - 2]} = ${conditionDetails.ema.long ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`   SHORT (Fast<Med<Slow && Price↓): ${emaFastCurrent < emaMediumCurrent} && ${emaMediumCurrent < emaSlowCurrent} && ${currentPrice < closes[closes.length - 2]} = ${conditionDetails.ema.short ? '✅ TRUE' : '❌ FALSE'}\n`);
  } else {
    console.log(`📈 EMA: ⚪ DISABLED\n`);
  }
  
  // RSI MOMENTUM DETALJERET
  if (config.rsi_enabled && rsiCurrent !== null && rsiHistory.length >= rsiMomentumPeriods) {
    console.log(`📊 RSI Momentum (${rsiMomentumPeriods} perioder):`);
    console.log(`   Historie: ${rsiHistory.map((v, i) => `RSI${i}=${v.toFixed(2)}`).join(', ')}`);
    console.log(`   LONG threshold: ${config.rsi_min_long}, SHORT threshold: ${config.rsi_max_short}`);
    console.log(`   LONG check: I zone OG stigende momentum = ${conditionDetails.rsi.long ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`   SHORT check: I zone OG faldende momentum = ${conditionDetails.rsi.short ? '✅ TRUE' : '❌ FALSE'}\n`);
  } else {
    console.log(`📊 RSI: ⚪ DISABLED\n`);
  }
  
  // STOCHRSI DETALJERET
  if (config.stochrsi_enabled && stochRSI) {
    const osK = config.stochrsi_oversold_k ?? config.stochrsi_oversold ?? 20;
    const osD = config.stochrsi_oversold_d ?? config.stochrsi_oversold ?? 20;
    const obK = config.stochrsi_overbought_k ?? config.stochrsi_overbought ?? 80;
    const obD = config.stochrsi_overbought_d ?? config.stochrsi_overbought ?? 80;
    console.log(`📉 StochRSI:`);
    console.log(`   K Value: ${stochRSI.k.toFixed(2)}, D Value: ${stochRSI.d.toFixed(2)}`);
    console.log(`   LONG thresholds: K<=${osK}, D<=${osD}`);
    console.log(`   SHORT thresholds: K>=${obK}, D>=${obD}`);
    console.log(`   LONG (K=${stochRSI.k.toFixed(2)}<=${osK} && D=${stochRSI.d.toFixed(2)}<=${osD}): ${conditionDetails.stochRSI.long ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`   SHORT (K=${stochRSI.k.toFixed(2)}>=${obK} && D=${stochRSI.d.toFixed(2)}>=${obD}): ${conditionDetails.stochRSI.short ? '✅ TRUE' : '❌ FALSE'}\n`);
  } else {
    console.log(`📉 StochRSI: ⚪ DISABLED\n`);
  }
  
  // MACD DETALJERET
  if (config.macd_enabled && macd && macdPrevious) {
    console.log(`📈 MACD:`);
    console.log(`   MACD Line: ${macd.macd.toFixed(6)}`);
    console.log(`   Signal Line: ${macd.signal.toFixed(6)}`);
    console.log(`   MACD vs Signal: ${macd.macd > macd.signal ? 'BULLISH (macdLine > signalLine) ✅' : macd.macd < macd.signal ? 'BEARISH (macdLine < signalLine) ❌' : 'NEUTRAL'}`);
    console.log(`   Current Histogram: ${macd.histogram.toFixed(6)}`);
    console.log(`   Previous Histogram: ${macdPrevious.histogram.toFixed(6)}`);
    console.log(`   Threshold: ${config.macd_histogram_threshold}`);
    
    if (config.macd_direction_enabled) {
      console.log(`   🔴 HÅRDT RETNINGSFILTER (macdLine vs signalLine):`);
      console.log(`      LONG kræver: macdLine > signalLine → ${macd.macd.toFixed(6)} > ${macd.signal.toFixed(6)} = ${macd.macd > macd.signal ? '✅ LONG TILLADT' : '❌ LONG BLOKERET'}`);
      console.log(`      SHORT kræver: macdLine < signalLine → ${macd.macd.toFixed(6)} < ${macd.signal.toFixed(6)} = ${macd.macd < macd.signal ? '✅ SHORT TILLADT' : '❌ SHORT BLOKERET'}`);
    }
    
    console.log(`   LONG (Shift red→green): Current=${macd.histogram.toFixed(6)} > ${config.macd_histogram_threshold} && Prev=${macdPrevious.histogram.toFixed(6)} <= ${config.macd_histogram_threshold} = ${conditionDetails.macd.long ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`   SHORT (Shift green→red): Current=${macd.histogram.toFixed(6)} < -${config.macd_histogram_threshold} && Prev=${macdPrevious.histogram.toFixed(6)} >= -${config.macd_histogram_threshold} = ${conditionDetails.macd.short ? '✅ TRUE' : '❌ FALSE'}\n`);
  } else {
    console.log(`📈 MACD: ⚪ DISABLED\n`);
  }
  
  // BOLLINGER BANDS DETALJERET
  if (config.bb_enabled && bb) {
    console.log(`📊 Bollinger Bands:`);
    console.log(`   Current Price: ${currentPrice.toFixed(4)}`);
    console.log(`   Upper Band: ${bb.upper.toFixed(4)} (99% = ${(bb.upper * 0.99).toFixed(4)})`);
    console.log(`   Lower Band: ${bb.lower.toFixed(4)} (101% = ${(bb.lower * 1.01).toFixed(4)})`);
    console.log(`   LONG (Price near lower): ${currentPrice.toFixed(4)} <= ${(bb.lower * 1.01).toFixed(4)} = ${conditionDetails.bb.long ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`   SHORT (Price near upper): ${currentPrice.toFixed(4)} >= ${(bb.upper * 0.99).toFixed(4)} = ${conditionDetails.bb.short ? '✅ TRUE' : '❌ FALSE'}\n`);
  } else {
    console.log(`📊 Bollinger Bands: ⚪ DISABLED\n`);
  }
  
  // VOLUME DETALJERET
  if (config.volume_enabled && currentVolume !== null && avgVolume !== null) {
    const ratio = currentVolume / avgVolume;
    console.log(`🔊 Volume:`);
    console.log(`   Current Volume: ${currentVolume.toFixed(2)}`);
    console.log(`   Average Volume: ${avgVolume.toFixed(2)}`);
    console.log(`   Ratio: ${ratio.toFixed(2)}x`);
    console.log(`   HIGH VOLUME (Current > Avg): ${currentVolume.toFixed(2)} > ${avgVolume.toFixed(2)} = ${conditionDetails.volume.long ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`   (Samme for både LONG & SHORT)\n`);
  } else {
    console.log(`🔊 Volume: ⚪ DISABLED\n`);
  }
  
  // PIVOT POINTS DETALJERET
  if (config.pivot_points_enabled && pivotPoints) {
    console.log(`📍 Pivot Points:`);
    console.log(`   Current Price: ${currentPrice.toFixed(4)}`);
    console.log(`   R1: ${pivotPoints.r1.toFixed(4)}, R2: ${pivotPoints.r2.toFixed(4)}`);
    console.log(`   S1: ${pivotPoints.s1.toFixed(4)}, S2: ${pivotPoints.s2.toFixed(4)}`);
    console.log(`   Threshold: ${(config.pivot_points_near_threshold * 100).toFixed(2)}%`);
    const distR1 = Math.abs(currentPrice - pivotPoints.r1) / currentPrice;
    const distR2 = Math.abs(currentPrice - pivotPoints.r2) / currentPrice;
    const distS1 = Math.abs(currentPrice - pivotPoints.s1) / currentPrice;
    const distS2 = Math.abs(currentPrice - pivotPoints.s2) / currentPrice;
    console.log(`   Distance to R1: ${(distR1 * 100).toFixed(2)}%, R2: ${(distR2 * 100).toFixed(2)}%`);
    console.log(`   Distance to S1: ${(distS1 * 100).toFixed(2)}%, S2: ${(distS2 * 100).toFixed(2)}%`);
    const nearResistance = distR1 < config.pivot_points_near_threshold || distR2 < config.pivot_points_near_threshold;
    const nearSupport = distS1 < config.pivot_points_near_threshold || distS2 < config.pivot_points_near_threshold;
    console.log(`   LONG (NOT near resistance): !${nearResistance} = ${conditionDetails.pivotPoints.long ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`   SHORT (NOT near support): !${nearSupport} = ${conditionDetails.pivotPoints.short ? '✅ TRUE' : '❌ FALSE'}\n`);
  } else {
    console.log(`📍 Pivot Points: ⚪ DISABLED\n`);
  }
  
  // SOFT CONDITIONS POINT BREAKDOWN
  console.log(`═══════════════════════════════════════════`);
  console.log(`📊 SOFT CONDITIONS POINT BREAKDOWN:`);
  console.log(`   Krævet: ${requiredConditions} points`);
  console.log(`   ─────────────────────────────────────────`);
  
  // LONG breakdown
  let longPointsBreakdown: string[] = [];
  if (config.ema_enabled && conditionDetails.ema.long) longPointsBreakdown.push('EMA Trend: +1');
  if (config.stochrsi_enabled && conditionDetails.stochRSI.long) longPointsBreakdown.push('StochRSI Zone: +1');
  if (config.macd_enabled && conditionDetails.macd.long) longPointsBreakdown.push('MACD Histogram: +1');
  if (config.histogram_momentum_enabled && conditionDetails.histogramMomentum?.long) longPointsBreakdown.push('MACD Momentum: +1');
  if (config.bb_enabled && conditionDetails.bb.long) longPointsBreakdown.push('Bollinger: +1');
  if (config.volume_enabled && conditionDetails.volume.long) longPointsBreakdown.push('Volume: +1');
  if (config.pivot_points_enabled && conditionDetails.pivotPoints.long) longPointsBreakdown.push('Pivot: +1');
  
  console.log(`   LONG points (${longConditionsMet}/${requiredConditions}):`);
  if (longPointsBreakdown.length > 0) {
    longPointsBreakdown.forEach(p => console.log(`      • ${p}`));
  } else {
    console.log(`      • (ingen points opnået)`);
  }
  
  // SHORT breakdown
  let shortPointsBreakdown: string[] = [];
  if (config.ema_enabled && conditionDetails.ema.short) shortPointsBreakdown.push('EMA Trend: +1');
  if (config.stochrsi_enabled && conditionDetails.stochRSI.short) shortPointsBreakdown.push('StochRSI Zone: +1');
  if (config.macd_enabled && conditionDetails.macd.short) shortPointsBreakdown.push('MACD Histogram: +1');
  if (config.histogram_momentum_enabled && conditionDetails.histogramMomentum?.short) shortPointsBreakdown.push('MACD Momentum: +1');
  if (config.bb_enabled && conditionDetails.bb.short) shortPointsBreakdown.push('Bollinger: +1');
  if (config.volume_enabled && conditionDetails.volume.short) shortPointsBreakdown.push('Volume: +1');
  if (config.pivot_points_enabled && conditionDetails.pivotPoints.short) shortPointsBreakdown.push('Pivot: +1');
  
  console.log(`   SHORT points (${shortConditionsMet}/${requiredConditions}):`);
  if (shortPointsBreakdown.length > 0) {
    shortPointsBreakdown.forEach(p => console.log(`      • ${p}`));
  } else {
    console.log(`      • (ingen points opnået)`);
  }
  
  console.log(`═══════════════════════════════════════════`);
  console.log(`🎯 FINAL RESULTAT:`);
  console.log(`   LONG: ${longConditionsMet}/${longConditions.length} betingelser opfyldt (kræver ${requiredConditions})`);
  console.log(`   SHORT: ${shortConditionsMet}/${shortConditions.length} betingelser opfyldt (kræver ${requiredConditions})`);
  console.log(`   SIGNAL: ${longSignal ? '🟢 LONG SIGNAL' : shortSignal ? '🔴 SHORT SIGNAL' : '⚪ INGEN SIGNAL'}`);
  console.log(`═══════════════════════════════════════════\n`);
  
  // 🔴 KRITISK: ATR skal være gyldig - INGEN fallback tilladt
  // Hvis ATR er null/0/NaN, skal trade BLOKERES senere i flowet
  const atrValue = atr;
  
  const indicators = {
    price: currentPrice,
    emaFast: emaFastCurrent,
    emaMedium: emaMediumCurrent,
    emaSlow: emaSlowCurrent,
    emaSpreadPercent: emaSpreadPercent, // 🔴 TILFØJET: Nødvendig for hard filter display i LiveMonitor
    rsi: rsiCurrent,
    stochRSI_k: stochRSI?.k ?? null,
    stochRSI_d: stochRSI?.d ?? null,
    // MACD - ENTYDIGT SCHEMA (config vs runtime adskilt)
    macd_signal_period: config.macd_signal,              // CONFIG: periode (int, fx 9)
    macd_line: macd?.macd ?? null,                       // RUNTIME: MACD-linjen (EMA fast - EMA slow)
    macd_signal_line: macd?.signal ?? null,              // RUNTIME: Signal-linjen (EMA af macd_line)
    macd_histogram: macd?.histogram ?? null,             // RUNTIME: macd_line - macd_signal_line
    // LEGACY felter (for bagudkompatibilitet med gamle exports)
    macd: macd?.histogram ?? null,                       // DEPRECATED: brug macd_histogram
    macdLine: macd?.macd ?? null,                        // DEPRECATED: brug macd_line
    macdSignal: macd?.signal ?? null,                    // DEPRECATED: brug macd_signal_line
    macdSignalLine: macd?.signal ?? null,                // v2: Frontend forventer dette navn
    macdHistogram: macd?.histogram ?? null,              // v2: For MACD color change check
    atr: atr,
    bb,
    // ADX - med fuldt audit objekt
    adx,
    adx_audit: adxResult ? {
      adx_value: adxResult.adx,
      adx_period: config.adx_period,
      adx_timeframe: config.trend_timeframe,
      adx_floor_used: config.adx_floor ?? 20,
      adx_ceiling_used: config.adx_ceiling ?? 40,
      plus_di: adxResult.plusDI,
      minus_di: adxResult.minusDI,
      dx_instant: adxResult.dx,
      adx_filter_passed: config.adx_enabled ? (adx !== null && adx >= (config.adx_floor ?? 20) && adx <= (config.adx_ceiling ?? 40)) : null,
    } : null,
    volume: currentVolume,
    avgVolume,
    volumeRatio: currentVolume && avgVolume ? currentVolume / avgVolume : null,
    pivotPoints,
    vwap,
    vwap_period: config.vwap_period ?? 50,
    conditionsMet,
    // Tilføj condition details for historisk analyse
    conditionDetails: {
      ...conditionDetails,
      longConditionsMet,
      shortConditionsMet,
      requiredConditions
    },
    // 🔴 FILTER MODE SETTINGS - Gemmer om hvert filter er hard eller soft (DIREKT fra config, ingen fallbacks)
    filter_mode_settings: {
      ema_hard_filter: config.ema_hard_filter,
      rsi_hard_filter: config.rsi_hard_filter,
      stochrsi_hard_filter: config.stochrsi_hard_filter,
      macd_hard_filter: config.macd_hard_filter,
      bb_hard_filter: config.bb_hard_filter,
      vwap_hard_filter: config.vwap_hard_filter,
      atr_hard_filter: config.atr_hard_filter,
      adx_hard_filter: config.adx_hard_filter,
      volume_hard_filter: config.volume_hard_filter,
      pivot_points_hard_filter: config.pivot_points_hard_filter,
      higher_trend_hard_filter: config.higher_trend_hard_filter,
    },
    // OBV (On Balance Volume) - beregnes altid for logging, ikke som filter
    obv: (() => {
      const finalSignalSide = longSignal ? 'LONG' : shortSignal ? 'SHORT' : 'LONG'; // Default til LONG for NONE signaler
      const obvResult = calculateOBV(closes, volumes, finalSignalSide);
      if (obvResult) {
        console.log(`📊 OBV: current=${obvResult.current.toFixed(0)}, prev5=${obvResult.previous5.toFixed(0)}, trend=${obvResult.trend}, confirmation=${obvResult.confirmation}`);
      }
      return obvResult;
    })()
  };
  
  console.log(`Indicators being saved: stochRSI_k=${indicators.stochRSI_k}, rsi=${indicators.rsi}, macd=${indicators.macd}, conditionsMet=${conditionsMet}`);
  
  // 🔴 KRITISK: stopLoss beregnes kun hvis ATR er gyldig
  // Hvis ATR er null/0/invalid, bliver stopLoss NaN - dette fanger vi senere
  const stopLoss = (atrValue && isFinite(atrValue) && atrValue > 0)
    ? (longSignal 
        ? currentPrice - (atrValue * config.atr_stop_loss_multiplier)
        : currentPrice + (atrValue * config.atr_stop_loss_multiplier))
    : NaN; // Vil blokere trade senere
  
  return {
    signal: longSignal ? 'LONG' : shortSignal ? 'SHORT' : 'NONE',
    indicators,
    stopLoss,
    takeProfit: null,
    hardFiltersPassed: hardFiltersPass,
    filterStatus,
  };
}

async function setLeverage(symbol: string, leverage: number) {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not configured');
  }

  const timestamp = Date.now();
  const params = new URLSearchParams({
    symbol,
    leverage: leverage.toString(),
    timestamp: timestamp.toString(),
  });

  const signature = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(params.toString()))
  ).then(sig => 
    Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );

  params.append('signature', signature);

  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/leverage?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to set leverage: ${error}`);
  }
}

async function placeOrder(
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  stopLoss: number,
  takeProfit: number | null,
  quantityPrecision: number,
  pricePrecision: number,
  leverage: number
) {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not configured');
  }

  // Set leverage before placing order
  await setLeverage(symbol, leverage);

  const timestamp = Date.now();
  const params = new URLSearchParams({
    symbol,
    side,
    type: 'MARKET',
    quantity: quantity.toFixed(quantityPrecision),
    timestamp: timestamp.toString(),
  });

  // Create signature
  const signature = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(params.toString()))
  ).then(sig => 
    Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );

  params.append('signature', signature);

  // Place market order
  const orderResponse = await fetch(
    `https://fapi.binance.com/fapi/v1/order?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!orderResponse.ok) {
    const error = await orderResponse.text();
    throw new Error(`Order failed: ${error}`);
  }

  const orderData = await orderResponse.json();
  
  // NOTE: NO stop loss or take profit orders are placed on Binance
  // All SL/TP/Trailing logic is handled entirely by monitor-positions software
  console.log(`Market order placed - all SL/TP logic handled by software`);

  return orderData;
}

async function verifyPositionOnBinance(symbol: string): Promise<any | null> {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not configured');
  }

  const timestamp = Date.now();
  const params = new URLSearchParams({
    timestamp: timestamp.toString(),
    recvWindow: '10000',
  });

  const signature = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(params.toString()))
  ).then(sig => 
    Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );

  params.append('signature', signature);

  const response = await fetch(
    `https://fapi.binance.com/fapi/v3/positionRisk?${params.toString()}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to verify position on Binance');
    return null;
  }

  const positions = await response.json();
  const position = positions.find((p: any) => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);
  
  return position || null;
}

async function getAccountBalance() {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not configured');
  }

  const timestamp = Date.now();
  const params = new URLSearchParams({
    timestamp: timestamp.toString(),
    recvWindow: '10000',
  });

  const signature = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(params.toString()))
  ).then(sig => 
    Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );

  params.append('signature', signature);

  const response = await fetch(
    `https://fapi.binance.com/fapi/v2/account?${params.toString()}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Binance account balance error:', errorText);
    throw new Error('Failed to fetch account balance');
  }

  const account = await response.json();
  // Use availableBalance instead of totalMarginBalance for accurate position sizing
  // totalMarginBalance includes unrealized PnL which can't be used for new trades
  return parseFloat(account.availableBalance || '0');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get active trading sessions
    const { data: sessions, error: sessionsError } = await supabaseClient
      .from('trading_session')
      .select('*, indicator_config(*)')
      .eq('is_active', true);

    if (sessionsError) throw sessionsError;
    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ message: 'No active sessions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const session of sessions) {
      const config = session.indicator_config;
      if (!config || !config.enabled) continue;

      // Calculate strategy identifier for this config
      const strategyHash = await getStrategyIdentifier(config);
      console.log(`📋 Strategy hash calculated: ${strategyHash.substring(0, 16)}... (signal_conditions_required=${config.signal_conditions_required})`);

      // Check current open positions
      const { data: positions } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('user_id', session.user_id)
        .eq('status', 'OPEN');

      if (positions && positions.length >= config.max_open_positions) {
        console.log(`Max positions reached for user ${session.user_id}`);
        continue;
      }

      // Analyze all USDC perpetual futures pairs
      const symbolFilters = await fetchSymbolFilters();
      const symbols = await fetchAllUSDCSymbols();
      console.log(`🔍 Scanning ${symbols.length} USDC pairs for user ${session.user_id}`);
      
      // 📊 STEP 1: Collect all valid signals with their strength
      interface SignalCandidate {
        symbol: string;
        signal: string;
        originalSignal: string;
        analysis: any;
        strength: number;
        trend: string;
        higherTrend: string;
        hardFiltersPassed: boolean;
      }
      
      const validSignals: SignalCandidate[] = [];
      
      for (const symbol of symbols) {
        try {
          // Add 100ms delay between symbols to avoid Binance rate limits (418 errors)
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Fetch klines for scan interval, trend timeframe, and higher trend timeframe (if enabled)
          const scanKlines = await fetchKlines(symbol, config.scan_interval, config.klines_limit);
          const trendKlines = await fetchKlines(symbol, config.trend_timeframe, config.klines_limit);
          
          // Determine trend on medium timeframe (always)
          const trend = analyzeMediumTrend(trendKlines, config);
          
          // Only fetch and analyze higher trend if enabled
          let higherTrend = 'NEUTRAL'; // Default til NEUTRAL hvis disabled
          if (config.higher_trend_enabled) {
            const higherTrendKlines = await fetchKlines(symbol, config.higher_trend_timeframe, config.klines_limit);
            higherTrend = analyzeHigherTrend(higherTrendKlines, config);
          }
          
          // Analyze signal on scan interval (men ADX beregnes på trend timeframe)
          const analysis = analyzeSignal(scanKlines, trendKlines, config);
          
          // Filter signal based on trend timeframes
          let filteredSignal = analysis.signal;
          
          if (filteredSignal === 'LONG') {
            // LONG kræver BULLISH på medium timeframe
            if (trend !== 'BULLISH') {
              filteredSignal = 'NONE';
              console.log(`Blocked LONG on ${symbol}: Medium trend (${config.trend_timeframe}) not BULLISH (is ${trend})`);
            } 
            // Tjek også higher trend hvis enabled
            else if (config.higher_trend_enabled && higherTrend !== 'BULLISH') {
              filteredSignal = 'NONE';
              console.log(`Blocked LONG on ${symbol}: Higher trend (${config.higher_trend_timeframe}) not BULLISH (is ${higherTrend})`);
            }
          } else if (filteredSignal === 'SHORT') {
            // SHORT kræver BEARISH på medium timeframe
            if (trend !== 'BEARISH') {
              filteredSignal = 'NONE';
              console.log(`Blocked SHORT on ${symbol}: Medium trend (${config.trend_timeframe}) not BEARISH (is ${trend})`);
            }
            // Tjek også higher trend hvis enabled
            else if (config.higher_trend_enabled && higherTrend !== 'BEARISH') {
              filteredSignal = 'NONE';
              console.log(`Blocked SHORT on ${symbol}: Higher trend (${config.higher_trend_timeframe}) not BEARISH (is ${higherTrend})`);
            }
          }

          // Log scan result to database
          const actionTaken = filteredSignal === 'NONE' 
            ? 'NO_SIGNAL'
            : positions && positions.length >= config.max_open_positions
            ? 'MAX_POSITIONS_REACHED'
            : 'SIGNAL_DETECTED';

          await supabaseClient.from('scan_results').insert({
            user_id: session.user_id,
            symbol,
            signal: filteredSignal,
            indicators: {
              ...analysis.indicators,
              trend: trend,
              higherTrend: higherTrend, // Add higher trend to scan_results
              trend_higher: higherTrend, // Also save as trend_higher for compatibility
              scan_interval: config.scan_interval,
              trend_timeframe: config.trend_timeframe,
              filterStatus: analysis.filterStatus, // Include filter evaluation results
            },
            stop_loss: analysis.stopLoss,
            take_profit: analysis.takeProfit,
            action_taken: actionTaken,
          });

          results.push({
            userId: session.user_id,
            symbol,
            analysis: { ...analysis, signal: filteredSignal },
            actionTaken,
            trend,
          });

          // 💪 Calculate signal strength (ALTID - også for NONE signaler)
          let strength = 0;
          
          // For NONE signaler: brug retning med flest opfyldte betingelser
          const effectiveSignal = filteredSignal !== 'NONE' 
            ? filteredSignal
            : (analysis.indicators.conditionDetails?.longConditionsMet || 0) > (analysis.indicators.conditionDetails?.shortConditionsMet || 0)
              ? 'LONG'
              : 'SHORT';
          
          // StochRSI contribution (0-30 points)
          if (analysis.indicators.stochRSI_k !== null) {
            if (effectiveSignal === 'LONG') {
              // LONG: Jo lavere StochRSI (mere oversolgt), jo bedre
              // 0-20 = 30 points, 20-40 = 15 points, 40+ = 0 points
              if (analysis.indicators.stochRSI_k <= 20) {
                strength += 30 * (20 - analysis.indicators.stochRSI_k) / 20;
              } else if (analysis.indicators.stochRSI_k <= 40) {
                strength += 15 * (40 - analysis.indicators.stochRSI_k) / 20;
              }
            } else { // SHORT
              // SHORT: Jo højere StochRSI (mere overkøbt), jo bedre
              // 80-100 = 30 points, 60-80 = 15 points, <60 = 0 points
              if (analysis.indicators.stochRSI_k >= 80) {
                strength += 30 * (analysis.indicators.stochRSI_k - 80) / 20;
              } else if (analysis.indicators.stochRSI_k >= 60) {
                strength += 15 * (analysis.indicators.stochRSI_k - 60) / 20;
              }
            }
          }
          
          // MACD histogram contribution (0-25 points)
          if (analysis.indicators.macd !== null) {
            const absHistogram = Math.abs(analysis.indicators.macd);
            if (effectiveSignal === 'LONG' && analysis.indicators.macd < 0) {
              // LONG med negativ histogram (lav): Jo tættere på 0, jo bedre momentum for vending
              strength += Math.min(25, absHistogram * 100);
            } else if (effectiveSignal === 'SHORT' && analysis.indicators.macd > 0) {
              // SHORT med positiv histogram (høj): Jo tættere på 0, jo bedre momentum for vending
              strength += Math.min(25, absHistogram * 100);
            }
          }
          
          // ADX contribution (0-25 points) - selv hvis under threshold
          if (analysis.indicators.adx !== null) {
            // Jo højere ADX, jo stærkere trend (selv under 30)
            // 0-20 = 0-5 points, 20-30 = 5-10 points, 30-40 = 10-18 points, 40-50 = 18-22 points, 50+ = 25 points
            if (analysis.indicators.adx >= 50) {
              strength += 25;
            } else if (analysis.indicators.adx >= 40) {
              strength += 18 + (4 * (analysis.indicators.adx - 40) / 10);
            } else if (analysis.indicators.adx >= 30) {
              strength += 10 + (8 * (analysis.indicators.adx - 30) / 10);
            } else if (analysis.indicators.adx >= 20) {
              strength += 5 + (5 * (analysis.indicators.adx - 20) / 10);
            } else {
              strength += (5 * analysis.indicators.adx / 20);
            }
          }
          
          // Conditions met bonus (0-20 points)
          if (analysis.indicators.conditionsMet !== undefined) {
            // conditionsMet / signal_conditions_required ratio
            const ratio = analysis.indicators.conditionsMet / (config.signal_conditions_required || 2);
            strength += Math.min(20, ratio * 20);
          }
          
          console.log(`💪 ${symbol} ${effectiveSignal} - Strength: ${strength.toFixed(1)} [${filteredSignal === 'NONE' ? 'HÅRDE FILTRE FEJLET' : 'OK'}] (StochRSI: ${analysis.indicators.stochRSI_k?.toFixed(1)}, MACD: ${analysis.indicators.macd?.toFixed(4)}, ADX: ${analysis.indicators.adx?.toFixed(1)})`);
          
          validSignals.push({
            symbol,
            signal: filteredSignal, // Det rigtige signal (NONE hvis blokeret af MACD)
            originalSignal: filteredSignal,
            analysis,
            strength,
            trend,
            higherTrend,
            hardFiltersPassed: analysis.hardFiltersPassed,
          });
        } catch (error: any) {
          console.error(`Error analyzing ${symbol}:`, error.message);
        }
      }
      
      // 🏆 STEP 2: Sort signals by strength (highest first)
      validSignals.sort((a, b) => b.strength - a.strength);
      
      console.log(`\n🏆 SIGNAL PRIORITERING - Analyseret ${validSignals.length} symboler (inkl. filtrerede):`);
      validSignals.slice(0, 20).forEach((sig, idx) => {
        const filterStatus = sig.hardFiltersPassed ? '✅' : '❌';
        console.log(`   ${idx + 1}. ${sig.symbol} ${sig.signal} [${filterStatus}] - Styrke: ${sig.strength.toFixed(1)}`);
      });
      
      // 🎯 STEP 3: Calculate how many positions we can open
      const slotsAvailable = config.max_open_positions - (positions?.length || 0);
      console.log(`\n🎯 Ledige positioner: ${slotsAvailable}/${config.max_open_positions}`);
      
      // 📈 STEP 4: Tag top 3x slots, filtrer for hårde filtre + MACD retning
      // 🛡️ RACE CONDITION FIX: Kun behandl ÉT signal per scan-cyklus for at undgå race conditions
      const topCandidates = validSignals.slice(0, Math.min(slotsAvailable * 3, validSignals.length));
      const eligibleSignals = topCandidates
        .filter(s => s.hardFiltersPassed && s.signal !== 'NONE'); // KRITISK: Bloker NONE signaler (MACD retningsfilter)
      
      // 🚨 LOG ALLE SIGNALS DER BLOKERES AF HÅRDE FILTRE
      const hardFilterBlockedSignals = topCandidates.filter(s => !s.hardFiltersPassed && s.signal !== 'NONE');
      for (const blocked of hardFilterBlockedSignals) {
        console.log(`\n🚫 HARD_FILTERS_FAILED = true -> TRADE_OPEN_FORBIDDEN`);
        console.log(`   Symbol: ${blocked.symbol}, Signal: ${blocked.signal}, Strength: ${blocked.strength.toFixed(1)}`);
        console.log(`   ADX: ${blocked.analysis.indicators.adx?.toFixed(2) ?? 'N/A'}, Floor: ${config.adx_floor}, Ceiling: ${config.adx_ceiling}`);
        console.log(`   Reason: Hard filter(s) blocked this trade`);
      }
      
      // 🛡️ KRITISK: Tag KUN det stærkeste signal for at undgå race conditions
      // Tidligere: .slice(0, slotsAvailable) kunne åbne flere positioner samtidigt
      // Nu: .slice(0, 1) sikrer kun én position åbnes per scan-cyklus
      const signalsToTrade = eligibleSignals.slice(0, 1);
      
      console.log(`\n📊 Efter hård filtrering: ${eligibleSignals.length}/${topCandidates.length} top signaler passerede hårde filtre`);
      console.log(`🛡️ RACE CONDITION GUARD: Behandler kun det stærkeste signal (${signalsToTrade.length} af ${eligibleSignals.length} eligible)`);
      
      if (signalsToTrade.length === 0) {
        console.log(`⚠️ Ingen signaler at handle eller ingen ledige positioner`);
        continue;
      }
      
      console.log(`\n📈 Handler det stærkeste signal:`);
      
      // 🚀 STEP 5: Place orders for selected signals
      for (const selectedSignal of signalsToTrade) {
        const { symbol, signal, analysis, trend } = selectedSignal;
        
        // SIKKERHEDSCHECK: Bloker NONE signaler (skulle aldrig komme hertil, men dobbelt-tjek)
        if (signal === 'NONE') {
          console.log(`⚠️ SIKKERHED: Blokerer NONE signal for ${symbol}`);
          continue;
        }
        
        try {
          console.log(`\n🎯 Behandler signal ${selectedSignal.symbol} (styrke: ${selectedSignal.strength.toFixed(1)})`);
          
          // ═══════════════════════════════════════════════════════════════════
          // 🚧 UNIFIED HARD FILTER GATE - ALL ENABLED FILTERS MUST BE TRUE
          // ═══════════════════════════════════════════════════════════════════
          // For hvert ENABLED filter: result SKAL være true. null/false = BLOCK
          const fs = analysis.filterStatus;
          let gateBlocked = false;
          let blockReason = '';
          
          // 1. EMA Spread (if ema_enabled AND ema_hard_filter)
          if (config.ema_enabled && config.ema_hard_filter !== false && fs?.hard?.emaSpread?.passed !== true) {
            gateBlocked = true;
            const val = fs?.hard?.emaSpread?.value;
            const reason = fs?.hard?.emaSpread?.reason ?? '';
            const maxSpread = config.max_ema_spread_percent ?? 0;
            
            if (fs?.hard?.emaSpread?.passed === null) {
              blockReason = `EMA_SPREAD_MISSING_OR_INVALID (value=${val})`;
            } else if (reason.includes('overextended')) {
              // Max spread exceeded - log specific rejection
              blockReason = `REJECT: EMA_SPREAD_TOO_HIGH → spread = ${val}, max = ${maxSpread}%`;
            } else {
              // Min spread not met
              blockReason = `EMA_SPREAD_FAILED (${val} < ${config.min_ema_spread_percent}%)`;
            }
          }
          
          // 2. ATR filter (if atr_enabled AND atr_hard_filter)
          if (!gateBlocked && config.atr_enabled && config.atr_hard_filter !== false && fs?.hard?.atr?.passed !== true) {
            gateBlocked = true;
            const val = fs?.hard?.atr?.value;
            blockReason = fs?.hard?.atr?.passed === null
              ? `ATR_FILTER_MISSING_OR_INVALID (value=${val})`
              : `ATR_FILTER_FAILED (${(val * 100)?.toFixed(4)}% < ${config.min_atr_percent}%)`;
          }
          
          // 3. ADX range (if adx_enabled AND adx_hard_filter)
          if (!gateBlocked && config.adx_enabled && config.adx_hard_filter !== false && fs?.hard?.adx?.passed !== true) {
            gateBlocked = true;
            const val = fs?.hard?.adx?.value;
            blockReason = fs?.hard?.adx?.passed === null
              ? `ADX_MISSING_OR_INVALID (value=${val})`
              : `ADX_OUT_OF_RANGE (${val?.toFixed(2)} not in [${config.adx_floor}, ${config.adx_ceiling}])`;
          }
          
          // 4. Volume (if volume_enabled AND volume_hard_filter)
          if (!gateBlocked && config.volume_enabled === true && config.volume_hard_filter !== false) {
            const volPassed = fs?.hard?.volume?.passed;
            if (volPassed !== true) {
              gateBlocked = true;
              const volCurrent = analysis.indicators?.volume_current ?? fs?.hard?.volume?.current;
              const volAvg = analysis.indicators?.volume_avg ?? fs?.hard?.volume?.avg;
              blockReason = volPassed === null
                ? `VOLUME_MISSING_OR_INVALID (current=${volCurrent}, avg=${volAvg})`
                : `VOLUME_FILTER_FAILED (ratio=${volCurrent && volAvg ? (volCurrent/volAvg).toFixed(2) : 'N/A'}x < ${config.volume_multiplier}x required)`;
            }
          }
          
          // 5. RSI Momentum (if rsi_enabled AND rsi_hard_filter)
          if (!gateBlocked && config.rsi_enabled && config.rsi_hard_filter !== false && fs?.hard?.rsiMomentum?.passed !== true) {
            gateBlocked = true;
            const val = fs?.hard?.rsiMomentum?.value;
            blockReason = fs?.hard?.rsiMomentum?.passed === null
              ? `RSI_MOMENTUM_MISSING_OR_INVALID (value=${val})`
              : `RSI_MOMENTUM_FAILED (RSI=${val?.toFixed(2)})`;
          }
          
          // 6. MACD Direction (if macd_direction_enabled - this is already a specific toggle)
          if (!gateBlocked && config.macd_direction_enabled) {
            const macdLine = analysis.indicators.macdLine;
            const macdSignalLine = analysis.indicators.macdSignalLine ?? analysis.indicators.macdSignal;
            if (macdLine === null || macdLine === undefined || macdSignalLine === null || macdSignalLine === undefined) {
              gateBlocked = true;
              blockReason = `MACD_DIRECTION_MISSING_OR_INVALID (line=${macdLine}, signal=${macdSignalLine})`;
            } else if (signal === 'LONG' && !(macdLine > macdSignalLine)) {
              gateBlocked = true;
              blockReason = `MACD_DIRECTION_FAILED_LONG (${macdLine.toFixed(6)} <= ${macdSignalLine.toFixed(6)})`;
            } else if (signal === 'SHORT' && !(macdLine < macdSignalLine)) {
              gateBlocked = true;
              blockReason = `MACD_DIRECTION_FAILED_SHORT (${macdLine.toFixed(6)} >= ${macdSignalLine.toFixed(6)})`;
            }
          }
          
          // 7. MACD Color Change Hard Filter (if macd_color_change_hard_filter)
          if (!gateBlocked && config.macd_color_change_hard_filter) {
            const colorChangePassed = signal === 'LONG' 
              ? analysis.indicators?.conditionDetails?.macd?.long 
              : analysis.indicators?.conditionDetails?.macd?.short;
            if (colorChangePassed !== true) {
              gateBlocked = true;
              blockReason = `MACD_COLOR_CHANGE_FAILED (${signal} required histogram shift not detected)`;
            }
          }
          
          // 8. Higher Trend Filter (if higher_trend_enabled AND higher_trend_hard_filter)
          if (!gateBlocked && config.higher_trend_enabled && config.higher_trend_hard_filter !== false) {
            const higherTrend = selectedSignal.higherTrend;
            if (signal === 'LONG' && higherTrend !== 'BULLISH') {
              gateBlocked = true;
              blockReason = `HIGHER_TREND_FAILED_LONG (${config.higher_trend_timeframe} trend=${higherTrend}, required=BULLISH)`;
            } else if (signal === 'SHORT' && higherTrend !== 'BEARISH') {
              gateBlocked = true;
              blockReason = `HIGHER_TREND_FAILED_SHORT (${config.higher_trend_timeframe} trend=${higherTrend}, required=BEARISH)`;
            }
          }
          
          // 9. Medium Trend Filter (always required if EMA enabled AND ema_hard_filter)
          if (!gateBlocked && config.ema_enabled && config.ema_hard_filter !== false) {
            const mediumTrend = selectedSignal.trend;
            if (signal === 'LONG' && mediumTrend !== 'BULLISH') {
              gateBlocked = true;
              blockReason = `MEDIUM_TREND_FAILED_LONG (${config.trend_timeframe} trend=${mediumTrend}, required=BULLISH)`;
            } else if (signal === 'SHORT' && mediumTrend !== 'BEARISH') {
              gateBlocked = true;
              blockReason = `MEDIUM_TREND_FAILED_SHORT (${config.trend_timeframe} trend=${mediumTrend}, required=BEARISH)`;
            }
          }
          
          // 10. StochRSI Hard Filter (if stochrsi_enabled AND stochrsi_hard_filter=true)
          if (!gateBlocked && config.stochrsi_enabled && config.stochrsi_hard_filter === true) {
            const fs = analysis.filterStatus;
            const stochLong = fs?.hard?.stochrsi?.long;
            const stochShort = fs?.hard?.stochrsi?.short;
            const stochK = analysis.indicators?.stochRSI_k;
            
            const osK = config.stochrsi_oversold_k ?? config.stochrsi_oversold ?? 20;
            const osD = config.stochrsi_oversold_d ?? config.stochrsi_oversold ?? 20;
            const obK = config.stochrsi_overbought_k ?? config.stochrsi_overbought ?? 80;
            const obD = config.stochrsi_overbought_d ?? config.stochrsi_overbought ?? 80;
            const stochD = analysis.indicators?.stochRSI_d;
            
            if (signal === 'LONG' && stochLong !== true) {
              gateBlocked = true;
              blockReason = `REJECT: STOCHRSI_ZONE_FAILED_LONG → K=${stochK?.toFixed(2)}, D=${stochD?.toFixed(2)} - kræver K<=${osK} AND D<=${osD}`;
            } else if (signal === 'SHORT' && stochShort !== true) {
              gateBlocked = true;
              blockReason = `REJECT: STOCHRSI_ZONE_FAILED_SHORT → K=${stochK?.toFixed(2)}, D=${stochD?.toFixed(2)} - kræver K>=${obK} AND D>=${obD}`;
            }
          }
          
          // LOG AND BLOCK IF GATE FAILED
          if (gateBlocked) {
            console.log(`\n🚨 TRADE_BLOCKED:${blockReason.split(' ')[0]}`);
            console.log(`   Symbol: ${symbol}, Signal: ${signal}, Strength: ${selectedSignal.strength.toFixed(1)}`);
            console.log(`   Full Reason: ${blockReason}`);
            continue;
          }
          console.log(`✅ UNIFIED GATE PASSED for ${symbol} ${signal}`);
          // ═══════════════════════════════════════════════════════════════════
          
          // 🛡️ KRITISK ATR DATA CHECK: Blok trade hvis ATR data mangler (for exit-beregninger)
          const atrForTrade = analysis.indicators.atr;
          if (!atrForTrade || atrForTrade <= 0 || !isFinite(atrForTrade)) {
            console.log(`\n🚨 TRADE_BLOCKED:ATR_DATA_MISSING_FOR_EXITS`);
            console.log(`   Symbol: ${symbol}, Signal: ${signal}`);
            console.log(`   ATR_value: ${atrForTrade}`);
            console.log(`   ❌ Reason: ATR er PÅKRÆVET for exit-logik (SL, BE, Trailing). Ingen trade uden gyldig ATR.`);
            continue;
          }
          console.log(`✅ ATR valideret for ${symbol}: ${atrForTrade.toFixed(6)} (${((atrForTrade / analysis.indicators.price) * 100).toFixed(2)}%)`);
          
          // NOTE: MACD direction check er nu dækket af UNIFIED GATE ovenfor

          // Place order logic starts here
          // CRITICAL: Count open positions with FOR UPDATE lock to prevent race conditions
          const { data: currentPositions, error: posError } = await supabaseClient
            .from('positions')
            .select('id, symbol')
            .eq('user_id', session.user_id)
            .eq('status', 'OPEN');
          
          if (posError) {
            console.error(`Error checking positions for ${symbol}:`, posError);
            continue;
          }
          
          // Strict check: >= means at or above limit
          if (currentPositions && currentPositions.length >= config.max_open_positions) {
            console.log(`Max positions LIMIT REACHED (${currentPositions.length}/${config.max_open_positions}) for user ${session.user_id}, skipping ${symbol}`);
            continue;
          }
          
          // Check if there's already an open position for this specific symbol (snapshot)
          const existingPositionForSymbol = currentPositions?.find(p => p.symbol === symbol);
          if (existingPositionForSymbol) {
            console.log(`Skipping ${symbol}: Already have an open position for this symbol (snapshot)`);
            continue;
          }
          
          // Fresh DB check to avoid races with concurrent scans
          const { data: existingOpenForSymbol, error: existingOpenErr } = await supabaseClient
            .from('positions')
            .select('id')
            .eq('user_id', session.user_id)
            .eq('symbol', symbol)
            .eq('status', 'OPEN')
            .maybeSingle();

          if (existingOpenErr) {
            console.error(`Error during fresh open-position check for ${symbol}:`, existingOpenErr);
            continue;
          }
          if (existingOpenForSymbol) {
            console.log(`Skipping ${symbol}: Already open (fresh DB check)`);
            continue;
          }

          // Exchange-level guard: if a position exists on Binance, don't place another
          const existingOnExchange = await verifyPositionOnBinance(symbol);
          if (existingOnExchange) {
            console.log(`Skipping ${symbol}: Position already open on Binance`);
            continue;
          }
          
          // Get account balance
          const balance = await getAccountBalance();
          console.log(`✅ Balance check OK: ${balance} USDC`);
          
          // 🔴 KRITISK SIKKERHEDSCHECK: ATR SKAL VÆRE GYLDIG
          // Uden ATR kan vi ikke beregne stop loss, break-even eller trailing stop korrekt
          const atrFromAnalysis = analysis.indicators.atr;
          if (!atrFromAnalysis || !isFinite(atrFromAnalysis) || atrFromAnalysis <= 0) {
            console.log(`🚨 BLOKERET: ${symbol} - ATR mangler eller ugyldig (${atrFromAnalysis})`);
            console.log(`   ❌ Trade AFVIST: Uden gyldig ATR kan exit-logik ikke fungere korrekt`);
            console.log(`   ❌ Stop Loss, Break-Even og Trailing Stop ville bruge faste procenter istedet for ATR`);
            continue;
          }
          console.log(`✅ ATR valideret: ${atrFromAnalysis.toFixed(6)} (${((atrFromAnalysis / analysis.indicators.price) * 100).toFixed(2)}%)`);
          
          // Tjek at stopLoss er gyldig (beregnet fra ATR)
          if (!analysis.stopLoss || !isFinite(analysis.stopLoss) || analysis.stopLoss <= 0) {
            console.log(`🚨 BLOKERET: ${symbol} - Stop Loss beregning fejlet (${analysis.stopLoss})`);
            console.log(`   ❌ Trade AFVIST: Stop Loss er påkrævet for alle trades`);
            continue;
          }
          
          // Log config values
          console.log(`📊 Config - risk_per_trade: ${config.risk_per_trade_percent}%, position_size: ${config.position_size_percent}%, leverage: ${config.leverage}x`);
          
          // Calculate position size using BOTH methods, take the smaller
          // Method 1: Risk-based (current logic)
          const riskAmount = balance * (config.risk_per_trade_percent / 100);
          const stopLossDistance = Math.abs(analysis.indicators.price - analysis.stopLoss);
          const riskBasedQuantity = (riskAmount / stopLossDistance) * config.leverage;
          console.log(`📐 Risk-based: riskAmount=${riskAmount.toFixed(2)}, stopLossDistance=${stopLossDistance.toFixed(4)}, quantity=${riskBasedQuantity.toFixed(4)}`);
          
          // Method 2: Direct percentage of balance WITH LEVERAGE
          // Formula: (Balance × Position%) × Leverage / Price
          // Example: ($100 × 20%) × 3 / $1 = $20 × 3 / $1 = 60 units
          // Position notional = 60 × $1 = $60
          // Required margin = $60 / 3 = $20 ✓
          const marginToUse = balance * (config.position_size_percent / 100);
          const positionNotional = marginToUse * config.leverage;
          const directQuantity = positionNotional / analysis.indicators.price;
          
          console.log(`📐 Direct percentage calculation:`);
          console.log(`   Balance: $${balance.toFixed(2)}`);
          console.log(`   Position size %: ${config.position_size_percent}%`);
          console.log(`   Margin to use: $${marginToUse.toFixed(2)} (${config.position_size_percent}% of balance)`);
          console.log(`   Leverage: ${config.leverage}x`);
          console.log(`   Position notional: $${positionNotional.toFixed(2)} (margin × leverage)`);
          console.log(`   Price: $${analysis.indicators.price.toFixed(4)}`);
          console.log(`   Quantity: ${directQuantity.toFixed(4)} units`);
          console.log(`   ✅ Total position value: $${(directQuantity * analysis.indicators.price).toFixed(2)}`);
          console.log(`   ✅ Required margin: $${((directQuantity * analysis.indicators.price) / config.leverage).toFixed(2)}`);
          
          // Use the SMALLER of the two (more conservative)
          const rawQuantity = Math.min(riskBasedQuantity, directQuantity);
          console.log(`🎯 Selected quantity (min of both): ${rawQuantity.toFixed(4)}`);

          // Apply Binance filters (minQty/stepSize and pricing tick)
          const filters = symbolFilters[symbol];
          if (!filters) {
            console.log(`❌ Missing filters for ${symbol}, skipping.`);
            continue;
          }
          const qtyPrecision = getPrecisionFromStep(filters.stepSize);
          const pricePrecision = getPrecisionFromStep(filters.tickSize);

          const step = filters.stepSize;
          const quantityRounded = Math.floor(rawQuantity / step) * step;
          console.log(`✂️ Rounded quantity: ${quantityRounded.toFixed(qtyPrecision)} (step=${step}, minQty=${filters.minQty})`);

          if (!isFinite(quantityRounded) || quantityRounded <= 0 || quantityRounded < filters.minQty) {
            console.log(`❌ Skip ${symbol}: qty ${quantityRounded} below min ${filters.minQty}`);
            continue;
          }
          
          // Place order
          const side = signal === 'LONG' ? 'BUY' : 'SELL';
          console.log(`\n🚀 PLACING ORDER on ${symbol}:`);
          console.log(`   Side: ${side}`);
          console.log(`   Quantity: ${quantityRounded}`);
          console.log(`   Price: ${analysis.indicators.price}`);
          console.log(`   Stop Loss: ${analysis.stopLoss}`);
          
          let orderData;
          try {
            orderData = await placeOrder(
              symbol,
              side,
              quantityRounded,
              analysis.stopLoss,
              analysis.takeProfit,
              qtyPrecision,
              pricePrecision,
              config.leverage
            );
            console.log(`✅ ORDER PLACED SUCCESSFULLY: ${symbol} ${side} ${quantityRounded}`);
            console.log(`   Order ID: ${orderData.orderId}`);
            console.log(`   Status: ${orderData.status}`);
          } catch (orderError: any) {
            console.error(`❌ ORDER PLACEMENT FAILED for ${symbol}:`, orderError.message);
            console.error(`   Full error:`, orderError);
            continue;
          }
          
          // Wait a moment for Binance to process the order
          console.log(`⏳ Waiting 1s for Binance to process...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Verify position is actually open on Binance
          console.log(`🔍 Verifying position on Binance for ${symbol}...`);
          const binancePosition = await verifyPositionOnBinance(symbol);
          
          if (!binancePosition) {
            console.error(`❌ VERIFICATION FAILED: Position ${symbol} not found on Binance after order placement`);
            console.error(`   Order ID: ${orderData.orderId}`);
            console.error(`   This order may need manual intervention`);
            continue;
          }
          
          console.log(`✅ POSITION VERIFIED on Binance: ${symbol}`);
          console.log(`   Binance Qty: ${binancePosition.positionAmt}`);
          console.log(`   Binance Entry: ${binancePosition.entryPrice}`);
          
          // Build open reason description
          const openReasonParts = [];
          if (analysis.indicators.rsi) openReasonParts.push(`RSI: ${analysis.indicators.rsi.toFixed(2)}`);
          if (analysis.indicators.macd) openReasonParts.push(`MACD: ${analysis.indicators.macd.toFixed(4)}`);
          if (analysis.indicators.emaFast && analysis.indicators.emaSlow) {
            openReasonParts.push(`EMA: Fast ${analysis.indicators.emaFast.toFixed(2)} vs Slow ${analysis.indicators.emaSlow.toFixed(2)}`);
          }
          if (analysis.indicators.adx) openReasonParts.push(`ADX: ${analysis.indicators.adx.toFixed(2)}`);
          const openReason = `${signal} signal på ${symbol} - Trend: ${trend}. ${openReasonParts.join(', ')}. Prioriteret med styrke: ${selectedSignal.strength.toFixed(1)}`;
          
          console.log(`📝 Open reason: ${openReason}`);
          
          // 🔴 KRITISK: Trailing stop beregnes KUN fra ATR - INGEN FALLBACK
          // ATR er allerede valideret tidligere, så dette er garanteret gyldigt
          const atrValue = analysis.indicators.atr;
          const trailingStopDistance = atrValue * config.atr_trailing_stop_multiplier;
          const trailingStopPercent = (trailingStopDistance / analysis.indicators.price) * 100;
          
          console.log(`🎯 Trailing stop beregning (ATR-baseret):`);
          console.log(`   ATR: ${atrValue.toFixed(6)}`);
          console.log(`   Multiplier: ${config.atr_trailing_stop_multiplier}x`);
          console.log(`   Distance: ${trailingStopDistance.toFixed(6)}`);
          console.log(`   Procent: ${trailingStopPercent.toFixed(2)}%`);
          
          // Use actual values from Binance for database insert
          const actualEntryPrice = parseFloat(binancePosition.entryPrice);
          const actualQuantity = Math.abs(parseFloat(binancePosition.positionAmt));
          
          // Calculate initial trailing stop level (aktiveres med det samme, ikke efter TP)
          const initialTrailingStop = signal === 'LONG'
            ? actualEntryPrice * (1 - trailingStopPercent / 100)
            : actualEntryPrice * (1 + trailingStopPercent / 100);
          
          console.log(`\n💾 SAVING TO DATABASE:`);
          console.log(`   Symbol: ${symbol}`);
          console.log(`   Side: ${signal}`);
          console.log(`   Entry: ${actualEntryPrice}`);
          console.log(`   Quantity: ${actualQuantity}`);
          console.log(`   Stop Loss: ${analysis.stopLoss}`);
          console.log(`   Trailing Stop: ${initialTrailingStop.toFixed(8)}`);
          console.log(`   Order ID: ${orderData.orderId}`);
          
          // Build comprehensive indicators_snapshot with ALL data needed for export
          const atrPercent = analysis.indicators.atr && analysis.indicators.price 
            ? (analysis.indicators.atr / analysis.indicators.price) * 100 
            : null;

          // 🔎 AUDIT: Volume multiplier tri-state (skal aldrig blive true når data mangler)
          // 🔴 FIX: Bruger Number.isFinite for at fange NaN/Infinity/undefined
          const volCurrent = analysis.indicators?.volume;
          const volAvg = analysis.indicators?.avgVolume;
          const volCurrentValid = volCurrent != null && Number.isFinite(volCurrent);
          const volAvgValid = volAvg != null && Number.isFinite(volAvg) && volAvg > 0;
          
          const volumeMultiplierFilterPassedTriState = config.volume_enabled !== true
            ? null
            : (!volCurrentValid || !volAvgValid)
              ? null
              : (volCurrent >= volAvg * config.volume_multiplier);
          
          // Soft volume tri-state
          const softVolumePassedTriState = config.volume_enabled !== true
            ? null
            : (!volCurrentValid || !volAvgValid)
              ? null
              : (volCurrent > volAvg);

          console.log(
            `📊 VOLUME TRI-STATE AUDIT | enabled=${config.volume_enabled} | current=${volCurrent ?? 'null'} (valid=${volCurrentValid}) | avg=${volAvg ?? 'null'} (valid=${volAvgValid}) | multiplier=${config.volume_multiplier} | hard_passed=${volumeMultiplierFilterPassedTriState} | soft_passed=${softVolumePassedTriState}`
          );

          // 🔴 AUDIT: Generate unique signal_id for dublet-afklaring
          const signalId = `${symbol}_${signal}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          
          // 🔴 ATR FILTER AUDIT - Detaljeret reason string
          const atrFilterAudit = (() => {
            const fs = analysis.filterStatus?.hard?.atr;
            if (!config.atr_enabled) {
              return { passed: null, reason: 'ATR_FILTER_DISABLED' };
            }
            const atrPctRaw = (atrValue / analysis.indicators.price) * 100;
            const floorUsed = fs?.effective_min_atr_percent_used ?? fs?.atr_floor_used ?? config.min_atr_percent;
            if (fs?.passed === true) {
              return { 
                passed: true, 
                reason: `ATR_OK: ${atrPctRaw.toFixed(6)}% >= ${floorUsed?.toFixed(4) ?? 'N/A'}% floor`,
                atr_value_raw: atrValue,
                atr_pct_raw: atrPctRaw,
                atr_timeframe: config.scan_interval,
                atr_period: config.atr_period,
                atr_source: 'entry',
                atr_adaptive_enabled: config.adaptive_atr_enabled,
                atr_base_used: config.atr_base_min,
                atr_floor_used: config.atr_floor,
                atr_ceiling_used: config.atr_ceiling,
                final_min_atr_used: floorUsed,
              };
            } else {
              return { 
                passed: false, 
                reason: `ATR_FAILED: ${atrPctRaw.toFixed(6)}% < ${floorUsed?.toFixed(4) ?? 'N/A'}% floor`,
                atr_value_raw: atrValue,
                atr_pct_raw: atrPctRaw,
                atr_timeframe: config.scan_interval,
                atr_period: config.atr_period,
                atr_source: 'entry',
                atr_adaptive_enabled: config.adaptive_atr_enabled,
                atr_base_used: config.atr_base_min,
                atr_floor_used: config.atr_floor,
                atr_ceiling_used: config.atr_ceiling,
                final_min_atr_used: floorUsed,
              };
            }
          })();
          
          // 🔴 ADX FILTER AUDIT - Detaljeret reason string med DI værdier
          const adxFilterAudit = (() => {
            if (!config.adx_enabled) {
              return { passed: null, reason: 'ADX_FILTER_DISABLED' };
            }
            const adxVal = analysis.indicators.adx;
            const adxAuditData = analysis.indicators.adx_audit;
            const floorUsed = config.adx_floor ?? 20;
            const ceilingUsed = config.adx_ceiling ?? 40;
            
            if (adxVal === null || adxVal === undefined) {
              return { passed: null, reason: 'ADX_VALUE_MISSING' };
            }
            
            const inRange = adxVal >= floorUsed && adxVal <= ceilingUsed;
            const reason = inRange 
              ? `ADX_OK: ${adxVal.toFixed(4)} in [${floorUsed}, ${ceilingUsed}]`
              : adxVal < floorUsed
                ? `ADX_BELOW_MIN: ${adxVal.toFixed(4)} < ${floorUsed}`
                : `ADX_ABOVE_MAX: ${adxVal.toFixed(4)} > ${ceilingUsed}`;
            
            return {
              passed: inRange,
              reason,
              adx_value_raw: adxVal,
              adx_floor_used: floorUsed,
              adx_ceiling_used: ceilingUsed,
              adx_adaptive_enabled: config.adaptive_adx_enabled,
              adx_base_used: config.adx_base_min,
              plus_di: adxAuditData?.plus_di ?? null,
              minus_di: adxAuditData?.minus_di ?? null,
              dx_instant: adxAuditData?.dx_instant ?? null,
              adx_timeframe: config.trend_timeframe,
              adx_period: config.adx_period,
            };
          })();
          
          console.log(`\n📋 ENTRY AUDIT - ${symbol} ${signal}`);
          console.log(`   signal_id: ${signalId}`);
          console.log(`   expected_stop_loss_price: ${analysis.stopLoss.toFixed(8)}`);
          console.log(`   ATR: ${atrFilterAudit.reason}`);
          console.log(`   ADX: ${adxFilterAudit.reason}`);
          
          const comprehensiveSnapshot = {
            // 🔴 SCHEMA VERSION - Bruges til at skelne legacy vs nye snapshots
            // v1 = legacy trades før schema fixes (ingen garanti for felter)
            // v2 = nye trades med garanterede felter (MACD, BE, ADX audit, trailing audit, StochRSI)
            schema_version: 2,
            
            // 🔴 UNIQUE IDENTIFIERS for dublet-afklaring
            signal_id: signalId,
            
            // Config values
            ...config,
            
            // Core indicators
            ...analysis.indicators,
            
            // 🔴 FILTER MODE SETTINGS - EXPLICIT gemmes for eksport (fra config, IKKE spread overskrevet)
            filter_mode_settings: {
              ema_hard_filter: config.ema_hard_filter,
              rsi_hard_filter: config.rsi_hard_filter,
              stochrsi_hard_filter: config.stochrsi_hard_filter,
              macd_hard_filter: config.macd_hard_filter,
              bb_hard_filter: config.bb_hard_filter,
              vwap_hard_filter: config.vwap_hard_filter,
              atr_hard_filter: config.atr_hard_filter,
              adx_hard_filter: config.adx_hard_filter,
              volume_hard_filter: config.volume_hard_filter,
              pivot_points_hard_filter: config.pivot_points_hard_filter,
              higher_trend_hard_filter: config.higher_trend_hard_filter,
            },
            
            // Signal strength
            signalStrength: selectedSignal.strength,
            
            // Explicit ATR percent
            atr_percent: atrPercent,
            
            // 🔴 ATR AUDIT - Entydig dokumentation af ATR source + floor enforcement
            // Model A: Entry-ATR bruges som fast reference for alle exits
            atr_audit: {
              atr_value: analysis.indicators.atr,
              atr_percent: atrPercent,
              atr_period: config.atr_period,
              atr_timeframe: config.trend_timeframe || config.scan_interval || '5m',
              atr_source: 'entry', // ATR samplet ved signal-tidspunkt, bruges hele positionens levetid
              atr_captured_at: new Date().toISOString(),
              // 🔴 ATR FLOOR AUDIT - Dokumenterer hvilken gulvværdi der blev brugt
              atr_floor_used: analysis.filterStatus?.hard?.atr?.atr_floor_used ?? null,
              atr_floor_source: analysis.filterStatus?.hard?.atr?.atr_floor_source ?? 'unknown',
              atr_floor_passed_boolean: analysis.filterStatus?.hard?.atr?.passed === true,
            },
            
            // 🔴 EXTENDED ATR FILTER AUDIT - Fuld forklaring af filter-beslutning
            atr_filter_audit: atrFilterAudit,
            
            // 🔴 EXTENDED ADX FILTER AUDIT - Fuld forklaring af filter-beslutning
            adx_filter_audit: adxFilterAudit,
            
            // EMA spread percent (already in indicators but ensuring it's there)
            ema_spread_percent: analysis.indicators.emaSpreadPercent,
            
            // Bollinger Bands flattened
            bb_upper: analysis.indicators.bb?.upper ?? null,
            bb_middle: analysis.indicators.bb?.middle ?? null,
            bb_lower: analysis.indicators.bb?.lower ?? null,
            
            // 🔴 MACD SCHEMA FIX - Klart opdelt i CONFIG vs RUNTIME værdier
            // CONFIG (heltal):
            macd_signal_period: config.macd_signal, // ✅ Config parameter (fx 9) - ALTID HELTAL
            // RUNTIME (decimaler):
            macd_line: analysis.indicators.macdLine, // ✅ Beregnet MACD linje værdi - DECIMAL
            macd_signal_line: analysis.indicators.macdSignal, // ✅ Beregnet signal linje værdi - DECIMAL
            macd_histogram: analysis.indicators.macd, // ✅ Histogram (macd - signal) - DECIMAL
            
            // 🔴 FIX: config.macd_signal fra spread overskrevet af explicit macd_signal_period ovenfor

            // 🔴 FIX: Hard filter pass/fail status - null hvis disabled (not evaluated)
            // Også null hvis volume er null (ingen data at evaluere)
            ema_spread_filter_passed: config.ema_enabled 
              ? (analysis.filterStatus?.hard?.emaSpread?.passed ?? null) 
              : null,
            // 🔴 FIX: ATR filter status - null hvis ATR filter er slukket i UI
            // (ATR beregnes stadig til exits, men filter_passed er "not evaluated")
            atr_filter_passed: config.atr_enabled 
              ? (analysis.filterStatus?.hard?.atr?.passed ?? null) 
              : null,
            adx_filter_passed: config.adx_enabled 
              ? (analysis.filterStatus?.hard?.adx?.passed ?? null) 
              : null,
            // 🔴 FIX: Volume filter status - TRI-STATE LOGIC
            // null = disabled ELLER manglende data (volume_current eller volume_avg er null)
            // true/false = faktisk evalueret resultat
            volume_filter_passed: volumeMultiplierFilterPassedTriState,
            volume_multiplier_filter_passed: volumeMultiplierFilterPassedTriState,

            // 🔴 FIX: Volume values for debugging - eksplicit null ved ugyldig data
            volume_current: volCurrentValid ? volCurrent : null,
            volume_avg: volAvgValid ? volAvg : null,
            
            macd_direction_passed: config.macd_direction_enabled 
              ? (signal === 'LONG' 
                  ? analysis.filterStatus?.hard?.macdDirection?.long ?? null
                  : analysis.filterStatus?.hard?.macdDirection?.short ?? null)
              : null,
            rsi_momentum_passed: config.rsi_enabled 
              ? (signal === 'LONG'
                  ? analysis.filterStatus?.hard?.rsiMomentum?.long ?? null
                  : analysis.filterStatus?.hard?.rsiMomentum?.short ?? null)
              : null,
            
            // 🔴 FIX: Soft conditions - beregn EKSPLICIT fra booleans, derefter sum
            // Hver condition er enten true, false, eller null (disabled)
            soft_ema_trend_passed: config.ema_enabled 
              ? (analysis.indicators.conditionDetails?.ema?.[signal.toLowerCase()] === true)
              : null,
            soft_stochrsi_passed: config.stochrsi_enabled 
              ? (analysis.indicators.conditionDetails?.stochRSI?.[signal.toLowerCase()] === true)
              : null,
            // 🔴 FIX: MACD histogram - side-aware (LONG: hist > threshold, SHORT: hist < -threshold)
            soft_macd_histogram_passed: config.macd_enabled 
              ? (analysis.indicators.conditionDetails?.macd?.[signal.toLowerCase()] === true)
              : null,
            // 🔴 FIX: MACD momentum - separat soft condition
            soft_macd_momentum_passed: config.histogram_momentum_enabled 
              ? (analysis.indicators.conditionDetails?.histogramMomentum?.[signal.toLowerCase()] === true)
              : null,
            soft_bb_passed: config.bb_enabled 
              ? (analysis.indicators.conditionDetails?.bb?.[signal.toLowerCase()] === true)
              : null,
            // 🔴 FIX: soft_volume_passed - bruger tri-state fra snapshot beregningen
            soft_volume_passed: softVolumePassedTriState,
            soft_pivot_passed: config.pivot_points_enabled 
              ? (analysis.indicators.conditionDetails?.pivotPoints?.[signal.toLowerCase()] === true)
              : null,
            
            // 🔴 VWAP - Full export for AI analysis
            soft_vwap_passed: config.vwap_enabled 
              ? (analysis.indicators.conditionDetails?.vwap?.[signal.toLowerCase()] === true)
              : null,
            vwap: analysis.indicators.conditionDetails?.vwap?.value ?? null,
            vwap_enabled: config.vwap_enabled ?? false,
            vwap_period: config.vwap_period ?? 50,
            vwap_timeframe: config.trend_timeframe ?? config.scan_interval ?? '5m',
            vwap_captured_at: new Date().toISOString(),
            
            // 🔴 FIX: soft_conditions_total - beregn DIREKTE fra de explicitte booleans ovenfor
            // Tæller kun true (ikke false eller null)
            soft_conditions_total: (() => {
              let total = 0;
              if (config.ema_enabled && analysis.indicators.conditionDetails?.ema?.[signal.toLowerCase()] === true) total++;
              if (config.stochrsi_enabled && analysis.indicators.conditionDetails?.stochRSI?.[signal.toLowerCase()] === true) total++;
              if (config.macd_enabled && analysis.indicators.conditionDetails?.macd?.[signal.toLowerCase()] === true) total++;
              if (config.histogram_momentum_enabled && analysis.indicators.conditionDetails?.histogramMomentum?.[signal.toLowerCase()] === true) total++;
              if (config.bb_enabled && analysis.indicators.conditionDetails?.bb?.[signal.toLowerCase()] === true) total++;
              // 🔴 FIX: Bruger tri-state soft volume
              if (softVolumePassedTriState === true) total++;
              if (config.pivot_points_enabled && analysis.indicators.conditionDetails?.pivotPoints?.[signal.toLowerCase()] === true) total++;
              // 🔴 VWAP soft condition
              if (config.vwap_enabled && analysis.indicators.conditionDetails?.vwap?.[signal.toLowerCase()] === true) total++;
              return total;
            })(),
            
            // StochRSI zone check
            stochrsi_zone_passed: analysis.indicators.conditionDetails?.stochRSI?.[signal.toLowerCase()] ?? false,
            
            // Break-even and trailing stop config
            break_even_atr_multiplier: config.break_even_atr,
            atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier,
            
            // 🔴 FIX: Omdøbt fra trailing_stop_initial til trailing_stop_initial_price
            trailing_stop_initial_price: initialTrailingStop, // Fuld precision, ingen afrunding
            
            // 🎯 AUDIT v6 FELTER - Beregnet ved trade open for verifikation (fuld precision)
            break_even_trigger_price: signal === 'LONG'
              ? actualEntryPrice + ((analysis.indicators.atr || 0) * config.break_even_atr)
              : actualEntryPrice - ((analysis.indicators.atr || 0) * config.break_even_atr),
            // 🔴 FIX: trailing_activation_price - korrekt fortegn baseret på side
            // LONG: entry + ATR * activation_atr (aktiveres når pris stiger)
            // SHORT: entry - ATR * activation_atr (aktiveres når pris falder)
            trailing_activation_price: signal === 'LONG'
              ? actualEntryPrice + ((analysis.indicators.atr || 0) * config.trailing_stop_activation_atr)
              : actualEntryPrice - ((analysis.indicators.atr || 0) * config.trailing_stop_activation_atr),
            trailing_distance: (analysis.indicators.atr || 0) * config.atr_trailing_stop_multiplier,
            expected_stop_loss: signal === 'LONG'
              ? actualEntryPrice - ((analysis.indicators.atr || 0) * config.atr_stop_loss_multiplier)
              : actualEntryPrice + ((analysis.indicators.atr || 0) * config.atr_stop_loss_multiplier),
            
            // 🔴 EXIT TYPE FLAG - Bruges til AUDIT v6 verifikation
            exit_type: 'ATR_BASED', // Altid ATR for bot trades - ALDRIG procent-fallback
            is_synced_position: false, // Bot-åbnet, ikke synkroniseret fra Binance
            
            // Trend data
            trend_medium: selectedSignal.trend,
            trend_higher: selectedSignal.higherTrend,
          };

          // 🔴 KRITISK: Stop Loss er ALTID ATR-baseret - INGEN FALLBACK
          // ATR og SL er allerede valideret tidligere i flowet
          // Hvis vi kommer hertil, er analysis.stopLoss garanteret gyldig
          const finalStopLoss = analysis.stopLoss;
          
          // Ekstra sikkerhedsvalidering - burde aldrig trigge efter tidligere checks
          if (!finalStopLoss || isNaN(finalStopLoss) || !isFinite(finalStopLoss) || finalStopLoss <= 0) {
            console.log(`🚨 KRITISK FEJL: Stop Loss ugyldig trods tidligere validering (${analysis.stopLoss})`);
            console.log(`   ❌ Trade AFVIST: Ingen fallback tilladt per strategi-regler`);
            continue; // BLOKER trade - ingen fallback
          }
          
          // 📊 KOMPLET ATR/EXIT LOGGING VED TRADE OPEN (sanity check)
          const atrValueForLogging = analysis.indicators.atr;
          const atrPctForLogging = atrValueForLogging ? (atrValueForLogging / actualEntryPrice) * 100 : null;
          const breakEvenTriggerPrice = signal === 'LONG'
            ? actualEntryPrice + (atrValueForLogging * config.break_even_atr)
            : actualEntryPrice - (atrValueForLogging * config.break_even_atr);
          const trailingActivationPrice = signal === 'LONG'
            ? actualEntryPrice + (atrValueForLogging * config.trailing_stop_activation_atr)
            : actualEntryPrice - (atrValueForLogging * config.trailing_stop_activation_atr);
          const trailingDistanceValue = atrValueForLogging * config.atr_trailing_stop_multiplier;
          
          console.log(`\n📊 ═══════════════════════════════════════════`);
          console.log(`📊 ATR/EXIT VÆRDIER VED TRADE OPEN - ${symbol} ${signal}`);
          console.log(`📊 ═══════════════════════════════════════════`);
          // 🔴 FIX: Fuld precision - ingen afrunding for at undgå truncering på lavpris-coins (PEPE etc)
          console.log(`   🎯 ATR_value: ${atrValueForLogging !== null ? atrValueForLogging : '❌ NULL'}`);
          console.log(`   🎯 ATR_pct: ${atrPctForLogging !== null ? atrPctForLogging + '%' : '❌ NULL'}`);
          console.log(`   🛡️ initial_stop_loss_price: ${finalStopLoss}`);
          console.log(`      (Entry ${actualEntryPrice} ${signal === 'LONG' ? '-' : '+'} ATR ${atrValueForLogging} × SL_multiplier ${config.atr_stop_loss_multiplier})`);
          console.log(`   🔄 break_even_trigger_price: ${breakEvenTriggerPrice}`);
          console.log(`      (Entry ${signal === 'LONG' ? '+' : '-'} ATR × BE_multiplier ${config.break_even_atr})`);
          console.log(`   📈 trailing_activation_price: ${trailingActivationPrice}`);
          console.log(`      (Entry ${signal === 'LONG' ? '+' : '-'} ATR × Activation_multiplier ${config.trailing_stop_activation_atr})`);
          console.log(`   📏 trailing_distance: ${trailingDistanceValue}`);
          console.log(`      (ATR × Trailing_multiplier ${config.atr_trailing_stop_multiplier})`);
          console.log(`📊 ═══════════════════════════════════════════`);
          
          // 🎯 TRADE_OPEN AUDIT - Samlet one-liner for nem verifikation (fuld precision)
          console.log(`\n🎯 TRADE_OPEN AUDIT | ${symbol} ${signal} | Entry: ${actualEntryPrice} | ATR_value: ${atrValueForLogging ?? 'NULL'} | ATR_pct: ${atrPctForLogging ?? 'NULL'}% | SL_Multi: ${config.atr_stop_loss_multiplier} | BE_ATR: ${config.break_even_atr} | Activation_ATR: ${config.trailing_stop_activation_atr} | Trail_Multi: ${config.atr_trailing_stop_multiplier} | SL_Price: ${finalStopLoss} | BE_Trigger: ${breakEvenTriggerPrice} | Trail_Activation: ${trailingActivationPrice} | Trail_Distance: ${trailingDistanceValue}`);
          
          if (atrValueForLogging === null || atrValueForLogging === 0 || !isFinite(atrValueForLogging)) {
            console.log(`🚨 ❌ ATR_MISSING_OR_INVALID VED TRADE OPEN - DETTE BØR ALDRIG SKE!`);
          }

          // 📊 MACD SCHEMA AUDIT - Verificerer korrekt navngivning og typer
          const macdLineValue = analysis.indicators.macd_line;
          const macdSignalLineValue = analysis.indicators.macd_signal_line;
          const macdHistogramValue = analysis.indicators.macd_histogram;
          const macdSignalPeriodValue = analysis.indicators.macd_signal_period;
          
          // 🔴 KRITISK VERIFIKATION: histogram SKAL være macd_line - macd_signal_line
          const expectedHistogram = (macdLineValue !== null && macdSignalLineValue !== null) 
            ? macdLineValue - macdSignalLineValue 
            : null;
          const histogramMatchesCalc = (expectedHistogram !== null && macdHistogramValue !== null)
            ? Math.abs(macdHistogramValue - expectedHistogram) < 1e-10
            : (macdHistogramValue === null && expectedHistogram === null);
          
          console.log(`\n📊 ═══════════════════════════════════════════`);
          console.log(`📊 MACD SCHEMA AUDIT - ${symbol} ${signal}`);
          console.log(`📊 ═══════════════════════════════════════════`);
          console.log(`   CONFIG PARAMETER:`);
          console.log(`   📌 macd_signal_period: ${macdSignalPeriodValue} (type: ${typeof macdSignalPeriodValue}, expected: integer)`);
          console.log(`   RUNTIME VALUES:`);
          console.log(`   📈 macd_line: ${macdLineValue !== null ? macdLineValue.toFixed(12) : 'NULL'}`);
          console.log(`   📉 macd_signal_line: ${macdSignalLineValue !== null ? macdSignalLineValue.toFixed(12) : 'NULL'}`);
          console.log(`   📊 macd_histogram: ${macdHistogramValue !== null ? macdHistogramValue.toFixed(12) : 'NULL'}`);
          console.log(`   VERIFIKATION:`);
          console.log(`   ✅ macd_signal_period er heltal: ${Number.isInteger(macdSignalPeriodValue)}`);
          console.log(`   📐 expected_histogram (line - signal): ${expectedHistogram !== null ? expectedHistogram.toFixed(12) : 'NULL'}`);
          console.log(`   ${histogramMatchesCalc ? '✅' : '❌'} histogram == macd_line - macd_signal_line: ${histogramMatchesCalc}`);
          if (!histogramMatchesCalc && macdHistogramValue !== null && expectedHistogram !== null) {
            console.log(`   🚨 HISTOGRAM MISMATCH: stored=${macdHistogramValue.toFixed(12)}, expected=${expectedHistogram.toFixed(12)}, diff=${Math.abs(macdHistogramValue - expectedHistogram)}`);
          }
          console.log(`📊 ═══════════════════════════════════════════`);


          // 🔴 DUPLET-CHECK: Undgå at oprette samme position to gange
          // Key: Symbol + Side + opened_at (timestamp afrundet til minut) + entry_price
          const openedAtNow = new Date();
          const openedAtMinute = new Date(openedAtNow);
          openedAtMinute.setSeconds(0, 0); // Afrund til nærmeste minut
          
          // Tjek for eksisterende position med samme nøgle (inden for samme minut)
          const { data: existingDuplicate } = await supabaseClient
            .from('positions')
            .select('id, symbol, side, entry_price, opened_at')
            .eq('user_id', session.user_id)
            .eq('symbol', symbol)
            .eq('side', signal)
            .gte('opened_at', openedAtMinute.toISOString())
            .lt('opened_at', new Date(openedAtMinute.getTime() + 60000).toISOString())
            .maybeSingle();
          
          if (existingDuplicate) {
            // Tjek også entry_price (inden for 0.1% tolerance)
            const priceDiff = Math.abs(existingDuplicate.entry_price - actualEntryPrice) / actualEntryPrice;
            if (priceDiff < 0.001) {
              console.log(`\n🚫 DUPLET BLOKERET: Position allerede oprettet`);
              console.log(`   Eksisterende ID: ${existingDuplicate.id}`);
              console.log(`   Symbol: ${symbol}, Side: ${signal}`);
              console.log(`   Entry: ${existingDuplicate.entry_price} (ny: ${actualEntryPrice}, diff: ${(priceDiff * 100).toFixed(4)}%)`);
              console.log(`   Opened_at: ${existingDuplicate.opened_at}`);
              continue;
            }
          }

          // Save position to database with verified Binance data and indicators
          const { data: insertedPosition, error: insertError } = await supabaseClient
            .from('positions')
            .insert({
              user_id: session.user_id,
              symbol,
              side: signal,
              entry_price: actualEntryPrice,
              quantity: actualQuantity,
              stop_loss: finalStopLoss,
              take_profit: null, // TP er fjernet, vi bruger kun trailing stop
              trailing_stop: parseFloat(initialTrailingStop.toFixed(8)),
              current_price: actualEntryPrice,
              peak_price: actualEntryPrice,
              trailing_stop_percent: parseFloat(trailingStopPercent.toFixed(2)),
              binance_order_id: orderData.orderId,
              status: 'OPEN',
              strategy_hash: strategyHash,
              open_reason: openReason,
              opened_at: openedAtNow.toISOString(),
              indicators_snapshot: comprehensiveSnapshot,
            })
            .select()
            .single();

          if (insertError) {
            console.error(`❌ DATABASE INSERT FAILED for ${symbol}:`, insertError);
            console.error(`   Position exists on Binance but not in DB!`);
            console.error(`   Order ID: ${orderData.orderId}`);
            console.error(`   Manual sync required`);
            continue;
          }
          
          // 🚨 POST-INSERT ASSERT: Verificer at ATR blev gemt korrekt
          if (insertedPosition) {
            const savedAtr = insertedPosition.indicators_snapshot?.atr;
            const savedExitType = insertedPosition.indicators_snapshot?.exit_type;
            
            if (!savedAtr || savedAtr <= 0 || !isFinite(savedAtr)) {
              console.log(`\n🚨🚨🚨 CRITICAL_ATR_NULL_OPENED 🚨🚨🚨`);
              console.log(`   Symbol: ${symbol}`);
              console.log(`   Side: ${signal}`);
              console.log(`   Entry: ${actualEntryPrice}`);
              console.log(`   Strategy: ${strategyHash}`);
              console.log(`   Position ID: ${insertedPosition.id}`);
              console.log(`   Saved ATR: ${savedAtr}`);
              console.log(`   Exit Type: ${savedExitType}`);
              console.log(`   ❌ DETTE BØR ALDRIG SKE - ATR VAR NULL VED INSERT!`);
            } else {
              console.log(`\n✅ POST-INSERT ASSERT PASSED: ATR=${savedAtr.toFixed(6)}, exit_type=${savedExitType}`);
            }
          }

          // 🛡️ RACE CONDITION GUARD: Check if we exceeded max positions after insert
          const { data: finalPositionCheck } = await supabaseClient
            .from('positions')
            .select('id')
            .eq('user_id', session.user_id)
            .eq('status', 'OPEN');
          
          if (finalPositionCheck && finalPositionCheck.length > config.max_open_positions) {
            console.log(`⚠️ RACE CONDITION DETECTED: ${finalPositionCheck.length} open positions exceed limit of ${config.max_open_positions}`);
            console.log(`   Closing newest position: ${symbol} (id: ${insertedPosition.id})`);
            
            // Mark position as closed in DB
            await supabaseClient
              .from('positions')
              .update({ 
                status: 'CLOSED', 
                close_reason: 'MAX_POSITIONS_EXCEEDED_RACE_CONDITION',
                closed_at: new Date().toISOString()
              })
              .eq('id', insertedPosition.id);
            
            // Close on Binance
            try {
              const closeResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/close-position-binance`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ positionId: insertedPosition.id }),
              });
              
              if (closeResponse.ok) {
                console.log(`✅ Excess position ${symbol} closed on Binance successfully`);
              } else {
                console.error(`❌ Failed to close excess position on Binance:`, await closeResponse.text());
              }
            } catch (closeErr) {
              console.error(`❌ Error closing excess position on Binance:`, closeErr);
            }
            
            continue;
          }

          console.log(`✅✅✅ POSITION FULLY CREATED: ${symbol}`);
          console.log(`   DB ID: ${insertedPosition.id}`);
          console.log(`   Binance Order ID: ${orderData.orderId}`);
          console.log(`   Entry: ${actualEntryPrice}`);
          console.log(`   Quantity: ${actualQuantity}`);
          console.log(`   Signal Strength: ${selectedSignal.strength.toFixed(1)}`);
          console.log(`   Open Reason: ${openReason}\n`);

          // NOTE: Removed immediate sync call to avoid race conditions
          // sync-binance-futures-positions runs on its own schedule via auto-monitor-quant
            
        } catch (error: any) {
          console.error(`\n❌❌❌ CRITICAL ERROR in order placement for ${symbol}:`);
          console.error(`   Error type: ${error.constructor.name}`);
          console.error(`   Error message: ${error.message}`);
          console.error(`   Stack trace:`, error.stack);
          console.error(`   Signal: ${signal}`);
          console.error(`   Price: ${analysis.indicators.price}`);
          console.error(`   This position may need manual intervention\n`);
        }
      } // End of signalsToTrade loop
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});