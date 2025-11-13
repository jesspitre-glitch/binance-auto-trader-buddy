import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function createSignature(queryString: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(queryString);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getBinanceServerTime(): Promise<number> {
  const response = await fetch('https://fapi.binance.com/fapi/v1/time');
  const data = await response.json();
  return data.serverTime;
}

async function getPositionRisk(symbol: string, apiKey: string, apiSecret: string) {
  const serverTime = await getBinanceServerTime();
  const queryString = `timestamp=${serverTime}&recvWindow=10000&symbol=${symbol}`;
  const signature = await createSignature(queryString, apiSecret);
  const url = `https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
  const response = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
  if (!response.ok) throw new Error(`Binance positionRisk error: ${await response.text()}`);
  const data = await response.json();
  // API can return array or object depending on endpoint; normalize
  const pos = Array.isArray(data) ? data[0] : data;
  return pos;
}

async function cancelAllOpenOrders(symbol: string, apiKey: string, apiSecret: string) {
  const serverTime = await getBinanceServerTime();
  const queryString = `symbol=${symbol}&timestamp=${serverTime}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  const url = `https://fapi.binance.com/fapi/v1/allOpenOrders?${queryString}&signature=${signature}`;
  const res = await fetch(url, { method: 'DELETE', headers: { 'X-MBX-APIKEY': apiKey } });
  if (!res.ok) {
    const errorText = await res.text();
    console.warn(`Failed to cancel orders for ${symbol}:`, errorText);
    return { cancelled: false, error: errorText };
  }
  const result = await res.json();
  console.log(`Cancelled ${result.code === 200 || Array.isArray(result) ? result.length || 0 : 0} orders for ${symbol}`);
  return { cancelled: true, result };
}

async function getCurrentPrice(symbol: string, supabaseClient: any): Promise<number> {
  // Try to get price from cache first (much faster, no rate limits)
  const { data: cached, error: cacheError } = await supabaseClient
    .from('price_cache')
    .select('price, updated_at')
    .eq('symbol', symbol)
    .maybeSingle();
  
  // Use cached price if it's less than 5 seconds old
  if (cached && !cacheError) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < 5000) {
      return parseFloat(cached.price);
    }
  }
  
  // Fallback to API if cache miss or stale
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    if (!res.ok) return NaN;
    const data = await res.json();
    const price = parseFloat(data.price);
    
    // Update cache for future requests
    if (price && isFinite(price)) {
      await supabaseClient
        .from('price_cache')
        .upsert({ symbol, price, updated_at: new Date().toISOString() });
    }
    
    return price;
  } catch (e) {
    console.error(`Failed to fetch price for ${symbol}:`, e);
    return NaN;
  }
}

async function closeOnBinance(symbol: string, apiKey: string, apiSecret: string) {
  // Fetch current position amount
  const pos = await getPositionRisk(symbol, apiKey, apiSecret);
  const amt = parseFloat(pos.positionAmt);
  if (!amt || Math.abs(amt) === 0) {
    return { message: 'Already closed', symbol };
  }

  const side = amt > 0 ? 'SELL' : 'BUY';
  const quantity = Math.abs(amt);

  const serverTime = await getBinanceServerTime();
  const params = new URLSearchParams({
    symbol,
    side,
    type: 'MARKET',
    reduceOnly: 'true',
    quantity: quantity.toString(),
    newOrderRespType: 'RESULT',
    timestamp: serverTime.toString(),
    recvWindow: '10000',
  });
  const signature = await createSignature(params.toString(), apiSecret);
  const url = `https://fapi.binance.com/fapi/v1/order?${params.toString()}&signature=${signature}`;
  const res = await fetch(url, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } });
  if (!res.ok) throw new Error(`Order failed: ${await res.text()}`);
  const order = await res.json();
  
  // Cancel all remaining open orders for this symbol (stop-loss, etc.)
  await cancelAllOpenOrders(symbol, apiKey, apiSecret);
  
  return { order };
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

    const { symbol } = await req.json();
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Missing symbol' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('BINANCE_API_KEY');
    const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
    if (!apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: 'Binance API keys not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1) Read the latest OPEN position for this symbol first (so we have full context)
    const { data: openPositions } = await supabaseClient
      .from('positions')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: false })
      .limit(1);
    const position = openPositions?.[0];

    // 2) Close position on Binance (reduce-only market)
    const closeRes = await closeOnBinance(symbol, apiKey, apiSecret);
    const order = (closeRes as any).order ?? {};

    // 3) Resolve execution details from Binance response (fallback to cache/ticker if missing)
    const avgPrice = Number(order.avgPrice) || Number(order.price) || 0;
    const executedQty = Number(order.executedQty) || Number(order.origQty) || Number(position?.quantity) || 0;

    let exitPrice = avgPrice;
    if (!exitPrice || !isFinite(exitPrice) || exitPrice === 0) {
      // Use price cache as primary fallback (avoids rate limits)
      exitPrice = await getCurrentPrice(symbol, supabaseClient);
      
      // If still no valid price, use position's current_price as last resort
      if (!exitPrice || !isFinite(exitPrice) || exitPrice === 0) {
        exitPrice = Number(position?.current_price) || 0;
      }
    }

    // 4) If we have the DB position, persist CLOSED state and insert trade history immediately
    let historyInserted = false;
    if (position) {
      const side: 'LONG' | 'SHORT' = position.side as any;
      const entry = Number(position.entry_price) || 0;
      const qty = executedQty || Number(position.quantity) || 0;
      const nowIso = new Date().toISOString();

      const pnl = side === 'LONG' ? (exitPrice - entry) * qty : (entry - exitPrice) * qty;
      const pnlPercent = ((exitPrice - entry) / (entry || 1)) * 100 * (side === 'LONG' ? 1 : -1);

      await supabaseClient
        .from('positions')
        .update({
          status: 'CLOSED',
          closed_at: nowIso,
          current_price: exitPrice || null,
          unrealized_pnl: pnl,
          close_reason: 'MANUAL',
        })
        .eq('id', position.id);

      const { error: histError } = await supabaseClient.from('trade_history').insert({
        user_id: position.user_id,
        symbol: position.symbol,
        side: position.side,
        entry_price: entry,
        exit_price: exitPrice,
        quantity: qty,
        pnl: pnl,
        pnl_percent: pnlPercent,
        opened_at: position.opened_at,
        closed_at: nowIso,
        duration_minutes: position.opened_at ? Math.floor((Date.now() - new Date(position.opened_at).getTime()) / (1000 * 60)) : null,
        strategy_hash: position.strategy_hash,
        open_reason: position.open_reason,
        close_reason: 'MANUAL',
      });

      historyInserted = !histError;
    }

    // 5) Still run a sync to refresh portfolio and ensure consistency with Binance
    const sync = await supabaseClient.functions.invoke('sync-binance-futures-positions');

    return new Response(JSON.stringify({ success: true, closeRes, historyInserted, sync: sync.data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('close-position-binance error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
