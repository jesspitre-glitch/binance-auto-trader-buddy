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
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getBinanceServerTime(): Promise<number> {
  const res = await fetch('https://fapi.binance.com/fapi/v1/time');
  if (!res.ok) return Date.now();
  const data = await res.json();
  return data.serverTime;
}

async function getPositionFills(
  symbol: string, side: 'LONG' | 'SHORT',
  apiKey: string, apiSecret: string,
  startTime: number, endTime: number,
) {
  try {
    const serverTime = await getBinanceServerTime();
    const qs = `symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&timestamp=${serverTime}&recvWindow=10000`;
    const sig = await createSignature(qs, apiSecret);
    const res = await fetch(`https://fapi.binance.com/fapi/v1/userTrades?${qs}&signature=${sig}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    if (!res.ok) return { avgEntry: 0, avgExit: 0, grossPnl: 0 };

    const trades = await res.json();
    if (!Array.isArray(trades) || trades.length === 0) return { avgEntry: 0, avgExit: 0, grossPnl: 0 };

    const entrySide = side === 'LONG' ? 'BUY' : 'SELL';
    let entryNot = 0, entryQty = 0, exitNot = 0, exitQty = 0;
    for (const t of trades) {
      const p = parseFloat(t.price), q = parseFloat(t.qty);
      if (t.side === entrySide) { entryNot += p * q; entryQty += q; }
      else { exitNot += p * q; exitQty += q; }
    }
    const avgEntry = entryQty > 0 ? entryNot / entryQty : 0;
    const avgExit = exitQty > 0 ? exitNot / exitQty : 0;
    const posQty = Math.min(entryQty, exitQty);
    const grossPnl = side === 'LONG' ? (avgExit - avgEntry) * posQty : (avgEntry - avgExit) * posQty;
    return { avgEntry, avgExit, grossPnl };
  } catch { return { avgEntry: 0, avgExit: 0, grossPnl: 0 }; }
}

async function getPositionIncome(
  symbol: string, apiKey: string, apiSecret: string,
  startTime: number, endTime: number,
) {
  const result = { realizedPnl: 0, commission: 0, fundingFee: 0, binanceNetPnl: 0 };
  try {
    const serverTime = await getBinanceServerTime();
    const qs = `symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&timestamp=${serverTime}&recvWindow=10000&limit=1000`;
    const sig = await createSignature(qs, apiSecret);
    const res = await fetch(`https://fapi.binance.com/fapi/v1/income?${qs}&signature=${sig}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    if (!res.ok) return result;

    const incomes = await res.json();
    if (!Array.isArray(incomes)) return result;

    for (const inc of incomes) {
      const amount = parseFloat(inc.income || 0);
      switch (inc.incomeType) {
        case 'REALIZED_PNL': result.realizedPnl += amount; break;
        case 'COMMISSION': result.commission += amount; break;
        case 'FUNDING_FEE': result.fundingFee += amount; break;
      }
    }
    result.binanceNetPnl = result.realizedPnl + result.commission + result.fundingFee;
    return result;
  } catch { return result; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const apiKey = Deno.env.get('BINANCE_API_KEY')!;
    const apiSecret = Deno.env.get('BINANCE_SECRET_KEY')!;

    // Fetch trades marked as fees_pending
    // Also reconcile trades closed within last 2 hours that haven't been reconciled
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const { data: pendingTrades, error } = await supabase
      .from('trade_history')
      .select('*')
      .or(`fees_pending.eq.true,and(closed_at.gte.${twoHoursAgo},fees_reconciled_at.is.null)`)
      .order('closed_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!pendingTrades || pendingTrades.length === 0) {
      return new Response(JSON.stringify({ message: 'No trades to reconcile', reconciled: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔄 Reconciling fees for ${pendingTrades.length} trades`);

    let reconciled = 0, skipped = 0, failed = 0;

    for (const trade of pendingTrades) {
      try {
        const openTime = new Date(trade.opened_at).getTime();
        // Add 5 min buffer after close to catch late-arriving income entries
        const closeTime = trade.closed_at 
          ? new Date(trade.closed_at).getTime() + 5 * 60 * 1000 
          : Date.now();
        const side = trade.side as 'LONG' | 'SHORT';

        // Rate limit
        await new Promise(r => setTimeout(r, 250));

        const fills = await getPositionFills(trade.symbol, side, apiKey, apiSecret, openTime, closeTime);
        await new Promise(r => setTimeout(r, 250));
        const income = await getPositionIncome(trade.symbol, apiKey, apiSecret, openTime, closeTime);

        if (income.binanceNetPnl === 0 && income.realizedPnl === 0 && income.commission === 0) {
          skipped++;
          continue;
        }

        const finalEntry = fills.avgEntry > 0 ? fills.avgEntry : trade.entry_price;
        const finalExit = fills.avgExit > 0 ? fills.avgExit : trade.exit_price;
        const grossPnl = income.realizedPnl !== 0 ? income.realizedPnl
          : (side === 'LONG' ? (finalExit - finalEntry) * trade.quantity : (finalEntry - finalExit) * trade.quantity);
        const pnlPercent = ((finalExit - finalEntry) / (finalEntry || 1)) * 100 * (side === 'LONG' ? 1 : -1);
        const totalFee = Math.abs(income.commission);
        const notional = finalEntry * trade.quantity;

        const { error: upErr } = await supabase
          .from('trade_history')
          .update({
            entry_price: finalEntry,
            exit_price: finalExit,
            pnl: grossPnl,
            pnl_percent: pnlPercent,
            net_pnl: income.binanceNetPnl,
            total_fee: totalFee,
            funding_fee: income.fundingFee,
            pnl_after_fees: grossPnl + income.commission,
            notional: notional,
            fees_pct_of_notional: notional > 0 ? (totalFee / notional) * 100 : 0,
            fees_data_missing: false,
            fees_pending: false,
            fees_reconciled_at: new Date().toISOString(),
          })
          .eq('id', trade.id);

        if (upErr) {
          failed++;
          console.error(`❌ Reconcile failed for ${trade.symbol}:`, upErr.message);
        } else {
          reconciled++;
          console.log(`✅ Reconciled ${trade.symbol} | net=${income.binanceNetPnl.toFixed(4)} | commission=${income.commission.toFixed(4)} | funding=${income.fundingFee.toFixed(4)}`);
        }
      } catch (e) {
        failed++;
        console.error(`❌ Error reconciling ${trade.symbol}:`, e);
      }
    }

    return new Response(JSON.stringify({ reconciled, skipped, failed, total: pendingTrades.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
