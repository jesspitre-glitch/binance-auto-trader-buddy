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
        binanceSymbols.add(binancePos.symbol);
        
        // Find ALL matching positions in DB for this symbol
        const matchingPositions = dbPositions?.filter(p => p.symbol === binancePos.symbol) || [];
        
        if (matchingPositions.length > 0) {
          // Update the FIRST position
          const mainPos = matchingPositions[0];
          const { error } = await supabaseClient
            .from('positions')
            .update({
              current_price: parseFloat(binancePos.markPrice),
              unrealized_pnl: parseFloat(binancePos.unRealizedProfit),
              quantity: absQuantity,
              side: side,
            })
            .eq('id', mainPos.id);
          
          if (error) console.error('Update error:', error);
          updates.push({ symbol: binancePos.symbol, action: 'updated', id: mainPos.id });
          
          // Close DUPLICATES (all except the first one)
          for (let i = 1; i < matchingPositions.length; i++) {
            const duplicate = matchingPositions[i];
            console.log(`Closing duplicate position ${duplicate.symbol} (ID: ${duplicate.id})`);
            
            await supabaseClient
              .from('positions')
              .update({
                status: 'CLOSED',
                closed_at: new Date().toISOString(),
              })
              .eq('id', duplicate.id);
            
            updates.push({ symbol: duplicate.symbol, action: 'closed_duplicate', id: duplicate.id });
          }
        } else {
          // Create new position if none exists
          const { error } = await supabaseClient
            .from('positions')
            .insert({
              user_id: userId,
              symbol: binancePos.symbol,
              side,
              entry_price: parseFloat(binancePos.entryPrice),
              quantity: absQuantity,
              current_price: parseFloat(binancePos.markPrice),
              unrealized_pnl: parseFloat(binancePos.unRealizedProfit),
              status: 'OPEN',
            });
          
          if (error) console.error('Insert error:', error);
          updates.push({ symbol: binancePos.symbol, action: 'created' });
        }
      }

      // Close positions that are no longer on Binance
      if (dbPositions) {
        for (const dbPos of dbPositions) {
          if (!binanceSymbols.has(dbPos.symbol)) {
            console.log(`Closing position ${dbPos.symbol} - not found on Binance`);
            
            await supabaseClient
              .from('positions')
              .update({
                status: 'CLOSED',
                closed_at: new Date().toISOString(),
              })
              .eq('id', dbPos.id);
            
            updates.push({ symbol: dbPos.symbol, action: 'closed', id: dbPos.id });
          }
        }
      }

      allUpdates.push({
        userId: userId,
        updates: updates,
      });
    }

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