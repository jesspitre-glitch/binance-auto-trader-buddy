import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getCurrentPrice(symbol: string, supabaseClient: any): Promise<number> {
  // Try to get price from cache first (much faster, no rate limits)
  const { data: cached, error: cacheError } = await supabaseClient
    .from('price_cache')
    .select('price, updated_at')
    .eq('symbol', symbol)
    .single();
  
  // Use cached price if it's less than 5 seconds old
  if (cached && !cacheError) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < 5000) {
      return parseFloat(cached.price);
    }
  }
  
  // Fallback to API if cache miss or stale
  try {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch price for ${symbol}`);
    }
    const data = await response.json();
    const price = parseFloat(data.price);
    
    // Update cache for next time
    await supabaseClient
      .from('price_cache')
      .upsert({ symbol, price, updated_at: new Date().toISOString() });
    
    return price;
  } catch (error) {
    // If API fails but we have cached data, use it even if stale
    if (cached) {
      console.warn(`API failed for ${symbol}, using stale cache (age: ${Date.now() - new Date(cached.updated_at).getTime()}ms)`);
      return parseFloat(cached.price);
    }
    throw error;
  }
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

  const positionAmt = Math.abs(parseFloat(position.positionAmt));
  const closeSide = side === 'LONG' ? 'SELL' : 'BUY';
  
  // Place the closing order
  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&side=${closeSide}&type=MARKET&quantity=${positionAmt}&timestamp=${timestamp}&recvWindow=10000`;
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
    };
  }

  return {
    orderId: orderResult.orderId,
    avgPrice: parseFloat(orderResult.avgPrice || orderResult.price || '0'),
    executedQty: parseFloat(orderResult.executedQty || '0'),
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
        // Get current price from cache (much faster, avoids rate limits)
        const currentPrice = await getCurrentPrice(position.symbol, supabaseClient);
        
        // Update current price in database
        await supabaseClient
          .from('positions')
          .update({ current_price: currentPrice })
          .eq('id', position.id);

        let shouldClose = false;
        let closeReason = '';

        // Trailing stop er ALTID aktiv fra start (ingen TP tjek længere)
        let newPeakPrice = position.peak_price || position.entry_price;
        let newTrailingStop = position.trailing_stop;
        
        // Update peak price hvis prisen er bedre
        if (position.side === 'LONG' && currentPrice > newPeakPrice) {
          console.log(`Updating peak: ${newPeakPrice} → ${currentPrice} for ${position.symbol}`);
          newPeakPrice = currentPrice;
        } else if (position.side === 'SHORT' && currentPrice < newPeakPrice) {
          console.log(`Updating peak: ${newPeakPrice} → ${currentPrice} for ${position.symbol}`);
          newPeakPrice = currentPrice;
        }
        
        // Beregn trailing stop fra peak med ATR-baseret procent
        const trailingPercent = position.trailing_stop_percent || 2.0;
        if (position.side === 'LONG') {
          newTrailingStop = newPeakPrice * (1 - trailingPercent / 100);
          console.log(`Trailing stop (LONG): peak=${newPeakPrice}, percent=${trailingPercent}%, stop=${newTrailingStop.toFixed(4)} for ${position.symbol}`);
        } else {
          newTrailingStop = newPeakPrice * (1 + trailingPercent / 100);
          console.log(`Trailing stop (SHORT): peak=${newPeakPrice}, percent=${trailingPercent}%, stop=${newTrailingStop.toFixed(4)} for ${position.symbol}`);
        }
        
        // Tjek om trailing stop er ramt
        if (position.side === 'LONG' && currentPrice <= newTrailingStop) {
          shouldClose = true;
          closeReason = 'TRAILING_STOP_HIT';
          console.log(`TRAILING STOP HIT (LONG): price=${currentPrice} <= trailing=${newTrailingStop} for ${position.symbol}`);
        } else if (position.side === 'SHORT' && currentPrice >= newTrailingStop) {
          shouldClose = true;
          closeReason = 'TRAILING_STOP_HIT';
          console.log(`TRAILING STOP HIT (SHORT): price=${currentPrice} >= trailing=${newTrailingStop} for ${position.symbol}`);
        }

        // Break-even logic: Move SL to entry hvis profit er nået
        let newStopLoss = position.stop_loss;
        if (!position.break_even_activated && position.indicators_snapshot?.atr && position.indicators_snapshot?.break_even_atr) {
          const atr = position.indicators_snapshot.atr;
          const breakEvenAtr = position.indicators_snapshot.break_even_atr;
          const breakEvenDistance = breakEvenAtr * atr;
          
          let breakEvenReached = false;
          if (position.side === 'LONG') {
            breakEvenReached = currentPrice >= (position.entry_price + breakEvenDistance);
          } else {
            breakEvenReached = currentPrice <= (position.entry_price - breakEvenDistance);
          }
          
          if (breakEvenReached) {
            newStopLoss = position.entry_price;
            await supabaseClient
              .from('positions')
              .update({ 
                stop_loss: newStopLoss, 
                break_even_activated: true 
              })
              .eq('id', position.id);
            console.log(`BREAK-EVEN ACTIVATED: SL moved to entry ${newStopLoss} for ${position.symbol}`);
          }
        }

        // Check stop loss (kun hvis trailing stop ikke ramt)
        if (!shouldClose && newStopLoss) {
          if (position.side === 'LONG' && currentPrice <= newStopLoss) {
            shouldClose = true;
            closeReason = position.break_even_activated ? 'BREAK_EVEN_HIT' : 'STOP_LOSS_HIT';
          } else if (position.side === 'SHORT' && currentPrice >= newStopLoss) {
            shouldClose = true;
            closeReason = position.break_even_activated ? 'BREAK_EVEN_HIT' : 'STOP_LOSS_HIT';
          }
        }

        // Check timeout (4 hours default)
        const openedAt = new Date(position.opened_at);
        const now = new Date();
        if (!shouldClose) {
          const hoursSinceOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceOpen >= 4) {
            shouldClose = true;
            closeReason = 'TIMEOUT';
          }
        }

        // Calculate unrealized PnL
        const pnl = position.side === 'LONG' 
          ? (currentPrice - position.entry_price) * position.quantity
          : (position.entry_price - currentPrice) * position.quantity;
        
        const pnlPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100 * (position.side === 'LONG' ? 1 : -1);

        // Update position with new peak and trailing stop
        await supabaseClient
          .from('positions')
          .update({ 
            unrealized_pnl: pnl,
            current_price: currentPrice,
            peak_price: newPeakPrice,
            trailing_stop: newTrailingStop,
          })
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
            const actualQuantity = closeResult.executedQty;
            
            // Calculate actual P&L based on real exit price
            const actualPnl = position.side === 'LONG' 
              ? (actualExitPrice - position.entry_price) * actualQuantity
              : (position.entry_price - actualExitPrice) * actualQuantity;
            
            const actualPnlPercent = ((actualExitPrice - position.entry_price) / position.entry_price) * 100 * (position.side === 'LONG' ? 1 : -1);

            console.log(`Position closed - Entry: ${position.entry_price}, Exit: ${actualExitPrice}, P&L: ${actualPnl.toFixed(2)} USDT`);
            
            // Update position status with close reason
            await supabaseClient
              .from('positions')
              .update({ 
                status: 'CLOSED',
                closed_at: new Date().toISOString(),
                current_price: actualExitPrice,
                unrealized_pnl: actualPnl,
                close_reason: closeReason,
              })
              .eq('id', position.id);

            // Add to trade history with actual values from Binance and indicators
            const { error: historyError } = await supabaseClient.from('trade_history').insert({
              user_id: position.user_id,
              symbol: position.symbol,
              side: position.side,
              entry_price: position.entry_price,
              exit_price: actualExitPrice,
              quantity: actualQuantity,
              pnl: actualPnl,
              pnl_percent: actualPnlPercent,
              opened_at: position.opened_at,
              closed_at: new Date().toISOString(),
              duration_minutes: Math.floor((now.getTime() - openedAt.getTime()) / (1000 * 60)),
              strategy_hash: position.strategy_hash,
              open_reason: position.open_reason,
              close_reason: closeReason,
              indicators_snapshot: position.indicators_snapshot || null,
            });

            if (historyError) {
              console.error(`Failed to insert trade history for ${position.symbol}:`, historyError);
            } else {
              console.log(`Trade history saved for ${position.symbol}`);
            }
            
            // Immediately sync with Binance to ensure DB matches reality
            console.log(`Syncing with Binance after closing ${position.symbol}`);
            await supabaseClient.functions.invoke('sync-binance-futures-positions');

            // Update user portfolio with actual balance from Binance
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

                if (portfolio) {
                  await supabaseClient
                    .from('user_portfolio')
                    .update({
                      futures_capital: accountBalance.totalMarginBalance,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', position.user_id);
                  
                  console.log(`Portfolio updated: ${accountBalance.totalMarginBalance} USDT`);
                } else {
                  // Create portfolio if it doesn't exist
                  await supabaseClient
                    .from('user_portfolio')
                    .insert({
                      user_id: position.user_id,
                      futures_capital: accountBalance.totalMarginBalance,
                    });
                }
              }
            } catch (error) {
              console.error('Failed to update portfolio balance:', error);
            }

            // After closing, immediately sync with Binance (source of truth)
            await supabaseClient.functions.invoke('sync-binance-futures-positions');

            results.push({
              symbol: position.symbol,
              action: 'CLOSED',
              reason: closeReason,
              pnl: actualPnl,
              pnlPercent: actualPnlPercent,
              entryPrice: position.entry_price,
              exitPrice: actualExitPrice,
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
