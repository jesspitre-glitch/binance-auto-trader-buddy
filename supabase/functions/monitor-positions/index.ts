import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getCurrentPrice(symbol: string): Promise<number> {
  const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch price for ${symbol}`);
  }
  const data = await response.json();
  return parseFloat(data.price);
}

async function closePositionOnBinance(symbol: string, side: string) {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not configured');
  }

  const timestamp = Date.now();
  const closeSide = side === 'LONG' ? 'SELL' : 'BUY';
  
  const params = new URLSearchParams({
    symbol,
    side: closeSide,
    type: 'MARKET',
    closePosition: 'true',
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
    `https://fapi.binance.com/fapi/v1/order?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to close position: ${error}`);
  }

  return await response.json();
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

    // Get all open positions
    const { data: positions, error: positionsError } = await supabaseClient
      .from('positions')
      .select('*')
      .eq('status', 'OPEN');

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
        // Get current price
        const currentPrice = await getCurrentPrice(position.symbol);
        
        // Update current price in database
        await supabaseClient
          .from('positions')
          .update({ current_price: currentPrice })
          .eq('id', position.id);

        let shouldClose = false;
        let closeReason = '';

        // Check stop loss
        if (position.side === 'LONG' && currentPrice <= position.stop_loss) {
          shouldClose = true;
          closeReason = 'STOP_LOSS_HIT';
        } else if (position.side === 'SHORT' && currentPrice >= position.stop_loss) {
          shouldClose = true;
          closeReason = 'STOP_LOSS_HIT';
        }

        // Check take profit
        if (position.side === 'LONG' && currentPrice >= position.take_profit) {
          shouldClose = true;
          closeReason = 'TAKE_PROFIT_HIT';
        } else if (position.side === 'SHORT' && currentPrice <= position.take_profit) {
          shouldClose = true;
          closeReason = 'TAKE_PROFIT_HIT';
        }

        // Check timeout (4 hours default)
        const openedAt = new Date(position.opened_at);
        const now = new Date();
        const hoursSinceOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceOpen >= 4) {
          shouldClose = true;
          closeReason = 'TIMEOUT';
        }

        // Calculate unrealized PnL
        const pnl = position.side === 'LONG' 
          ? (currentPrice - position.entry_price) * position.quantity
          : (position.entry_price - currentPrice) * position.quantity;
        
        const pnlPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100 * (position.side === 'LONG' ? 1 : -1);

        await supabaseClient
          .from('positions')
          .update({ unrealized_pnl: pnl })
          .eq('id', position.id);

        if (shouldClose) {
          console.log(`Closing position ${position.symbol} - Reason: ${closeReason}`);
          
          try {
            // Close position on Binance
            await closePositionOnBinance(position.symbol, position.side);
            
            // Update position status
            await supabaseClient
              .from('positions')
              .update({ 
                status: 'CLOSED',
                closed_at: new Date().toISOString(),
              })
              .eq('id', position.id);

            // Add to trade history
            await supabaseClient.from('trade_history').insert({
              user_id: position.user_id,
              symbol: position.symbol,
              side: position.side,
              entry_price: position.entry_price,
              exit_price: currentPrice,
              quantity: position.quantity,
              pnl: pnl,
              pnl_percent: pnlPercent,
              opened_at: position.opened_at,
              closed_at: new Date().toISOString(),
              duration_minutes: Math.floor((now.getTime() - openedAt.getTime()) / (1000 * 60)),
              strategy_hash: position.strategy_hash,
            });

            // Update user portfolio
            const { data: portfolio } = await supabaseClient
              .from('user_portfolio')
              .select('*')
              .eq('user_id', position.user_id)
              .single();

            if (portfolio) {
              await supabaseClient
                .from('user_portfolio')
                .update({
                  futures_capital: portfolio.futures_capital + pnl,
                })
                .eq('user_id', position.user_id);
            }

            results.push({
              symbol: position.symbol,
              action: 'CLOSED',
              reason: closeReason,
              pnl: pnl,
              pnlPercent: pnlPercent,
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
          results.push({
            symbol: position.symbol,
            action: 'MONITORED',
            currentPrice: currentPrice,
            unrealizedPnl: pnl,
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
