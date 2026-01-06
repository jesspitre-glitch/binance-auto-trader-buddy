import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Trade {
  id: string;
  symbol: string;
  side: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  opened_at: string;
  closed_at: string;
  pnl: number;
  pnl_percent: number;
}

interface Kline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

async function fetchKlines(symbol: string, startTime: number, endTime: number): Promise<Kline[]> {
  const allKlines: Kline[] = [];
  let currentStart = startTime;
  
  // Fetch 1-minute klines in batches (max 1500 per request)
  while (currentStart < endTime) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&startTime=${currentStart}&endTime=${endTime}&limit=1500`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch klines for ${symbol}: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      if (!data || data.length === 0) break;
      
      for (const k of data) {
        allKlines.push({
          openTime: k[0],
          open: k[1],
          high: k[2],
          low: k[3],
          close: k[4],
          volume: k[5],
          closeTime: k[6],
        });
      }
      
      // Move to next batch
      const lastKline = data[data.length - 1];
      currentStart = lastKline[6] + 1; // closeTime + 1ms
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.error(`Error fetching klines for ${symbol}:`, error);
      break;
    }
  }
  
  return allKlines;
}

function calculateMAE(trade: Trade, klines: Kline[]): { mae: number; mae_percent: number; low_price: number } {
  const entryPrice = trade.entry_price;
  const isLong = trade.side === 'LONG';
  
  let worstPrice = entryPrice;
  
  for (const kline of klines) {
    const low = parseFloat(kline.low);
    const high = parseFloat(kline.high);
    
    if (isLong) {
      // For LONG: worst is lowest price
      if (low < worstPrice) {
        worstPrice = low;
      }
    } else {
      // For SHORT: worst is highest price
      if (high > worstPrice) {
        worstPrice = high;
      }
    }
  }
  
  // Calculate MAE
  let mae_percent: number;
  if (isLong) {
    mae_percent = ((worstPrice - entryPrice) / entryPrice) * 100;
  } else {
    mae_percent = ((entryPrice - worstPrice) / entryPrice) * 100;
  }
  
  // MAE should be negative or zero (represents adverse movement)
  mae_percent = Math.min(0, mae_percent);
  
  const mae = (mae_percent / 100) * entryPrice * trade.quantity;
  
  return {
    mae: mae,
    mae_percent: mae_percent,
    low_price: worstPrice,
  };
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

    // Parse request body for optional hours parameter
    let hours = 72;
    try {
      const body = await req.json();
      if (body.hours && typeof body.hours === 'number') {
        hours = body.hours;
      }
    } catch {
      // Use default 72 hours
    }

    console.log(`Backfilling MAE for trades from the last ${hours} hours...`);

    // Calculate time range
    const now = Date.now();
    const startTime = new Date(now - hours * 60 * 60 * 1000).toISOString();

    // Fetch trades from the last X hours that don't have MAE calculated
    const { data: trades, error: tradesError } = await supabaseClient
      .from('trade_history')
      .select('*')
      .gte('closed_at', startTime)
      .order('closed_at', { ascending: false });

    if (tradesError) {
      console.error('Error fetching trades:', tradesError);
      throw tradesError;
    }

    if (!trades || trades.length === 0) {
      console.log('No trades found in the specified time range');
      return new Response(JSON.stringify({ 
        message: 'No trades found',
        trades_processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${trades.length} trades to process`);

    const results: { id: string; symbol: string; mae_percent: number; status: string }[] = [];

    for (const trade of trades) {
      try {
        console.log(`Processing trade ${trade.id} - ${trade.symbol} (${trade.side})`);
        
        const openedAt = new Date(trade.opened_at).getTime();
        const closedAt = new Date(trade.closed_at).getTime();
        
        // Fetch klines for the trade period
        const klines = await fetchKlines(trade.symbol, openedAt, closedAt);
        
        if (klines.length === 0) {
          console.log(`No klines found for trade ${trade.id}, using exit price as fallback`);
          
          // Fallback: calculate MAE from entry/exit if no klines available
          const entryPrice = trade.entry_price;
          const exitPrice = trade.exit_price;
          const isLong = trade.side === 'LONG';
          
          let mae_percent: number;
          if (isLong) {
            mae_percent = Math.min(0, ((exitPrice - entryPrice) / entryPrice) * 100);
          } else {
            mae_percent = Math.min(0, ((entryPrice - exitPrice) / entryPrice) * 100);
          }
          
          const mae = (mae_percent / 100) * entryPrice * trade.quantity;
          
          const { error: updateError } = await supabaseClient
            .from('trade_history')
            .update({
              mae: mae,
              mae_percent: mae_percent,
              low_price: isLong ? Math.min(entryPrice, exitPrice) : Math.max(entryPrice, exitPrice),
            })
            .eq('id', trade.id);
          
          if (updateError) {
            console.error(`Error updating trade ${trade.id}:`, updateError);
            results.push({ id: trade.id, symbol: trade.symbol, mae_percent, status: 'error' });
          } else {
            results.push({ id: trade.id, symbol: trade.symbol, mae_percent, status: 'fallback' });
          }
          
          continue;
        }
        
        console.log(`Found ${klines.length} klines for trade ${trade.id}`);
        
        // Calculate MAE from klines
        const maeData = calculateMAE(trade, klines);
        
        console.log(`Trade ${trade.id}: MAE = ${maeData.mae_percent.toFixed(3)}%, low_price = ${maeData.low_price}`);
        
        // Update the trade
        const { error: updateError } = await supabaseClient
          .from('trade_history')
          .update({
            mae: maeData.mae,
            mae_percent: maeData.mae_percent,
            low_price: maeData.low_price,
          })
          .eq('id', trade.id);
        
        if (updateError) {
          console.error(`Error updating trade ${trade.id}:`, updateError);
          results.push({ id: trade.id, symbol: trade.symbol, mae_percent: maeData.mae_percent, status: 'error' });
        } else {
          results.push({ id: trade.id, symbol: trade.symbol, mae_percent: maeData.mae_percent, status: 'success' });
        }
        
        // Small delay between trades
        await new Promise(r => setTimeout(r, 200));
        
      } catch (error) {
        console.error(`Error processing trade ${trade.id}:`, error);
        results.push({ id: trade.id, symbol: trade.symbol, mae_percent: 0, status: 'error' });
      }
    }

    const successCount = results.filter(r => r.status === 'success' || r.status === 'fallback').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`Backfill complete: ${successCount} succeeded, ${errorCount} failed`);

    return new Response(JSON.stringify({ 
      message: 'MAE backfill complete',
      trades_processed: trades.length,
      success_count: successCount,
      error_count: errorCount,
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
