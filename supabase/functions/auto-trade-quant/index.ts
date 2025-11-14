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
  bb_enabled: boolean;
  bb_period: number;
  bb_std_dev: number;
  atr_enabled: boolean;
  atr_period: number;
  atr_stop_loss_multiplier: number;
  atr_take_profit_multiplier: number;
  atr_trailing_stop_multiplier: number;
  break_even_atr: number;
  adx_enabled: boolean;
  adx_period: number;
  adx_threshold: number;
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

// Calculate strategy hash from config
async function calculateStrategyHash(config: IndicatorConfig): Promise<string> {
  // Create a stable string representation of ALL config values (excluding id, user_id, name, created_at, updated_at, enabled)
  const configStr = JSON.stringify({
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
  });
  
  const msgUint8 = new TextEncoder().encode(configStr);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
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

// Determine trend direction from higher timeframe using MACD histogram
function analyzeHigherTrend(klines: any[], config: IndicatorConfig): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const closes = klines.map(k => k.close);
  
  // Calculate MACD using config values
  const macd = calculateMACD(closes, config.macd_fast, config.macd_slow, config.macd_signal);
  
  // Trend filter: MACD histogram
  // LONG kun hvis histogram > 0 (grøn)
  // SHORT kun hvis histogram < 0 (rød)
  if (macd.histogram > 0) return 'BULLISH';
  if (macd.histogram < 0) return 'BEARISH';
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
  
  // BEREGN ALLE INDICATORS FØRST (så de kan vises i UI selv når filtre fejler)
  const emaFast = config.ema_enabled ? calculateEMA(closes, config.ema_fast) : null;
  const emaMedium = config.ema_enabled ? calculateEMA(closes, config.ema_medium) : null;
  const emaSlow = config.ema_enabled ? calculateEMA(closes, config.ema_slow) : null;
  const emaFastCurrent = emaFast ? emaFast[emaFast.length - 1] : null;
  const emaMediumCurrent = emaMedium ? emaMedium[emaMedium.length - 1] : null;
  const emaSlowCurrent = emaSlow ? emaSlow[emaSlow.length - 1] : null;
  
  const rsiCurrent = config.rsi_enabled ? calculateRSI(closes, config.rsi_period) : null;
  const rsiPrevious = config.rsi_enabled ? calculateRSI(closes.slice(0, -1), config.rsi_period) : null;
  
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
  // 🚫 HÅRDE FILTRE - BLOKERER TRADE FØR SIGNAL EVALUERING
  // ════════════════════════════════════════════════════════════════
  
  console.log(`\n🚫 HÅRDE FILTRE CHECK (blokerer trade før signal evaluering):`);
  
  // HÅRDT EMA SPREAD FILTER
  if (config.ema_enabled && emaFastCurrent !== null && emaSlowCurrent !== null) {
    const emaSpread = Math.abs(emaFastCurrent - emaSlowCurrent);
    const emaSpreadPercent = (emaSpread / currentPrice) * 100;
    console.log(`   📏 EMA Spread: ${emaSpreadPercent.toFixed(3)}% (min ${config.min_ema_spread_percent}%)`);
    
    if (emaSpreadPercent < config.min_ema_spread_percent) {
      console.log(`   ❌ BLOKERET - EMA SPREAD FOR LAV`);
      console.log(`   ⛔ Sidelæns marked - INGEN TRADE EVALUERING\n`);
      return {
        signal: 'NONE',
        indicators: {
          price: currentPrice,
          emaFast: emaFastCurrent,
          emaMedium: emaMediumCurrent,
          emaSlow: emaSlowCurrent,
          emaSpreadPercent,
          rsi: rsiCurrent,
          stochRSI_k: stochRSI?.k || null,
          stochRSI_d: stochRSI?.d || null,
          macd: macd?.histogram || null,
          macdLine: macd?.macd || null,
          macdSignal: macd?.signal || null,
          atr: atr,
          bb,
          adx,
          volume: currentVolume,
          avgVolume,
          volumeRatio: currentVolume && avgVolume ? currentVolume / avgVolume : null,
          pivotPoints: null,
        },
        stopLoss: 0,
        takeProfit: null,
      };
    }
    console.log(`   ✅ EMA Spread OK`);
  } else {
    console.log(`   ⚪ EMA Spread: DISABLED`);
  }
  
  
  // HÅRDT ATR FILTER
  if (config.atr_enabled && atr !== null) {
    console.log(`   📊 ATR: ${atr.toFixed(6)}`);
    if (atr === 0) {
      console.log(`   ❌ BLOKERET - ATR = 0`);
      console.log(`   ⛔ Stop-loss kan ikke beregnes - INGEN TRADE EVALUERING\n`);
      return {
        signal: 'NONE',
        indicators: {
          price: closes[closes.length - 1],
          atr: 0,
          emaFast: emaFastCurrent,
          emaMedium: emaMediumCurrent,
          emaSlow: emaSlowCurrent,
          rsi: rsiCurrent,
          stochRSI_k: stochRSI?.k || null,
          stochRSI_d: stochRSI?.d || null,
          macd: macd?.histogram || null,
          macdLine: macd?.macd || null,
          macdSignal: macd?.signal || null,
          bb,
          adx,
          volume: currentVolume,
          avgVolume,
          volumeRatio: currentVolume && avgVolume ? currentVolume / avgVolume : null,
          pivotPoints: null,
        },
        stopLoss: 0,
        takeProfit: null,
      };
    }
    console.log(`   ✅ ATR OK`);
  } else {
    console.log(`   ⚪ ATR: DISABLED`);
  }
  
  
  // HÅRDT ADX FILTER
  if (config.adx_enabled && adx !== null) {
    console.log(`   📈 ADX: ${adx.toFixed(2)} (min ${config.adx_threshold})`);
    if (adx < config.adx_threshold) {
      console.log(`   ❌ BLOKERET - ADX UNDER THRESHOLD`);
      console.log(`   ⛔ Trend ikke stærk nok - INGEN TRADE EVALUERING\n`);
      return {
        signal: 'NONE',
        indicators: {
          price: closes[closes.length - 1],
          adx,
          emaFast: emaFastCurrent,
          emaMedium: emaMediumCurrent,
          emaSlow: emaSlowCurrent,
          rsi: rsiCurrent,
          stochRSI_k: stochRSI?.k || null,
          stochRSI_d: stochRSI?.d || null,
          macd: macd?.histogram || null,
          macdLine: macd?.macd || null,
          macdSignal: macd?.signal || null,
          atr: atr,
          bb,
          volume: currentVolume,
          avgVolume,
          volumeRatio: currentVolume && avgVolume ? currentVolume / avgVolume : null,
          pivotPoints: null,
        },
        stopLoss: 0,
        takeProfit: null,
      };
    }
    console.log(`   ✅ ADX OK`);
  } else {
    console.log(`   ⚪ ADX: DISABLED`);
  }
  
  
  // HÅRDT VOLUMEN FILTER
  if (config.volume_enabled && currentVolume !== null && avgVolume !== null) {
    const requiredVolume = avgVolume * config.volume_multiplier;
    const volumeRatio = currentVolume / avgVolume;
    console.log(`   🔊 Volume: ${currentVolume.toFixed(2)} / Required: ${requiredVolume.toFixed(2)} (${volumeRatio.toFixed(2)}x)`);
    if (currentVolume < requiredVolume) {
      console.log(`   ❌ BLOKERET - VOLUME FOR LAV`);
      console.log(`   ⛔ Ikke nok aktivitet - INGEN TRADE EVALUERING\n`);
      return {
        signal: 'NONE',
        indicators: {
          price: closes[closes.length - 1],
          volume: currentVolume,
          avgVolume,
          volumeRatio: currentVolume / avgVolume,
          emaFast: emaFastCurrent,
          emaMedium: emaMediumCurrent,
          emaSlow: emaSlowCurrent,
          rsi: rsiCurrent,
          stochRSI_k: stochRSI?.k || null,
          stochRSI_d: stochRSI?.d || null,
          macd: macd?.histogram || null,
          macdLine: macd?.macd || null,
          macdSignal: macd?.signal || null,
          atr: atr,
          bb,
          adx,
          pivotPoints: null,
        },
        stopLoss: 0,
        takeProfit: null,
      };
    }
    console.log(`   ✅ Volume OK`);
  } else {
    console.log(`   ⚪ Volume: DISABLED`);
  }
  
  console.log(`✅ ALLE HÅRDE FILTRE PASSERET - Fortsætter til signal evaluering\n`);
  
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
  
  // RSI Overbought/Oversold (hvis enabled)
  if (config.rsi_enabled && rsiCurrent !== null) {
    // LONG: RSI er oversolgt (under threshold) - køb lavt
    const rsiOversoldLong = rsiCurrent < config.rsi_min_long;
    longConditions.push(rsiOversoldLong);
    conditionDetails.rsi.long = rsiOversoldLong;
    
    // SHORT: RSI er overkøbt (over threshold) - sælg højt
    const rsiOverboughtShort = rsiCurrent > config.rsi_max_short;
    shortConditions.push(rsiOverboughtShort);
    conditionDetails.rsi.short = rsiOverboughtShort;
  }
  
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
  const longSignal = longConditions.filter(c => c).length >= requiredConditions;
  const shortSignal = shortConditions.filter(c => c).length >= requiredConditions;
  
  // Calculate conditions met for signal strength
  const longConditionsMet = longConditions.filter(c => c).length;
  const shortConditionsMet = shortConditions.filter(c => c).length;
  const conditionsMet = Math.max(longConditionsMet, shortConditionsMet);
  
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
  
  // RSI DETALJERET
  if (config.rsi_enabled && rsiCurrent !== null) {
    console.log(`📊 RSI:`);
    console.log(`   Current Value: ${rsiCurrent.toFixed(2)}`);
    console.log(`   LONG threshold (oversolgt): < ${config.rsi_min_long}`);
    console.log(`   SHORT threshold (overkøbt): > ${config.rsi_max_short}`);
    console.log(`   LONG (${rsiCurrent.toFixed(2)} < ${config.rsi_min_long}): ${conditionDetails.rsi.long ? '✅ TRUE' : '❌ FALSE'}`);
    console.log(`   SHORT (${rsiCurrent.toFixed(2)} > ${config.rsi_max_short}): ${conditionDetails.rsi.short ? '✅ TRUE' : '❌ FALSE'}\n`);
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
    console.log(`   Current Histogram: ${macd.histogram.toFixed(6)}`);
    console.log(`   Previous Histogram: ${macdPrevious.histogram.toFixed(6)}`);
    console.log(`   Threshold: ${config.macd_histogram_threshold}`);
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
    rsi: rsiCurrent,
    stochRSI_k: stochRSI?.k || null,
    stochRSI_d: stochRSI?.d || null,
    macd: macd?.histogram || null,
    macdLine: macd?.macd || null,
    macdSignal: macd?.signal || null,
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
      ? currentPrice - (atrValue * config.atr_stop_loss_multiplier)
      : currentPrice + (atrValue * config.atr_stop_loss_multiplier),
    takeProfit: null, // Kun trailing stop bruges til profit
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

      // Calculate strategy hash for this config
      const strategyHash = await calculateStrategyHash(config);

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
      console.log(`Scanning ${symbols.length} USDC pairs for user ${session.user_id}`);
      
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
              trend: trend, // Include trend info
              scan_interval: config.scan_interval,
              trend_timeframe: config.trend_timeframe,
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

          // If there's a signal and we have capacity, place order
          if (filteredSignal !== 'NONE') {
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
            
            try {
              // Get account balance
              const balance = await getAccountBalance();
              console.log(`Balance for ${symbol}: ${balance} USDC`);
              
              // Log config values
              console.log(`Config - risk_per_trade: ${config.risk_per_trade_percent}%, position_size: ${config.position_size_percent}%, leverage: ${config.leverage}x`);
              
              // Calculate position size using BOTH methods, take the smaller
              // Method 1: Risk-based (current logic)
              const riskAmount = balance * (config.risk_per_trade_percent / 100);
              const stopLossDistance = Math.abs(analysis.indicators.price - analysis.stopLoss);
              const riskBasedQuantity = (riskAmount / stopLossDistance) * config.leverage;
              console.log(`Risk-based: riskAmount=${riskAmount}, stopLossDistance=${stopLossDistance}, quantity=${riskBasedQuantity}`);
              
              // Method 2: Direct percentage of balance
              const directPositionValue = balance * (config.position_size_percent / 100);
              const directQuantity = (directPositionValue / analysis.indicators.price) * config.leverage;
              console.log(`Direct: positionValue=${directPositionValue}, price=${analysis.indicators.price}, quantity=${directQuantity}`);
              
              // Use the SMALLER of the two (more conservative)
              const rawQuantity = Math.min(riskBasedQuantity, directQuantity);
              console.log(`Raw quantity (min of both methods): ${rawQuantity}`);

              // Apply Binance filters (minQty/stepSize and pricing tick)
              const filters = symbolFilters[symbol];
              if (!filters) {
                console.log(`Missing filters for ${symbol}, skipping.`);
                continue;
              }
              const qtyPrecision = getPrecisionFromStep(filters.stepSize);
              const pricePrecision = getPrecisionFromStep(filters.tickSize);

              const step = filters.stepSize;
              const quantityRounded = Math.floor(rawQuantity / step) * step;

              if (!isFinite(quantityRounded) || quantityRounded <= 0 || quantityRounded < filters.minQty) {
                console.log(`Skip ${symbol}: qty ${quantityRounded} below min ${filters.minQty}`);
                continue;
              }
              
              // Place order
              const side = analysis.signal === 'LONG' ? 'BUY' : 'SELL';
              const orderData = await placeOrder(
                symbol,
                side,
                quantityRounded,
                analysis.stopLoss,
                analysis.takeProfit,
                qtyPrecision,
                pricePrecision,
                config.leverage
              );
              
              console.log(`Order placed: ${symbol} ${side} ${quantityRounded} @ ${analysis.indicators.price}`);
              
              // Wait a moment for Binance to process the order
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Verify position is actually open on Binance
              const binancePosition = await verifyPositionOnBinance(symbol);
              
              if (!binancePosition) {
                console.error(`Failed to verify position ${symbol} on Binance - skipping database insert`);
                continue;
              }
              
              console.log(`Position verified on Binance: ${symbol} - Qty: ${binancePosition.positionAmt}, Entry: ${binancePosition.entryPrice}`);
              
              // Build open reason description
              const openReasonParts = [];
              if (analysis.indicators.rsi) openReasonParts.push(`RSI: ${analysis.indicators.rsi.toFixed(2)}`);
              if (analysis.indicators.macd) openReasonParts.push(`MACD: ${analysis.indicators.macd.toFixed(4)}`);
              if (analysis.indicators.emaFast && analysis.indicators.emaSlow) {
                openReasonParts.push(`EMA: Fast ${analysis.indicators.emaFast.toFixed(2)} vs Slow ${analysis.indicators.emaSlow.toFixed(2)}`);
              }
              if (analysis.indicators.adx) openReasonParts.push(`ADX: ${analysis.indicators.adx.toFixed(2)}`);
              const openReason = `${analysis.signal} signal på ${symbol} - Trend: ${trend}. ${openReasonParts.join(', ')}`;
              
              // Calculate trailing stop from ATR and config
              const atrValue = analysis.indicators.atr || (analysis.indicators.price * 0.01); // Fallback til 1% hvis ATR disabled
              const trailingStopDistance = atrValue * config.atr_trailing_stop_multiplier;
              const trailingStopPercent = (trailingStopDistance / analysis.indicators.price) * 100;
              
              // Use actual values from Binance for database insert
              const actualEntryPrice = parseFloat(binancePosition.entryPrice);
              const actualQuantity = Math.abs(parseFloat(binancePosition.positionAmt));
              
              // Calculate initial trailing stop level (aktiveres med det samme, ikke efter TP)
              const initialTrailingStop = analysis.signal === 'LONG'
                ? actualEntryPrice * (1 - trailingStopPercent / 100)
                : actualEntryPrice * (1 + trailingStopPercent / 100);
              
              // Save position to database with verified Binance data and indicators
              await supabaseClient.from('positions').insert({
                user_id: session.user_id,
                symbol,
                side: analysis.signal,
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
                },
              });

              console.log(`Position saved to DB: ${symbol} with verified Binance data`);

              // Immediately sync with Binance so DB matches source of truth
              await supabaseClient.functions.invoke('sync-binance-futures-positions');
            } catch (error) {
              console.error(`Failed to place order for ${symbol}:`, error);
            }
          }
        } catch (error) {
          console.error(`Error scanning ${symbol}:`, error);
        }
      }
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