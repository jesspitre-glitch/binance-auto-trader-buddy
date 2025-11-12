import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IndicatorConfig {
  ema_fast: number;
  ema_medium: number;
  ema_slow: number;
  rsi_period: number;
  rsi_overbought: number;
  rsi_oversold: number;
  rsi_min_long: number;
  rsi_max_short: number;
  macd_fast: number;
  macd_slow: number;
  macd_signal: number;
  macd_histogram_threshold: number;
  bb_period: number;
  bb_std_dev: number;
  atr_period: number;
  atr_stop_loss_multiplier: number;
  atr_trailing_stop_multiplier: number;
  adx_period: number;
  adx_threshold: number;
  volume_avg_period: number;
  signal_conditions_required: number;
  position_size_percent: number;
  risk_per_trade_percent: number;
  max_open_positions: number;
  max_exposure_percent: number;
  daily_loss_limit_percent: number;
  max_position_duration_minutes: number;
  risk_reward_ratio: number;
  leverage: number;
  scan_interval: string;
  trend_timeframe: string;
}

// Calculate strategy hash from config
async function calculateStrategyHash(config: IndicatorConfig): Promise<string> {
  // Create a stable string representation of the config (excluding id, user_id, name, created_at, updated_at, enabled)
  const configStr = JSON.stringify({
    ema_fast: config.ema_fast,
    ema_medium: config.ema_medium,
    ema_slow: config.ema_slow,
    rsi_period: config.rsi_period,
    rsi_overbought: config.rsi_overbought,
    rsi_oversold: config.rsi_oversold,
    macd_fast: config.macd_fast,
    macd_slow: config.macd_slow,
    macd_signal: config.macd_signal,
    macd_histogram_threshold: config.macd_histogram_threshold,
    bb_period: config.bb_period,
    bb_std_dev: config.bb_std_dev,
    atr_period: config.atr_period,
    atr_stop_loss_multiplier: config.atr_stop_loss_multiplier,
    atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier,
    adx_period: config.adx_period,
    adx_threshold: config.adx_threshold,
    risk_per_trade_percent: config.risk_per_trade_percent,
    max_open_positions: config.max_open_positions,
    risk_reward_ratio: config.risk_reward_ratio,
    leverage: config.leverage,
    scan_interval: config.scan_interval,
    trend_timeframe: config.trend_timeframe,
  });
  
  const msgUint8 = new TextEncoder().encode(configStr);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Determine trend direction from higher timeframe
function analyzeTrend(klines: any[], config: IndicatorConfig): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const closes = klines.map(k => k.close);
  
  // Use config EMAs for trend analysis
  const emaMedium = calculateEMA(closes, config.ema_medium);
  const emaSlow = calculateEMA(closes, config.ema_slow);
  
  const currentEmaMedium = emaMedium[emaMedium.length - 1];
  const currentEmaSlow = emaSlow[emaSlow.length - 1];
  
  if (currentEmaMedium > currentEmaSlow * 1.001) return 'BULLISH';
  if (currentEmaMedium < currentEmaSlow * 0.999) return 'BEARISH';
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

async function fetchAllUSDCSymbols(): Promise<string[]> {
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
    return usdcSymbols;
  } catch (error) {
    console.error('Error fetching USDC symbols:', error);
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
  const map: Record<string, SymbolFilters> = {};
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    if (!response.ok) return map;
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
  } catch (e) {
    console.error('Failed to fetch symbol filters', e);
  }
  return map;
}

function analyzeSignal(klines: any[], config: IndicatorConfig) {
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);
  
  // Calculate all indicators
  const emaFast = calculateEMA(closes, config.ema_fast);
  const emaMedium = calculateEMA(closes, config.ema_medium);
  const emaSlow = calculateEMA(closes, config.ema_slow);
  
  const rsi = calculateRSI(closes, config.rsi_period);
  const macd = calculateMACD(closes, config.macd_fast, config.macd_slow, config.macd_signal);
  const atr = calculateATR(highs, lows, closes, config.atr_period);
  const bb = calculateBollingerBands(closes, config.bb_period, config.bb_std_dev);
  const adx = calculateADX(highs, lows, closes, config.adx_period);
  
  const currentPrice = closes[closes.length - 1];
  const avgVolume = volumes.slice(-config.volume_avg_period).reduce((a, b) => a + b, 0) / config.volume_avg_period;
  const currentVolume = volumes[volumes.length - 1];
  
  const emaFastCurrent = emaFast[emaFast.length - 1];
  const emaMediumCurrent = emaMedium[emaMedium.length - 1];
  const emaSlowCurrent = emaSlow[emaSlow.length - 1];
  
  // LONG signal
  const longConditions = [
    currentPrice > emaFastCurrent,
    emaFastCurrent > emaMediumCurrent,
    emaMediumCurrent > emaSlowCurrent,
    rsi > (config.rsi_min_long || 30) && rsi < config.rsi_overbought,
    macd.histogram > config.macd_histogram_threshold,
    adx > config.adx_threshold,
  ];
  
  // SHORT signal
  const shortConditions = [
    currentPrice < emaFastCurrent,
    emaFastCurrent < emaMediumCurrent,
    emaMediumCurrent < emaSlowCurrent,
    rsi < (config.rsi_max_short || 70) && rsi > config.rsi_oversold,
    macd.histogram < -config.macd_histogram_threshold,
    adx > config.adx_threshold,
  ];
  
  const requiredConditions = config.signal_conditions_required || 5;
  const longSignal = longConditions.filter(c => c).length >= requiredConditions;
  const shortSignal = shortConditions.filter(c => c).length >= requiredConditions;
  
  return {
    signal: longSignal ? 'LONG' : shortSignal ? 'SHORT' : 'NONE',
    indicators: {
      price: currentPrice,
      emaFast: emaFastCurrent,
      emaMedium: emaMediumCurrent,
      emaSlow: emaSlowCurrent,
      rsi,
      macd: macd.histogram,
      atr,
      bb,
      adx,
      volume: currentVolume,
      avgVolume,
    },
    stopLoss: longSignal 
      ? currentPrice - (atr * config.atr_stop_loss_multiplier)
      : currentPrice + (atr * config.atr_stop_loss_multiplier),
    takeProfit: longSignal
      ? currentPrice + (atr * config.atr_stop_loss_multiplier * config.risk_reward_ratio)
      : currentPrice - (atr * config.atr_stop_loss_multiplier * config.risk_reward_ratio),
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
  takeProfit: number,
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
  
  // Set stop loss
  const slParams = new URLSearchParams({
    symbol,
    side: side === 'BUY' ? 'SELL' : 'BUY',
    type: 'STOP_MARKET',
    stopPrice: stopLoss.toFixed(pricePrecision),
    closePosition: 'true',
    timestamp: Date.now().toString(),
  });

  const slSignature = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(slParams.toString()))
  ).then(sig => 
    Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );

  slParams.append('signature', slSignature);

  await fetch(
    `https://fapi.binance.com/fapi/v1/order?${slParams.toString()}`,
    {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  // NOTE: NO TAKE_PROFIT order is placed on Binance
  // TP + Trailing Stop is handled entirely by monitor-positions software logic
  console.log(`Position opened with SL only - TP/Trailing handled by software`);

  return orderData;
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
  return parseFloat(account.totalMarginBalance || '0');
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
          // Fetch klines for both scan interval and trend timeframe
          const scanKlines = await fetchKlines(symbol, config.scan_interval || '5m', 100);
          const trendKlines = await fetchKlines(symbol, config.trend_timeframe || '15m', 100);
          
          // Determine higher timeframe trend
          const trend = analyzeTrend(trendKlines, config);
          
          // Analyze signal on scan interval
          const analysis = analyzeSignal(scanKlines, config);
          
          // Filter signal based on trend
          let filteredSignal = analysis.signal;
          if (filteredSignal === 'LONG' && trend === 'BEARISH') {
            filteredSignal = 'NONE'; // Skip LONG if trend is bearish
          } else if (filteredSignal === 'SHORT' && trend === 'BULLISH') {
            filteredSignal = 'NONE'; // Skip SHORT if trend is bullish
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
            // Re-check positions count right before opening (positions may have been opened in this same scan)
            const { data: currentPositions } = await supabaseClient
              .from('positions')
              .select('id, symbol')
              .eq('user_id', session.user_id)
              .eq('status', 'OPEN');
            
            if (currentPositions && currentPositions.length >= config.max_open_positions) {
              console.log(`Max positions reached (${currentPositions.length}/${config.max_open_positions}) for user ${session.user_id}, skipping ${symbol}`);
              continue;
            }
            
            // Check if there's already an open position for this specific symbol
            const existingPositionForSymbol = currentPositions?.find(p => p.symbol === symbol);
            if (existingPositionForSymbol) {
              console.log(`Skipping ${symbol}: Already have an open position for this symbol`);
              continue;
            }
            
            console.log(`Signal detected for ${session.user_id}: ${filteredSignal} on ${symbol} (Trend: ${trend}) - Current positions: ${currentPositions?.length || 0}/${config.max_open_positions}`);
            
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
              
              // Build open reason description
              const openReasonParts = [];
              if (analysis.indicators.rsi) openReasonParts.push(`RSI: ${analysis.indicators.rsi.toFixed(2)}`);
              if (analysis.indicators.macd) openReasonParts.push(`MACD: ${analysis.indicators.macd.toFixed(4)}`);
              if (analysis.indicators.emaFast && analysis.indicators.emaSlow) {
                openReasonParts.push(`EMA: Fast ${analysis.indicators.emaFast.toFixed(2)} vs Slow ${analysis.indicators.emaSlow.toFixed(2)}`);
              }
              if (analysis.indicators.adx) openReasonParts.push(`ADX: ${analysis.indicators.adx.toFixed(2)}`);
              const openReason = `${analysis.signal} signal på ${symbol} - Trend: ${trend}. ${openReasonParts.join(', ')}`;
              
              // Calculate trailing stop percentage from ATR and config
              const trailingStopDistance = analysis.indicators.atr * config.atr_trailing_stop_multiplier;
              const trailingStopPercent = (trailingStopDistance / analysis.indicators.price) * 100;
              
              // Save position to database
              await supabaseClient.from('positions').insert({
                user_id: session.user_id,
                symbol,
                side: analysis.signal,
                entry_price: analysis.indicators.price,
                quantity: quantityRounded,
                stop_loss: analysis.stopLoss,
                take_profit: analysis.takeProfit,
                current_price: analysis.indicators.price,
                peak_price: analysis.indicators.price,
                trailing_stop_percent: parseFloat(trailingStopPercent.toFixed(2)),
                binance_order_id: orderData.orderId,
                status: 'OPEN',
                strategy_hash: strategyHash,
                open_reason: openReason,
              });

              // Immediately sync with Binance so DB matches source of truth
              await supabaseClient.functions.invoke('sync-binance-futures-positions');
              
              console.log(`Order placed: ${symbol} ${side} ${quantityRounded} @ ${analysis.indicators.price}`);
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