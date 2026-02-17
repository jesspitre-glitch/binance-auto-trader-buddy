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
  const data = await res.json();
  return data.serverTime;
}

/**
 * Convert a non-USDC/USDT commission asset to USDC equivalent.
 * Uses spot API ticker price for conversion.
 */
async function convertToUsdc(asset: string, amount: number): Promise<number> {
  if (asset === 'USDT' || asset === 'USDC') return amount;
  try {
    // Try futures ticker first
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${asset}USDT`);
    if (res.ok) {
      const data = await res.json();
      return amount * parseFloat(data.price);
    }
    // Fallback to spot
    const spotRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${asset}USDT`);
    if (spotRes.ok) {
      const spotData = await spotRes.json();
      return amount * parseFloat(spotData.price);
    }
  } catch { /* fallback below */ }
  // Last resort: return raw amount (better than 0)
  console.warn(`⚠️ Could not convert ${asset} to USDC, using raw amount`);
  return amount;
}

/**
 * Fetch per-fill trade data from Binance userTrades endpoint.
 * Returns avg entry/exit prices AND actual paid commission (converted to USDC).
 * This handles BNB fee discount automatically via commissionAsset field.
 */
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
    if (!res.ok) return { avgEntry: 0, avgExit: 0, grossPnl: 0, fillCommissionUsdc: 0, commissionAssets: '' };

    const trades = await res.json();
    if (!Array.isArray(trades) || trades.length === 0) return { avgEntry: 0, avgExit: 0, grossPnl: 0, fillCommissionUsdc: 0, commissionAssets: '' };

    const entrySide = side === 'LONG' ? 'BUY' : 'SELL';
    let entryNot = 0, entryQty = 0, exitNot = 0, exitQty = 0;

    // Track commission per asset for BNB conversion
    const commissionByAsset: Record<string, number> = {};

    for (const t of trades) {
      const p = parseFloat(t.price), q = parseFloat(t.qty);
      const comm = parseFloat(t.commission || '0');
      const commAsset = t.commissionAsset || 'USDT';

      if (t.side === entrySide) { entryNot += p * q; entryQty += q; }
      else { exitNot += p * q; exitQty += q; }

      commissionByAsset[commAsset] = (commissionByAsset[commAsset] || 0) + comm;
    }

    const avgEntry = entryQty > 0 ? entryNot / entryQty : 0;
    const avgExit = exitQty > 0 ? exitNot / exitQty : 0;
    const posQty = Math.min(entryQty, exitQty);
    const grossPnl = side === 'LONG' ? (avgExit - avgEntry) * posQty : (avgEntry - avgExit) * posQty;

    // Convert all commissions to USDC (handles BNB, USDT, etc.)
    let fillCommissionUsdc = 0;
    for (const [asset, amount] of Object.entries(commissionByAsset)) {
      fillCommissionUsdc += await convertToUsdc(asset, amount);
    }

    const commissionAssets = Object.keys(commissionByAsset).join(',');

    return { avgEntry, avgExit, grossPnl, fillCommissionUsdc, commissionAssets };
  } catch { return { avgEntry: 0, avgExit: 0, grossPnl: 0, fillCommissionUsdc: 0, commissionAssets: '' }; }
}

/**
 * Fetch REALIZED_PNL and FUNDING_FEE from Binance income endpoint.
 * Commission is NOT used from here — we use per-fill commission from userTrades instead.
 */
async function getPositionIncome(
  symbol: string, apiKey: string, apiSecret: string,
  startTime: number, endTime: number,
) {
  const result = { realizedPnl: 0, fundingFee: 0, incomeCommission: 0 };
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
        case 'COMMISSION': result.incomeCommission += amount; break;
        case 'FUNDING_FEE': result.fundingFee += amount; break;
      }
    }
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

    const { data: trades, error } = await supabase
      .from('trade_history')
      .select('*')
      .order('opened_at', { ascending: true });

    if (error) throw error;
    if (!trades || trades.length === 0) {
      return new Response(JSON.stringify({ message: 'No trades to backfill' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updated = 0, skipped = 0, failed = 0;
    const results: any[] = [];

    for (const trade of trades) {
      try {
        const openTime = new Date(trade.opened_at).getTime();
        const closeTime = trade.closed_at ? new Date(trade.closed_at).getTime() : Date.now();
        const side = trade.side as 'LONG' | 'SHORT';

        await new Promise(r => setTimeout(r, 200));
        const fills = await getPositionFills(trade.symbol, side, apiKey, apiSecret, openTime, closeTime);

        await new Promise(r => setTimeout(r, 200));
        const income = await getPositionIncome(trade.symbol, apiKey, apiSecret, openTime, closeTime);

        if (income.realizedPnl === 0 && fills.fillCommissionUsdc === 0 && income.fundingFee === 0) {
          skipped++;
          results.push({ symbol: trade.symbol, id: trade.id, status: 'skipped_no_data' });
          continue;
        }

        const finalEntry = fills.avgEntry > 0 ? fills.avgEntry : trade.entry_price;
        const finalExit = fills.avgExit > 0 ? fills.avgExit : trade.exit_price;

        // Gross P&L: use Binance REALIZED_PNL as ground truth
        const grossPnl = income.realizedPnl !== 0 ? income.realizedPnl
          : (side === 'LONG' ? (finalExit - finalEntry) * trade.quantity : (finalEntry - finalExit) * trade.quantity);

        const pnlPercent = ((finalExit - finalEntry) / (finalEntry || 1)) * 100 * (side === 'LONG' ? 1 : -1);

        // Commission: use per-fill actual paid commission (handles BNB discount)
        // fillCommissionUsdc is always positive (cost)
        const totalFee = fills.fillCommissionUsdc > 0 ? fills.fillCommissionUsdc : Math.abs(income.incomeCommission);

        // Net P&L = gross + commission (negative) + funding
        const netPnl = grossPnl + (-totalFee) + income.fundingFee;

        const notional = finalEntry * trade.quantity;

        const { error: upErr } = await supabase
          .from('trade_history')
          .update({
            entry_price: finalEntry,
            exit_price: finalExit,
            pnl: grossPnl,
            pnl_percent: pnlPercent,
            net_pnl: netPnl,
            total_fee: totalFee,
            funding_fee: income.fundingFee,
            pnl_after_fees: grossPnl + (-totalFee),
            notional: notional,
            fees_pct_of_notional: notional > 0 ? (totalFee / notional) * 100 : 0,
            fees_data_missing: false,
          })
          .eq('id', trade.id);

        if (upErr) {
          failed++;
          results.push({ symbol: trade.symbol, id: trade.id, status: 'update_error', error: upErr.message });
        } else {
          updated++;
          results.push({
            symbol: trade.symbol, id: trade.id, status: 'updated',
            gross: grossPnl.toFixed(4), net: netPnl.toFixed(4),
            commission: (-totalFee).toFixed(4), funding: income.fundingFee.toFixed(4),
            commission_source: fills.fillCommissionUsdc > 0 ? 'userTrades' : 'income',
            commission_assets: fills.commissionAssets || 'USDT',
          });
        }

        console.log(`✅ ${trade.symbol} | gross=${grossPnl.toFixed(4)} net=${netPnl.toFixed(4)} comm=${(-totalFee).toFixed(4)} [${fills.commissionAssets || 'income'}]`);
      } catch (e) {
        failed++;
        results.push({ symbol: trade.symbol, id: trade.id, status: 'error', error: String(e) });
      }
    }

    return new Response(JSON.stringify({ updated, skipped, failed, total: trades.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
