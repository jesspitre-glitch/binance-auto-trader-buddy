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
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getBinanceServerTime(): Promise<number> {
  const response = await fetch('https://fapi.binance.com/fapi/v1/time');
  const data = await response.json();
  return data.serverTime;
}

async function getBinanceAccount(apiKey: string, apiSecret: string) {
  const serverTime = await getBinanceServerTime();
  const queryString = `timestamp=${serverTime}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const url = `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Binance account error:', errorText);
    throw new Error(`Binance API error: ${response.statusText}`);
  }
  
  return await response.json();
}

async function getBinancePositions(apiKey: string, apiSecret: string) {
  const serverTime = await getBinanceServerTime();
  const queryString = `timestamp=${serverTime}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const url = `https://fapi.binance.com/fapi/v3/positionRisk?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Binance positions error:', errorText);
    throw new Error(`Binance API error: ${response.statusText}`);
  }
  
  const positions = await response.json();
  
  // Filter only positions with quantity > 0
  return positions.filter((p: any) => parseFloat(p.positionAmt) !== 0);
}

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
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    if (!res.ok) return NaN;
    const data = await res.json();
    const price = parseFloat(data.price);
    
    // Update cache for next time
    await supabaseClient
      .from('price_cache')
      .upsert({ symbol, price, updated_at: new Date().toISOString() });
    
    return price;
  } catch (error) {
    // If API fails but we have cached data, use it even if stale
    if (cached) {
      console.warn(`API failed for ${symbol}, using stale cache`);
      return parseFloat(cached.price);
    }
    return NaN;
  }
}

// Try to detect the actual close order type from Binance (TP/SL/Trailing)
async function getRecentCloseReason(
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<'EXTERNAL_CLOSE' | 'STOP_LOSS_HIT' | 'TAKE_PROFIT_HIT' | 'TRAILING_STOP_HIT'> {
  try {
    const serverTime = await getBinanceServerTime();
    const params = new URLSearchParams({
      symbol,
      timestamp: serverTime.toString(),
      recvWindow: '10000',
      limit: '50',
    });
    const signature = await createSignature(params.toString(), apiSecret);
    const url = `https://fapi.binance.com/fapi/v1/allOrders?${params.toString()}&signature=${signature}`;
    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
    if (!res.ok) return 'EXTERNAL_CLOSE';
    const orders = await res.json();
    // Look for the most recent filled reduce-only order
    const recent = orders
      .filter((o: any) => o.status === 'FILLED')
      .sort((a: any, b: any) => (b.updateTime || b.time) - (a.updateTime || a.time))[0];
    if (!recent) return 'EXTERNAL_CLOSE';
    const type: string = recent.origType || recent.type || '';
    if (type.includes('TAKE_PROFIT')) return 'TAKE_PROFIT_HIT';
    if (type.includes('TRAILING_STOP')) return 'TRAILING_STOP_HIT';
    if (type.includes('STOP')) return 'STOP_LOSS_HIT';
    return 'EXTERNAL_CLOSE';
  } catch (_err) {
    return 'EXTERNAL_CLOSE';
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

    // Fetch account data (balance) from Binance
    const accountData = await getBinanceAccount(apiKey, apiSecret);
    const totalMarginBalance = parseFloat(accountData.totalMarginBalance);
    const totalWalletBalance = parseFloat(accountData.totalWalletBalance);
    const totalUnrealizedProfit = parseFloat(accountData.totalUnrealizedProfit);
    const availableBalance = parseFloat(accountData.availableBalance);

    // Get all active users from trading_session
    const { data: activeSessions } = await supabaseClient
      .from('trading_session')
      .select('user_id')
      .eq('is_active', true);

    if (!activeSessions || activeSessions.length === 0) {
      console.log('No active trading sessions');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active sessions to sync',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allUpdates = [];

    // Process each active user
    for (const session of activeSessions) {
      const userId = session.user_id;
      console.log(`Syncing positions for user ${userId}`);

      // Update or insert user portfolio with balance
      const { data: existingPortfolio } = await supabaseClient
        .from('user_portfolio')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (existingPortfolio) {
        await supabaseClient
          .from('user_portfolio')
          .update({
            futures_capital: totalMarginBalance,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      } else {
        await supabaseClient
          .from('user_portfolio')
          .insert({
            user_id: userId,
            futures_capital: totalMarginBalance,
          });
      }

      // Fetch positions from Binance
      const binancePositions = await getBinancePositions(apiKey, apiSecret);
      
      // Get current positions from database for this user
      const { data: dbPositions } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'OPEN');

      const updates = [];

      // Sync each Binance position to database
      const binanceSymbols = new Set<string>();
      
      for (const binancePos of binancePositions) {
        const quantity = parseFloat(binancePos.positionAmt);
        const side = quantity > 0 ? 'LONG' : 'SHORT';
        const absQuantity = Math.abs(quantity);
        const currentPrice = parseFloat(binancePos.markPrice);
        const unrealizedPnl = parseFloat(binancePos.unRealizedProfit);
        
        binanceSymbols.add(binancePos.symbol);
        
        // Find ALL matching positions in DB for this symbol
        const matchingPositions = dbPositions?.filter(p => p.symbol === binancePos.symbol) || [];
        
        if (matchingPositions.length > 0) {
          // Update the FIRST position with LIVE data from Binance
          const mainPos = matchingPositions[0];
          
          console.log(`Updating ${binancePos.symbol}: Price ${currentPrice}, P&L ${unrealizedPnl.toFixed(2)} USDT`);
          
          const { error } = await supabaseClient
            .from('positions')
            .update({
              current_price: currentPrice,
              unrealized_pnl: unrealizedPnl,
              quantity: absQuantity,
              side: side,
              updated_at: new Date().toISOString(),
            })
            .eq('id', mainPos.id);
          
          if (error) console.error('Update error:', error);
          updates.push({ 
            symbol: binancePos.symbol, 
            action: 'updated', 
            id: mainPos.id,
            price: currentPrice,
            pnl: unrealizedPnl,
          });
          
          // Close DUPLICATES (all except the first one)
          for (let i = 1; i < matchingPositions.length; i++) {
            const duplicate = matchingPositions[i];
            console.log(`Closing duplicate position ${duplicate.symbol} (ID: ${duplicate.id})`);
            
            // Fetch a current price snapshot to log history
            const exitPrice = await getCurrentPrice(duplicate.symbol, supabaseClient);
            const qty = Number(duplicate.quantity) || 0;
            const entry = Number(duplicate.entry_price) || 0;
            const sideDup = duplicate.side as 'LONG' | 'SHORT';
            const pnlRaw = sideDup === 'LONG' ? (exitPrice - entry) * qty : (entry - exitPrice) * qty;
            const positionValue = entry * qty || 1;
            const pnlPct = (pnlRaw / positionValue) * 100;
            const nowIso = new Date().toISOString();
            const durationMin = duplicate.opened_at ? Math.floor((Date.now() - new Date(duplicate.opened_at).getTime()) / (1000 * 60)) : null;

            await supabaseClient
              .from('positions')
              .update({
                status: 'CLOSED',
                closed_at: nowIso,
                close_reason: 'DUPLICATE',
              })
              .eq('id', duplicate.id);

            // Insert trade history for duplicate closure
            await supabaseClient
              .from('trade_history')
              .insert({
                user_id: duplicate.user_id,
                symbol: duplicate.symbol,
                side: duplicate.side,
                entry_price: entry,
                exit_price: exitPrice,
                quantity: qty,
                pnl: pnlRaw,
                pnl_percent: pnlPct,
                opened_at: duplicate.opened_at,
                closed_at: nowIso,
                duration_minutes: durationMin,
                strategy_hash: duplicate.strategy_hash,
                open_reason: duplicate.open_reason,
                close_reason: 'DUPLICATE',
              });
            
            updates.push({ symbol: duplicate.symbol, action: 'closed_duplicate', id: duplicate.id });
          }
        } else {
          // Create new position if none exists
          console.log(`Creating new position for ${binancePos.symbol}`);
          
            // For positions found on Binance (not created by our system), use a default trailing stop
            // We don't have ATR or config here, so use a reasonable default of 2%
            const { error } = await supabaseClient
              .from('positions')
              .insert({
                user_id: userId,
                symbol: binancePos.symbol,
                side,
                entry_price: parseFloat(binancePos.entryPrice),
                quantity: absQuantity,
                current_price: currentPrice,
                peak_price: currentPrice,
                trailing_stop_percent: 2.0, // Default for external positions
                unrealized_pnl: unrealizedPnl,
                status: 'OPEN',
                open_reason: `Position fundet på Binance (${side} @ ${parseFloat(binancePos.entryPrice).toFixed(4)})`,
              });
          
          if (error) console.error('Insert error:', error);
          updates.push({ symbol: binancePos.symbol, action: 'created' });
        }
      }

      // Close positions that are no longer on Binance
      if (dbPositions) {
        for (const dbPos of dbPositions) {
          if (!binanceSymbols.has(dbPos.symbol)) {
            // Only process if still OPEN (don't overwrite if already closed by monitor/manual)
            if (dbPos.status !== 'OPEN') {
              console.log(`Skipping ${dbPos.symbol} - already closed with reason: ${dbPos.close_reason}`);
              continue;
            }
            
            console.log(`Closing position ${dbPos.symbol} - not found on Binance (was closed externally)`);
            const nowIso = new Date().toISOString();

            // Best-effort snapshot price for history
            const exitPrice = await getCurrentPrice(dbPos.symbol, supabaseClient);
            const qty = Number(dbPos.quantity) || 0;
            const entry = Number(dbPos.entry_price) || 0;
            const sideDb = dbPos.side as 'LONG' | 'SHORT';

            // Try to infer reason from Binance recent orders first, then fallback to SL/TP thresholds
            let inferredReason: 'EXTERNAL_CLOSE' | 'STOP_LOSS_HIT' | 'TAKE_PROFIT_HIT' | 'TRAILING_STOP_HIT' = await getRecentCloseReason(dbPos.symbol, apiKey!, apiSecret!);
            if (inferredReason === 'EXTERNAL_CLOSE') {
              if (sideDb === 'LONG') {
                if (dbPos.stop_loss && exitPrice <= Number(dbPos.stop_loss)) inferredReason = 'STOP_LOSS_HIT';
                else if (dbPos.take_profit && exitPrice >= Number(dbPos.take_profit)) inferredReason = 'TAKE_PROFIT_HIT';
              } else {
                if (dbPos.stop_loss && exitPrice >= Number(dbPos.stop_loss)) inferredReason = 'STOP_LOSS_HIT';
                else if (dbPos.take_profit && exitPrice <= Number(dbPos.take_profit)) inferredReason = 'TAKE_PROFIT_HIT';
              }
            }

            const pnlRaw = sideDb === 'LONG' ? (exitPrice - entry) * qty : (entry - exitPrice) * qty;
            const positionValue = entry * qty || 1;
            const pnlPct = (pnlRaw / positionValue) * 100;
            const durationMin = dbPos.opened_at ? Math.floor((Date.now() - new Date(dbPos.opened_at).getTime()) / (1000 * 60)) : null;
            
            const { data: updatedRows } = await supabaseClient
              .from('positions')
              .update({
                status: 'CLOSED',
                closed_at: nowIso,
                close_reason: inferredReason,
              })
              .eq('id', dbPos.id)
              .eq('status', 'OPEN')
              .select('id'); // Only update if still OPEN
            
            // Insert trade history only if we actually changed the row (avoids duplicates)
            if (updatedRows && updatedRows.length > 0) {
              await supabaseClient
                .from('trade_history')
                .insert({
                  user_id: dbPos.user_id,
                  symbol: dbPos.symbol,
                  side: dbPos.side,
                  entry_price: entry,
                  exit_price: exitPrice,
                  quantity: qty,
                  pnl: pnlRaw,
                  pnl_percent: pnlPct,
                  opened_at: dbPos.opened_at,
                  closed_at: nowIso,
                  duration_minutes: durationMin,
                  strategy_hash: dbPos.strategy_hash,
                  open_reason: dbPos.open_reason,
                  close_reason: inferredReason,
                });

              updates.push({ symbol: dbPos.symbol, action: 'closed', id: dbPos.id });
            } else {
              console.log(`No update applied for ${dbPos.symbol} (already closed)`);
            }
          }
        }
      }

      allUpdates.push({
        userId: userId,
        updates: updates,
      });
    }

    console.log(`Sync completed - Updated ${allUpdates.length} users`);

    return new Response(JSON.stringify({ 
      success: true, 
      userUpdates: allUpdates,
      totalPositions: (await getBinancePositions(apiKey, apiSecret)).length,
      balance: {
        totalMarginBalance,
        totalWalletBalance,
        totalUnrealizedProfit,
        availableBalance,
      },
    }), {
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