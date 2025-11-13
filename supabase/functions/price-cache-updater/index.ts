import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This edge function maintains a WebSocket connection to Binance and updates the price_cache table
// This prevents rate limiting by eliminating the need for REST API calls for price data

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting price cache updater...');

    // Connect to Binance WebSocket for all USDC perpetual futures
    const ws = new WebSocket("wss://fstream.binance.com/ws/!ticker@arr");
    
    let updateCount = 0;
    const batchSize = 50;
    let batchUpdates: any[] = [];
    
    ws.onopen = () => {
      console.log("Connected to Binance WebSocket for price cache updates");
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Filter for USDC pairs only and prepare batch updates
        const usdcPairs = data.filter((ticker: any) => 
          ticker.s && ticker.s.endsWith('USDC')
        );

        for (const ticker of usdcPairs) {
          batchUpdates.push({
            symbol: ticker.s,
            price: parseFloat(ticker.c),
            volume: parseFloat(ticker.v),
            change_24h: parseFloat(ticker.P),
            updated_at: new Date().toISOString(),
          });
        }

        // Batch update to database every 50 tickers to reduce DB load
        if (batchUpdates.length >= batchSize) {
          const { error } = await supabaseClient
            .from('price_cache')
            .upsert(batchUpdates, { onConflict: 'symbol' });

          if (error) {
            console.error('Error updating price cache:', error);
          } else {
            updateCount += batchUpdates.length;
            if (updateCount % 200 === 0) {
              console.log(`Updated ${updateCount} price records`);
            }
          }
          
          batchUpdates = [];
        }
      } catch (error) {
        console.error("Error processing price update:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket closed, attempting to reconnect...");
      // In production, implement exponential backoff reconnection
    };

    // Keep the connection alive
    return new Response(
      JSON.stringify({ 
        status: 'running', 
        message: 'Price cache updater is running' 
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('Price cache updater error:', error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

