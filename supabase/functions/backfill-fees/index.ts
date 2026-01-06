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
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getBinanceServerTime(): Promise<number> {
  const response = await fetch('https://fapi.binance.com/fapi/v1/time');
  const data = await response.json();
  return data.serverTime;
}

async function getRecentTradeFees(
  symbol: string, 
  apiKey: string, 
  apiSecret: string, 
  startTime: number,
  endTime: number
): Promise<{ entryFee: number, exitFee: number, totalFee: number }> {
  try {
    const timestamp = await getBinanceServerTime();
    const queryString = `symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&timestamp=${timestamp}`;
    const signature = await createSignature(queryString, apiSecret);
    
    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/userTrades?${queryString}&signature=${signature}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );
    
    if (!response.ok) {
      console.log(`Failed to fetch trades for ${symbol}: ${response.status}`);
      return { entryFee: 0, exitFee: 0, totalFee: 0 };
    }
    
    const trades = await response.json();
    if (!trades || trades.length === 0) {
      return { entryFee: 0, exitFee: 0, totalFee: 0 };
    }
    
    // Sort trades by time
    trades.sort((a: any, b: any) => a.time - b.time);
    
    let entryFee = 0;
    let exitFee = 0;
    
    // First half of trades are entry, second half are exit
    const midPoint = Math.floor(trades.length / 2);
    
    for (let i = 0; i < trades.length; i++) {
      const commission = Math.abs(parseFloat(trades[i].commission || '0'));
      if (i < midPoint || trades.length === 1) {
        entryFee += commission;
      } else {
        exitFee += commission;
      }
    }
    
    // If only one trade, split evenly
    if (trades.length === 1) {
      const half = entryFee / 2;
      entryFee = half;
      exitFee = half;
    }
    
    return { entryFee, exitFee, totalFee: entryFee + exitFee };
  } catch (error) {
    console.error(`Error fetching trade fees for ${symbol}:`, error);
    return { entryFee: 0, exitFee: 0, totalFee: 0 };
  }
}

async function getPositionFundingFees(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  startTime: number,
  endTime: number
): Promise<number> {
  try {
    const timestamp = await getBinanceServerTime();
    const queryString = `symbol=${symbol}&incomeType=FUNDING_FEE&startTime=${startTime}&endTime=${endTime}&limit=1000&timestamp=${timestamp}`;
    const signature = await createSignature(queryString, apiSecret);
    
    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/income?${queryString}&signature=${signature}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );
    
    if (!response.ok) {
      console.log(`Failed to fetch funding for ${symbol}: ${response.status}`);
      return 0;
    }
    
    const incomes = await response.json();
    if (!incomes || incomes.length === 0) {
      return 0;
    }
    
    // Sum all funding fees (can be positive or negative)
    let totalFunding = 0;
    for (const income of incomes) {
      totalFunding += parseFloat(income.income || '0');
    }
    
    return totalFunding;
  } catch (error) {
    console.error(`Error fetching funding fees for ${symbol}:`, error);
    return 0;
  }
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

    const apiKey = Deno.env.get('BINANCE_API_KEY');
    const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');

    if (!apiKey || !apiSecret) {
      throw new Error('Binance API keys not configured');
    }

    // Parse request body for optional hours parameter
    let hours = 168; // Default 7 days
    try {
      const body = await req.json();
      if (body.hours && typeof body.hours === 'number') {
        hours = body.hours;
      }
    } catch {
      // Use default
    }

    console.log(`Backfilling fees for trades from the last ${hours} hours...`);

    // Binance trade history is only available for last 7 days
    const maxHours = 168;
    if (hours > maxHours) {
      console.log(`Warning: Binance only keeps trade history for 7 days. Using ${maxHours} hours.`);
      hours = maxHours;
    }

    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Fetch trades that need fee backfill
    const { data: trades, error: tradesError } = await supabaseClient
      .from('trade_history')
      .select('*')
      .or('total_fee.is.null,total_fee.eq.0')
      .gte('closed_at', startTime)
      .order('closed_at', { ascending: false });

    if (tradesError) {
      console.error('Error fetching trades:', tradesError);
      throw tradesError;
    }

    // Also fetch trades outside the window to mark as missing
    const { data: oldTrades, error: oldTradesError } = await supabaseClient
      .from('trade_history')
      .select('id')
      .or('total_fee.is.null,total_fee.eq.0')
      .lt('closed_at', startTime);

    if (!oldTradesError && oldTrades && oldTrades.length > 0) {
      console.log(`Marking ${oldTrades.length} old trades as fees_data_missing...`);
      
      const oldIds = oldTrades.map(t => t.id);
      const { error: updateOldError } = await supabaseClient
        .from('trade_history')
        .update({ fees_data_missing: true })
        .in('id', oldIds);
      
      if (updateOldError) {
        console.error('Error marking old trades:', updateOldError);
      }
    }

    if (!trades || trades.length === 0) {
      console.log('No trades found that need fee backfill');
      return new Response(JSON.stringify({ 
        message: 'No trades to backfill',
        trades_processed: 0,
        old_trades_marked: oldTrades?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${trades.length} trades to backfill`);

    const results: { id: string; symbol: string; status: string; totalFee?: number; funding?: number }[] = [];

    for (const trade of trades) {
      try {
        console.log(`Processing trade ${trade.id} - ${trade.symbol}`);
        
        const openedAt = new Date(trade.opened_at).getTime();
        const closedAt = new Date(trade.closed_at).getTime();
        
        // Add buffer of 1 minute before and after
        const startMs = openedAt - 60000;
        const endMs = closedAt + 60000;
        
        // Fetch fees from Binance
        const fees = await getRecentTradeFees(trade.symbol, apiKey, apiSecret, startMs, endMs);
        
        // Fetch funding fees
        const fundingFee = await getPositionFundingFees(trade.symbol, apiKey, apiSecret, openedAt, closedAt);
        
        if (fees.totalFee === 0) {
          console.log(`No fee data found for trade ${trade.id}, marking as missing`);
          
          const { error: updateError } = await supabaseClient
            .from('trade_history')
            .update({ fees_data_missing: true })
            .eq('id', trade.id);
          
          if (updateError) {
            console.error(`Error marking trade ${trade.id}:`, updateError);
          }
          
          results.push({ id: trade.id, symbol: trade.symbol, status: 'no_data' });
          continue;
        }
        
        // Calculate derived values
        const pnl = Number(trade.pnl);
        const notional = trade.notional || (Number(trade.entry_price) * Number(trade.quantity));
        const leverage = trade.leverage_used || (trade.indicators_snapshot as any)?.leverage || null;
        const pnlAfterFees = pnl - fees.totalFee;
        const netPnl = pnlAfterFees + fundingFee;
        const feesPctOfNotional = notional > 0 ? (fees.totalFee / notional) * 100 : 0;
        
        // Update the trade
        const updateData: any = {
          entry_fee: fees.entryFee,
          exit_fee: fees.exitFee,
          total_fee: fees.totalFee,
          funding_fee: fundingFee,
          pnl_after_fees: pnlAfterFees,
          net_pnl: netPnl,
          fees_data_missing: false,
        };
        
        // Only update notional and leverage if not already set
        if (!trade.notional) {
          updateData.notional = notional;
        }
        if (!trade.leverage_used && leverage) {
          updateData.leverage_used = leverage;
        }
        if (!trade.fees_pct_of_notional) {
          updateData.fees_pct_of_notional = feesPctOfNotional;
        }
        
        const { error: updateError } = await supabaseClient
          .from('trade_history')
          .update(updateData)
          .eq('id', trade.id);
        
        if (updateError) {
          console.error(`Error updating trade ${trade.id}:`, updateError);
          results.push({ id: trade.id, symbol: trade.symbol, status: 'error' });
        } else {
          console.log(`Updated trade ${trade.id}: fees=${fees.totalFee.toFixed(4)}, funding=${fundingFee.toFixed(4)}`);
          results.push({ 
            id: trade.id, 
            symbol: trade.symbol, 
            status: 'success',
            totalFee: fees.totalFee,
            funding: fundingFee
          });
        }
        
        // Delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
        
      } catch (error) {
        console.error(`Error processing trade ${trade.id}:`, error);
        results.push({ id: trade.id, symbol: trade.symbol, status: 'error' });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const noDataCount = results.filter(r => r.status === 'no_data').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`Backfill complete: ${successCount} success, ${noDataCount} no data, ${errorCount} errors`);

    return new Response(JSON.stringify({ 
      message: 'Fee backfill complete',
      trades_processed: trades.length,
      success_count: successCount,
      no_data_count: noDataCount,
      error_count: errorCount,
      old_trades_marked: oldTrades?.length || 0,
      results: results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
