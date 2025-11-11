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
  volume_spike_multiplier: number;
  risk_per_trade_percent: number;
  max_open_positions: number;
  risk_reward_ratio: number;
  leverage: number;
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
    volume_spike_multiplier: config.volume_spike_multiplier,
    risk_per_trade_percent: config.risk_per_trade_percent,
    max_open_positions: config.max_open_positions,
    risk_reward_ratio: config.risk_reward_ratio,
    leverage: config.leverage,
  });
  
  const msgUint8 = new TextEncoder().encode(configStr);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
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
  
  const currentPrice = closes[closes.length - 1];
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  
  const emaFastCurrent = emaFast[emaFast.length - 1];
  const emaMediumCurrent = emaMedium[emaMedium.length - 1];
  const emaSlowCurrent = emaSlow[emaSlow.length - 1];
  
  // LONG signal
  const longConditions = [
    currentPrice > emaFastCurrent,
    emaFastCurrent > emaMediumCurrent,
    emaMediumCurrent > emaSlowCurrent,
    rsi > 30 && rsi < config.rsi_overbought,
    macd.histogram > config.macd_histogram_threshold,
    currentVolume > avgVolume * config.volume_spike_multiplier,
  ];
  
  // SHORT signal
  const shortConditions = [
    currentPrice < emaFastCurrent,
    emaFastCurrent < emaMediumCurrent,
    emaMediumCurrent < emaSlowCurrent,
    rsi < 70 && rsi > config.rsi_oversold,
    macd.histogram < -config.macd_histogram_threshold,
    currentVolume > avgVolume * config.volume_spike_multiplier,
  ];
  
  const longSignal = longConditions.filter(c => c).length >= 5;
  const shortSignal = shortConditions.filter(c => c).length >= 5;
  
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

async function placeOrder(
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  stopLoss: number,
  takeProfit: number
) {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not configured');
  }

  const timestamp = Date.now();
  const params = new URLSearchParams({
    symbol,
    side,
    type: 'MARKET',
    quantity: quantity.toFixed(3),
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
    stopPrice: stopLoss.toFixed(2),
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

  // Set take profit
  const tpParams = new URLSearchParams({
    symbol,
    side: side === 'BUY' ? 'SELL' : 'BUY',
    type: 'TAKE_PROFIT_MARKET',
    stopPrice: takeProfit.toFixed(2),
    closePosition: 'true',
    timestamp: Date.now().toString(),
  });

  const tpSignature = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(tpParams.toString()))
  ).then(sig => 
    Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );

  tpParams.append('signature', tpSignature);

  await fetch(
    `https://fapi.binance.com/fapi/v1/order?${tpParams.toString()}`,
    {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

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
    `https://fapi.binance.com/fapi/v2/balance?${params.toString()}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch account balance');
  }

  const balances = await response.json();
  const usdcBalance = balances.find((b: any) => b.asset === 'USDC');
  return parseFloat(usdcBalance?.availableBalance || '0');
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

      // Analyze USDC pairs
      const symbols = ['BTCUSDC', 'ETHUSDC', 'BNBUSDC', 'SOLUSDC'];
      
      for (const symbol of symbols) {
        try {
          const klines = await fetchKlines(symbol, '5m', 100);
          const analysis = analyzeSignal(klines, config);

          // Log scan result to database
          const actionTaken = analysis.signal === 'NONE' 
            ? 'NO_SIGNAL'
            : positions && positions.length >= config.max_open_positions
            ? 'MAX_POSITIONS_REACHED'
            : 'SIGNAL_DETECTED';

          await supabaseClient.from('scan_results').insert({
            user_id: session.user_id,
            symbol,
            signal: analysis.signal,
            indicators: analysis.indicators,
            stop_loss: analysis.stopLoss,
            take_profit: analysis.takeProfit,
            action_taken: actionTaken,
          });

          results.push({
            userId: session.user_id,
            symbol,
            analysis,
            actionTaken,
          });

          // If there's a signal and we have capacity, place order
          if (analysis.signal !== 'NONE' && (!positions || positions.length < config.max_open_positions)) {
            console.log(`Signal detected for ${session.user_id}: ${analysis.signal} on ${symbol}`);
            
            try {
              // Get account balance
              const balance = await getAccountBalance();
              const riskAmount = balance * (config.risk_per_trade_percent / 100);
              const stopLossDistance = Math.abs(analysis.indicators.price - analysis.stopLoss);
              const quantity = (riskAmount / stopLossDistance) * config.leverage;
              
              // Place order
              const side = analysis.signal === 'LONG' ? 'BUY' : 'SELL';
              const orderData = await placeOrder(
                symbol,
                side,
                quantity,
                analysis.stopLoss,
                analysis.takeProfit
              );
              
              // Save position to database
              await supabaseClient.from('positions').insert({
                user_id: session.user_id,
                symbol,
                side: analysis.signal,
                entry_price: analysis.indicators.price,
                quantity,
                stop_loss: analysis.stopLoss,
                take_profit: analysis.takeProfit,
                current_price: analysis.indicators.price,
                binance_order_id: orderData.orderId,
                status: 'OPEN',
                strategy_hash: strategyHash,
              });
              
              console.log(`Order placed: ${symbol} ${side} ${quantity} @ ${analysis.indicators.price}`);
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