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

    // Close position on Binance (reduce-only market)
    const closeRes = await closeOnBinance(symbol, apiKey, apiSecret);

    // Immediately sync DB with Binance (Binance has source of truth)
    const sync = await supabaseClient.functions.invoke('sync-binance-futures-positions');

    return new Response(JSON.stringify({ success: true, closeRes, sync: sync.data }), {
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
