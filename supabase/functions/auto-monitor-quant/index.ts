import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting automated trading workflow...');

    // Step 1: Sync Binance positions with database
    console.log('Step 1: Syncing Binance positions...');
    const syncResponse = await supabaseClient.functions.invoke('sync-binance-futures-positions');
    
    if (syncResponse.error) {
      console.error('Error syncing positions:', syncResponse.error);
    } else {
      console.log('Position sync completed:', syncResponse.data);
    }

    // Step 2: Monitor open positions
    console.log('Step 2: Monitoring open positions...');
    const monitorResponse = await supabaseClient.functions.invoke('monitor-positions');
    
    if (monitorResponse.error) {
      console.error('Error monitoring positions:', monitorResponse.error);
    } else {
      console.log('Position monitoring completed:', monitorResponse.data);
    }

    // Step 3: Scan for new signals
    console.log('Step 3: Scanning for new trading signals...');
    const scanResponse = await supabaseClient.functions.invoke('auto-trade-quant');
    
    if (scanResponse.error) {
      console.error('Error scanning markets:', scanResponse.error);
    } else {
      console.log('Market scan completed:', scanResponse.data);
    }

    return new Response(JSON.stringify({ 
      message: 'Workflow completed',
      syncResult: syncResponse.data,
      monitorResult: monitorResponse.data,
      scanResult: scanResponse.data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Workflow error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
