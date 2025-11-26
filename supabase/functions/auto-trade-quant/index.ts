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
  rsi_enabled: boolean;
  rsi_period: number;
  rsi_min_long: number;
  rsi_max_short: number;
  rsi_zone_width: number;
  rsi_momentum_periods: number;
  stochrsi_enabled: boolean;
  stochrsi_period: number;
  stochrsi_k_period: number;
  stochrsi_d_period: number;
  stochrsi_overbought: number;
  stochrsi_oversold: number;
  pivot_points_enabled: boolean;
  pivot_points_timeframe: string;
  pivot_points_lookback: number;
  pivot_points_near_threshold: number;
  macd_enabled: boolean;
  macd_fast: number;
  macd_slow: number;
  macd_signal: number;
  macd_histogram_threshold: number;
  macd_direction_enabled: boolean;
  histogram_momentum_enabled: boolean;
  histogram_momentum_periods: number;
  bb_enabled: boolean;
  bb_period: number;
  bb_std_dev: number;
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
  adx_enabled: boolean;
  adx_period: number;
  adx_threshold: number;
  adaptive_adx_enabled?: boolean;
  adx_base_min?: number;
  adx_floor?: number;
  adx_ceiling?: number;
  volume_enabled: boolean;
  volume_avg_period: number;
  volume_multiplier: number;
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
  higher_trend_timeframe: string;
  klines_limit: number;
}

// Calculate strategy identifier from ALL config parameters using SHA-256 hash
async function getStrategyIdentifier(config: IndicatorConfig): Promise<string> {
  // Extract all relevant strategy parameters (excluding metadata like id, user_id, timestamps, name)
  const strategyParams = {
    ema_enabled: config.ema_enabled,
    ema_fast: config.ema_fast,
    ema_medium: config.ema_medium,
    ema_slow: config.ema_slow,
    ema_medium_trend: config.ema_medium_trend,
    min_ema_spread_percent: config.min_ema_spread_percent,
    rsi_enabled: config.rsi_enabled,
    rsi_period: config.rsi_period,
    rsi_min_long: config.rsi_min_long,
    rsi_max_short: config.rsi_max_short,
    rsi_zone_width: config.rsi_zone_width,
    rsi_momentum_periods: config.rsi_momentum_periods,
    stochrsi_enabled: config.stochrsi_enabled,
    stochrsi_period: config.stochrsi_period,
    stochrsi_k_period: config.stochrsi_k_period,
    stochrsi_d_period: config.stochrsi_d_period,
    stochrsi_overbought: config.stochrsi_overbought,
    stochrsi_oversold: config.stochrsi_oversold,
    pivot_points_enabled: config.pivot_points_enabled,
    pivot_points_timeframe: config.pivot_points_timeframe,
    pivot_points_lookback: config.pivot_points_lookback,
    pivot_points_near_threshold: config.pivot_points_near_threshold,
    macd_enabled: config.macd_enabled,
    macd_fast: config.macd_fast,
    macd_slow: config.macd_slow,
    macd_signal: config.macd_signal,
    macd_histogram_threshold: config.macd_histogram_threshold,
    macd_direction_enabled: config.macd_direction_enabled,
    histogram_momentum_enabled: config.histogram_momentum_enabled,
    histogram_momentum_periods: config.histogram_momentum_periods,
    bb_enabled: config.bb_enabled,
    bb_period: config.bb_period,
    bb_std_dev: config.bb_std_dev,
    atr_enabled: config.atr_enabled,
    atr_period: config.atr_period,
    atr_stop_loss_multiplier: config.atr_stop_loss_multiplier,
    atr_take_profit_multiplier: config.atr_take_profit_multiplier,
    atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier,
    break_even_atr: config.break_even_atr,
    adx_enabled: config.adx_enabled,
    adx_period: config.adx_period,
    adx_threshold: config.adx_threshold,
    volume_enabled: config.volume_enabled,
    volume_avg_period: config.volume_avg_period,
    volume_multiplier: config.volume_multiplier,
    signal_conditions_required: config.signal_conditions_required,
    position_size_percent: config.position_size_percent,
    risk_per_trade_percent: config.risk_per_trade_percent,
    max_open_positions: config.max_open_positions,
    max_exposure_percent: config.max_exposure_percent,
    daily_loss_limit_percent: config.daily_loss_limit_percent,
    max_position_duration_minutes: config.max_position_duration_minutes,
    leverage: config.leverage,
    scan_interval: config.scan_interval,
    trend_timeframe: config.trend_timeframe,
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
  // Calculate RSI values for the period
  const rsiValues: number[] = [];
  for (let i = rsiPeriod; i < prices.length; i++) {
    const slice = prices.slice(i - rsiPeriod, i + 1);
    rsiValues.push(calculateRSI(slice, rsiPeriod));
  }
  
  if (rsiValues.length < rsiPeriod) {
    return { k: 50, d: 50 };
  }
  
  // Calculate Stochastic of RSI
  const latestRSIValues = rsiValues.slice(-rsiPeriod);
  const maxRSI = Math.max(...latestRSIValues);
  const minRSI = Math.min(...latestRSIValues);
  const currentRSI = latestRSIValues[latestRSIValues.length - 1];
  
  const stochRSI = maxRSI !== minRSI ? ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100 : 50;
  
  // For simplicity, K = StochRSI, D = SMA of K (here we use current value for both)
  // In production, you'd want to maintain a rolling buffer for proper SMA calculation
  return { k: stochRSI, d: stochRSI };
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

function calculateADX(high: number[], low: number[], close: number[], period: number): number {
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
  
  // Smooth the values
  const atr = tr.slice(-period).reduce((a, b) => a + b, 0) / period;
  const diPlus = (dmPlus.slice(-period).reduce((a, b) => a + b, 0) / period / atr) * 100;
  const diMinus = (dmMinus.slice(-period).reduce((a, b) => a + b, 0) / period / atr) * 100;
  
  // Calculate DX and ADX
  const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
  return dx;
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

async function fetchKlines(symbol: string, interval: string, limit: number) {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  
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
  
  const atr = config.atr_enabled ? calculateATR(highs, lows, closes, config.atr_period) : null;
  const bb = config.bb_enabled ? calculateBollingerBands(closes, config.bb_period, config.bb_std_dev) : null;
  
  // ADX beregnes på TREND timeframe, ikke scan interval
  const trendHighs = trendKlines.map(k => k.high);
  const trendLows = trendKlines.map(k => k.low);
  const trendCloses = trendKlines.map(k => k.close);
  const adx = config.adx_enabled ? calculateADX(trendHighs, trendLows, trendCloses, config.adx_period) : null;
  
  const avgVolume = config.volume_enabled
    ? volumes.slice(-config.volume_avg_period).reduce((a, b) => a + b, 0) / config.volume_avg_period
    : null;
  const currentVolume = config.volume_enabled ? volumes[volumes.length - 1] : null;
  
  // ════════════════════════════════════════════════════════════════
  // 📋 EVALUERING AF ALLE FILTRE (HÅRDE + BLØDE)
  // ════════════════════════════════════════════════════════════════
  
  const filterStatus = {
    hard: {
      emaSpread: { passed: true, value: '', reason: '' },
      atr: { passed: true, value: '', reason: '' },
      adx: { passed: true, value: '', reason: '' },
      volume: { passed: true, value: '', reason: '' },
      macdDirection: { passed: true, long: false, short: false, reason: '' },
      rsiMomentum: { passed: true, long: false, short: false, reason: '' },
    },
    soft: {
      emaAlignment: { long: false, short: false },
      macd: { long: false, short: false },
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
    
    if (emaSpreadPercent < config.min_ema_spread_percent) {
      filterStatus.hard.emaSpread.passed = false;
      filterStatus.hard.emaSpread.reason = `${emaSpreadPercent.toFixed(3)}% < ${config.min_ema_spread_percent}% (sidelæns marked)`;
    }
  }
  
  // 2️⃣ ATR (med adaptive threshold)
  if (config.atr_enabled && atr !== null) {
    filterStatus.hard.atr.value = atr.toFixed(6);
    
    if (atr === 0) {
      filterStatus.hard.atr.passed = false;
      filterStatus.hard.atr.reason = 'ATR = 0 (kan ikke beregne stop-loss)';
    }
    
    // Check absolut ATR minimum
    if (config.min_atr > 0 && atr < config.min_atr) {
      filterStatus.hard.atr.passed = false;
      filterStatus.hard.atr.reason = `ATR ${atr.toFixed(6)} < ${config.min_atr.toFixed(6)} (lav volatilitet)`;
    }
    
    // Check ATR som procent af pris med ADAPTIVE threshold
    if (config.min_atr_percent > 0) {
      const atrPercent = (atr / currentPrice) * 100;
      
      // Beregn adaptive ATR threshold KUN hvis enabled
      let dynamicMinATR = config.min_atr_percent; // Fallback til standard
      
      if (config.adaptive_atr_enabled && config.atr_base_min && config.atr_floor && config.atr_ceiling && currentVolume !== null && avgVolume !== null && avgVolume > 0) {
        const volumeRatio = currentVolume / avgVolume;
        dynamicMinATR = config.atr_base_min * volumeRatio;
        
        // Anvend floor og ceiling
        if (dynamicMinATR < config.atr_floor) dynamicMinATR = config.atr_floor;
        if (dynamicMinATR > config.atr_ceiling) dynamicMinATR = config.atr_ceiling;
        
        console.log(`   🔄 Adaptive ATR%: Base=${config.atr_base_min}% × Volume(${volumeRatio.toFixed(2)}) = ${dynamicMinATR.toFixed(3)}% (floor=${config.atr_floor}%, ceiling=${config.atr_ceiling}%)`);
      }
      
      console.log(`   📊 ATR%: ${atrPercent.toFixed(3)}% (dynamisk min: ${dynamicMinATR.toFixed(3)}%)`);
      
      if (atrPercent < dynamicMinATR) {
        filterStatus.hard.atr.passed = false;
        filterStatus.hard.atr.reason = `ATR% ${atrPercent.toFixed(3)}% < ${dynamicMinATR.toFixed(3)}% (adaptive threshold)`;
        console.log(`   ❌ ATR% blokerer: ${atrPercent.toFixed(3)}% < ${dynamicMinATR.toFixed(3)}%`);
      }
    }
  }
  
  // 3️⃣ ADX (med adaptive threshold)
  if (config.adx_enabled && adx !== null) {
    filterStatus.hard.adx.value = adx.toFixed(2);
    
    // Beregn adaptive ADX threshold KUN hvis enabled
    let dynamicMinADX = config.adx_threshold; // Fallback til standard
    
    if (config.adaptive_adx_enabled && config.adx_base_min && config.adx_floor && config.adx_ceiling && atr !== null) {
      // Beregn nuværende og gennemsnitlig ATR%
      const currentATRPercent = (atr / currentPrice) * 100;
      
      // For gennemsnitlig ATR%, brug de sidste N perioder
      const atrPeriod = config.atr_period || 14;
      let avgATRPercent = currentATRPercent; // Fallback
      
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
        
        // Anvend floor og ceiling
        if (dynamicMinADX < config.adx_floor) dynamicMinADX = config.adx_floor;
        if (dynamicMinADX > config.adx_ceiling) dynamicMinADX = config.adx_ceiling;
        
        console.log(`   🔄 Adaptive ADX: Base=${config.adx_base_min} × ATR%(${atrRatio.toFixed(2)}) = ${dynamicMinADX.toFixed(2)} (floor=${config.adx_floor}, ceiling=${config.adx_ceiling})`);
      }
    }
    
    if (adx < dynamicMinADX) {
      filterStatus.hard.adx.passed = false;
      filterStatus.hard.adx.reason = `${adx.toFixed(2)} < ${dynamicMinADX.toFixed(2)} (adaptive threshold)`;
    }
  }
  
  // 4️⃣ VOLUME
  if (config.volume_enabled && currentVolume !== null && avgVolume !== null && avgVolume > 0) {
    const volumeRatio = currentVolume / avgVolume;
    const requiredVolume = avgVolume * config.volume_multiplier;
    filterStatus.hard.volume.value = `${volumeRatio.toFixed(2)}x (${(volumeRatio * 100).toFixed(0)}%)`;
    
    // Log volume check detaljeret
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
      console.log(`      ✅ OPFYLDT: ${volumeRatio.toFixed(2)}x >= ${config.volume_multiplier}x`);
    }
  }
  
  // 5️⃣ MACD RETNINGS-FILTER (HÅRDT FILTER - blokerer trades mod MACD retning)
  // ⚠️ VIGTIGT: Dette er et RETNINGS-SPECIFIKT filter og evalueres IKKE i hardFiltersPass
  // Det blokerer kun i longSignal/shortSignal baseret på retning
  let macdLongOK = true;
  let macdShortOK = true;
  
  if (config.macd_direction_enabled) {
    // 🚨 KRITISK FIX: Tjek kun om MACD er tilgængelig, ikke om MACD indicator er enabled
    // Hvis direction filter er enabled MEN MACD værdi mangler, bloker ALT for sikkerhed
    if (config.macd_enabled && macd && macd.macd !== null) {
      // 🚨 HÅRDT RETNINGSFILTER:
      // LONG blokeres ALTID når MACD ≤ 0 (bearish)
      // SHORT blokeres ALTID når MACD ≥ 0 (bullish)
      macdLongOK = macd.macd > 0;  // LONG kun tilladt når MACD er positiv
      macdShortOK = macd.macd < 0; // SHORT kun tilladt når MACD er negativ
      
      filterStatus.hard.macdDirection.long = macdLongOK;
      filterStatus.hard.macdDirection.short = macdShortOK;
      
      if (!macdLongOK && !macdShortOK) {
        // Dette sker kun ved MACD nøjagtigt = 0 (ekstremt sjældent)
        filterStatus.hard.macdDirection.reason = `MACD præcis på nul-linjen ${macd.macd.toFixed(6)}`;
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
    // Filter er deaktiveret - alle retninger tilladt
    filterStatus.hard.macdDirection.long = true;
    filterStatus.hard.macdDirection.short = true;
  }
  
  // 6️⃣ RSI MOMENTUM (Hård regel)
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
    pivotPoints: { enabled: config.pivot_points_enabled, long: null, short: null }
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
  
  // StochRSI (hvis enabled)
  if (config.stochrsi_enabled && stochRSI) {
    // LONG: StochRSI under oversold niveau
    const stochRSILong = stochRSI.k < config.stochrsi_oversold;
    longConditions.push(stochRSILong);
    conditionDetails.stochRSI.long = stochRSILong;
    
    // SHORT: StochRSI over overbought niveau
    const stochRSIShort = stochRSI.k > config.stochrsi_overbought;
    shortConditions.push(stochRSIShort);
    conditionDetails.stochRSI.short = stochRSIShort;
  }
  
  // MACD Histogram (hvis enabled)
  if (config.macd_enabled && macd && macdPrevious) {
    // LONG: Histogram skifter fra rød til grøn
    const macdColorChangeToGreen = macd.histogram > config.macd_histogram_threshold && macdPrevious.histogram <= config.macd_histogram_threshold;
    longConditions.push(macdColorChangeToGreen);
    conditionDetails.macd.long = macdColorChangeToGreen;
    
    // SHORT: Histogram skifter fra grøn til rød
    const macdColorChangeToRed = macd.histogram < -config.macd_histogram_threshold && macdPrevious.histogram >= -config.macd_histogram_threshold;
    shortConditions.push(macdColorChangeToRed);
    conditionDetails.macd.short = macdColorChangeToRed;
  }

  // Histogram Momentum Shift (hvis enabled) - BLØD INDIKATOR
  if (config.histogram_momentum_enabled && closes.length >= config.histogram_momentum_periods + 2) {
    const histograms: number[] = [];
    for (let i = 0; i < config.histogram_momentum_periods + 1; i++) {
      const idx = closes.length - 1 - i;
      if (idx >= 0) {
        const m = calculateMACD(closes.slice(0, idx + 1), config.macd_fast, config.macd_slow, config.macd_signal);
        histograms.unshift(m.histogram);
      }
    }
    
    if (histograms.length >= 3) {
      // Beregn momentum (ændringshastighed) i histogrammet
      const currentMomentum = histograms[histograms.length - 1] - histograms[histograms.length - 2];
      const previousMomentum = histograms[histograms.length - 2] - histograms[histograms.length - 3];
      
      // LONG: Momentum skifter til opad (accelererende grøn eller decelererende rød)
      const momentumShiftUp = currentMomentum > previousMomentum && currentMomentum > 0;
      longConditions.push(momentumShiftUp);
      
      // SHORT: Momentum skifter til nedad (accelererende rød eller decelererende grøn)
      const momentumShiftDown = currentMomentum < previousMomentum && currentMomentum < 0;
      shortConditions.push(momentumShiftDown);
      
      console.log(`   📊 Histogram Momentum: Long: ${momentumShiftUp ? '✅' : '❌'} Short: ${momentumShiftDown ? '✅' : '❌'} - Current: ${currentMomentum.toFixed(6)}, Previous: ${previousMomentum.toFixed(6)}`);
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
  
  // Volume (hvis enabled)
  if (config.volume_enabled && currentVolume !== null && avgVolume !== null) {
    const highVolume = currentVolume > avgVolume;
    longConditions.push(highVolume);
    shortConditions.push(highVolume);
    conditionDetails.volume.long = highVolume;
    conditionDetails.volume.short = highVolume;
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
  
  const requiredConditions = config.signal_conditions_required;
  const longConditionsMet = longConditions.filter(c => c).length;
  const shortConditionsMet = shortConditions.filter(c => c).length;

  // 🚨 FINAL SIGNAL BESLUTNING - Bløde betingelser + MACD retningsfilter
  // MACD retningsfilter blokerer ALLE trades i forkert retning (evalueret FØR bløde betingelser)
  const longSignal = longConditionsMet >= requiredConditions && macdLongOK; // LONG blokeres hvis MACD ≤ 0
  const shortSignal = shortConditionsMet >= requiredConditions && macdShortOK; // SHORT blokeres hvis MACD ≥ 0
  
  // Calculate conditions met for signal strength
  const conditionsMet = Math.max(longConditionsMet, shortConditionsMet);
  
  // ═══════════════════════════════════════════════
  // 🚫 CHECK: BLOKERER HÅRDE FILTRE?
  // ═══════════════════════════════════════════════
  
  // Kun check enabled filters (MACD retning evalueres IKKE her - den er retnings-specifik)
  const hardFiltersPass = 
    (!config.ema_enabled || filterStatus.hard.emaSpread.passed) &&
    (!config.atr_enabled || filterStatus.hard.atr.passed) &&
    (!config.adx_enabled || filterStatus.hard.adx.passed) &&
    (!config.volume_enabled || filterStatus.hard.volume.passed) &&
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
    console.log(`📉 StochRSI:`);
    console.log(`   K Value: ${stochRSI.k.toFixed(2)}, D Value: ${stochRSI.d.toFixed(2)}`);
    console.log(`   LONG threshold (oversolgt): < ${config.stochrsi_oversold}`);
    console.log(`   SHORT threshold (overkøbt): > ${config.stochrsi_overbought}`);
    console.log(`   LONG (${stochRSI.k.toFixed(2)} < ${config.stochrsi_oversold}): ${conditionDetails.stochRSI.long ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`   SHORT (${stochRSI.k.toFixed(2)} > ${config.stochrsi_overbought}): ${conditionDetails.stochRSI.short ? '✅ TRUE' : '❌ FALSE'}\n`);
  } else {
    console.log(`📉 StochRSI: ⚪ DISABLED\n`);
  }
  
  // MACD DETALJERET
  if (config.macd_enabled && macd && macdPrevious) {
    console.log(`📈 MACD:`);
    console.log(`   MACD Line: ${macd.macd.toFixed(6)} (${macd.macd > 0 ? 'BULLISH ✅' : 'BEARISH ❌'})`);
    console.log(`   Signal Line: ${macd.signal.toFixed(6)}`);
    console.log(`   Current Histogram: ${macd.histogram.toFixed(6)}`);
    console.log(`   Previous Histogram: ${macdPrevious.histogram.toFixed(6)}`);
    console.log(`   Threshold: ${config.macd_histogram_threshold}`);
    
    if (config.macd_direction_enabled) {
      console.log(`   🔴 HÅRDT RETNINGSFILTER (evalueret FØR bløde betingelser):`);
      console.log(`      ⛔ BLOKER LONG når MACD ≤ 0 → Status: ${macd.macd > 0 ? '✅ LONG TILLADT' : '❌ LONG BLOKERET'} (MACD = ${macd.macd.toFixed(6)})`);
      console.log(`      ⛔ BLOKER SHORT når MACD ≥ 0 → Status: ${macd.macd < 0 ? '✅ SHORT TILLADT' : '❌ SHORT BLOKERET'} (MACD = ${macd.macd.toFixed(6)})`);
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
  
  // FINAL RESULTAT
  console.log(`═══════════════════════════════════════════`);
  console.log(`🎯 FINAL RESULTAT:`);
  console.log(`   LONG: ${longConditionsMet}/${longConditions.length} betingelser opfyldt (kræver ${requiredConditions})`);
  console.log(`   SHORT: ${shortConditionsMet}/${shortConditions.length} betingelser opfyldt (kræver ${requiredConditions})`);
  console.log(`   SIGNAL: ${longSignal ? '🟢 LONG SIGNAL' : shortSignal ? '🔴 SHORT SIGNAL' : '⚪ INGEN SIGNAL'}`);
  console.log(`═══════════════════════════════════════════\n`);
  
  // Calculate stop loss using ATR (fallback to 1% if ATR disabled)
  const atrValue = atr || (currentPrice * 0.01);
  
  const indicators = {
    price: currentPrice,
    emaFast: emaFastCurrent,
    emaMedium: emaMediumCurrent,
    emaSlow: emaSlowCurrent,
    emaSpreadPercent: emaSpreadPercent, // 🔴 TILFØJET: Nødvendig for hard filter display i LiveMonitor
    rsi: rsiCurrent,
    stochRSI_k: stochRSI?.k ?? null,
    stochRSI_d: stochRSI?.d ?? null,
    macd: macd?.histogram ?? null,
    macdLine: macd?.macd ?? null,
    macdSignal: macd?.signal ?? null,
    atr: atr,
    bb,
    adx,
    volume: currentVolume,
    avgVolume,
    volumeRatio: currentVolume && avgVolume ? currentVolume / avgVolume : null,
    pivotPoints,
    conditionsMet,
    // Tilføj condition details for historisk analyse
    conditionDetails: {
      ...conditionDetails,
      longConditionsMet,
      shortConditionsMet,
      requiredConditions
    }
  };
  
  console.log(`Indicators being saved: stochRSI_k=${indicators.stochRSI_k}, rsi=${indicators.rsi}, macd=${indicators.macd}, conditionsMet=${conditionsMet}`);
  
  return {
    signal: longSignal ? 'LONG' : shortSignal ? 'SHORT' : 'NONE',
    indicators,
    stopLoss: longSignal 
      ? currentPrice - (atrValue * config.atr_stop_loss_multiplier) // LONG: SL below entry
      : currentPrice + (atrValue * config.atr_stop_loss_multiplier), // SHORT: SL above entry
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

  return await response.json();
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
          // Fetch klines for scan interval, trend timeframe, and higher trend timeframe
          const scanKlines = await fetchKlines(symbol, config.scan_interval, config.klines_limit);
          const trendKlines = await fetchKlines(symbol, config.trend_timeframe, config.klines_limit);
          const higherTrendKlines = await fetchKlines(symbol, config.higher_trend_timeframe, config.klines_limit);
          
          // Determine trend on both timeframes
          const trend = analyzeMediumTrend(trendKlines, config);
          const higherTrend = analyzeHigherTrend(higherTrendKlines, config);
          
          // Analyze signal on scan interval (men ADX beregnes på trend timeframe)
          const analysis = analyzeSignal(scanKlines, trendKlines, config);
          
          // Filter signal based on BOTH trend timeframes
          // BEGGE trends skal godkende handlen - ellers blokeres den
          let filteredSignal = analysis.signal;
          
          if (filteredSignal === 'LONG') {
            // LONG kræver BULLISH på begge timeframes
            if (higherTrend !== 'BULLISH') {
              filteredSignal = 'NONE';
              console.log(`Blocked LONG on ${symbol}: Higher trend (${config.higher_trend_timeframe}) not BULLISH (is ${higherTrend})`);
            } else if (trend !== 'BULLISH') {
              filteredSignal = 'NONE';
              console.log(`Blocked LONG on ${symbol}: Medium trend (${config.trend_timeframe}) not BULLISH (is ${trend})`);
            }
          } else if (filteredSignal === 'SHORT') {
            // SHORT kræver BEARISH på begge timeframes
            if (higherTrend !== 'BEARISH') {
              filteredSignal = 'NONE';
              console.log(`Blocked SHORT on ${symbol}: Higher trend (${config.higher_trend_timeframe}) not BEARISH (is ${higherTrend})`);
            } else if (trend !== 'BEARISH') {
              filteredSignal = 'NONE';
              console.log(`Blocked SHORT on ${symbol}: Medium trend (${config.trend_timeframe}) not BEARISH (is ${trend})`);
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
      
      // 📈 STEP 4: Tag top 3x slots, filtrer for hårde filtre + MACD retning, derefter vælg top slots
      const topCandidates = validSignals.slice(0, Math.min(slotsAvailable * 3, validSignals.length));
      const signalsToTrade = topCandidates
        .filter(s => s.hardFiltersPassed && s.signal !== 'NONE') // KRITISK: Bloker NONE signaler (MACD retningsfilter)
        .slice(0, slotsAvailable);
      
      console.log(`\n📊 Efter hård filtrering: ${signalsToTrade.length}/${topCandidates.length} top signaler passerede hårde filtre`);
      
      if (signalsToTrade.length === 0) {
        console.log(`⚠️ Ingen signaler at handle eller ingen ledige positioner`);
        continue;
      }
      
      console.log(`\n📈 Handler de ${signalsToTrade.length} stærkeste signaler:`);
      
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
          
          // FINAL MACD RETNINGSCHECK FØR ORDER (ekstra sikkerhed)
          // 🔴 KRITISK: Checker ALTID når macd_direction_enabled=true, uanset om MACD er aktiveret
          if (config.macd_direction_enabled) {
            const macdLine = analysis.indicators.macdLine;
            if (macdLine !== null && macdLine !== undefined) {
              if (signal === 'LONG' && macdLine <= 0) {
                console.log(`🚨 BLOKERET: LONG for ${symbol} med MACD=${macdLine.toFixed(4)} ≤ 0`);
                continue;
              }
              if (signal === 'SHORT' && macdLine >= 0) {
                console.log(`🚨 BLOKERET: SHORT for ${symbol} med MACD=${macdLine.toFixed(4)} ≥ 0`);
                continue;
              }
            } else if (config.macd_enabled) {
              // MACD direction filter er aktiveret men MACD værdi mangler - bloker for sikkerhed
              console.log(`🚨 BLOKERET: ${signal} for ${symbol} - MACD direction filter aktiveret men ingen MACD værdi`);
              continue;
            }
          }
          
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
          
          // Calculate trailing stop from ATR and config
          const atrValue = analysis.indicators.atr || (analysis.indicators.price * 0.01); // Fallback til 1% hvis ATR disabled
          const trailingStopDistance = atrValue * config.atr_trailing_stop_multiplier;
          const trailingStopPercent = (trailingStopDistance / analysis.indicators.price) * 100;
          
          console.log(`🎯 Trailing stop calculation: ATR=${atrValue.toFixed(6)}, Distance=${trailingStopDistance.toFixed(6)}, Percent=${trailingStopPercent.toFixed(2)}%`);
          
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
          
          // Save position to database with verified Binance data and indicators
          const { data: insertedPosition, error: insertError } = await supabaseClient
            .from('positions')
            .insert({
              user_id: session.user_id,
              symbol,
              side: signal,
              entry_price: actualEntryPrice,
              quantity: actualQuantity,
              stop_loss: analysis.stopLoss,
              take_profit: null, // TP er fjernet, vi bruger kun trailing stop
              trailing_stop: parseFloat(initialTrailingStop.toFixed(8)),
              current_price: actualEntryPrice,
              peak_price: actualEntryPrice,
              trailing_stop_percent: parseFloat(trailingStopPercent.toFixed(2)),
              binance_order_id: orderData.orderId,
              status: 'OPEN',
              strategy_hash: strategyHash,
              open_reason: openReason,
              indicators_snapshot: {
                ...config,
                ...analysis.indicators,
                signalStrength: selectedSignal.strength,
              },
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

          // Immediately sync with Binance so DB matches source of truth
          await supabaseClient.functions.invoke('sync-binance-futures-positions');
            
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