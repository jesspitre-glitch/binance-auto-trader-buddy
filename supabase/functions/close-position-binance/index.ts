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
  return { cancelled: true, result };
}

async function getCurrentPrice(symbol: string, supabaseClient: any): Promise<number> {
  const { data: cached, error: cacheError } = await supabaseClient
    .from('price_cache')
    .select('price, updated_at')
    .eq('symbol', symbol)
    .maybeSingle();

  if (cached && !cacheError) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < 5000) {
      return parseFloat(cached.price);
    }
  }

  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    if (!res.ok) return NaN;
    const data = await res.json();
    const price = parseFloat(data.price);
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

// ──────────────────────────────────────────────────────────────
// Binance-matched P&L: use fills for avg prices + income API for net P&L
// ──────────────────────────────────────────────────────────────

// Fetch all fills (userTrades) and compute avg entry/exit prices
async function getPositionFills(
  symbol: string, side: 'LONG' | 'SHORT',
  apiKey: string, apiSecret: string,
  startTime: number, endTime: number,
): Promise<{ avgEntry: number; avgExit: number; totalQtyEntry: number; totalQtyExit: number; grossPnl: number }> {
  try {
    const serverTime = await getBinanceServerTime();
    const queryString = `symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&timestamp=${serverTime}&recvWindow=10000`;
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

// Fetch ALL income for a symbol in time window → Binance-matched Net P&L
// Net P&L = Σ(REALIZED_PNL) + Σ(COMMISSION) + Σ(FUNDING_FEE) + Σ(other)
async function getPositionIncome(
  symbol: string, apiKey: string, apiSecret: string,
  startTime: number, endTime: number,
): Promise<{ realizedPnl: number; commission: number; fundingFee: number; otherIncome: number; binanceNetPnl: number }> {
  const result = { realizedPnl: 0, commission: 0, fundingFee: 0, otherIncome: 0, binanceNetPnl: 0 };
  try {
    const serverTime = await getBinanceServerTime();
    const queryString = `symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&timestamp=${serverTime}&recvWindow=10000&limit=1000`;
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

async function closeOnBinance(symbol: string, apiKey: string, apiSecret: string, requestedQty?: number) {
  const pos = await getPositionRisk(symbol, apiKey, apiSecret);
  const amt = parseFloat(pos.positionAmt);
  if (!amt || Math.abs(amt) === 0) {
    return { message: 'Already closed', symbol };
  }

  const side = amt > 0 ? 'SELL' : 'BUY';
  const livePositionQty = Math.abs(amt);
  const desiredQty = Math.abs(Number(requestedQty) || 0);
  const quantity = desiredQty > 0 ? Math.min(desiredQty, livePositionQty) : livePositionQty;

  if (desiredQty > livePositionQty) {
    console.warn(`Requested manual close qty for ${symbol} exceeds live Binance qty (${desiredQty} > ${livePositionQty}) - clamping to live qty`);
  }

  const serverTime = await getBinanceServerTime();
  const params = new URLSearchParams({
    symbol, side, type: 'MARKET', reduceOnly: 'true',
    quantity: quantity.toString(), newOrderRespType: 'RESULT',
    timestamp: serverTime.toString(), recvWindow: '10000',
  });
  const signature = await createSignature(params.toString(), apiSecret);
  const url = `https://fapi.binance.com/fapi/v1/order?${params.toString()}&signature=${signature}`;
  const res = await fetch(url, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } });
  if (!res.ok) throw new Error(`Order failed: ${await res.text()}`);
  const order = await res.json();

  await cancelAllOpenOrders(symbol, apiKey, apiSecret);
  return { order, requestedQty: quantity, livePositionQty };
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

    // 1) Read the latest OPEN position for this symbol
    const { data: openPositions } = await supabaseClient
      .from('positions')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: false })
      .limit(1);
    const position = openPositions?.[0];

    // 2) Close position on Binance
    const closeRes = await closeOnBinance(symbol, apiKey, apiSecret, Number(position?.quantity) || undefined);
    const order = (closeRes as any).order ?? {};

    // 3) Resolve exit price from order response or fallback
    const avgPrice = Number(order.avgPrice) || Number(order.price) || 0;
    const rawExecutedQty = Number(order.executedQty) || Number(order.origQty) || 0;
    const slotQuantity = Math.abs(Number(position?.quantity) || 0);
    const executedQty = rawExecutedQty > 0 && rawExecutedQty <= slotQuantity * 1.02
      ? rawExecutedQty
      : (slotQuantity || rawExecutedQty);

    if (slotQuantity > 0 && rawExecutedQty > slotQuantity * 1.02) {
      console.error(`🚨 Manual close qty mismatch for ${symbol}: executed=${rawExecutedQty}, slot=${slotQuantity}. Using slot quantity for DB/history.`);
    }

    let exitPrice = avgPrice;
    if (!exitPrice || !isFinite(exitPrice) || exitPrice === 0) {
      exitPrice = await getCurrentPrice(symbol, supabaseClient);
      if (!exitPrice || !isFinite(exitPrice) || exitPrice === 0) {
        exitPrice = Number(position?.current_price) || 0;
      }
    }

    // 4) If we have the DB position, compute Binance-matched P&L and persist
    let historyInserted = false;
    if (position) {
      const side: 'LONG' | 'SHORT' = position.side as any;
      const entry = Number(position.entry_price) || 0;
      const qty = executedQty || Number(position.quantity) || 0;
      const nowIso = new Date().toISOString();
      const openedAtTime = position.opened_at ? new Date(position.opened_at).getTime() : Date.now() - 3600000;
      const closedAtTime = Date.now();

      // ── Binance-matched P&L via fills + income ──
      const fills = await getPositionFills(symbol, side, apiKey, apiSecret, openedAtTime, closedAtTime);
      const income = await getPositionIncome(symbol, apiKey, apiSecret, openedAtTime, closedAtTime);

      // Use fill-based avg prices for display, but Binance REALIZED_PNL as ground truth
      const finalAvgEntry = fills.avgEntry > 0 ? fills.avgEntry : entry;
      const finalAvgExit = fills.avgExit > 0 ? fills.avgExit : exitPrice;
      // Use Binance REALIZED_PNL as gross P&L (ground truth, not calculated from prices)
      const grossPnl = income.realizedPnl !== 0 ? income.realizedPnl
        : (side === 'LONG' ? (finalAvgExit - finalAvgEntry) * qty : (finalAvgEntry - finalAvgExit) * qty);

      const pnlPercent = ((finalAvgExit - finalAvgEntry) / (finalAvgEntry || 1)) * 100 * (side === 'LONG' ? 1 : -1);

      // Binance-matched net P&L: REALIZED_PNL + COMMISSION + FUNDING_FEE
      const binanceNetPnl = income.binanceNetPnl;

      const totalFee = Math.abs(income.commission);
      const notional = finalAvgEntry * qty;
      const feesPctOfNotional = notional > 0 ? (totalFee / notional) * 100 : 0;
      const leverageUsed = position.indicators_snapshot?.leverage ?? null;

      console.log(`📊 BINANCE-MATCH | ${symbol} ${side} | realized_pnl=${income.realizedPnl.toFixed(4)} | binanceNetPnl=${binanceNetPnl.toFixed(4)} | commission=${income.commission.toFixed(4)} funding=${income.fundingFee.toFixed(4)}`);

      await supabaseClient
        .from('positions')
        .update({
          status: 'CLOSED',
          closed_at: nowIso,
          current_price: finalAvgExit || null,
          unrealized_pnl: grossPnl,
          close_reason: 'MANUAL',
        })
        .eq('id', position.id);

      const { error: histError } = await supabaseClient.from('trade_history').insert({
        user_id: position.user_id,
        symbol: position.symbol,
        side: position.side,
        entry_price: finalAvgEntry,
        exit_price: finalAvgExit,
        quantity: qty,
        pnl: grossPnl,
        pnl_percent: pnlPercent,
        opened_at: position.opened_at,
        closed_at: nowIso,
        duration_minutes: position.opened_at ? Math.floor((Date.now() - new Date(position.opened_at).getTime()) / (1000 * 60)) : null,
        strategy_hash: position.strategy_hash,
        open_reason: position.open_reason,
        close_reason: 'MANUAL',
        entry_fee: 0,
        exit_fee: 0,
        total_fee: totalFee,
        funding_fee: income.fundingFee,
        net_pnl: binanceNetPnl,
        pnl_after_fees: grossPnl + income.commission,
        notional: notional,
        leverage_used: leverageUsed,
        fees_pct_of_notional: feesPctOfNotional,
        fees_pending: true,
        fees_reconciled_at: null,
      });

      historyInserted = !histError;
      if (histError) console.error('trade_history insert error:', histError);
    }

    // 5) Sync to refresh portfolio
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
