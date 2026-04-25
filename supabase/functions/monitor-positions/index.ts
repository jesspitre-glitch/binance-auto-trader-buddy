import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getCurrentPrice(symbol: string, supabaseClient: any): Promise<number> {
  // 🔴 KRITISK FIX: For monitor-positions skal vi ALTID have live priser
  // Stale prices kan betyde at SL ikke rammes, selvom prisen reelt er under SL
  
  // Forsøg først at hente live pris fra Binance API
  try {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    if (response.ok) {
      const data = await response.json();
      const price = parseFloat(data.price);
      
      // Update cache for andre services der bruger det
      await supabaseClient
        .from('price_cache')
        .upsert({ symbol, price, updated_at: new Date().toISOString() });
      
      return price;
    }
  } catch (error) {
    console.warn(`Live API failed for ${symbol}, trying cache fallback`);
  }
  
  // Fallback til cache KUN hvis API fejler - men log en advarsel
  const { data: cached, error: cacheError } = await supabaseClient
    .from('price_cache')
    .select('price, updated_at')
    .eq('symbol', symbol)
    .single();
    
  if (cached && !cacheError) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    console.warn(`⚠️ Using CACHED price for ${symbol} (age: ${(age / 1000).toFixed(1)}s) - API fallback`);
    
    // Hvis cache er mere end 30 sekunder gammel, log KRITISK advarsel
    if (age > 30000) {
      console.error(`🚨 KRITISK: Price cache for ${symbol} er ${(age / 1000).toFixed(0)}s gammel! SL/TP check kan være unøjagtig!`);
    }
    
    return parseFloat(cached.price);
  }
  
  throw new Error(`Failed to get price for ${symbol} - both API and cache failed`);
}

// Parabolic SAR calculation for trailing stops
function calculatePSARForTrailing(highs: number[], lows: number[], closes: number[], afStart: number, afIncrement: number, afMax: number): { value: number, direction: 'up' | 'down' } | null {
  if (highs.length < 3) return null;
  
  let isUpTrend = closes[1] > closes[0];
  let sar = isUpTrend ? lows[0] : highs[0];
  let ep = isUpTrend ? highs[1] : lows[1];
  let af = afStart;
  
  for (let i = 2; i < highs.length; i++) {
    const prevSar = sar;
    sar = prevSar + af * (ep - prevSar);
    
    if (isUpTrend) {
      sar = Math.min(sar, lows[i-1], lows[i-2]);
      if (lows[i] < sar) {
        isUpTrend = false;
        sar = ep;
        ep = lows[i];
        af = afStart;
      } else {
        if (highs[i] > ep) {
          ep = highs[i];
          af = Math.min(af + afIncrement, afMax);
        }
      }
    } else {
      sar = Math.max(sar, highs[i-1], highs[i-2]);
      if (highs[i] > sar) {
        isUpTrend = true;
        sar = ep;
        ep = highs[i];
        af = afStart;
      } else {
        if (lows[i] < ep) {
          ep = lows[i];
          af = Math.min(af + afIncrement, afMax);
        }
      }
    }
  }
  
  return { value: sar, direction: isUpTrend ? 'up' : 'down' };
}

async function createSignature(queryString: string, apiSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(queryString)
  );
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getBinanceAccountBalance(apiKey: string, apiSecret: string) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get account balance: ${error}`);
  }

  const accountData = await response.json();
  return {
    totalMarginBalance: parseFloat(accountData.totalMarginBalance),
    totalWalletBalance: parseFloat(accountData.totalWalletBalance),
    totalUnrealizedProfit: parseFloat(accountData.totalUnrealizedProfit),
    availableBalance: parseFloat(accountData.availableBalance),
  };
}

async function getPositionFromBinance(symbol: string, apiKey: string, apiSecret: string) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get position: ${error}`);
  }

  const positions = await response.json();
  return positions.find((p: any) => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);
}

async function cancelAllOpenOrders(symbol: string, apiKey: string, apiSecret: string) {
  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&timestamp=${timestamp}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/allOpenOrders?${queryString}&signature=${signature}`,
    {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.warn(`Failed to cancel orders for ${symbol}:`, error);
    return { cancelled: false, error };
  }

  const result = await response.json();
  console.log(`Cancelled orders for ${symbol}:`, result);
  return { cancelled: true, result };
}

// Fetch all fills and compute avg entry/exit prices for Binance-matched P&L
async function getPositionFills(
  symbol: string, side: string,
  apiKey: string, apiSecret: string,
  startTime: number, endTime: number,
): Promise<{ avgEntry: number; avgExit: number; totalQtyEntry: number; totalQtyExit: number; grossPnl: number }> {
  try {
    const timestamp = Date.now();
    const queryString = `symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&timestamp=${timestamp}&recvWindow=10000`;
    const signature = await createSignature(queryString, apiSecret);
    const url = `https://fapi.binance.com/fapi/v1/userTrades?${queryString}&signature=${signature}`;
    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
    if (!res.ok) { console.warn(`Failed to fetch fills: ${await res.text()}`); return { avgEntry: 0, avgExit: 0, totalQtyEntry: 0, totalQtyExit: 0, grossPnl: 0 }; }

    const trades = await res.json();
    if (!Array.isArray(trades) || trades.length === 0) return { avgEntry: 0, avgExit: 0, totalQtyEntry: 0, totalQtyExit: 0, grossPnl: 0 };

    const entrySide = side === 'LONG' ? 'BUY' : 'SELL';
    let entryNotional = 0, entryQty = 0, exitNotional = 0, exitQty = 0;

    for (const t of trades) {
      const price = parseFloat(t.price);
      const qty = parseFloat(t.qty);
      if (t.side === entrySide) { entryNotional += price * qty; entryQty += qty; }
      else { exitNotional += price * qty; exitQty += qty; }
    }

    const avgEntry = entryQty > 0 ? entryNotional / entryQty : 0;
    const avgExit = exitQty > 0 ? exitNotional / exitQty : 0;
    const posQty = Math.min(entryQty, exitQty);
    const grossPnl = side === 'LONG' ? (avgExit - avgEntry) * posQty : (avgEntry - avgExit) * posQty;

    console.log(`📋 FILLS | ${symbol} ${side} | entries=${entryQty} avgEntry=${avgEntry.toFixed(6)} | exits=${exitQty} avgExit=${avgExit.toFixed(6)} | grossPnl=${grossPnl.toFixed(4)}`);
    return { avgEntry, avgExit, totalQtyEntry: entryQty, totalQtyExit: exitQty, grossPnl };
  } catch (e) { console.error('Error fetching fills:', e); return { avgEntry: 0, avgExit: 0, totalQtyEntry: 0, totalQtyExit: 0, grossPnl: 0 }; }
}

// Fetch ALL income for a symbol → Binance-matched Net P&L
// Net P&L = Σ(REALIZED_PNL) + Σ(COMMISSION) + Σ(FUNDING_FEE) + Σ(other)
async function getPositionIncome(
  symbol: string, apiKey: string, apiSecret: string,
  startTime: number, endTime: number,
): Promise<{ realizedPnl: number; commission: number; fundingFee: number; otherIncome: number; binanceNetPnl: number }> {
  const result = { realizedPnl: 0, commission: 0, fundingFee: 0, otherIncome: 0, binanceNetPnl: 0 };
  try {
    const timestamp = Date.now();
    const queryString = `symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&timestamp=${timestamp}&recvWindow=10000&limit=1000`;
    const signature = await createSignature(queryString, apiSecret);
    const url = `https://fapi.binance.com/fapi/v1/income?${queryString}&signature=${signature}`;
    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
    if (!res.ok) { console.warn(`Failed to fetch income: ${await res.text()}`); return result; }

    const incomes = await res.json();
    if (!Array.isArray(incomes)) return result;

    for (const inc of incomes) {
      const amount = parseFloat(inc.income || 0);
      switch (inc.incomeType) {
        case 'REALIZED_PNL': result.realizedPnl += amount; break;
        case 'COMMISSION': result.commission += amount; break;
        case 'FUNDING_FEE': result.fundingFee += amount; break;
        default: result.otherIncome += amount; break;
      }
    }

    result.binanceNetPnl = result.realizedPnl + result.commission + result.fundingFee + result.otherIncome;
    console.log(`📋 INCOME | ${symbol} | REALIZED=${result.realizedPnl.toFixed(4)} COMMISSION=${result.commission.toFixed(4)} FUNDING=${result.fundingFee.toFixed(4)} OTHER=${result.otherIncome.toFixed(4)} | binanceNetPnl=${result.binanceNetPnl.toFixed(4)}`);
    return result;
  } catch (e) { console.error('Error fetching income:', e); return result; }
}

async function closePositionOnBinance(symbol: string, side: string, quantity: number) {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not configured');
  }

  // Get current position to verify quantity
  const position = await getPositionFromBinance(symbol, apiKey, apiSecret);
  
  if (!position) {
    console.log(`No open position found for ${symbol}, skipping close`);
    return null;
  }

  const livePositionQty = Math.abs(parseFloat(position.positionAmt));
  const requestedQty = Math.abs(Number(quantity) || 0);

  if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
    throw new Error(`Invalid requested close quantity for ${symbol}: ${quantity}`);
  }

  const closeQuantity = Math.min(requestedQty, livePositionQty);

  if (!Number.isFinite(closeQuantity) || closeQuantity <= 0) {
    console.log(`No closable quantity found for ${symbol} (requested=${requestedQty}, live=${livePositionQty})`);
    return null;
  }

  if (requestedQty > livePositionQty) {
    console.warn(`Requested close qty for ${symbol} exceeds live Binance qty (${requestedQty} > ${livePositionQty}) - clamping to live qty`);
  }

  const closeSide = side === 'LONG' ? 'SELL' : 'BUY';
  
  // Place the closing order
  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&side=${closeSide}&type=MARKET&quantity=${closeQuantity}&reduceOnly=true&timestamp=${timestamp}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);

  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`,
    {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to close position:', error);
    throw new Error(`Failed to close position: ${error}`);
  }

  const orderResult = await response.json();
  
  // Cancel all remaining open orders for this symbol (stop-loss, etc.)
  await cancelAllOpenOrders(symbol, apiKey, apiSecret);
  
  // Wait a bit for order to fill
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Get the filled order details to get actual exit price
  const orderQueryString = `symbol=${symbol}&orderId=${orderResult.orderId}&timestamp=${Date.now()}&recvWindow=10000`;
  const orderSignature = await createSignature(orderQueryString, apiSecret);
  
  const orderResponse = await fetch(
    `https://fapi.binance.com/fapi/v1/order?${orderQueryString}&signature=${orderSignature}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (orderResponse.ok) {
    const orderDetails = await orderResponse.json();
    return {
      orderId: orderResult.orderId,
      avgPrice: parseFloat(orderDetails.avgPrice),
      executedQty: parseFloat(orderDetails.executedQty),
      cumQuote: parseFloat(orderDetails.cumQuote),
      requestedQty: closeQuantity,
      livePositionQty,
    };
  }

  return {
    orderId: orderResult.orderId,
    avgPrice: parseFloat(orderResult.avgPrice || orderResult.price || '0'),
    executedQty: parseFloat(orderResult.executedQty || '0'),
    requestedQty: closeQuantity,
    livePositionQty,
  };
}

type SlotComplianceResult = {
  compliant: boolean;
  reason?: string;
  details?: string;
};

function parseFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function validatePositionAgainstSlotUi(params: {
  currentPrice: number;
  position: any;
  slotData: { config_id?: string | null; name?: string | null; capital_percent?: number | null; is_active?: boolean | null } | null;
  configData: { leverage?: number | null; position_size_percent?: number | null } | null;
  supabaseClient: any;
}): Promise<SlotComplianceResult> {
  const { position, currentPrice, slotData, configData, supabaseClient } = params;

  if (!position.slot_id) {
    return { compliant: true };
  }

  if (!slotData) {
    return { compliant: false, reason: 'SLOT_UI_MISMATCH', details: 'Slot configuration could not be found' };
  }

  if (slotData.is_active === false) {
    return {
      compliant: false,
      reason: 'SLOT_UI_MISMATCH',
      details: `Slot "${slotData.name ?? position.slot_id}" is inactive in UI`,
    };
  }

  const capitalPercent = parseFiniteNumber(slotData.capital_percent);
  const positionSizePercent = parseFiniteNumber(configData?.position_size_percent);
  const expectedLeverage = parseFiniteNumber(configData?.leverage);

  if (capitalPercent === null || capitalPercent <= 0 || capitalPercent > 100) {
    return {
      compliant: false,
      reason: 'SLOT_UI_MISMATCH',
      details: `Invalid slot capital percent (${slotData.capital_percent})`,
    };
  }

  if (positionSizePercent === null || positionSizePercent <= 0 || positionSizePercent > 100) {
    return {
      compliant: false,
      reason: 'SLOT_UI_MISMATCH',
      details: `Invalid UI position size percent (${configData?.position_size_percent})`,
    };
  }

  if (expectedLeverage === null || expectedLeverage <= 0) {
    return {
      compliant: false,
      reason: 'SLOT_UI_MISMATCH',
      details: `Invalid UI leverage (${configData?.leverage})`,
    };
  }

  const { data: portfolioData, error: portfolioError } = await supabaseClient
    .from('user_portfolio')
    .select('futures_capital')
    .eq('user_id', position.user_id)
    .maybeSingle();

  if (portfolioError) throw portfolioError;

  const configuredPortfolioBalance = parseFiniteNumber(portfolioData?.futures_capital);
  if (configuredPortfolioBalance === null || configuredPortfolioBalance <= 0) {
    return {
      compliant: false,
      reason: 'SLOT_UI_MISMATCH',
      details: 'Missing valid UI futures capital baseline',
    };
  }

  // Notional check REMOVED — Binance er master, sync opdaterer quantity/entry direkte.
  // Alle handler styres af appen, så notional kan ændre sig via Binance sync.

  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not configured');
  }

  const livePosition = await getPositionFromBinance(position.symbol, apiKey, apiSecret);
  if (livePosition) {
    const liveLeverage = parseFiniteNumber(livePosition.leverage);
    if (liveLeverage !== null && Math.abs(liveLeverage - expectedLeverage) > 0.001) {
      return {
        compliant: false,
        reason: 'SLOT_UI_MISMATCH',
        details: `Binance leverage ${liveLeverage}x does not match slot UI ${expectedLeverage}x for ${slotData.name ?? position.slot_id}`,
      };
    }
  }

  console.log(`✅ SLOT UI COMPLIANCE | ${position.symbol} | slot=${slotData.name ?? position.slot_id} | leverage=${expectedLeverage}x`);

  return { compliant: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse debug flag from request body
    let debug = false;
    try {
      const body = await req.json();
      debug = body?.debug === true;
    } catch {
      // No body or invalid JSON - debug defaults to false
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all open positions
    const { data: positions, error: positionsError } = await supabaseClient
      .from('positions')
      .select('*')
      .eq('status', 'OPEN');

    const slotCache = new Map<string, any>();
    const configCache = new Map<string, any>();

    if (positionsError) throw positionsError;
    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({ message: 'No open positions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Monitoring ${positions.length} open positions`);

    const results = [];

    for (const position of positions) {
      try {
        // Get current price from cache (much faster, avoids rate limits)
        const currentPrice = await getCurrentPrice(position.symbol, supabaseClient);
        
        // Update current price in database
        await supabaseClient
          .from('positions')
          .update({ current_price: currentPrice })
          .eq('id', position.id);

        let shouldClose = false;
        let closeReason = '';

        // Get indicator config for this position (ALTID hent fra database - også for synkroniserede positioner!)
        let trailingActivationEnabled = true; // default
        let trailingActivationAtr = 1.0; // default
        let autoExitEnabled = true; // default - hvis slukket lukkes positioner ikke automatisk
        let maxPositionDurationMinutes: number | null = null; // default - hvis null/0 lukkes positioner ikke pga timeout
        let conditionalTimeExitEnabled = true; // default - betinget tids-exit (Anti-Sour Exit)
        let adxFloor = 20; // default ADX min
        
        // Tjek om trailing stop ALLEREDE er aktiveret (fra database)
        let trailingAlreadyActivated = position.trailing_stop != null && position.trailing_stop > 0;
        
        // 🔴 STRATEGY SLOTS: Resolve config via slot_id first, then fall back to trading_session
        let configData: any = null;
        let slotData: any = null;
        
        if (position.slot_id) {
          if (slotCache.has(position.slot_id)) {
            slotData = slotCache.get(position.slot_id);
          } else {
            const { data: fetchedSlotData } = await supabaseClient
              .from('strategy_slots')
              .select('config_id, name, capital_percent, is_active')
              .eq('id', position.slot_id)
              .single();
            slotData = fetchedSlotData;
            slotCache.set(position.slot_id, slotData ?? null);
          }
          
          if (slotData?.config_id) {
            if (configCache.has(slotData.config_id)) {
              configData = configCache.get(slotData.config_id);
            } else {
              const { data: slotConfig } = await supabaseClient
                .from('indicator_config')
                .select('trailing_stop_activation_enabled, trailing_stop_activation_atr, atr_trailing_stop_multiplier, auto_exit_enabled, max_position_duration_minutes, conditional_time_exit_enabled, adx_floor, break_even_enabled, break_even_ratchet_only, break_even_atr_enabled, break_even_atr, break_even_atr_stop_offset, break_even_profit_pct_enabled, break_even_profit_pct_trigger, break_even_profit_pct_stop_over_entry, peak_lock_enabled, peak_lock_activate_profit_pct, peak_lock_distance_pct, peak_lock_min_profit_floor_pct, peak_lock_ratchet_only, max_sl_after_mfe_enabled, max_sl_after_mfe_activate_pct, max_sl_after_mfe_max_dist_pct, hard_sl_pct_enabled, hard_sl_pct, psar_trailing_enabled, psar_af_start, psar_af_increment, psar_af_max, position_size_percent, leverage, scan_interval, stale_exit_enabled, stale_exit_max_duration_tf_mult, stale_exit_peak_inactivity_tf_mult, stale_exit_trailing_inactivity_tf_mult, stale_exit_min_move_atr_mult, stale_exit_use_momentum_filter')
                .eq('id', slotData.config_id)
                .single();
              configData = slotConfig;
              configCache.set(slotData.config_id, configData ?? null);
            }
            console.log(`📋 Bruger SLOT config "${slotData.name}" (slot: ${position.slot_id}, config: ${slotData.config_id}): timeout=${configData?.max_position_duration_minutes}min`);
          } else {
            console.warn(`⚠️ Slot ${position.slot_id} har ingen config_id — falder tilbage til trading_session`);
          }
        }
        
        if (!configData) {
          // Fallback: use trading_session's active config (legacy behavior)
          const { data: sessionData } = await supabaseClient
            .from('trading_session')
            .select('active_config_id')
            .eq('user_id', position.user_id)
            .single();
          
          if (sessionData?.active_config_id) {
            const { data: activeConfig } = await supabaseClient
              .from('indicator_config')
              .select('trailing_stop_activation_enabled, trailing_stop_activation_atr, atr_trailing_stop_multiplier, auto_exit_enabled, max_position_duration_minutes, conditional_time_exit_enabled, adx_floor, break_even_enabled, break_even_ratchet_only, break_even_atr_enabled, break_even_atr, break_even_atr_stop_offset, break_even_profit_pct_enabled, break_even_profit_pct_trigger, break_even_profit_pct_stop_over_entry, peak_lock_enabled, peak_lock_activate_profit_pct, peak_lock_distance_pct, peak_lock_min_profit_floor_pct, peak_lock_ratchet_only, max_sl_after_mfe_enabled, max_sl_after_mfe_activate_pct, max_sl_after_mfe_max_dist_pct, hard_sl_pct_enabled, hard_sl_pct, psar_trailing_enabled, psar_af_start, psar_af_increment, psar_af_max, position_size_percent, leverage, scan_interval, stale_exit_enabled, stale_exit_max_duration_tf_mult, stale_exit_peak_inactivity_tf_mult, stale_exit_trailing_inactivity_tf_mult, stale_exit_min_move_atr_mult, stale_exit_use_momentum_filter')
              .eq('id', sessionData.active_config_id)
              .single();
            configData = activeConfig;
            console.log(`📋 Bruger AKTIV strategi (${sessionData.active_config_id}): timeout=${configData?.max_position_duration_minutes}min`);
          } else {
            // Fallback til første config hvis ingen session
            const { data: fallbackConfig } = await supabaseClient
              .from('indicator_config')
              .select('trailing_stop_activation_enabled, trailing_stop_activation_atr, atr_trailing_stop_multiplier, auto_exit_enabled, max_position_duration_minutes, conditional_time_exit_enabled, adx_floor, break_even_enabled, break_even_ratchet_only, break_even_atr_enabled, break_even_atr, break_even_atr_stop_offset, break_even_profit_pct_enabled, break_even_profit_pct_trigger, break_even_profit_pct_stop_over_entry, peak_lock_enabled, peak_lock_activate_profit_pct, peak_lock_distance_pct, peak_lock_min_profit_floor_pct, peak_lock_ratchet_only, max_sl_after_mfe_enabled, max_sl_after_mfe_activate_pct, max_sl_after_mfe_max_dist_pct, hard_sl_pct_enabled, hard_sl_pct, psar_trailing_enabled, psar_af_start, psar_af_increment, psar_af_max, position_size_percent, leverage, scan_interval, stale_exit_enabled, stale_exit_max_duration_tf_mult, stale_exit_peak_inactivity_tf_mult, stale_exit_trailing_inactivity_tf_mult, stale_exit_min_move_atr_mult, stale_exit_use_momentum_filter')
              .eq('user_id', position.user_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            configData = fallbackConfig;
            console.warn(`⚠️ Ingen aktiv session fundet - bruger seneste config: timeout=${configData?.max_position_duration_minutes}min`);
          }
        }
        
        // Break-even config fra database
        let breakEvenMasterEnabled = true;
        let breakEvenRatchetOnly = false;
        let breakEvenAtrModeEnabled = true;
        let breakEvenAtrTrigger = 1.0;
        let breakEvenAtrStopOffset = 0;
        let breakEvenProfitPctEnabled = false;
        let breakEvenProfitPctTrigger = 1.5;
        let breakEvenProfitPctStopOverEntry = 0.1;

        // Peak-Lock config fra database
        let peakLockEnabled = false;
        let peakLockActivateProfitPct = 0.60;
        let peakLockDistancePct = 0.35;
        let peakLockMinProfitFloorPct = 0.15;
        let peakLockRatchetOnly = true;

        // Max SL after MFE config (stramning af SL når MFE er nået, før BE trigger)
        let maxSlAfterMfeEnabled = false;
        let maxSlAfterMfeActivatePct = 0.60;
        let maxSlAfterMfeMaxDistPct = 1.0;

        // Hard Stop Loss % - absolut yderste grænse (prioritet 1)
        let hardSlPctEnabled = true;
        let hardSlPct = 3.0;

        // Trailing multiplier fra UI (indicator_config)
        let atrTrailingStopMultiplierFromUi: number | null = null;
        
        // PSAR Trailing config
        let psarTrailingEnabled = false;
        let psarAfStart = 0.02;
        let psarAfIncrement = 0.02;
        let psarAfMax = 0.2;
        
        if (configData) {
          trailingActivationEnabled = configData.trailing_stop_activation_enabled ?? true;
          trailingActivationAtr = configData.trailing_stop_activation_atr ?? 1.0;
          atrTrailingStopMultiplierFromUi = (configData as any).atr_trailing_stop_multiplier ?? null;
          autoExitEnabled = configData.auto_exit_enabled ?? true;
          maxPositionDurationMinutes = configData.max_position_duration_minutes;
          conditionalTimeExitEnabled = configData.conditional_time_exit_enabled ?? true;
          adxFloor = configData.adx_floor ?? 20;

          if (!shouldClose) {
            const complianceResult = await validatePositionAgainstSlotUi({
              currentPrice,
              position,
              slotData,
              configData,
              supabaseClient,
            });

            if (!complianceResult.compliant) {
              shouldClose = true;
              closeReason = complianceResult.reason ?? 'SLOT_UI_MISMATCH';
              console.error(`🚨 SLOT UI MISMATCH | ${position.symbol} | ${complianceResult.details ?? 'Position no longer matches slot UI'}`);
            }
          }

          // Break-even config
          breakEvenMasterEnabled = configData.break_even_enabled ?? true;
          breakEvenRatchetOnly = configData.break_even_ratchet_only ?? false;
          breakEvenAtrModeEnabled = configData.break_even_atr_enabled ?? true;
          breakEvenAtrTrigger = configData.break_even_atr ?? 1.0;
          breakEvenAtrStopOffset = configData.break_even_atr_stop_offset ?? 0;
          breakEvenProfitPctEnabled = configData.break_even_profit_pct_enabled ?? false;
          breakEvenProfitPctTrigger = configData.break_even_profit_pct_trigger ?? 1.5;
          breakEvenProfitPctStopOverEntry = configData.break_even_profit_pct_stop_over_entry ?? 0.1;

          // Peak-Lock config
          peakLockEnabled = configData.peak_lock_enabled ?? false;
          peakLockActivateProfitPct = configData.peak_lock_activate_profit_pct ?? 0.60;
          peakLockDistancePct = configData.peak_lock_distance_pct ?? 0.35;
          peakLockMinProfitFloorPct = configData.peak_lock_min_profit_floor_pct ?? 0.15;
          peakLockRatchetOnly = configData.peak_lock_ratchet_only ?? true;

          // Max SL after MFE
          maxSlAfterMfeEnabled = configData.max_sl_after_mfe_enabled ?? false;
          maxSlAfterMfeActivatePct = configData.max_sl_after_mfe_activate_pct ?? 0.60;
          maxSlAfterMfeMaxDistPct = configData.max_sl_after_mfe_max_dist_pct ?? 1.0;

          // Hard Stop Loss %
          hardSlPctEnabled = (configData as any).hard_sl_pct_enabled ?? true;
          hardSlPct = (configData as any).hard_sl_pct ?? 3.0;

          // PSAR Trailing config
          psarTrailingEnabled = (configData as any).psar_trailing_enabled ?? false;
          psarAfStart = (configData as any).psar_af_start ?? 0.02;
          psarAfIncrement = (configData as any).psar_af_increment ?? 0.02;
          psarAfMax = (configData as any).psar_af_max ?? 0.2;

          // Log for synkroniserede positioner uden strategy_hash
          if (!position.strategy_hash) {
            console.log(`📋 Synkroniseret position ${position.symbol} bruger aktuel config: timeout=${maxPositionDurationMinutes}min, autoExit=${autoExitEnabled}, conditionalTimeExit=${conditionalTimeExitEnabled}, peakLock=${peakLockEnabled}, maxSlAfterMfe=${maxSlAfterMfeEnabled ? `${maxSlAfterMfeActivatePct}%→${maxSlAfterMfeMaxDistPct}%` : 'off'}, hardSlPct=${hardSlPctEnabled ? hardSlPct + '%' : 'off'}`);
          }
        }

        // If auto exit is disabled, skip this position
        if (!autoExitEnabled) {
          console.log(`⏭️ Position ${position.symbol} - auto exit disabled, skipping automatic monitoring`);
          results.push({
            symbol: position.symbol,
            action: 'skipped',
            reason: 'Auto exit disabled in strategy config'
          });
          continue;
        }

        // 🔍 AUDIT v6: Identificer exit type - LEGACY_PERCENT_FALLBACK vs ATR_EXIT_OK
        const snapshotAtr = position.indicators_snapshot?.atr;
        const legacyPercentExit = position.indicators_snapshot?.legacy_percent_exit === true;
        const exitType = position.indicators_snapshot?.exit_type || 'UNKNOWN';
        const isSyncedPosition = position.indicators_snapshot?.is_synced_position || false;
        
        // Position er LEGACY hvis: legacy_percent_exit=true ELLER exit_type indeholder FALLBACK ELLER ATR er null/0
        const isLegacyPosition = legacyPercentExit || 
                                  exitType === 'PERCENT_FALLBACK_LEGACY' || 
                                  exitType === 'PERCENT_FALLBACK' ||
                                  !snapshotAtr || snapshotAtr <= 0 || !isFinite(snapshotAtr);
        
        // Log position type tydeligt
        if (isLegacyPosition) {
          console.log(`\n⚠️ LEGACY_PERCENT_FALLBACK: ${position.symbol} ${position.side}`);
          console.log(`   exit_type: ${exitType}`);
          console.log(`   legacy_percent_exit: ${legacyPercentExit}`);
          console.log(`   ATR: ${snapshotAtr ?? 'NULL'}`);
          console.log(`   -> Bruger 3% SL fallback og 1.8% trailing`);
        } else {
          console.log(`\n✅ ATR_EXIT_OK: ${position.symbol} ${position.side}`);
          console.log(`   exit_type: ${exitType}`);
          console.log(`   ATR: ${snapshotAtr}`);
          console.log(`   -> Bruger ATR-baseret exit system`);
        }
        
        // Beregn profit - forskelligt for legacy vs ATR positioner
        const profitDistance = position.side === 'LONG'
          ? currentPrice - position.entry_price
          : position.entry_price - currentPrice;
        
        const atr = snapshotAtr || 0;
        const profitInAtr = atr > 0 ? profitDistance / atr : 0;
        const profitPercent = (profitDistance / position.entry_price) * 100;
        
        // For legacy positioner: brug procent-baseret profit threshold
        // For ATR positioner: brug ATR-baseret threshold
        const isInProfit = profitDistance > 0;

        // Trailing skal først kunne blive aktiv EFTER break-even (gates senere).
        // Her beregner vi kun om profit-thresholdet er opfyldt.
        let trailingProfitThresholdPassed = false;
        let trailingProfitThresholdLabel = '';

        if (isLegacyPosition) {
          const legacyActivationPercent = 1.0; // 1% profit for trailing activation
          trailingProfitThresholdPassed = profitPercent >= legacyActivationPercent;
          trailingProfitThresholdLabel = `${legacyActivationPercent}%`;

          if (trailingActivationEnabled) {
            console.log(
              `   LEGACY trailing threshold: profit=${profitPercent.toFixed(2)}% (need ${legacyActivationPercent}%) - passed: ${trailingProfitThresholdPassed}`
            );
          }
        } else {
          trailingProfitThresholdPassed = profitInAtr >= trailingActivationAtr;
          trailingProfitThresholdLabel = `${trailingActivationAtr} ATR`;

          if (trailingActivationEnabled) {
            console.log(
              `   Trailing threshold: profit=${profitInAtr.toFixed(2)} ATR (need ${trailingActivationAtr} ATR) - passed: ${trailingProfitThresholdPassed}`
            );
          }
        }

        // Bliver sat korrekt efter break-even evalueres (Stop-loss → Break-even → Trailing)
        let trailingStopActive = false;

        let newStopLoss = position.stop_loss;
        let newPeakPrice = position.peak_price || position.entry_price;
        let newTrailingStop = position.trailing_stop;
        
        // 🔴 LOW-TRACKING (MAE): Track laveste pris for LONG / højeste pris for SHORT
        // MAE = Maximum Adverse Excursion (største bevægelse imod os)
        // VIGTIGT: Kun til logging/analyse - påvirker IKKE exit-logik
        let newLowPrice = position.low_price ?? position.entry_price;
        let lowWasUpdated = false;
        
        // LONG: low_price = laveste pris set (adverse = nedad)
        // SHORT: low_price = højeste pris set (adverse = opad)
        if (position.side === 'LONG' && currentPrice < newLowPrice) {
          console.log(`📉 MAE low_price opdateret: ${newLowPrice.toFixed(6)} → ${currentPrice.toFixed(6)} for ${position.symbol} (LONG adverse)`);
          lowWasUpdated = true;
          newLowPrice = currentPrice;
        } else if (position.side === 'SHORT' && currentPrice > newLowPrice) {
          console.log(`📈 MAE low_price opdateret: ${newLowPrice.toFixed(6)} → ${currentPrice.toFixed(6)} for ${position.symbol} (SHORT adverse)`);
          lowWasUpdated = true;
          newLowPrice = currentPrice;
        }
        
        // 🔴 PEAK-TRACKING: Opdater peak ALTID når position er åben (hvis Peak-Lock eller Trailing er aktivt i UI)
        // Peak må kun bevæge sig i gunstig retning (ratchet)
        // LONG: peak = højeste pris set, SHORT: peak = laveste pris set
        // Dette sker UAFHÆNGIGT af om trailing/BE er aktivt, så peak-lock kan stramme korrekt senere
        let peakWasUpdated = false;
        const peakTrackingEnabled = peakLockEnabled || trailingActivationEnabled;
        
        if (peakTrackingEnabled) {
          if (position.side === 'LONG' && currentPrice > newPeakPrice) {
            console.log(`📈 Peak price opdateret: ${newPeakPrice.toFixed(6)} → ${currentPrice.toFixed(6)} for ${position.symbol}`);
            peakWasUpdated = true;
            newPeakPrice = currentPrice;
          } else if (position.side === 'SHORT' && currentPrice < newPeakPrice) {
            console.log(`📉 Peak price opdateret: ${newPeakPrice.toFixed(6)} → ${currentPrice.toFixed(6)} for ${position.symbol}`);
            peakWasUpdated = true;
            newPeakPrice = currentPrice;
          }
        }
        
        // 🔴 FIX: Track break-even state LOKALT for at undgå at miste data ved trade-close
        // Disse værdier bruges i enhancedSnapshot ved close
        let breakEvenActivatedThisCycle = false;
        let breakEvenAtPrice: number | null = position.indicators_snapshot?.break_even_at_price ?? null;
        let breakEvenTriggerPrice: number | null = position.indicators_snapshot?.break_even_trigger_price ?? null;
        let stopLossAfterBE: number | null = position.indicators_snapshot?.stop_loss_after_be ?? null;
        let breakEvenActivatedState = position.break_even_activated || false;

        // Audit/flow flags (bruges til korrekt exit-prioritet og logging)
        let breakEvenProfitThresholdPassed = false;
        let breakEvenTriggerMode: string | null = null;
        
        // Break-even logic: Move SL til entry eller over når profit er nået (KUN hvis break_even_enabled === true)
        if (!position.break_even_activated && breakEvenMasterEnabled) {
          if (isLegacyPosition) {
            // LEGACY: Brug 1% break-even threshold (hardcoded for legacy positioner)
            const legacyBreakEvenPercent = 1.0; // 1% profit for break-even
            const breakEvenReached = profitPercent >= legacyBreakEvenPercent;
            
            console.log(`   LEGACY break-even check: profit=${profitPercent.toFixed(2)}% (need ${legacyBreakEvenPercent}%)`);
            
            if (breakEvenReached) {
              breakEvenProfitThresholdPassed = true;
              breakEvenTriggerMode = 'LEGACY';

              breakEvenActivatedThisCycle = true;
              breakEvenActivatedState = true;
              // LEGACY: BE på entry (ingen offset)
              // KRAV: LONG BE stop skal altid være >= entry, SHORT BE stop skal altid være <= entry
              if (position.side === 'LONG') {
                // LONG: BE stop på eller over entry (profit side er opad)
                breakEvenAtPrice = position.entry_price; // Altid mindst entry
              } else {
                // SHORT: BE stop på eller under entry (profit side er nedad)
                breakEvenAtPrice = position.entry_price; // Altid højst entry
              }
              breakEvenTriggerPrice = currentPrice;
              newStopLoss = breakEvenAtPrice;
              stopLossAfterBE = newStopLoss;

              const updatedSnapshot = {
                ...position.indicators_snapshot,
                // Bevar initial SL som “max loss”-anker
                original_stop_loss: position.indicators_snapshot?.original_stop_loss ?? position.stop_loss,
                break_even_at_price: breakEvenAtPrice,
                break_even_trigger_price: breakEvenTriggerPrice,
                break_even_triggered_at: new Date().toISOString(),
                stop_loss_after_be: stopLossAfterBE,
                break_even_mode: 'LEGACY',
              };
              await supabaseClient
                .from('positions')
                .update({ 
                  stop_loss: newStopLoss, 
                  break_even_activated: true,
                  indicators_snapshot: updatedSnapshot
                })
                .eq('id', position.id);
              
              console.log(`📊 BREAK-EVEN ACTIVATED - ${position.symbol} ${position.side}`);
              console.log(`   Type: LEGACY (1% threshold)`);
              console.log(`   break_even_at_price: ${breakEvenAtPrice}`);
            }
          } else {
            // UI-DRIVEN BREAK-EVEN: Evaluer begge modes og vælg mest beskyttende
            console.log(`\n📐 Break-Even Check - ${position.symbol} ${position.side}`);
            console.log(`   Config: masterEnabled=${breakEvenMasterEnabled}, atrEnabled=${breakEvenAtrModeEnabled}, profitPctEnabled=${breakEvenProfitPctEnabled}, ratchetOnly=${breakEvenRatchetOnly}`);
            
            let candidateStops: { price: number, mode: string, triggerPrice: number }[] = [];
            
            // Mode 1: ATR-baseret BE
            if (breakEvenAtrModeEnabled && snapshotAtr > 0) {
              const atrTriggerDistance = breakEvenAtrTrigger * snapshotAtr;
              const atrStopOffset = breakEvenAtrStopOffset * snapshotAtr;
              
              let atrTriggered = false;
              let atrCandidateStop: number;
              
              if (position.side === 'LONG') {
                atrTriggered = currentPrice >= (position.entry_price + atrTriggerDistance);
                atrCandidateStop = position.entry_price + atrStopOffset;
              } else {
                atrTriggered = currentPrice <= (position.entry_price - atrTriggerDistance);
                atrCandidateStop = position.entry_price - atrStopOffset;
              }
              
              // AUDIT: BE_ATR_TRIGGER log entry
              console.log(`🔔 BE_ATR_TRIGGER: ${position.symbol} ${position.side} | trigger=${breakEvenAtrTrigger}xATR offset=${breakEvenAtrStopOffset}xATR | ATR=${snapshotAtr.toFixed(6)} | triggerDist=${atrTriggerDistance.toFixed(6)} | offsetDist=${atrStopOffset.toFixed(6)}`);
              console.log(`   ATR Triggered: ${atrTriggered} (current profit: ${profitDistance.toFixed(6)}, needed: ${atrTriggerDistance.toFixed(6)})`);
              
              if (atrTriggered) {
                candidateStops.push({ price: atrCandidateStop, mode: 'ATR', triggerPrice: currentPrice });
              }
            } else if (!breakEvenAtrModeEnabled) {
              // AUDIT: BE_ATR_SKIPPED - ATR-BE disabled
              console.log(`⏭️ BE_ATR_SKIPPED: disabled | ${position.symbol} ${position.side}`);
            } else if (snapshotAtr <= 0) {
              // AUDIT: BE_ATR_SKIPPED - Invalid ATR
              console.log(`⏭️ BE_ATR_SKIPPED: invalid ATR=${snapshotAtr} | ${position.symbol} ${position.side}`);
            }
            
            // Mode 2: Profit %-baseret BE
            if (breakEvenProfitPctEnabled) {
              let pctTriggered = false;
              let pctCandidateStop: number;
              
              if (position.side === 'LONG') {
                // LONG: Trigger når price >= entry * (1 + trigger_pct/100)
                const triggerPrice = position.entry_price * (1 + breakEvenProfitPctTrigger / 100);
                pctTriggered = currentPrice >= triggerPrice;
                // Stop sættes til entry * (1 + stop_over_entry_pct/100)
                pctCandidateStop = position.entry_price * (1 + breakEvenProfitPctStopOverEntry / 100);
              } else {
                // SHORT: Trigger når price <= entry * (1 - trigger_pct/100)
                const triggerPrice = position.entry_price * (1 - breakEvenProfitPctTrigger / 100);
                pctTriggered = currentPrice <= triggerPrice;
                // Stop sættes til entry * (1 - stop_over_entry_pct/100)
                pctCandidateStop = position.entry_price * (1 - breakEvenProfitPctStopOverEntry / 100);
              }
              
              console.log(`   Profit% Mode: trigger=${breakEvenProfitPctTrigger}%, stopOverEntry=${breakEvenProfitPctStopOverEntry}%`);
              console.log(`   Profit% Triggered: ${pctTriggered} (current profit: ${profitPercent.toFixed(2)}%)`);
              
              if (pctTriggered) {
                candidateStops.push({ price: pctCandidateStop, mode: 'PROFIT_PCT', triggerPrice: currentPrice });
              }
            }
            
            // Vælg mest beskyttende kandidat hvis nogen er triggered
            if (candidateStops.length > 0) {
              breakEvenProfitThresholdPassed = true;
              breakEvenTriggerMode = candidateStops.length === 1 ? candidateStops[0].mode : 'MULTI';

              let bestCandidate: { price: number, mode: string, triggerPrice: number };

              if (position.side === 'LONG') {
                // LONG: Højeste stop vinder (mest oppe = mest beskyttende)
                bestCandidate = candidateStops.reduce((best, c) => c.price > best.price ? c : best);
              } else {
                // SHORT: Laveste stop vinder (mest nede = mest beskyttende)
                bestCandidate = candidateStops.reduce((best, c) => c.price < best.price ? c : best);
              }

              console.log(`   Kandidater: ${candidateStops.map(c => `${c.mode}@${c.price.toFixed(6)}`).join(', ')}`);
              console.log(`   Valgt: ${bestCandidate.mode}@${bestCandidate.price.toFixed(6)} (mest beskyttende)`);

              // Ratchet check: Må nyt stop flyttes?
              let finalStop = bestCandidate.price;
              let ratchetBlocked = false;

              if (breakEvenRatchetOnly && newStopLoss) {
                if (position.side === 'LONG') {
                  if (finalStop < newStopLoss) {
                    ratchetBlocked = true;
                    console.log(`   ⚠️ RATCHET BLOCKED: Nyt stop ${finalStop.toFixed(6)} < nuværende ${newStopLoss.toFixed(6)}`);
                    finalStop = newStopLoss;
                  }
                } else {
                  if (finalStop > newStopLoss) {
                    ratchetBlocked = true;
                    console.log(`   ⚠️ RATCHET BLOCKED: Nyt stop ${finalStop.toFixed(6)} > nuværende ${newStopLoss.toFixed(6)}`);
                    finalStop = newStopLoss;
                  }
                }
              }

              // KRAV: Break-even må ALDRIG ligge på tabssiden
              // LONG: BE stop skal altid være >= entry (profit side er opad)
              // SHORT: BE stop skal altid være <= entry (profit side er nedad)
              // Dette sikrer at en BREAK_EVEN_HIT aldrig giver negativ PnL
              const originalBECandidate = finalStop;
              let beWrongSide = false;
              
              if (position.side === 'LONG') {
                // LONG: Clamp til mindst entry (offset kan kun være positiv = opad)
                if (finalStop < position.entry_price) {
                  beWrongSide = true;
                  console.log(`\n🚨 ═══════════════════════════════════════════════════════`);
                  console.log(`🚨 BREAK-EVEN FORKERT SIDE AUDIT - ${position.symbol} LONG`);
                  console.log(`🚨 ═══════════════════════════════════════════════════════`);
                  console.log(`   ❌ BE-stop beregnet: ${finalStop.toFixed(6)}`);
                  console.log(`   ❌ Entry price: ${position.entry_price}`);
                  console.log(`   ❌ PROBLEM: BE-stop UNDER entry for LONG = ville give tab!`);
                  console.log(`   ✅ KORRIGERET: Clampes til entry ${position.entry_price}`);
                  console.log(`🚨 ═══════════════════════════════════════════════════════\n`);
                }
                finalStop = Math.max(finalStop, position.entry_price);
              } else {
                // SHORT: Clamp til højst entry (offset kan kun være negativ = nedad)  
                if (finalStop > position.entry_price) {
                  beWrongSide = true;
                  console.log(`\n🚨 ═══════════════════════════════════════════════════════`);
                  console.log(`🚨 BREAK-EVEN FORKERT SIDE AUDIT - ${position.symbol} SHORT`);
                  console.log(`🚨 ═══════════════════════════════════════════════════════`);
                  console.log(`   ❌ BE-stop beregnet: ${finalStop.toFixed(6)}`);
                  console.log(`   ❌ Entry price: ${position.entry_price}`);
                  console.log(`   ❌ PROBLEM: BE-stop OVER entry for SHORT = ville give tab!`);
                  console.log(`   ✅ KORRIGERET: Clampes til entry ${position.entry_price}`);
                  console.log(`🚨 ═══════════════════════════════════════════════════════\n`);
                }
                finalStop = Math.min(finalStop, position.entry_price);
              }
              
              console.log(`   BE clamp: ${originalBECandidate.toFixed(6)} -> ${finalStop.toFixed(6)} (entry=${position.entry_price}, wrongSide=${beWrongSide})`);

              if (!ratchetBlocked) {
                breakEvenActivatedThisCycle = true;
                breakEvenActivatedState = true;
                breakEvenAtPrice = finalStop;
                breakEvenTriggerPrice = bestCandidate.triggerPrice;
                newStopLoss = finalStop;
                stopLossAfterBE = newStopLoss;

                const updatedSnapshot = {
                  ...position.indicators_snapshot,
                  // Bevar initial SL som “max loss”-anker
                  original_stop_loss: position.indicators_snapshot?.original_stop_loss ?? position.stop_loss,
                  break_even_at_price: breakEvenAtPrice,
                  break_even_trigger_price: breakEvenTriggerPrice,
                  break_even_triggered_at: new Date().toISOString(),
                  stop_loss_after_be: stopLossAfterBE,
                  break_even_mode: bestCandidate.mode,
                  break_even_candidates: candidateStops.length,
                };
                await supabaseClient
                  .from('positions')
                  .update({
                    stop_loss: newStopLoss,
                    break_even_activated: true,
                    indicators_snapshot: updatedSnapshot,
                  })
                  .eq('id', position.id);

                // AUDIT: BE_ATR_SL_SET log entry when ATR mode is used
                if (bestCandidate.mode === 'ATR') {
                  console.log(`\n🎯 BE_ATR_SL_SET: ${position.symbol} ${position.side} | newSL=${breakEvenAtPrice?.toFixed(6)} | entry=${position.entry_price} | offset=${breakEvenAtrStopOffset}xATR | ATR=${snapshotAtr.toFixed(6)}`);
                }
                
                console.log(`\n📊 ═══════════════════════════════════════════════════════`);
                console.log(`📊 BREAK-EVEN ACTIVATED - ${position.symbol} ${position.side}`);
                console.log(`📊 ═══════════════════════════════════════════════════════`);
                console.log(`   Mode: ${bestCandidate.mode}`);
                console.log(`   entry_price: ${position.entry_price}`);
                console.log(`   break_even_at_price: ${breakEvenAtPrice}`);
                console.log(`   stop_loss_after_be: ${stopLossAfterBE}`);
                console.log(`📊 ═══════════════════════════════════════════════════════\n`);
              }
            } else {
              console.log(`   Ingen BE-mode triggered endnu`);
            }
          }
        } else if (!breakEvenMasterEnabled) {
          console.log(`   ⏭️ Break-even DISABLED (break_even_enabled=false)`);
        } else {
          // Break-even er ALLEREDE aktiveret - sørg for at newStopLoss reflekterer BE-prisen
          const existingBEPrice = position.indicators_snapshot?.break_even_at_price;

          const clampBeToEntrySide = (level: number) => {
            const clamped = position.side === 'LONG'
              ? Math.max(level, position.entry_price)
              : Math.min(level, position.entry_price);

            // Audit: BE må aldrig ligge på "forkert" side af entry
            if (clamped !== level) {
              console.error(
                `🚨 BE_SIDE_VIOLATION | ${position.symbol} ${position.side} | entry=${position.entry_price} | be_raw=${level} | be_clamped=${clamped}`
              );
            }

            return clamped;
          };

          if (existingBEPrice !== null && existingBEPrice !== undefined && isFinite(existingBEPrice)) {
            newStopLoss = clampBeToEntrySide(Number(existingBEPrice));
            breakEvenAtPrice = newStopLoss;
            breakEvenActivatedState = true;
            stopLossAfterBE = newStopLoss;

            // Sikr at original_stop_loss eksisterer for audit
            if (position.stop_loss && (position.indicators_snapshot?.original_stop_loss == null)) {
              const patchedSnapshot = {
                ...(position.indicators_snapshot || {}),
                original_stop_loss: position.stop_loss,
              };
              await supabaseClient
                .from('positions')
                .update({ indicators_snapshot: patchedSnapshot })
                .eq('id', position.id);
            }

            console.log(`📋 Break-even ALLEREDE AKTIV for ${position.symbol}:`);
            console.log(`   break_even_at_price: ${existingBEPrice}`);
            console.log(`   newStopLoss synkroniseret: ${newStopLoss}`);
          } else {
            // Retroaktiv fix: Brug entry_price som BE-pris
            console.log(`⚠️ BE activated men break_even_at_price er null - retroaktiv fix til entry_price`);
            newStopLoss = position.entry_price;
            breakEvenAtPrice = position.entry_price;
            breakEvenActivatedState = true;
            stopLossAfterBE = position.entry_price;

            const fixedSnapshot = {
              ...(position.indicators_snapshot || {}),
              original_stop_loss: (position.indicators_snapshot as any)?.original_stop_loss ?? position.stop_loss,
              break_even_at_price: position.entry_price,
              break_even_retroactive_fix: true,
              break_even_fix_timestamp: new Date().toISOString(),
            };
            await supabaseClient
              .from('positions')
              .update({
                indicators_snapshot: fixedSnapshot,
                stop_loss: position.entry_price,
              })
              .eq('id', position.id);
          }
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // MAX SL AFTER MFE - Cap SL når MFE er nået, men KUN før BE trigger
        // ═══════════════════════════════════════════════════════════════════════
        // Regel: Når trade har været i profit (MFE >= aktiveringsthreshold), stram 
        // SL så den ikke kan ligge længere væk end max_dist% fra entry. Gælder kun før BE.
        // 
        // LONG: SL må ikke være under entry * (1 - max_dist/100)
        // SHORT: SL må ikke være over entry * (1 + max_dist/100)
        // ═══════════════════════════════════════════════════════════════════════
        
        if (maxSlAfterMfeEnabled && !breakEvenActivatedState) {
          // Beregn MFE% (Maximum Favorable Excursion)
          // Dette er hvor langt prisen har været i gunstig retning
          const mfePct = position.side === 'LONG'
            ? ((newPeakPrice - position.entry_price) / position.entry_price) * 100
            : ((position.entry_price - newPeakPrice) / position.entry_price) * 100;
          
          console.log(`\n🎯 MAX_SL_AFTER_MFE Check - ${position.symbol} ${position.side}`);
          console.log(`   Config: aktivér ved MFE=${maxSlAfterMfeActivatePct}%, max dist=${maxSlAfterMfeMaxDistPct}%`);
          console.log(`   MFE%: ${mfePct.toFixed(4)}% (peak=${newPeakPrice}, entry=${position.entry_price})`);
          console.log(`   BE aktiveret: ${breakEvenActivatedState}`);
          
          // Reglen gælder kun når MFE >= aktiverings-threshold
          if (mfePct >= maxSlAfterMfeActivatePct) {
            let maxSlCapApplied = false;
            
            if (position.side === 'LONG') {
              // LONG: SL må ikke være under entry * (1 - max_dist/100)
              const minAllowedSl = position.entry_price * (1 - maxSlAfterMfeMaxDistPct / 100);
              
              if (newStopLoss !== null && newStopLoss !== undefined && newStopLoss < minAllowedSl) {
                console.log(`   ✅ CAP APPLIED: SL strammes fra ${newStopLoss.toFixed(6)} → ${minAllowedSl.toFixed(6)}`);
                newStopLoss = minAllowedSl;
                maxSlCapApplied = true;
              } else {
                console.log(`   ⏭️ Ingen ændring: SL (${newStopLoss?.toFixed(6) ?? 'null'}) er allerede ≥ min (${minAllowedSl.toFixed(6)})`);
              }
            } else {
              // SHORT: SL må ikke være over entry * (1 + max_dist/100)
              const maxAllowedSl = position.entry_price * (1 + maxSlAfterMfeMaxDistPct / 100);
              
              if (newStopLoss !== null && newStopLoss !== undefined && newStopLoss > maxAllowedSl) {
                console.log(`   ✅ CAP APPLIED: SL strammes fra ${newStopLoss.toFixed(6)} → ${maxAllowedSl.toFixed(6)}`);
                newStopLoss = maxAllowedSl;
                maxSlCapApplied = true;
              } else {
                console.log(`   ⏭️ Ingen ændring: SL (${newStopLoss?.toFixed(6) ?? 'null'}) er allerede ≤ max (${maxAllowedSl.toFixed(6)})`);
              }
            }
            
            // Opdater database hvis SL blev ændret
            if (maxSlCapApplied) {
              await supabaseClient
                .from('positions')
                .update({
                  stop_loss: newStopLoss,
                  indicators_snapshot: {
                    ...position.indicators_snapshot,
                    max_sl_after_mfe_applied: true,
                    max_sl_after_mfe_at: new Date().toISOString(),
                    max_sl_after_mfe_activate_pct: maxSlAfterMfeActivatePct,
                    max_sl_after_mfe_max_dist_pct: maxSlAfterMfeMaxDistPct,
                    max_sl_after_mfe_mfe_pct: mfePct,
                  }
                })
                .eq('id', position.id);
              
              console.log(`   💾 Database opdateret med ny SL: ${newStopLoss}`);
            }
          } else {
            console.log(`   ⏭️ MFE (${mfePct.toFixed(4)}%) < aktiveringsthreshold (${maxSlAfterMfeActivatePct}%) - afventer`);
          }
        }
        
        // NOW calculate trailing stop (using updated stop loss from break-even)
        // NY EXIT-LOGIK: Hard SL % → Max SL after MFE → Break-even → Peak-Lock → ATR Trailing

        // 1) Hard SL % (absolut yderste grænse - prioritet 1)
        // LONG: Exit hvis price ≤ entry × (1 − hard_sl_pct/100)
        // SHORT: Exit hvis price ≥ entry × (1 + hard_sl_pct/100)
        // Hard SL kan kun strammes ind, aldrig ud
        let hardStopLoss: number | null = null;
        if (hardSlPctEnabled) {
          if (position.side === 'LONG') {
            hardStopLoss = position.entry_price * (1 - hardSlPct / 100);
          } else {
            hardStopLoss = position.entry_price * (1 + hardSlPct / 100);
          }
          
          // Ratchet: Hard SL kan kun strammes ind (gøres strammere af andre mekanismer, men den yderste grænse selv ændres ikke)
          // Original SL fra position bruges til sammenligning - vælg den strammeste
          const originalSl = position.indicators_snapshot?.original_stop_loss ?? position.stop_loss;
          if (originalSl !== null && originalSl !== undefined && isFinite(Number(originalSl))) {
            if (position.side === 'LONG') {
              // LONG: Højere SL er strammere
              hardStopLoss = Math.max(hardStopLoss, Number(originalSl));
            } else {
              // SHORT: Lavere SL er strammere
              hardStopLoss = Math.min(hardStopLoss, Number(originalSl));
            }
          }
          
          console.log(`   🛑 HARD SL %: ${hardSlPct}% = ${hardStopLoss.toFixed(6)} (entry=${position.entry_price})`);
        } else {
          console.log(`   🛑 HARD SL %: DISABLED`);
        }

        const clampToEntrySide = (level: number) => {
          if (position.side === 'LONG') return Math.max(level, position.entry_price);
          return Math.min(level, position.entry_price);
        };

        // 2) Break-even stop (kun hvis BE er aktiveret)
        const breakEvenStop = breakEvenActivatedState
          ? clampToEntrySide(Number(newStopLoss ?? position.entry_price))
          : null;

        // 3) Trailing må kun aktiveres efter BE + i profit + threshold
        const trailingActivationCheckPassed =
          trailingAlreadyActivated || !trailingActivationEnabled || trailingProfitThresholdPassed;

        // 🔴 FIX: Trailing stop kan aktiveres UAFHÆNGIGT af break-even
        // Hvis trailing threshold (f.eks. 2×ATR) er lavere end BE threshold (f.eks. 3×ATR),
        // så skal trailing stop stadig kunne aktivere når den når sin egen threshold
        let trailingActivationReason = 'WAITING_FOR_THRESHOLD';
        if (!isInProfit) {
          trailingActivationReason = 'BLOCKED_NOT_IN_PROFIT';
        } else if (trailingAlreadyActivated) {
          trailingActivationReason = 'ACTIVE_ALREADY_IN_DB';
        } else if (!trailingActivationEnabled) {
          trailingActivationReason = 'ACTIVE_CONFIG_DISABLED';
        } else if (trailingProfitThresholdPassed) {
          trailingActivationReason = 'ACTIVE_THRESHOLD_MET';
        } else {
          trailingActivationReason = 'WAITING_FOR_TRAILING_THRESHOLD';
        }

        // 🔴 FIX: Trailing kan aktiveres når enten:
        // 1) Break-even ER aktiveret OG i profit OG trailing threshold passed, ELLER
        // 2) Trailing threshold passed OG i profit (uanset BE status)
        // Dette tillader trailing at aktivere når 2×ATR er nået selv hvis BE kræver 3×ATR
        trailingStopActive = isInProfit && trailingActivationCheckPassed;

        let trailingValidThisCycle = false;

        if (trailingStopActive) {
          // Peak opdateres nu tidligere i flowet (linje ~448) så den er korrekt her

          // Beregn trailing
          if (isLegacyPosition) {
            const legacyTrailingPercent = 1.8;
            const trailingDistance = position.entry_price * (legacyTrailingPercent / 100);
            console.log(`   LEGACY trailing stop beregning:`);
            console.log(`   Trailing %: ${legacyTrailingPercent}%`);
            console.log(`   Distance: ${trailingDistance.toFixed(6)}`);

            if (position.side === 'LONG') {
              const calculatedTrailingStop = newPeakPrice - trailingDistance;
              newTrailingStop = newStopLoss ? Math.max(calculatedTrailingStop, newStopLoss) : calculatedTrailingStop;
              console.log(
                `   LONG: peak=${newPeakPrice}, calculated=${calculatedTrailingStop.toFixed(4)}, final=${newTrailingStop.toFixed(4)}`
              );
            } else {
              const calculatedTrailingStop = newPeakPrice + trailingDistance;
              newTrailingStop = newStopLoss ? Math.min(calculatedTrailingStop, newStopLoss) : calculatedTrailingStop;
              console.log(
                `   SHORT: peak=${newPeakPrice}, calculated=${calculatedTrailingStop.toFixed(4)}, final=${newTrailingStop.toFixed(4)}`
              );
            }
          } else {
            // ATR-baseret trailing stop
            // Prioritet: UI config → snapshot (backwards compatibility)
            const rawMultiplier = atrTrailingStopMultiplierFromUi
              ?? position.indicators_snapshot?.atr_trailing_stop_multiplier
              ?? position.indicators_snapshot?.trailing_stop_atr_multiplier;
            const DEFAULT_TRAILING_MULTIPLIER = 1.8;
            const multiplierUsedFallback = rawMultiplier === null || rawMultiplier === undefined;
            const atrTrailingMultiplier = rawMultiplier ?? DEFAULT_TRAILING_MULTIPLIER;

            if (multiplierUsedFallback) {
              console.log(`\n⚠️ ═══════════════════════════════════════════════════════`);
              console.log(`⚠️ TRAILING STOP AUDIT WARNING - ${position.symbol} ${position.side}`);
              console.log(`⚠️ ═══════════════════════════════════════════════════════`);
              console.log(`   ❌ atr_trailing_stop_multiplier: ${position.indicators_snapshot?.atr_trailing_stop_multiplier ?? 'NULL'}`);
              console.log(`   ❌ trailing_stop_atr_multiplier: ${position.indicators_snapshot?.trailing_stop_atr_multiplier ?? 'NULL'}`);
              console.log(`   🔧 FALLBACK APPLIED: ${DEFAULT_TRAILING_MULTIPLIER}x`);
              console.log(`⚠️ ═══════════════════════════════════════════════════════\n`);
            }

            const trailingDistance = snapshotAtr * atrTrailingMultiplier;
            console.log(`   ATR trailing stop beregning:`);
            console.log(`   ATR: ${snapshotAtr.toFixed(6)}`);
            console.log(`   Multiplier: ${atrTrailingMultiplier}x${multiplierUsedFallback ? ' (FALLBACK!)' : ''}`);
            console.log(`   Distance: ${trailingDistance.toFixed(6)}`);

            let calculatedTrailingStop: number;
            let clampApplied = false;
            let clampReason: string | null = null;
            let clampDelta = 0;

            if (position.side === 'LONG') {
              calculatedTrailingStop = newPeakPrice - trailingDistance;
              if (newStopLoss && calculatedTrailingStop < newStopLoss) {
                clampApplied = true;
                clampDelta = newStopLoss - calculatedTrailingStop;
                clampReason = breakEvenActivatedState ? 'CLAMP_TO_BREAK_EVEN' : 'CLAMP_TO_STOP_LOSS';
                newTrailingStop = newStopLoss;
              } else {
                newTrailingStop = calculatedTrailingStop;
              }
              console.log(
                `   LONG: peak=${newPeakPrice}, expected=${calculatedTrailingStop.toFixed(8)}, final=${newTrailingStop.toFixed(8)}${clampApplied ? ` (${clampReason}, delta=${clampDelta.toFixed(8)})` : ''}`
              );
            } else {
              calculatedTrailingStop = newPeakPrice + trailingDistance;
              if (newStopLoss && calculatedTrailingStop > newStopLoss) {
                clampApplied = true;
                clampDelta = calculatedTrailingStop - newStopLoss;
                clampReason = breakEvenActivatedState ? 'CLAMP_TO_BREAK_EVEN' : 'CLAMP_TO_STOP_LOSS';
                newTrailingStop = newStopLoss;
              } else {
                newTrailingStop = calculatedTrailingStop;
              }
              console.log(
                `   SHORT: peak=${newPeakPrice}, expected=${calculatedTrailingStop.toFixed(8)}, final=${newTrailingStop.toFixed(8)}${clampApplied ? ` (${clampReason}, delta=${clampDelta.toFixed(8)})` : ''}`
              );
            }

            // @ts-ignore - dynamisk tilføjet property
            position._trailingClampInfo = {
              expected_trailing_level: calculatedTrailingStop,
              effective_trailing_level: newTrailingStop,
              was_clamped: clampApplied,
              clamp_reason: clampReason,
              clamp_delta: clampDelta,
              clamp_protection_level: clampApplied ? newStopLoss : null,
            };
          }

          // ═══════════════════════════════════════════════
          // 🆕 PSAR TRAILING STOP ENHANCEMENT
          // When enabled, calculate live PSAR and use most protective level
          // ═══════════════════════════════════════════════
          if (psarTrailingEnabled && newTrailingStop !== null) {
            try {
              // Fetch recent klines for PSAR calculation
              const klineResponse = await fetch(
                `https://fapi.binance.com/fapi/v1/klines?symbol=${position.symbol}&interval=5m&limit=50`
              );
              if (klineResponse.ok) {
                const klineData = await klineResponse.json();
                const kHighs = klineData.map((k: any) => parseFloat(k[2]));
                const kLows = klineData.map((k: any) => parseFloat(k[3]));
                const kCloses = klineData.map((k: any) => parseFloat(k[4]));
                
                const psarResult = calculatePSARForTrailing(kHighs, kLows, kCloses, psarAfStart, psarAfIncrement, psarAfMax);
                
                if (psarResult) {
                  const psarValue = psarResult.value;
                  
                  // Model B: Most Protective - use tightest stop
                  if (position.side === 'LONG') {
                    // LONG: higher trailing stop is more protective
                    if (psarValue > newTrailingStop && psarResult.direction === 'up') {
                      console.log(`   📊 PSAR TRAILING: PSAR=${psarValue.toFixed(8)} > ATR_trailing=${newTrailingStop.toFixed(8)} → using PSAR (more protective)`);
                      newTrailingStop = psarValue;
                    } else {
                      console.log(`   📊 PSAR TRAILING: PSAR=${psarValue.toFixed(8)} <= ATR_trailing=${newTrailingStop.toFixed(8)} → keeping ATR (more protective)`);
                    }
                  } else {
                    // SHORT: lower trailing stop is more protective
                    if (psarValue < newTrailingStop && psarResult.direction === 'down') {
                      console.log(`   📊 PSAR TRAILING: PSAR=${psarValue.toFixed(8)} < ATR_trailing=${newTrailingStop.toFixed(8)} → using PSAR (more protective)`);
                      newTrailingStop = psarValue;
                    } else {
                      console.log(`   📊 PSAR TRAILING: PSAR=${psarValue.toFixed(8)} >= ATR_trailing=${newTrailingStop.toFixed(8)} → keeping ATR (more protective)`);
                    }
                  }
                }
              }
            } catch (psarError) {
              console.warn(`⚠️ PSAR trailing calculation failed for ${position.symbol}: ${psarError}`);
            }
          }
          // LONG: trailing-stop skal altid ligge OVER entry
          // SHORT: trailing-stop skal altid ligge UNDER entry
          if (newTrailingStop !== null && newTrailingStop !== undefined && isFinite(newTrailingStop)) {
            newTrailingStop = Number(newTrailingStop);

            const tsInProfitZone = position.side === 'LONG'
              ? newTrailingStop > position.entry_price
              : newTrailingStop < position.entry_price;

            if (!tsInProfitZone) {
              trailingStopActive = false;
              trailingActivationReason = 'BLOCKED_TS_NOT_IN_PROFIT_ZONE';
              console.log(`   ⛔ Trailing IGNORED (not in profit zone): ts=${newTrailingStop} entry=${position.entry_price}`);
            } else {
              // KRAV: Trailing må aldrig være dårligere end break-even
              const tsWorseThanBe = breakEvenStop !== null
                ? (position.side === 'LONG' ? newTrailingStop < breakEvenStop : newTrailingStop > breakEvenStop)
                : false;

              // KRAV: Trailing må aldrig være værre end hard SL (max loss) - kun hvis hard SL er enabled
              const tsWorseThanSl = hardStopLoss !== null && (position.side === 'LONG' 
                ? newTrailingStop < hardStopLoss 
                : newTrailingStop > hardStopLoss);

              if (tsWorseThanSl) {
                trailingStopActive = false;
                trailingActivationReason = 'BLOCKED_TS_WORSE_THAN_SL';
                // 🚨 MECHANICAL EXIT CONFLICT: Trailing forsøger at sætte stop værre end hard SL
                console.error(`\n🚨 ═══════════════════════════════════════════════════════`);
                console.error(`🚨 MECHANICAL_EXIT_CONFLICT - ${position.symbol} ${position.side}`);
                console.error(`🚨 ═══════════════════════════════════════════════════════`);
                console.error(`   conflict_type: TRAILING_WORSE_THAN_HARD_SL`);
                console.error(`   trailing_calculated: ${newTrailingStop}`);
                console.error(`   hard_stop_loss: ${hardStopLoss}`);
                console.error(`   break_even_stop: ${breakEvenStop}`);
                console.error(`   entry_price: ${position.entry_price}`);
                console.error(`   current_price: ${currentPrice}`);
                console.error(`   action: TRAILING_PAUSED (hierarki respekteret)`);
                console.error(`   hierarchy: Hard SL → Break-even → Trailing`);
                console.error(`🚨 ═══════════════════════════════════════════════════════\n`);
              } else if (tsWorseThanBe) {
                trailingStopActive = false;
                trailingActivationReason = 'BLOCKED_TS_WORSE_THAN_BREAK_EVEN';
                // 🚨 MECHANICAL EXIT CONFLICT: Trailing forsøger at sætte stop værre end break-even
                console.error(`\n🚨 ═══════════════════════════════════════════════════════`);
                console.error(`🚨 MECHANICAL_EXIT_CONFLICT - ${position.symbol} ${position.side}`);
                console.error(`🚨 ═══════════════════════════════════════════════════════`);
                console.error(`   conflict_type: TRAILING_WORSE_THAN_BREAK_EVEN`);
                console.error(`   trailing_calculated: ${newTrailingStop}`);
                console.error(`   break_even_stop: ${breakEvenStop}`);
                console.error(`   hard_stop_loss: ${hardStopLoss}`);
                console.error(`   entry_price: ${position.entry_price}`);
                console.error(`   current_price: ${currentPrice}`);
                console.error(`   action: TRAILING_PAUSED (hierarki respekteret)`);
                console.error(`   hierarchy: Hard SL → Break-even → Trailing`);
                console.error(`🚨 ═══════════════════════════════════════════════════════\n`);
              } else {
                trailingValidThisCycle = true;
              }
            }
          } else {
            trailingStopActive = false;
            trailingActivationReason = 'BLOCKED_TS_INVALID_LEVEL';
          }
        } else {
          // Ikke aktiv endnu (pga BE-gate eller threshold)
          console.log(
            `   Trailing status: ${trailingActivationReason} | threshold=${trailingProfitThresholdLabel} | inProfit=${isInProfit} | BE=${breakEvenActivatedState}`
          );
        }

        // 🔒 PEAK-LOCK TRAILING (procent-baseret)
        // Kombinerer med eksisterende trailing stop - vælger det strammeste
        let peakLockStop: number | null = null;
        let peakLockActive = false;

        if (peakLockEnabled && isInProfit) {
          const profitPctFromEntry = Math.abs(profitPercent);

          if (profitPctFromEntry >= peakLockActivateProfitPct) {
            peakLockActive = true;

            // Beregn peak-lock stop og profit floor
            let peakLockStopFromPeak: number;
            let profitFloorStop: number;

            if (position.side === 'LONG') {
              // LONG: stop under peak, floor over entry
              peakLockStopFromPeak = newPeakPrice * (1 - peakLockDistancePct / 100);
              profitFloorStop = position.entry_price * (1 + peakLockMinProfitFloorPct / 100);
              // Kandidat stop = max(peak-lock, floor)
              peakLockStop = Math.max(peakLockStopFromPeak, profitFloorStop);
            } else {
              // SHORT: stop over peak, floor under entry
              peakLockStopFromPeak = newPeakPrice * (1 + peakLockDistancePct / 100);
              profitFloorStop = position.entry_price * (1 - peakLockMinProfitFloorPct / 100);
              // Kandidat stop = min(peak-lock, floor)
              peakLockStop = Math.min(peakLockStopFromPeak, profitFloorStop);
            }

            console.log(`\n🔒 PEAK-LOCK TRAILING AKTIV - ${position.symbol} ${position.side}`);
            console.log(`   profit_pct: ${profitPctFromEntry.toFixed(4)}% (threshold: ${peakLockActivateProfitPct}%)`);
            console.log(`   peak_price: ${newPeakPrice}`);
            console.log(`   peak_lock_stop_from_peak: ${peakLockStopFromPeak.toFixed(8)}`);
            console.log(`   profit_floor_stop: ${profitFloorStop.toFixed(8)}`);
            console.log(`   peak_lock_candidate: ${peakLockStop.toFixed(8)}`);

            // Kombinér med eksisterende stop (ATR/BE trailing)
            if (newTrailingStop !== null && newTrailingStop !== undefined && isFinite(newTrailingStop)) {
              const existingStop = Number(newTrailingStop);
              const beforeCombine = newTrailingStop;

              if (position.side === 'LONG') {
                // LONG: vælg højeste (strammeste)
                newTrailingStop = Math.max(existingStop, peakLockStop);
              } else {
                // SHORT: vælg laveste (strammeste)
                newTrailingStop = Math.min(existingStop, peakLockStop);
              }

              console.log(`   existing_trailing: ${beforeCombine.toFixed(8)}`);
              console.log(`   final_trailing: ${newTrailingStop.toFixed(8)} (${newTrailingStop === beforeCombine ? 'ATR' : 'PEAK-LOCK'})`);
            } else {
              // Ingen eksisterende trailing - brug peak-lock direkte
              newTrailingStop = peakLockStop;
              trailingStopActive = true;
              trailingValidThisCycle = true;
              console.log(`   No existing trailing - using peak-lock as trailing: ${newTrailingStop.toFixed(8)}`);
            }

            // Ratchet: stop må kun strammes
            if (peakLockRatchetOnly && position.trailing_stop != null) {
              const dbTrailingStop = Number(position.trailing_stop);
              const beforeRatchet = newTrailingStop;

              // Ratchet: stop må kun strammes (mere beskyttende)
              // LONG: højere stop = mere beskyttende (tættere på pris) → Math.max
              // SHORT: lavere stop = mere beskyttende (tættere på pris) → Math.min
              newTrailingStop = position.side === 'LONG'
                ? Math.max(newTrailingStop, dbTrailingStop)
                : Math.min(newTrailingStop, dbTrailingStop);

              if (newTrailingStop !== beforeRatchet) {
                console.log(`   🔧 RATCHET: ${beforeRatchet.toFixed(8)} → ${newTrailingStop.toFixed(8)} (kept DB value)`);
              }
            }
          } else {
            console.log(`   🔒 Peak-lock waiting: profit=${profitPctFromEntry.toFixed(4)}% < threshold=${peakLockActivateProfitPct}%`);
          }
        }

        const trailingStop = trailingStopActive && trailingValidThisCycle
          ? Number(newTrailingStop)
          : null;

        // 🔍 DEBUG LOG: Kompakt oversigt over stop-kandidater og winner (kun når debug=true)
        if (debug) {
          // Beregn hvilken stop-kandidat der vinder (mest beskyttende)
          const candidates: { name: string; value: number | null; active: boolean }[] = [
            { name: 'HARD_SL_PCT', value: hardStopLoss, active: hardSlPctEnabled && hardStopLoss !== null },
            { name: 'BREAK_EVEN', value: breakEvenStop, active: breakEvenActivatedState && breakEvenStop !== null },
            { name: 'PEAK_LOCK', value: peakLockActive ? trailingStop : null, active: peakLockActive },
            { name: 'ATR_TRAILING', value: trailingValidThisCycle && !peakLockActive ? trailingStop : null, active: trailingValidThisCycle && !peakLockActive },
          ];

          // Find winner: For LONG = højeste, for SHORT = laveste
          const activeCandidates = candidates.filter(c => c.active && c.value !== null);
          let winner = 'NONE';
          let finalStop: number | null = null;

          if (activeCandidates.length > 0) {
            if (position.side === 'LONG') {
              const best = activeCandidates.reduce((a, b) => (b.value! > a.value! ? b : a));
              winner = best.name;
              finalStop = best.value;
            } else {
              const best = activeCandidates.reduce((a, b) => (b.value! < a.value! ? b : a));
              winner = best.name;
              finalStop = best.value;
            }
          }

          console.log(`\n🔧 ═══════════════════════════════════════════════════════`);
          console.log(`🔧 DEBUG: ${position.symbol} ${position.side}`);
          console.log(`🔧 ═══════════════════════════════════════════════════════`);
          console.log(`   UI Settings:`);
          console.log(`     hardSlPct: ${hardSlPct}%`);
          console.log(`     peakLockEnabled: ${peakLockEnabled}`);
          console.log(`     trailingActivationEnabled: ${trailingActivationEnabled}`);
          console.log(`     breakEvenMasterEnabled: ${breakEvenMasterEnabled}`);
          console.log(`   Peak Tracking:`);
          console.log(`     peakTrackingEnabled: ${peakTrackingEnabled}`);
          console.log(`     peakWasUpdated: ${peakWasUpdated}`);
          console.log(`     peak_price: ${newPeakPrice.toFixed(6)}`);
          console.log(`   Stop Candidates (priority order):`);
          console.log(`     1️⃣ HARD_SL_PCT: ${hardStopLoss !== null ? hardStopLoss.toFixed(6) : 'DISABLED'} (${hardSlPct}% from entry, enabled: ${hardSlPctEnabled})`);
          console.log(`     2️⃣ MAX_SL_AFTER_MFE: computed later (active: ${maxSlAfterMfeEnabled})`);
          console.log(`     3️⃣ BREAK_EVEN: ${breakEvenStop !== null ? breakEvenStop.toFixed(6) : 'N/A'} (active: ${breakEvenActivatedState})`);
          console.log(`     4️⃣ PEAK_LOCK: ${peakLockActive ? trailingStop?.toFixed(6) : 'N/A'} (active: ${peakLockActive})`);
          console.log(`     5️⃣ ATR_TRAILING: ${trailingValidThisCycle && !peakLockActive ? trailingStop?.toFixed(6) : 'N/A'} (active: ${trailingValidThisCycle && !peakLockActive})`);
          console.log(`   Winner:`);
          console.log(`     🏆 ${winner} @ ${finalStop !== null ? finalStop.toFixed(6) : 'N/A'}`);
          console.log(`🔧 ═══════════════════════════════════════════════════════\n`);
        }

        // 🔍 EXIT HIERARCHY AUDIT - Bekræft rækkefølgen Hard SL % → Max SL after MFE → Break-even → Peak-Lock → Trailing
        console.log(`\n📊 EXIT HIERARCHY AUDIT - ${position.symbol} ${position.side}`);
        console.log(`   ═══════════════════════════════════════════════════════`);
        console.log(`   1️⃣ HARD SL % (${hardSlPct}%): ${hardStopLoss !== null ? hardStopLoss.toFixed(8) : 'DISABLED'} (enabled: ${hardSlPctEnabled})`);
        console.log(`   2️⃣ MAX_SL_AFTER_MFE: computed later (enabled: ${maxSlAfterMfeEnabled})`);
        console.log(`   3️⃣ BREAK-EVEN: ${breakEvenStop !== null ? breakEvenStop.toFixed(8) : 'N/A'} (activated: ${breakEvenActivatedState})`);
        console.log(`   4️⃣ PEAK-LOCK: ${peakLockActive ? trailingStop?.toFixed(8) : 'N/A'} (active: ${peakLockActive})`);
        console.log(`   5️⃣ ATR_TRAILING: ${trailingStop !== null ? trailingStop.toFixed(8) : 'N/A'} (valid: ${trailingValidThisCycle})`);
        console.log(`   ───────────────────────────────────────────────────────`);
        console.log(`   entry_price: ${position.entry_price}`);
        console.log(`   current_price: ${currentPrice}`);
        console.log(`   profit_distance: ${profitDistance.toFixed(8)}`);
        console.log(`   is_in_profit: ${isInProfit}`);
        
        // Bekræft hierarki-invarianter
        let hierarchyValid = true;
        const hierarchyViolations: string[] = [];
        
        // INVARIANT 1: For LONG: Hard SL <= BE <= Trailing (alle skal være under entry i tab, over i profit)
        // INVARIANT 2: For SHORT: Hard SL >= BE >= Trailing (omvendt)
        if (position.side === 'LONG') {
          if (breakEvenStop !== null && hardStopLoss !== null && breakEvenStop < hardStopLoss) {
            hierarchyValid = false;
            hierarchyViolations.push(`BE(${breakEvenStop}) < HardSL(${hardStopLoss})`);
          }
          if (trailingStop !== null && breakEvenStop !== null && trailingStop < breakEvenStop) {
            hierarchyValid = false;
            hierarchyViolations.push(`Trailing(${trailingStop}) < BE(${breakEvenStop})`);
          }
        } else {
          if (breakEvenStop !== null && hardStopLoss !== null && breakEvenStop > hardStopLoss) {
            hierarchyValid = false;
            hierarchyViolations.push(`BE(${breakEvenStop}) > HardSL(${hardStopLoss})`);
          }
          if (trailingStop !== null && breakEvenStop !== null && trailingStop > breakEvenStop) {
            hierarchyValid = false;
            hierarchyViolations.push(`Trailing(${trailingStop}) > BE(${breakEvenStop})`);
          }
        }
        
        if (!hierarchyValid) {
          console.error(`   🚨 MECHANICAL_EXIT_CONFLICT: HIERARCHY_VIOLATION`);
          console.error(`   violations: ${hierarchyViolations.join(', ')}`);
          console.error(`   action: Trailing will be paused if active`);
        } else {
          console.log(`   ✅ hierarchy_valid: true`);
        }
        console.log(`   ═══════════════════════════════════════════════════════\n`);

        // 4) Hit checks - vælg det HØJESTE stop level for LONG (laveste for SHORT)
        // Da monitor kører periodisk, kan prisen falde under flere levels på én gang.
        // Vi skal vælge det level der BURDE have lukket først (højeste for LONG).
        
        const slTriggered = hardStopLoss !== null && (
          (position.side === 'LONG' && currentPrice <= hardStopLoss) ||
          (position.side === 'SHORT' && currentPrice >= hardStopLoss)
        );

        const beTriggered = breakEvenStop !== null && (
          (position.side === 'LONG' && currentPrice <= breakEvenStop) ||
          (position.side === 'SHORT' && currentPrice >= breakEvenStop)
        );

        const tsTriggered = trailingStop !== null && (
          (position.side === 'LONG' && currentPrice <= trailingStop) ||
          (position.side === 'SHORT' && currentPrice >= trailingStop)
        );

        // ═══════════════════════════════════════════════════════════════════════
        // MAX SL AFTER MFE EXIT CHECK
        // ═══════════════════════════════════════════════════════════════════════
        // Beregn det effektive Max SL cap niveau og tjek om det er ramt
        let maxSlAfterMfeCap: number | null = null;
        let maxSlAfterMfeTriggered = false;
        
        if (maxSlAfterMfeEnabled && !breakEvenActivatedState) {
          const mfePctForExit = position.side === 'LONG'
            ? ((newPeakPrice - position.entry_price) / position.entry_price) * 100
            : ((position.entry_price - newPeakPrice) / position.entry_price) * 100;
          
          if (mfePctForExit >= maxSlAfterMfeActivatePct) {
            if (position.side === 'LONG') {
              maxSlAfterMfeCap = position.entry_price * (1 - maxSlAfterMfeMaxDistPct / 100);
              maxSlAfterMfeTriggered = currentPrice <= maxSlAfterMfeCap;
            } else {
              maxSlAfterMfeCap = position.entry_price * (1 + maxSlAfterMfeMaxDistPct / 100);
              maxSlAfterMfeTriggered = currentPrice >= maxSlAfterMfeCap;
            }
            
            if (maxSlAfterMfeTriggered) {
              console.log(`\n🎯 MAX_SL_AFTER_MFE EXIT TRIGGERED - ${position.symbol} ${position.side}`);
              console.log(`   MFE%: ${mfePctForExit.toFixed(4)}% >= ${maxSlAfterMfeActivatePct}%`);
              console.log(`   Max SL Cap: ${maxSlAfterMfeCap.toFixed(6)}`);
              console.log(`   Current Price: ${currentPrice} ${position.side === 'LONG' ? '<=' : '>='} ${maxSlAfterMfeCap.toFixed(6)}`);
            }
          }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 🔴 KRAV 2: EXIT MODEL B - effective_stop = mest beskyttende stop
        // LONG: effective_stop = MAX(alle aktive stop levels)
        // SHORT: effective_stop = MIN(alle aktive stop levels)
        // ═══════════════════════════════════════════════════════════════════════
        
        // 1) Byg candidate_stops[] med ALLE aktive stop-niveauer (uanset om triggered)
        const candidateStops: { type: string; level: number; active: boolean; triggered: boolean }[] = [];
        
        // Hard SL % - altid aktiv hvis enabled
        if (hardSlPctEnabled && hardStopLoss !== null) {
          candidateStops.push({ 
            type: 'HARD_STOP_LOSS_HIT', 
            level: hardStopLoss, 
            active: true, 
            triggered: slTriggered 
          });
        }
        
        // Max SL after MFE - kun aktiv hvis enabled OG MFE threshold nået
        if (maxSlAfterMfeCap !== null) {
          candidateStops.push({ 
            type: 'MAX_SL_AFTER_MFE_HIT', 
            level: maxSlAfterMfeCap, 
            active: true, 
            triggered: maxSlAfterMfeTriggered 
          });
        }
        
        // Break-even - kun aktiv hvis BE er aktiveret
        if (breakEvenActivatedState && breakEvenStop !== null) {
          candidateStops.push({ 
            type: 'BREAK_EVEN_HIT', 
            level: breakEvenStop, 
            active: true, 
            triggered: beTriggered 
          });
        }
        
        // Peak-Lock trailing - kun aktiv hvis peak-lock er aktiveret
        if (peakLockActive && trailingStop !== null) {
          candidateStops.push({ 
            type: 'PEAK_LOCK_HIT', 
            level: trailingStop, 
            active: true, 
            triggered: tsTriggered 
          });
        }
        
        // ATR Trailing - kun aktiv hvis trailing er aktivt (og ikke peak-lock)
        if (trailingValidThisCycle && !peakLockActive && trailingStop !== null) {
          candidateStops.push({ 
            type: 'TRAILING_STOP_HIT', 
            level: trailingStop, 
            active: true, 
            triggered: tsTriggered 
          });
        }
        
        // 2) Beregn effective_stop = mest beskyttende af alle AKTIVE stops
        // LONG: MAX(levels) = højeste stop er mest beskyttende
        // SHORT: MIN(levels) = laveste stop er mest beskyttende
        const activeStops = candidateStops.filter(c => c.active);
        let effectiveStop: number | null = null;
        let effectiveStopType: string | null = null;
        
        if (activeStops.length > 0) {
          if (position.side === 'LONG') {
            const best = activeStops.reduce((a, b) => b.level > a.level ? b : a);
            effectiveStop = best.level;
            effectiveStopType = best.type;
          } else {
            const best = activeStops.reduce((a, b) => b.level < a.level ? b : a);
            effectiveStop = best.level;
            effectiveStopType = best.type;
          }
        }
        
        // 3) Find TRIGGERED levels og vælg det mest beskyttende af dem
        const triggeredLevels = candidateStops.filter(c => c.triggered);

        let selectedExit = 'NONE';
        let resultingStopLevel: number | null = null;
        let slHit = false;
        let beHit = false;
        let tsHit = false;
        let maxSlAfterMfeHit = false;
        let peakLockHit = false;
        let stopTypeHit: string | null = null;
        let stopLevelHit: number | null = null;

        if (triggeredLevels.length > 0) {
          // Sortér: For LONG vælg højeste level (det der burde have lukket først)
          // For SHORT vælg laveste level
          triggeredLevels.sort((a, b) => 
            position.side === 'LONG' ? b.level - a.level : a.level - b.level
          );
          
          const bestExit = triggeredLevels[0];
          selectedExit = bestExit.type;
          resultingStopLevel = bestExit.level;
          stopTypeHit = bestExit.type;
          stopLevelHit = bestExit.level;
          
          slHit = bestExit.type === 'HARD_STOP_LOSS_HIT';
          beHit = bestExit.type === 'BREAK_EVEN_HIT';
          tsHit = bestExit.type === 'TRAILING_STOP_HIT';
          peakLockHit = bestExit.type === 'PEAK_LOCK_HIT';
          maxSlAfterMfeHit = bestExit.type === 'MAX_SL_AFTER_MFE_HIT';
        }
        
        // 🔴 KRAV 2 OPFYLDT: Log candidate_stops[], effective_stop, stop_type_hit, stop_level_hit
        console.log(`\n🎯 ═══════════════════════════════════════════════════════════════════`);
        console.log(`🎯 EXIT MODEL B AUDIT - ${position.symbol} ${position.side}`);
        console.log(`🎯 ═══════════════════════════════════════════════════════════════════`);
        console.log(`   📋 candidate_stops[]:`);
        candidateStops.forEach((c, i) => {
          console.log(`      ${i + 1}. ${c.type}: ${c.level.toFixed(8)} (active: ${c.active}, triggered: ${c.triggered})`);
        });
        console.log(`   ───────────────────────────────────────────────────────────────────`);
        console.log(`   🏆 effective_stop: ${effectiveStop !== null ? effectiveStop.toFixed(8) : 'null'} (type: ${effectiveStopType ?? 'none'})`);
        console.log(`   🎯 stop_type_hit: ${stopTypeHit ?? 'none'}`);
        console.log(`   📍 stop_level_hit: ${stopLevelHit !== null ? stopLevelHit.toFixed(8) : 'null'}`);
        console.log(`   📊 current_price: ${currentPrice}`);
        console.log(`   📐 selection_method: ${position.side === 'LONG' ? 'MAX' : 'MIN'}(triggered_levels)`);
        console.log(`🎯 ═══════════════════════════════════════════════════════════════════\n`);

        // 🔴 COMPREHENSIVE EXIT AUDIT - expected vs effective values
        const snapshotAtrForAudit = position.indicators_snapshot?.atr ?? 0;
        const snapshotExpectedSL = position.indicators_snapshot?.expected_stop_loss ?? null;
        
        // Calculate differences for audit
        const effectiveStopAtExit = resultingStopLevel;
        const expectedTrailingAtExit = position.side === 'LONG' && newPeakPrice && snapshotAtrForAudit
          ? newPeakPrice - (snapshotAtrForAudit * (position.indicators_snapshot?.atr_trailing_stop_multiplier ?? 1.8))
          : position.side === 'SHORT' && newPeakPrice && snapshotAtrForAudit
            ? newPeakPrice + (snapshotAtrForAudit * (position.indicators_snapshot?.atr_trailing_stop_multiplier ?? 1.8))
            : null;
        
        const exitAudit = {
          // 🔴 KRAV 2: Eksporter disse felter pr trade
          candidate_stops: candidateStops.map(c => ({ type: c.type, level: c.level, active: c.active, triggered: c.triggered })),
          effective_stop: effectiveStop,
          effective_stop_type: effectiveStopType,
          stop_type_hit: stopTypeHit,
          stop_level_hit: stopLevelHit,
          selection_method: position.side === 'LONG' ? 'MAX' : 'MIN',
          
          original_stop_loss: hardStopLoss,
          break_even_active: breakEvenActivatedState,
          trailing_active: trailingStopActive && trailingValidThisCycle,
          peak_lock_active: peakLockActive,
          exit_reason: slHit
            ? 'HARD_STOP_LOSS_HIT'
            : maxSlAfterMfeHit
              ? 'MAX_SL_AFTER_MFE_HIT'
              : beHit
                ? 'BREAK_EVEN_HIT'
                : peakLockHit
                  ? 'PEAK_LOCK_HIT'
                  : tsHit
                    ? (isLegacyPosition ? 'LEGACY_TRAILING_STOP_HIT' : 'TRAILING_STOP_HIT')
                    : null,
          resulting_stop_level: resultingStopLevel,
          
          // 🔴 EXPECTED vs EFFECTIVE audit
          expected_stop_loss_price: snapshotExpectedSL,
          expected_trailing_stop_price: expectedTrailingAtExit,
          effective_stop_loss_at_exit: slHit ? hardStopLoss : null,
          effective_trailing_at_exit: tsHit || peakLockHit ? trailingStop : null,
          effective_max_sl_after_mfe_cap: maxSlAfterMfeHit ? maxSlAfterMfeCap : null,
          effective_exit_level: effectiveStopAtExit,
          exit_price: currentPrice,
          
          // 🔴 DIFFERENCE audit (expected vs effective)
          stop_loss_diff_abs: snapshotExpectedSL && hardStopLoss 
            ? Math.abs(hardStopLoss - snapshotExpectedSL) 
            : null,
          stop_loss_diff_pct: snapshotExpectedSL && hardStopLoss && snapshotExpectedSL !== 0
            ? ((hardStopLoss - snapshotExpectedSL) / snapshotExpectedSL) * 100
            : null,
          trailing_diff_abs: expectedTrailingAtExit && trailingStop
            ? Math.abs(trailingStop - expectedTrailingAtExit)
            : null,
          trailing_diff_pct: expectedTrailingAtExit && trailingStop && expectedTrailingAtExit !== 0
            ? ((trailingStop - expectedTrailingAtExit) / expectedTrailingAtExit) * 100
            : null,
          
          // ekstra debug felter (hjælper ved audit)
          profit_threshold_passed: breakEvenProfitThresholdPassed,
          break_even_trigger_mode: breakEvenTriggerMode,
          ts_activated_reason: trailingActivationReason,
          sl_be_ts_priority: { slHit, beHit, tsHit, peakLockHit, maxSlAfterMfeHit, selected: selectedExit },
        };
        
        // 🔴 CLAMP INVARIANT VALIDATION - Log ERROR if clamp violates invariants
        // @ts-ignore
        const clampInfo = position._trailingClampInfo;
        if (clampInfo?.was_clamped) {
          const clampValid = position.side === 'LONG'
            ? clampInfo.effective_trailing_level >= (breakEvenStop ?? position.entry_price)
            : clampInfo.effective_trailing_level <= (breakEvenStop ?? position.entry_price);
          
          if (!clampValid) {
            console.error(`\n🚨 ═══════════════════════════════════════════════════════`);
            console.error(`🚨 CLAMP INVARIANT VIOLATION - ${position.symbol} ${position.side}`);
            console.error(`🚨 ═══════════════════════════════════════════════════════`);
            console.error(`   ❌ KRITISK: Clamp violation detected!`);
            console.error(`   Side: ${position.side}`);
            console.error(`   Expected trailing (before clamp): ${clampInfo.expected_trailing_level}`);
            console.error(`   Effective trailing (after clamp): ${clampInfo.effective_trailing_level}`);
            console.error(`   Break-even level: ${breakEvenStop}`);
            console.error(`   Entry price: ${position.entry_price}`);
            console.error(`   Clamp reason: ${clampInfo.clamp_reason}`);
            console.error(`   ❌ For LONG: trailing MUST be >= break_even`);
            console.error(`   ❌ For SHORT: trailing MUST be <= break_even`);
            console.error(`🚨 ═══════════════════════════════════════════════════════\n`);
          }
          
          // Log clamp details always
          console.log(`\n📐 CLAMP AUDIT - ${position.symbol} ${position.side}`);
          console.log(`   clamp_applied: true`);
          console.log(`   clamp_reason: ${clampInfo.clamp_reason}`);
          console.log(`   clamp_protection_level: ${clampInfo.clamp_protection_level}`);
          console.log(`   before_clamp: ${clampInfo.expected_trailing_level?.toFixed(8)}`);
          console.log(`   after_clamp: ${clampInfo.effective_trailing_level?.toFixed(8)}`);
          console.log(`   clamp_delta: ${clampInfo.clamp_delta?.toFixed(8)}`);
          console.log(`   clamp_applied_correctly: ${clampValid}`);
        }

        // @ts-ignore - gem audit på position context så vi kan inkludere det i result payload
        position._exitAudit = exitAudit;

        if (slHit || beHit || tsHit || peakLockHit || maxSlAfterMfeHit) {
          shouldClose = true;

          // KRAV 4: Beregn om PnL vil være negativ ved denne exit
          // Bruges til at overstyre BREAK_EVEN_HIT -> STOP_LOSS_HIT hvis PnL er negativ
          const exitAtPrice = slHit ? hardStopLoss : maxSlAfterMfeHit ? maxSlAfterMfeCap : beHit ? breakEvenStop : trailingStop;
          const estimatedPnl = position.side === 'LONG'
            ? (exitAtPrice! - position.entry_price) * position.quantity
            : (position.entry_price - exitAtPrice!) * position.quantity;
          const pnlIsNegative = estimatedPnl < 0;

          // 🔴 KRAV 5: Exit reasons skal være entydige
          // Mulige værdier: HARD_STOP_LOSS_HIT, MAX_SL_AFTER_MFE_HIT, STOP_LOSS_HIT, BREAK_EVEN_HIT, PEAK_LOCK_HIT, TRAILING_STOP_HIT, TIMEOUT
          if (slHit) {
            closeReason = 'HARD_STOP_LOSS_HIT';
            console.log(`HARD_STOP_LOSS_HIT | ${position.symbol} | price=${currentPrice} | stop_level_hit=${hardStopLoss} | stop_type_hit=HARD_STOP_LOSS_HIT`);
          } else if (maxSlAfterMfeHit) {
            closeReason = 'MAX_SL_AFTER_MFE_HIT';
            console.log(`MAX_SL_AFTER_MFE_HIT | ${position.symbol} | price=${currentPrice} | stop_level_hit=${maxSlAfterMfeCap} | stop_type_hit=MAX_SL_AFTER_MFE_HIT`);
          } else if (beHit) {
            // KRAV: En handel må ALDRIG få exit_reason = 'BREAK_EVEN_HIT' hvis PnL er negativ
            if (pnlIsNegative) {
              closeReason = 'STOP_LOSS_HIT';
              console.log(`BREAK_EVEN_HIT → REKLASSIFICERET TIL STOP_LOSS_HIT (negativ PnL) | ${position.symbol} | price=${currentPrice} | stop_level_hit=${breakEvenStop} | estimatedPnl=${estimatedPnl.toFixed(2)}`);
            } else {
              closeReason = 'BREAK_EVEN_HIT';
              console.log(`BREAK_EVEN_HIT | ${position.symbol} | price=${currentPrice} | stop_level_hit=${breakEvenStop} | stop_type_hit=BREAK_EVEN_HIT`);
            }
          } else if (peakLockHit) {
            // Peak-lock trailing stop hit
            if (pnlIsNegative) {
              closeReason = 'STOP_LOSS_HIT';
              console.log(`PEAK_LOCK_HIT → REKLASSIFICERET TIL STOP_LOSS_HIT (negativ PnL) | ${position.symbol} | price=${currentPrice} | stop_level_hit=${trailingStop} | estimatedPnl=${estimatedPnl.toFixed(2)}`);
            } else {
              closeReason = 'PEAK_LOCK_HIT';
              console.log(`PEAK_LOCK_HIT | ${position.symbol} | price=${currentPrice} | stop_level_hit=${trailingStop} | stop_type_hit=PEAK_LOCK_HIT`);
            }
          } else {
            // ATR Trailing stop hit
            if (pnlIsNegative) {
              closeReason = 'STOP_LOSS_HIT';
              console.log(`TRAILING_STOP_HIT → REKLASSIFICERET TIL STOP_LOSS_HIT (negativ PnL) | ${position.symbol} | price=${currentPrice} | stop_level_hit=${trailingStop} | estimatedPnl=${estimatedPnl.toFixed(2)}`);
            } else {
              closeReason = isLegacyPosition ? 'LEGACY_TRAILING_STOP_HIT' : 'TRAILING_STOP_HIT';
              console.log(`TRAILING_STOP_HIT | ${position.symbol} | price=${currentPrice} | stop_level_hit=${trailingStop} | stop_type_hit=TRAILING_STOP_HIT`);
            }
          }

          console.log(`\n📊 EXIT AUDIT SUMMARY | ${position.symbol}`);
          console.log(`   stop_type_hit: ${stopTypeHit}`);
          console.log(`   stop_level_hit: ${stopLevelHit}`);
          console.log(`   effective_stop: ${effectiveStop}`);
          console.log(`   estimatedPnl: ${estimatedPnl.toFixed(2)}`);
          console.log(`   pnlIsNegative: ${pnlIsNegative}`);
          console.log(`   closeReason: ${closeReason}`);
        }

        // Definer tidspunkt variabler (bruges til både timeout check og duration beregning)
        const openedAt = new Date(position.opened_at);
        const now = new Date();

        // Check timeout (SIKKERHEDSNET - kun luk hvis IKKE i profit over break-even)
        // KRAV: Timeout må kun lukke handler der ikke har udviklet sig positivt.
        // Handler i profit over break-even skal blive åbne og styres af trailing stop.
        if (!shouldClose && maxPositionDurationMinutes && maxPositionDurationMinutes > 0) {
          const minutesSinceOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60);

          if (minutesSinceOpen >= maxPositionDurationMinutes) {
            // Tjek om positionen er i profit OG break-even er aktiveret
            const positionIsInProfit = profitDistance > 0;
            const isAboveBreakEven = breakEvenActivatedState; // BE aktiveret = positionen har været i tilstrækkelig profit
            
            if (positionIsInProfit && isAboveBreakEven) {
              // Position er i profit over break-even -> INGEN timeout, lad trailing stop styre
              console.log(
                `⏱️ TIMEOUT SKIPPED | ${position.symbol} | ${minutesSinceOpen.toFixed(0)}/${maxPositionDurationMinutes} min | I PROFIT (${profitPercent.toFixed(2)}%) + BE aktiveret -> fortsætter med trailing stop`
              );
              
              // Hvis BE ikke allerede er sat, sæt det nu som sikkerhedsnet
              if (!breakEvenActivatedState && !position.break_even_activated) {
                console.log(`   🔧 Aktiverer break-even som sikkerhedsnet for timeout-overskridelse`);
                breakEvenActivatedState = true;
                breakEvenAtPrice = position.entry_price;
                newStopLoss = position.entry_price;
                
                await supabaseClient
                  .from('positions')
                  .update({
                    stop_loss: position.entry_price,
                    break_even_activated: true,
                    indicators_snapshot: {
                      ...position.indicators_snapshot,
                      original_stop_loss: position.indicators_snapshot?.original_stop_loss ?? position.stop_loss,
                      break_even_at_price: position.entry_price,
                      break_even_trigger_price: currentPrice,
                      break_even_triggered_at: new Date().toISOString(),
                      break_even_mode: 'TIMEOUT_SAFETY_NET',
                    },
                  })
                  .eq('id', position.id);
              }
            } else {
              // Position er IKKE i profit ELLER break-even er ikke aktiveret -> timeout luk
              shouldClose = true;
              closeReason = 'TIMEOUT';
              console.log(
                `⏱️ TIMEOUT | ${position.symbol} overskred max varighed (${minutesSinceOpen.toFixed(0)}/${maxPositionDurationMinutes} min) | profit=${profitPercent.toFixed(2)}% | BE_active=${isAboveBreakEven} -> LUKKES`
              );
            }
          }
        } else if (!shouldClose && (!maxPositionDurationMinutes || maxPositionDurationMinutes === 0)) {
          console.log(`⏱️ Position ${position.symbol} - max duration disabled (set to ${maxPositionDurationMinutes}), will only close on stop loss or trailing stop`);
        }

        // ═══════════════════════════════════════════════════════════════════
        // 🟢 STALE POSITION EXIT (isoleret tilføjelse — påvirker INTET andet)
        // Kører som ALLERSIDSTE check. Hvis feature er slukket eller blot ÉT felt
        // mangler i UI, springes hele blokken over (ingen defaults, ingen fallback).
        // ═══════════════════════════════════════════════════════════════════
        if (!shouldClose && autoExitEnabled && configData) {
          const sx_enabled = (configData as any).stale_exit_enabled;
          const sx_maxDurMult = (configData as any).stale_exit_max_duration_tf_mult;
          const sx_peakInactMult = (configData as any).stale_exit_peak_inactivity_tf_mult;
          const sx_trailInactMult = (configData as any).stale_exit_trailing_inactivity_tf_mult;
          const sx_minMoveAtrMult = (configData as any).stale_exit_min_move_atr_mult;
          const sx_useMomentumFilter = (configData as any).stale_exit_use_momentum_filter;
          const sx_scanInterval: string | null = (configData as any).scan_interval ?? null;

          // Parser timeframe (fx "15m", "1h", "4h", "8h", "1d") til minutter — ingen fallback
          const parseTfToMinutes = (tf: string | null): number | null => {
            if (!tf || typeof tf !== 'string') return null;
            const m = tf.trim().match(/^(\d+)\s*([smhdw])$/i);
            if (!m) return null;
            const n = parseInt(m[1], 10);
            const u = m[2].toLowerCase();
            if (!Number.isFinite(n) || n <= 0) return null;
            switch (u) {
              case 's': return n / 60;
              case 'm': return n;
              case 'h': return n * 60;
              case 'd': return n * 1440;
              case 'w': return n * 10080;
              default: return null;
            }
          };
          const tfMinutes = parseTfToMinutes(sx_scanInterval);

          // Strikt: ALLE nødvendige felter skal være sat. Toggle skal være true. Multipliers > 0.
          // BEMÆRK: stale_exit_trailing_inactivity_tf_mult bruges IKKE længere som krav.
          // I stedet kræver vi at trailing IKKE er aktiv (position.trailing_stop er tom/0).
          const allFieldsSet =
            sx_enabled === true &&
            typeof sx_maxDurMult === 'number' && Number.isFinite(sx_maxDurMult) && sx_maxDurMult > 0 &&
            typeof sx_peakInactMult === 'number' && Number.isFinite(sx_peakInactMult) && sx_peakInactMult > 0 &&
            typeof sx_minMoveAtrMult === 'number' && Number.isFinite(sx_minMoveAtrMult) && sx_minMoveAtrMult > 0 &&
            typeof sx_useMomentumFilter === 'boolean' &&
            tfMinutes !== null && tfMinutes > 0;

          if (allFieldsSet) {
            const nowMs = now.getTime();
            const openedMs = openedAt.getTime();
            const ageMin = (nowMs - openedMs) / 60000;
            const requiredAgeMin = sx_maxDurMult * tfMinutes;
            const peakWindowMin = sx_peakInactMult * tfMinutes;

            // Krav 1: position varighed > X × TF
            const ageOk = ageMin > requiredAgeMin;

            // Krav 2: Ingen ny peak i Y × TF.
            // Kilde: stale_exit_peak_updated_at i indicators_snapshot.
            // Hvis aldrig opdateret -> brug opened_at (positionens start) som baseline.
            const peakUpdatedRaw = position.indicators_snapshot?.stale_exit_peak_updated_at ?? null;
            const peakUpdatedMs = peakUpdatedRaw ? new Date(peakUpdatedRaw).getTime() : openedMs;
            const peakInactiveMin = (nowMs - peakUpdatedMs) / 60000;
            const peakInactiveOk = peakInactiveMin >= peakWindowMin;

            // Krav 3: Trailing er IKKE aktiv. Hvis trailing_stop er sat (>0) -> Stale Exit må IKKE lukke.
            const trailingActive = typeof position.trailing_stop === 'number' && position.trailing_stop > 0;
            const trailingInactiveOk = !trailingActive;

            // Krav 4: Prisbevægelse < Z × ATR i samme periode.
            // Måles som spændet mellem peak_price og low_price (samlet excursion).
            // Falder tilbage til |current - entry| hvis peak/low ikke findes.
            const snapshotAtr = typeof position.indicators_snapshot?.atr === 'number'
              ? position.indicators_snapshot.atr
              : null;
            let priceSpan: number | null = null;
            if (
              typeof position.peak_price === 'number' && position.peak_price > 0 &&
              typeof position.low_price === 'number' && position.low_price > 0
            ) {
              priceSpan = Math.abs(position.peak_price - position.low_price);
            } else if (typeof currentPrice === 'number') {
              priceSpan = Math.abs(currentPrice - position.entry_price);
            }
            const atrThreshold = (snapshotAtr && snapshotAtr > 0) ? snapshotAtr * sx_minMoveAtrMult : null;
            const moveOk = (priceSpan !== null && atrThreshold !== null) ? priceSpan < atrThreshold : false;

            // Krav 5: Momentum filter (valgfri). MACD histogram momentum ≤ 0.
            let momentumOk = true;
            if (sx_useMomentumFilter) {
              const histNow = typeof position.indicators_snapshot?.macd_histogram === 'number'
                ? position.indicators_snapshot.macd_histogram
                : null;
              if (histNow === null) {
                momentumOk = false; // mangler data -> ikke svagt momentum bekræftet
              } else {
                // Svagt momentum for LONG: histogram <= 0. For SHORT: histogram >= 0.
                momentumOk = position.side === 'LONG' ? histNow <= 0 : histNow >= 0;
              }
            }

            const allConditions = ageOk && peakInactiveOk && trailingInactiveOk && moveOk && momentumOk;
            console.log(
              `🟢 STALE EXIT CHECK | ${position.symbol} | tf=${sx_scanInterval}(${tfMinutes}m) | ` +
              `age=${ageMin.toFixed(1)}/${requiredAgeMin.toFixed(1)}min(${ageOk}) | ` +
              `peakInact=${peakInactiveMin.toFixed(1)}/${peakWindowMin.toFixed(1)}min(${peakInactiveOk}) | ` +
              `trailingActive=${trailingActive}(blockIfActive=${!trailingInactiveOk ? 'YES' : 'no'}) | ` +
              `move=${priceSpan?.toFixed(8) ?? 'n/a'}<${atrThreshold?.toFixed(8) ?? 'n/a'}(${moveOk}) | ` +
              `momentum=${momentumOk}(filter=${sx_useMomentumFilter})`
            );

            if (allConditions) {
              shouldClose = true;
              closeReason = 'STALE_EXIT';
              console.log(`🟢 STALE_EXIT TRIGGER | ${position.symbol} | alle betingelser opfyldt -> LUKKES`);
            }
          }
        }


        // Calculate unrealized PnL
        const pnl = position.side === 'LONG' 
          ? (currentPrice - position.entry_price) * position.quantity
          : (position.entry_price - currentPrice) * position.quantity;
        
        const pnlPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100 * (position.side === 'LONG' ? 1 : -1);

        // Update position with new values
        const updateData: any = {
          unrealized_pnl: pnl,
          current_price: currentPrice,
        };

        // Persistér original_stop_loss til audit, hvis den mangler
        if (position.stop_loss && (!position.indicators_snapshot || position.indicators_snapshot?.original_stop_loss == null)) {
          updateData.indicators_snapshot = {
            ...(position.indicators_snapshot || {}),
            original_stop_loss: position.stop_loss,
          };
        }
        
        // 🔴 KRITISK: Opdater peak_price ALTID når prisen bevæger sig i vores favor
        // Dette skal ske UAFHÆNGIGT af om trailing stop er aktivt
        // Så når trailing aktiveres senere, har vi den korrekte peak
        if (newPeakPrice !== position.peak_price) {
          updateData.peak_price = newPeakPrice;
          // 🟢 STALE EXIT TRACKING: marker tidspunkt for ny peak (uden at påvirke andet)
          updateData.indicators_snapshot = {
            ...(updateData.indicators_snapshot ?? position.indicators_snapshot ?? {}),
            stale_exit_peak_updated_at: new Date().toISOString(),
          };
          console.log(`📈 PEAK GEMT | ${position.symbol} | ${position.peak_price || 'null'} → ${newPeakPrice}`);
        }
        
        // 🔴 MAE TRACKING: Opdater low_price for adverse excursion logging
        if (lowWasUpdated) {
          updateData.low_price = newLowPrice;
          console.log(`📉 LOW GEMT (MAE) | ${position.symbol} | ${position.low_price || 'null'} → ${newLowPrice}`);
        }

        // ALTID opdater stop_loss til BE-niveauet hvis BE er aktiveret
        if (breakEvenActivatedState && breakEvenAtPrice !== null && breakEvenAtPrice !== undefined) {
          updateData.stop_loss = breakEvenAtPrice;
        }

        // Opdater peak og trailing HVER gang trailing er valid (uanset om den allerede var aktiveret)
        if (trailingStopActive && trailingValidThisCycle && newTrailingStop !== null && newTrailingStop !== undefined && isFinite(newTrailingStop)) {
          updateData.peak_price = newPeakPrice;
          updateData.trailing_stop = newTrailingStop;
          // 🟢 STALE EXIT TRACKING: marker tidspunkt for trailing-opdatering kun ved reel ændring
          if (newTrailingStop !== position.trailing_stop) {
            updateData.indicators_snapshot = {
              ...(updateData.indicators_snapshot ?? position.indicators_snapshot ?? {}),
              stale_exit_trailing_updated_at: new Date().toISOString(),
            };
          }

          console.log(`📈 TRAILING OPDATERET | ${position.symbol} | peak=${newPeakPrice} ts=${newTrailingStop}`);
        } else if (trailingStopActive && !trailingValidThisCycle) {
          console.log(`⚠️ TRAILING VALID=FALSE | ${position.symbol} | reason=${trailingActivationReason}`);
        } else if (!trailingStopActive && breakEvenActivatedState && isInProfit && trailingProfitThresholdPassed) {
          // Debug: Burde være aktiv men er det ikke
          console.log(`⚠️ TRAILING BURDE VÆRE AKTIV | ${position.symbol} | BE=${breakEvenActivatedState} inProfit=${isInProfit} threshold=${trailingProfitThresholdPassed} activationCheck=${trailingActivationCheckPassed}`);
        }

        console.log(`📝 UPDATE DATA | ${position.symbol} | stop_loss=${updateData.stop_loss ?? 'unchanged'} | trailing_stop=${updateData.trailing_stop ?? 'unchanged'} | peak_price=${updateData.peak_price ?? 'unchanged'}`);

        await supabaseClient
          .from('positions')
          .update(updateData)
          .eq('id', position.id);

        if (shouldClose) {
          console.log(`Closing position ${position.symbol} - Reason: ${closeReason}`);
          
          try {
            // Close position on Binance and get actual exit price
            const closeResult = await closePositionOnBinance(position.symbol, position.side, position.quantity);
            
            if (!closeResult) {
              console.log(`Position ${position.symbol} already closed on Binance`);
              continue;
            }

            // Use actual exit price from Binance order
            const actualExitPrice = closeResult.avgPrice;
            const slotQuantity = Math.abs(Number(position.quantity) || 0);
            const executedQuantity = Math.abs(Number(closeResult.executedQty) || 0);
            const actualQuantity = executedQuantity > 0 && executedQuantity <= slotQuantity * 1.02
              ? executedQuantity
              : slotQuantity;

            if (executedQuantity > slotQuantity * 1.02) {
              console.error(`🚨 Close qty mismatch for ${position.symbol}: executed=${executedQuantity}, slot=${slotQuantity}. Using slot quantity for DB/history.`);
            }
            
            // Calculate actual P&L based on real exit price
            const actualPnl = position.side === 'LONG' 
              ? (actualExitPrice - position.entry_price) * actualQuantity
              : (position.entry_price - actualExitPrice) * actualQuantity;
            
            const actualPnlPercent = ((actualExitPrice - position.entry_price) / position.entry_price) * 100 * (position.side === 'LONG' ? 1 : -1);

            console.log(`Position closed - Entry: ${position.entry_price}, Exit: ${actualExitPrice}, P&L: ${actualPnl.toFixed(2)} USDT`);
            
            // 🚨 KRAV: BREAK_EVEN_HIT og TRAILING_STOP_HIT må ALDRIG give negativ PnL
            // Reklassificer til STOP_LOSS_HIT baseret på FAKTISK PnL (ikke estimeret)
            let finalCloseReason = closeReason;
            if (actualPnl < 0) {
              if (closeReason === 'BREAK_EVEN_HIT') {
                finalCloseReason = 'STOP_LOSS_HIT';
                console.log(`\n🚨 ═══════════════════════════════════════════════════════`);
                console.log(`🚨 FAKTISK PnL REKLASSIFICERING - ${position.symbol} ${position.side}`);
                console.log(`🚨 ═══════════════════════════════════════════════════════`);
                console.log(`   ❌ Original close_reason: BREAK_EVEN_HIT`);
                console.log(`   ❌ Faktisk PnL: ${actualPnl.toFixed(4)} USDT (NEGATIV)`);
                console.log(`   ✅ Reklassificeret til: STOP_LOSS_HIT`);
                console.log(`   📋 Entry: ${position.entry_price}, Exit: ${actualExitPrice}`);
                console.log(`🚨 ═══════════════════════════════════════════════════════\n`);
              } else if (closeReason === 'TRAILING_STOP_HIT' || closeReason === 'LEGACY_TRAILING_STOP_HIT') {
                finalCloseReason = 'STOP_LOSS_HIT';
                console.log(`\n🚨 ═══════════════════════════════════════════════════════`);
                console.log(`🚨 FAKTISK PnL REKLASSIFICERING - ${position.symbol} ${position.side}`);
                console.log(`🚨 ═══════════════════════════════════════════════════════`);
                console.log(`   ❌ Original close_reason: ${closeReason}`);
                console.log(`   ❌ Faktisk PnL: ${actualPnl.toFixed(4)} USDT (NEGATIV)`);
                console.log(`   ✅ Reklassificeret til: STOP_LOSS_HIT`);
                console.log(`   📋 Entry: ${position.entry_price}, Exit: ${actualExitPrice}`);
                console.log(`🚨 ═══════════════════════════════════════════════════════\n`);
              }
            }
            
            // Update position status with final close reason
            await supabaseClient
              .from('positions')
              .update({ 
                status: 'CLOSED',
                closed_at: new Date().toISOString(),
                current_price: actualExitPrice,
                unrealized_pnl: actualPnl,
                close_reason: finalCloseReason,
              })
              .eq('id', position.id);

            // Add to trade history with actual values from Binance and indicators
            // Gem stop_loss, trailing_stop og multiplier værdier i indicators_snapshot
            const DEFAULT_TRAILING_MULTIPLIER = 1.8;
            // 🔴 BACKWARDS COMPATIBILITY: Læs fra begge mulige feltnavne
            const rawTrailingMultiplier = position.indicators_snapshot?.atr_trailing_stop_multiplier 
                                       ?? position.indicators_snapshot?.trailing_stop_atr_multiplier;
            const trailingMultiplierUsed = rawTrailingMultiplier ?? DEFAULT_TRAILING_MULTIPLIER;
            const trailingMultiplierWasFallback = rawTrailingMultiplier === null || rawTrailingMultiplier === undefined;
            
            // 🔴 HARD AUDIT: Tjek om break_even_activated=true men break_even_at_price er null
            const finalBreakEvenActivated = breakEvenActivatedState || position.break_even_activated || false;
            const finalBreakEvenAtPrice = breakEvenAtPrice ?? position.indicators_snapshot?.break_even_at_price ?? null;
            const finalBreakEvenTriggerPrice = breakEvenTriggerPrice ?? position.indicators_snapshot?.break_even_trigger_price ?? null;
            const finalStopLossAfterBE = stopLossAfterBE ?? position.indicators_snapshot?.stop_loss_after_be ?? null;
            
            if (finalBreakEvenActivated && (finalBreakEvenAtPrice === null || finalBreakEvenAtPrice === undefined)) {
              console.log(`\n❌ ═══════════════════════════════════════════════════════`);
              console.log(`❌ BREAK-EVEN AUDIT ERROR - ${position.symbol} ${position.side}`);
              console.log(`❌ ═══════════════════════════════════════════════════════`);
              console.log(`   ❌ KRITISK: break_even_activated = TRUE`);
              console.log(`   ❌ KRITISK: break_even_at_price = NULL`);
              console.log(`   📋 symbol: ${position.symbol}`);
              console.log(`   📋 side: ${position.side}`);
              console.log(`   📋 entry_price: ${position.entry_price}`);
              console.log(`   📋 break_even_trigger_price: ${finalBreakEvenTriggerPrice ?? 'NULL'}`);
              console.log(`   📋 stop_loss ved close: ${newStopLoss}`);
              console.log(`   📋 breakEvenActivatedThisCycle: ${breakEvenActivatedThisCycle}`);
              console.log(`   📋 position.break_even_activated: ${position.break_even_activated}`);
              console.log(`   📋 position.indicators_snapshot?.break_even_at_price: ${position.indicators_snapshot?.break_even_at_price ?? 'NULL'}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   🔧 RETROAKTIV FIX: Sætter break_even_at_price = entry_price`);
              console.log(`❌ ═══════════════════════════════════════════════════════\n`);
            }
            
            // 🔴 Byg enhancedSnapshot med LOKALE værdier (ikke fra position.indicators_snapshot)
            // 🔴 MACD SCHEMA FIX: Fjern gammelt MACD_signal felt og behold kun de 4 korrekte felter
            const rawSnapshot = position.indicators_snapshot || {};
            
            // 🔴 Udtræk MACD værdier fra eksisterende snapshot (sat ved trade open)
            const macdSignalPeriod = rawSnapshot.macd_signal_period ?? rawSnapshot.MACD_signal ?? null;
            const macdLine = rawSnapshot.macd_line ?? null;
            const macdSignalLine = rawSnapshot.macd_signal_line ?? null;
            const macdHistogram = rawSnapshot.macd_histogram ?? null;
            
            // 🔴 MACD SCHEMA AUDIT - Type-check alle 4 felter
            const macdSchemaErrors: string[] = [];
            
            // Check 1: macd_signal_period skal være int (eller null)
            if (macdSignalPeriod !== null && !Number.isInteger(macdSignalPeriod)) {
              macdSchemaErrors.push(`macd_signal_period er ikke int: ${macdSignalPeriod} (type: ${typeof macdSignalPeriod})`);
            }
            
            // Check 2: runtime-felter må ikke være null (hvis MACD var aktiv)
            const macdWasActive = macdSignalPeriod !== null;
            if (macdWasActive) {
              if (macdLine === null || macdLine === undefined) {
                macdSchemaErrors.push(`macd_line er null/undefined`);
              }
              if (macdSignalLine === null || macdSignalLine === undefined) {
                macdSchemaErrors.push(`macd_signal_line er null/undefined`);
              }
              if (macdHistogram === null || macdHistogram === undefined) {
                macdSchemaErrors.push(`macd_histogram er null/undefined`);
              }
            }
            
            // Check 3: Histogram konsistens - skal matche (macd_line - macd_signal_line)
            if (macdLine !== null && macdSignalLine !== null && macdHistogram !== null) {
              const expectedHistogram = macdLine - macdSignalLine;
              const histogramDiff = Math.abs(macdHistogram - expectedHistogram);
              if (histogramDiff > 1e-10) {
                macdSchemaErrors.push(`macd_histogram inkonsistent: ${macdHistogram} vs expected ${expectedHistogram} (diff: ${histogramDiff.toExponential(10)})`);
              }
            }
            
            // Log MACD SCHEMA AUDIT
            if (macdSchemaErrors.length > 0) {
              console.log(`\n❌ ═══════════════════════════════════════════════════════`);
              console.log(`❌ MACD SCHEMA AUDIT ERROR - ${position.symbol} ${position.side}`);
              console.log(`❌ ═══════════════════════════════════════════════════════`);
              console.log(`   Gammel MACD_signal i snapshot: ${rawSnapshot.MACD_signal ?? 'IKKE FUNDET'}`);
              console.log(`   macd_signal_period: ${macdSignalPeriod} (type: ${typeof macdSignalPeriod})`);
              console.log(`   macd_line: ${macdLine}`);
              console.log(`   macd_signal_line: ${macdSignalLine}`);
              console.log(`   macd_histogram: ${macdHistogram}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              for (const err of macdSchemaErrors) {
                console.log(`   ❌ ${err}`);
              }
              console.log(`❌ ═══════════════════════════════════════════════════════\n`);
            } else if (macdWasActive) {
              console.log(`✅ MACD SCHEMA OK: period=${macdSignalPeriod}, line=${macdLine}, signal=${macdSignalLine}, hist=${macdHistogram}`);
            }
            
            // 🔴 Byg snapshot UDEN det gamle MACD_signal felt
            // Destructure for at fjerne MACD_signal
            const { MACD_signal: _removedMacdSignal, ...cleanSnapshot } = rawSnapshot;
            
            // 📊 Beregn TRAILING STOP AUDIT felter (altid beregnet, gemmes kun ved trailing exit)
            const snapshotAtrForExit = position.indicators_snapshot?.atr || null;
            const trailingDistanceForExit = (snapshotAtrForExit && trailingMultiplierUsed) 
              ? snapshotAtrForExit * trailingMultiplierUsed 
              : null;
            
            // Distance fra peak i procent (hvor langt trailing stop var fra peak)
            const distanceFromPeakPct = (newPeakPrice && newTrailingStop && newPeakPrice !== 0)
              ? Math.abs(newPeakPrice - newTrailingStop) / newPeakPrice * 100
              : null;
            
            // Distance fra peak i ATR (for audit)
            const distanceFromPeakAtr = (snapshotAtrForExit && snapshotAtrForExit > 0 && newPeakPrice && newTrailingStop)
              ? Math.abs(newPeakPrice - newTrailingStop) / snapshotAtrForExit
              : null;
            
            // Er dette en trailing stop exit?
            const isTrailingStopExit = closeReason.includes('TRAILING_STOP');
            
            const enhancedSnapshot = {
              ...cleanSnapshot,
              stop_loss: newStopLoss,
              trailing_stop: newTrailingStop,
              trailing_stop_percent: position.trailing_stop_percent,
              peak_price: newPeakPrice,
              // 🔴 FIX: Brug lokale BE-værdier (opdateret i denne cycle) IKKE position.break_even_activated
              break_even_activated: finalBreakEvenActivated,
              break_even_at_price: finalBreakEvenAtPrice ?? (finalBreakEvenActivated ? position.entry_price : null),
              break_even_trigger_price: finalBreakEvenTriggerPrice,
              stop_loss_after_be: finalStopLossAfterBE ?? (finalBreakEvenActivated ? position.entry_price : null),
              // 🔴 FIX: Gem BEGGE feltnavne for backwards compatibility
              atr_trailing_stop_multiplier: trailingMultiplierUsed,
              trailing_stop_atr_multiplier: trailingMultiplierUsed, // Alias for eksisterende dashboards
              trailing_stop_multiplier_was_fallback: trailingMultiplierWasFallback,
              close_timestamp: new Date().toISOString(),
              exit_price: actualExitPrice,
              // 🔴 MACD SCHEMA: Explicit sæt de 4 korrekte felter (overskriver eventuelle gamle)
              macd_signal_period: macdSignalPeriod, // int config
              macd_line: macdLine, // decimal runtime
              macd_signal_line: macdSignalLine, // decimal runtime  
              macd_histogram: macdHistogram, // decimal runtime
              // 🔴 Explicit fjern gammelt felt ved at sætte til undefined (vil ikke blive inkluderet i JSON)
              MACD_signal: undefined,
              
              // 📊 TRAILING STOP EXIT AUDIT FELTER - bygget nedenfor med clamp-info
              trailing_stop_exit_audit: (() => {
                // 🔴 CLAMP INFO: Hent fra position context (sat i trailing-beregningen)
                // @ts-ignore - dynamisk tilføjet property
                const clampInfo = position._trailingClampInfo || {
                  expected_trailing_level: null,
                  effective_trailing_level: newTrailingStop,
                  was_clamped: false,
                  clamp_reason: null,
                  clamp_delta: 0,
                  clamp_protection_level: null,
                };
                
                // 🔴 EXPECTED: Ren beregning fra peak ± ATR*multiplier (ingen clamp)
                const expectedTrailingLevel = clampInfo.expected_trailing_level 
                  ?? (newPeakPrice && trailingDistanceForExit
                    ? (position.side === 'LONG' ? newPeakPrice - trailingDistanceForExit : newPeakPrice + trailingDistanceForExit)
                    : null);
                
                // 🔴 EFFECTIVE: Det niveau der faktisk bruges (kan være clamped)
                const effectiveTrailingLevel = clampInfo.effective_trailing_level ?? newTrailingStop;
                
                // 🔴 trailing_calculation_matches: Validerer at REN MATEMATIK er korrekt (ignorer clamp)
                const trailingMathIsCorrect = (expectedTrailingLevel !== null && newPeakPrice && trailingDistanceForExit)
                  ? Math.abs(expectedTrailingLevel - (position.side === 'LONG' ? newPeakPrice - trailingDistanceForExit : newPeakPrice + trailingDistanceForExit)) < 1e-6
                  : null;
                
                // 🔴 clamp_applied_correctly: Validerer at clamp-reglen blev udført korrekt
                let clampAppliedCorrectly: boolean | null = null;
                if (clampInfo.was_clamped && clampInfo.clamp_protection_level !== null && effectiveTrailingLevel !== null) {
                  if (position.side === 'LONG') {
                    clampAppliedCorrectly = effectiveTrailingLevel >= clampInfo.clamp_protection_level - 1e-10;
                  } else {
                    clampAppliedCorrectly = effectiveTrailingLevel <= clampInfo.clamp_protection_level + 1e-10;
                  }
                } else if (!clampInfo.was_clamped) {
                  clampAppliedCorrectly = expectedTrailingLevel !== null && effectiveTrailingLevel !== null
                    ? Math.abs(effectiveTrailingLevel - expectedTrailingLevel) < 1e-6
                    : null;
                }
                
                return {
                  peak_price: newPeakPrice,
                  
                  // 🔴 TODELT AUDIT: expected vs effective
                  expected_trailing_level: expectedTrailingLevel,
                  effective_exit_level: isTrailingStopExit ? effectiveTrailingLevel : newStopLoss,
                  effective_exit_mechanism: isTrailingStopExit 
                    ? (clampInfo.was_clamped ? `TRAILING_CLAMPED_${clampInfo.clamp_reason}` : 'TRAILING')
                    : (finalBreakEvenActivated ? 'BREAK_EVEN_SL' : 'INITIAL_SL'),
                  
                  // 🔴 CLAMP TRACKING
                  was_clamped: clampInfo.was_clamped,
                  clamp_reason: clampInfo.clamp_reason,
                  clamp_delta: clampInfo.clamp_delta,
                  clamp_protection_level: clampInfo.clamp_protection_level,
                  
                  // 🔴 VERIFIKATION
                  trailing_calculation_matches: trailingMathIsCorrect,
                  clamp_applied_correctly: clampAppliedCorrectly,
                  
                  // Backwards compatibility felter
                  trailing_stop_price_at_exit: effectiveTrailingLevel,
                  stop_loss_at_exit: isTrailingStopExit ? effectiveTrailingLevel : newStopLoss,
                  original_stop_loss: newStopLoss,
                  break_even_was_active: finalBreakEvenActivated,
                  break_even_at_price_at_exit: finalBreakEvenAtPrice,
                  
                  // ATR AUDIT
                  atr_value_used_for_trailing: snapshotAtrForExit,
                  atr_value_at_exit: snapshotAtrForExit,
                  atr_source: 'entry',
                  atr_timeframe: position.indicators_snapshot?.atr_audit?.atr_timeframe 
                    ?? position.indicators_snapshot?.trend_timeframe 
                    ?? position.indicators_snapshot?.scan_interval 
                    ?? 'unknown',
                  atr_period: position.indicators_snapshot?.atr_audit?.atr_period 
                    ?? position.indicators_snapshot?.atr_period 
                    ?? 14,
                  trailing_distance: trailingDistanceForExit,
                  distance_from_peak_pct: distanceFromPeakPct,
                  distance_from_peak_atr: distanceFromPeakAtr,
                  multiplier_used: trailingMultiplierUsed,
                  multiplier_was_fallback: trailingMultiplierWasFallback,
                  is_legacy_position: isLegacyPosition,
                  exit_trigger_price: actualExitPrice,
                  entry_price: position.entry_price,
                  expected_trailing_from_peak: expectedTrailingLevel,
                };
              })(),
              
              // 🔴 KRAV 2: EXIT AUDIT - candidate_stops[], effective_stop, stop_type_hit, stop_level_hit
              // @ts-ignore - dynamisk tilføjet property fra exit-logik
              exit_audit: position._exitAudit ?? null,
            };
            
            // 🔴 FINAL ASSERTION: Verificer at BE-felter er konsistente
            if (enhancedSnapshot.break_even_activated && enhancedSnapshot.break_even_at_price !== null) {
              const beAssertionDiff = Math.abs((enhancedSnapshot.stop_loss_after_be ?? 0) - (enhancedSnapshot.break_even_at_price ?? 0));
              if (beAssertionDiff >= 1e-10) {
                console.log(`\n⚠️ BREAK-EVEN FINAL ASSERTION WARNING:`);
                console.log(`   stop_loss_after_be: ${enhancedSnapshot.stop_loss_after_be}`);
                console.log(`   break_even_at_price: ${enhancedSnapshot.break_even_at_price}`);
                console.log(`   diff: ${beAssertionDiff.toExponential(10)} (expected < 1e-10)`);
              }
              
              // 🔴 CRITICAL AUDIT: Verificer stop_loss_at_exit matcher BE-price når BE er aktiv
              const slAtExitFromAudit = enhancedSnapshot.trailing_stop_exit_audit?.stop_loss_at_exit;
              const expectedSlWithBE = enhancedSnapshot.break_even_at_price;
              if (slAtExitFromAudit !== null && slAtExitFromAudit !== undefined && 
                  expectedSlWithBE !== null && expectedSlWithBE !== undefined) {
                const slAuditDiff = Math.abs(slAtExitFromAudit - expectedSlWithBE);
                if (slAuditDiff >= 1e-10) {
                  console.log(`\n❌ ═══════════════════════════════════════════════════════`);
                  console.log(`❌ STOP_LOSS_AT_EXIT AUDIT ASSERTION FAILED!`);
                  console.log(`❌ ═══════════════════════════════════════════════════════`);
                  console.log(`   break_even_activated: ${enhancedSnapshot.break_even_activated}`);
                  console.log(`   break_even_at_price: ${expectedSlWithBE}`);
                  console.log(`   stop_loss_at_exit (audit): ${slAtExitFromAudit}`);
                  console.log(`   DIFF: ${slAuditDiff} (expected < 1e-10)`);
                  console.log(`   ─────────────────────────────────────────────────────────`);
                  console.log(`   KONKLUSION: stop_loss_at_exit afviger fra BE-price!`);
                  console.log(`   Dette indikerer at newStopLoss ikke blev synkroniseret korrekt`);
                  console.log(`   med break-even state ved loop-start.`);
                  console.log(`❌ ═══════════════════════════════════════════════════════\n`);
                } else {
                  console.log(`✅ STOP_LOSS_AT_EXIT AUDIT OK: ${slAtExitFromAudit} matches BE price ${expectedSlWithBE}`);
                }
              }
            }

            // 📊 TRAILING STOP SUMMARY - Log når exit_reason er trailing stop relateret
            if (closeReason.includes('TRAILING_STOP')) {
              const audit = enhancedSnapshot.trailing_stop_exit_audit;
              
              // 🔴 AUDIT ASSERTION: Verificer at stop_loss_at_exit matcher effective_exit_level ved trailing exit
              const trailingExitMismatch = audit.stop_loss_at_exit !== audit.effective_exit_level;
              if (trailingExitMismatch) {
                console.log(`\n❌ ═══════════════════════════════════════════════════════`);
                console.log(`❌ TRAILING EXIT AUDIT ASSERTION FAILED!`);
                console.log(`❌ ═══════════════════════════════════════════════════════`);
                console.log(`   stop_loss_at_exit: ${audit.stop_loss_at_exit}`);
                console.log(`   effective_exit_level: ${audit.effective_exit_level}`);
                console.log(`   DISSE BØR VÆRE IDENTISKE VED TRAILING EXIT!`);
                console.log(`❌ ═══════════════════════════════════════════════════════\n`);
              }
              
              // 🔴 AUDIT ASSERTION: Verificer at trailing level matcher expected beregning
              // NB: Kun flag divergence hvis IKKE clamped - clamp er bevidst divergens
              const expectedTrailing = audit.expected_trailing_level;
              const actualTrailing = audit.trailing_stop_price_at_exit;
              if (expectedTrailing && actualTrailing && !audit.was_clamped) {
                const trailingDiff = Math.abs(actualTrailing - expectedTrailing);
                if (trailingDiff >= 1e-6) {
                  console.log(`\n❌ TRAILING CALCULATION DIVERGENCE DETECTED (INGEN CLAMP)!`);
                  console.log(`   actual trailing: ${actualTrailing}`);
                  console.log(`   expected from peak: ${expectedTrailing}`);
                  console.log(`   diff: ${trailingDiff.toExponential(10)}`);
                  console.log(`   was_clamped: ${audit.was_clamped}`);
                  console.log(`   break_even_was_active: ${audit.break_even_was_active}`);
                }
              }
              
              console.log(`\n📊 ═══════════════════════════════════════════════════════`);
              console.log(`📊 TRAILING STOP EXIT AUDIT - ${position.symbol} ${position.side}`);
              console.log(`📊 ═══════════════════════════════════════════════════════`);
              console.log(`   EXIT NIVEAUER (TODELT AUDIT):`);
              console.log(`   📍 expected_trailing_level: ${audit.expected_trailing_level?.toFixed(8) ?? 'NULL'} (ren beregning)`);
              console.log(`   📍 effective_exit_level: ${audit.effective_exit_level} (${audit.effective_exit_mechanism})`);
              console.log(`   📍 trailing_stop_price_at_exit: ${audit.trailing_stop_price_at_exit}`);
              console.log(`   📍 stop_loss_at_exit: ${audit.stop_loss_at_exit}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   🔒 CLAMP TRACKING:`);
              console.log(`   🔒 was_clamped: ${audit.was_clamped}`);
              if (audit.was_clamped) {
                console.log(`   🔒 clamp_reason: ${audit.clamp_reason}`);
                console.log(`   🔒 clamp_delta: ${audit.clamp_delta?.toFixed(8)}`);
                console.log(`   🔒 clamp_protection_level: ${audit.clamp_protection_level}`);
                console.log(`   ${audit.clamp_applied_correctly === true ? '✅' : '❌'} clamp_applied_correctly: ${audit.clamp_applied_correctly}`);
              }
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   BREAK-EVEN STATUS:`);
              console.log(`   🔴 break_even_was_active: ${audit.break_even_was_active}`);
              console.log(`   🔴 break_even_at_price_at_exit: ${audit.break_even_at_price_at_exit ?? 'NULL'}`);
              console.log(`   📍 original_stop_loss: ${audit.original_stop_loss}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   PRISER:`);
              console.log(`   📍 entry_price: ${audit.entry_price}`);
              console.log(`   📍 peak_price: ${audit.peak_price}`);
              console.log(`   📍 exit_trigger_price: ${audit.exit_trigger_price}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   ATR & MULTIPLIER:`);
              console.log(`   📐 atr_value_at_exit: ${audit.atr_value_at_exit ?? 'NULL'}`);
              console.log(`   📐 multiplier_used: ${audit.multiplier_used}x${audit.multiplier_was_fallback ? ' ⚠️ FALLBACK' : ''}`);
              console.log(`   📐 trailing_distance: ${audit.trailing_distance?.toFixed(8) ?? 'NULL'}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   DISTANCE FRA PEAK:`);
              console.log(`   📏 distance_from_peak_pct: ${audit.distance_from_peak_pct?.toFixed(4) ?? 'NULL'}%`);
              console.log(`   📏 distance_from_peak_atr: ${audit.distance_from_peak_atr?.toFixed(4) ?? 'NULL'} ATR`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   VERIFIKATION:`);
              console.log(`   ${audit.trailing_calculation_matches === true ? '✅' : audit.trailing_calculation_matches === false ? '❌' : '⚪'} trailing_calculation_matches: ${audit.trailing_calculation_matches} (ren matematik)`);
              console.log(`   ${audit.clamp_applied_correctly === true ? '✅' : audit.clamp_applied_correctly === false ? '❌' : '⚪'} clamp_applied_correctly: ${audit.clamp_applied_correctly}`);
              console.log(`   🏷️ is_legacy_position: ${audit.is_legacy_position}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   CLOSE INFO:`);
              console.log(`   📋 close_reason: ${closeReason}`);
              console.log(`   📋 exit_type: ${position.indicators_snapshot?.exit_type || 'UNKNOWN'}`);
              if (audit.multiplier_was_fallback) {
                console.log(`   ⚠️ FALLBACK AUDIT: Multiplier var NULL - brugte default`);
              }
              if (audit.trailing_calculation_matches === false && !audit.was_clamped) {
                console.log(`   ❌ TRAILING CALCULATION MISMATCH (ingen clamp)!`);
                console.log(`      actual: ${audit.trailing_stop_price_at_exit}`);
                console.log(`      expected: ${audit.expected_trailing_level}`);
              }
              console.log(`📊 ═══════════════════════════════════════════════════════\n`);
            }

            // 🔴 SCHEMA VALIDATION AUDIT - Log errors for v2 trades before saving to history
            const schemaVersion = enhancedSnapshot?.schema_version ?? 1;
            if (schemaVersion >= 2) {
              const schemaErrors: string[] = [];
              
              // MACD guaranteed fields
              if (enhancedSnapshot.macd_signal_period === undefined) schemaErrors.push('macd_signal_period');
              if (enhancedSnapshot.macd_line === undefined) schemaErrors.push('macd_line');
              if (enhancedSnapshot.macd_signal_line === undefined) schemaErrors.push('macd_signal_line');
              if (enhancedSnapshot.macd_histogram === undefined) schemaErrors.push('macd_histogram');
              
              // ATR (required for exits)
              if (enhancedSnapshot.atr === undefined || enhancedSnapshot.atr === null) schemaErrors.push('atr');
              if (enhancedSnapshot.atr_percent === undefined) schemaErrors.push('atr_percent');
              
              // ATR audit (required for v2 - entydigt dokumentation af ATR source)
              if (!enhancedSnapshot.atr_audit) {
                schemaErrors.push('atr_audit');
              } else {
                if (enhancedSnapshot.atr_audit.atr_timeframe === undefined) schemaErrors.push('atr_audit.atr_timeframe');
                if (enhancedSnapshot.atr_audit.atr_period === undefined) schemaErrors.push('atr_audit.atr_period');
                if (enhancedSnapshot.atr_audit.atr_source === undefined) schemaErrors.push('atr_audit.atr_source');
              }
              
              // Break-even: if triggered, at_price must exist
              if (enhancedSnapshot.break_even_activated === true && enhancedSnapshot.break_even_at_price === null) {
                schemaErrors.push('break_even_at_price (BE activated but price null)');
              }
              
              // ADX audit (if ADX enabled)
              if (enhancedSnapshot.adx_enabled === true && !enhancedSnapshot.adx_audit) {
                schemaErrors.push('adx_audit (ADX enabled but audit missing)');
              }
              
              // Trailing stop exit audit (if exit reason is trailing_stop)
              if (closeReason?.toUpperCase().includes('TRAILING') && !enhancedSnapshot.trailing_stop_exit_audit) {
                schemaErrors.push('trailing_stop_exit_audit (trailing exit but audit missing)');
              }
              
              // StochRSI separate fields
              if (enhancedSnapshot.stochrsi_enabled === true) {
                if (enhancedSnapshot.stochRSI_k === undefined) schemaErrors.push('stochRSI_k');
                if (enhancedSnapshot.stochRSI_d === undefined) schemaErrors.push('stochRSI_d');
              }
              
              // Soft conditions total
              if (enhancedSnapshot.soft_conditions_total === undefined) schemaErrors.push('soft_conditions_total');
              
              // Exit type flag
              if (enhancedSnapshot.exit_type === undefined) schemaErrors.push('exit_type');
              
              if (schemaErrors.length > 0) {
                console.log(`\n🚨 ═══════════════════════════════════════════════════════`);
                console.log(`🚨 SCHEMA VALIDATION AUDIT - ERRORS DETECTED!`);
                console.log(`🚨 ═══════════════════════════════════════════════════════`);
                console.log(`   📋 position_id: ${position.id}`);
                console.log(`   📋 symbol: ${position.symbol}`);
                console.log(`   📋 side: ${position.side}`);
                console.log(`   📋 schema_version: ${schemaVersion}`);
                console.log(`   📋 close_reason: ${closeReason}`);
                console.log(`   📋 closed_at: ${new Date().toISOString()}`);
                console.log(`   ─────────────────────────────────────────────────────────`);
                console.log(`   ❌ MISSING GUARANTEED FIELDS (${schemaErrors.length}):`);
                schemaErrors.forEach((err, i) => {
                  console.log(`      ${i + 1}. ${err}`);
                });
                console.log(`   ─────────────────────────────────────────────────────────`);
                console.log(`   ⚠️ Dette er en REGRESSION - v2 trades skal have alle felter!`);
                console.log(`🚨 ═══════════════════════════════════════════════════════\n`);
                
                // Add schema error info to the snapshot for traceability
                enhancedSnapshot.schema_error = true;
                enhancedSnapshot.schema_error_reason = schemaErrors.join(', ');
              } else {
                console.log(`✅ SCHEMA VALIDATION OK | ${position.symbol} | v${schemaVersion} | All guaranteed fields present`);
              }
            }

            // 🔴 MAE BEREGNING: Maximum Adverse Excursion (kun til logging)
            // MAE = største ABSOLUTTE prisbevægelse imod entry (altid positiv)
            // LONG: entry - low_price (hvor meget prisen faldt under entry)
            // SHORT: low_price - entry (hvor meget prisen steg over entry)
            const finalLowPrice = newLowPrice;
            let maeValue: number | null = null;
            let maePercent: number | null = null;
            
            if (finalLowPrice !== null && finalLowPrice !== undefined && isFinite(finalLowPrice)) {
              if (position.side === 'LONG') {
                // LONG: adverse = price going down (low < entry)
                maeValue = Math.max(0, position.entry_price - finalLowPrice);
                maePercent = (maeValue / position.entry_price) * 100;
              } else {
                // SHORT: adverse = price going up (low > entry, where "low" is actually the high)
                maeValue = Math.max(0, finalLowPrice - position.entry_price);
                maePercent = (maeValue / position.entry_price) * 100;
              }
              console.log(`📊 MAE BEREGNET | ${position.symbol} ${position.side} | entry=${position.entry_price} low=${finalLowPrice} | MAE=${maeValue.toFixed(6)} (${maePercent.toFixed(4)}%)`);
            }
            
            // Tilføj MAE til enhancedSnapshot for export
            enhancedSnapshot.low_price = finalLowPrice;
            enhancedSnapshot.mae = maeValue;
            enhancedSnapshot.mae_percent = maePercent;

            // 🔴 BINANCE-MATCHED P&L via fills + income API
            const apiKey = Deno.env.get('BINANCE_API_KEY');
            const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
            let totalFee = 0;
            let fundingFee = 0;
            let netPnl: number | null = null;
            let pnlAfterFees: number | null = null;
            let notional: number | null = null;
            let feesPctOfNotional: number | null = null;
            let leverageUsed: number | null = null;
            let binanceNetPnl: number | null = null;
            let finalEntryPrice = position.entry_price;
            let finalExitPrice = actualExitPrice;
            let finalGrossPnl = actualPnl;
            
            if (apiKey && apiSecret) {
              const openedAtTime = position.opened_at ? new Date(position.opened_at).getTime() : now.getTime() - 3600000;
              const closedAtTime = now.getTime();
              
              // Fetch fills for avg entry/exit prices (for display only)
              const fills = await getPositionFills(position.symbol, position.side, apiKey, apiSecret, openedAtTime, closedAtTime);
              if (fills.avgEntry > 0) finalEntryPrice = fills.avgEntry;
              if (fills.avgExit > 0) finalExitPrice = fills.avgExit;
              
              // Fetch ALL income types → Binance ground truth P&L
              const income = await getPositionIncome(position.symbol, apiKey, apiSecret, openedAtTime, closedAtTime);
              totalFee = Math.abs(income.commission);
              fundingFee = income.fundingFee;
              // Use Binance REALIZED_PNL as gross P&L (ground truth, not calculated)
              if (income.realizedPnl !== 0) finalGrossPnl = income.realizedPnl;
              binanceNetPnl = income.binanceNetPnl;
              pnlAfterFees = income.realizedPnl + income.commission;
              netPnl = binanceNetPnl; // REALIZED_PNL + COMMISSION + FUNDING_FEE
              
              notional = finalEntryPrice * actualQuantity;
              feesPctOfNotional = notional > 0 ? (totalFee / notional) * 100 : 0;
              leverageUsed = (position.indicators_snapshot as any)?.leverage ?? null;
              
              console.log(`📊 BINANCE-MATCH | ${position.symbol} ${position.side} | grossPnl=${finalGrossPnl.toFixed(4)} | binanceNetPnl=${binanceNetPnl.toFixed(4)} | realized=${income.realizedPnl.toFixed(4)} commission=${income.commission.toFixed(4)} funding=${income.fundingFee.toFixed(4)}`);
            }

            const tradeHistoryInsert: any = {
              user_id: position.user_id,
              symbol: position.symbol,
              side: position.side,
              entry_price: finalEntryPrice,
              exit_price: finalExitPrice,
              quantity: actualQuantity,
              pnl: finalGrossPnl,
              pnl_percent: finalEntryPrice > 0 ? ((finalExitPrice - finalEntryPrice) / finalEntryPrice) * 100 * (position.side === 'LONG' ? 1 : -1) : actualPnlPercent,
              opened_at: position.opened_at,
              closed_at: new Date().toISOString(),
              duration_minutes: Math.floor((now.getTime() - openedAt.getTime()) / (1000 * 60)),
              strategy_hash: position.strategy_hash,
              open_reason: position.open_reason,
              close_reason: finalCloseReason,
              indicators_snapshot: enhancedSnapshot,
              mae: maeValue,
              mae_percent: maePercent,
              low_price: finalLowPrice,
              entry_fee: 0,
              exit_fee: 0,
              total_fee: totalFee || null,
              funding_fee: fundingFee || null,
              net_pnl: netPnl,
              pnl_after_fees: pnlAfterFees,
              notional: notional,
              leverage_used: leverageUsed,
              fees_pct_of_notional: feesPctOfNotional,
              fees_pending: true,
              fees_reconciled_at: null,
            };
            // Propagate slot_id from position to trade_history
            if (position.slot_id) {
              tradeHistoryInsert.slot_id = position.slot_id;
            }

            const { error: historyError } = await supabaseClient.from('trade_history').insert(tradeHistoryInsert);

            if (historyError) {
              console.error(`Failed to insert trade history for ${position.symbol}:`, historyError);
            } else {
              console.log(`Trade history saved for ${position.symbol}`);
            }
            
            // Immediately sync with Binance to ensure DB matches reality
            console.log(`Syncing with Binance after closing ${position.symbol}`);
            await supabaseClient.functions.invoke('sync-binance-futures-positions');

            // Preserve user-defined trading capital.
            // Position sizing must keep using user_portfolio.futures_capital as the stable baseline,
            // so monitor-positions must not overwrite it with live Binance balance after closes.
            try {
              const apiKey = Deno.env.get('BINANCE_API_KEY');
              const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
              
              if (apiKey && apiSecret) {
                const accountBalance = await getBinanceAccountBalance(apiKey, apiSecret);
                
                const { data: portfolio } = await supabaseClient
                  .from('user_portfolio')
                  .select('*')
                  .eq('user_id', position.user_id)
                  .single();

                if (!portfolio) {
                  // Create portfolio if it doesn't exist
                  await supabaseClient
                    .from('user_portfolio')
                    .insert({
                      user_id: position.user_id,
                      futures_capital: accountBalance.totalMarginBalance,
                    });

                  console.log(`Portfolio initialized: ${accountBalance.totalMarginBalance} USDT`);
                } else {
                  console.log(`Portfolio capital preserved for ${position.user_id}: ${portfolio.futures_capital}`);
                }
              }
            } catch (error) {
              console.error('Failed to update portfolio balance:', error);
            }

            // After closing, immediately sync with Binance (source of truth)
            await supabaseClient.functions.invoke('sync-binance-futures-positions');

            // @ts-ignore
            const exitAudit = position._exitAudit ?? null;

            results.push({
              symbol: position.symbol,
              action: 'CLOSED',
              reason: finalCloseReason,
              pnl: actualPnl,
              pnlPercent: actualPnlPercent,
              entryPrice: position.entry_price,
              exitPrice: actualExitPrice,
              exitAudit,
            });
          } catch (error) {
            console.error(`Failed to close position ${position.symbol}:`, error);
            results.push({
              symbol: position.symbol,
              action: 'CLOSE_FAILED',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          // @ts-ignore
          const exitAudit = position._exitAudit ?? null;

          results.push({
            symbol: position.symbol,
            action: 'MONITORED',
            currentPrice: currentPrice,
            unrealizedPnl: pnl,
            exitAudit,
          });
        }
      } catch (error) {
        console.error(`Error monitoring position ${position.symbol}:`, error);
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
