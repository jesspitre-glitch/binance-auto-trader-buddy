import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Global flag to control sync loop
let isSyncing = false;
let lastFundingSyncTime = 0;
const FUNDING_SYNC_INTERVAL = 5 * 60 * 1000; // Sync funding fees every 5 minutes

async function syncLoop() {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  while (isSyncing) {
    try {
      console.log(`[${new Date().toISOString()}] Starting sync with Binance...`);
      
      const { data, error } = await supabaseClient.functions.invoke('sync-binance-futures-positions');
      
      if (error) {
        console.error('Sync error:', error);
      } else {
        console.log('Sync completed:', data?.userUpdates?.length || 0, 'users updated');
      }

      // Sync funding fees periodically (every 5 minutes)
      const now = Date.now();
      if (now - lastFundingSyncTime >= FUNDING_SYNC_INTERVAL) {
        console.log(`[${new Date().toISOString()}] Syncing funding fees...`);
        const { data: fundingData, error: fundingError } = await supabaseClient.functions.invoke('sync-funding-fees', {
          body: { startTime: now - (24 * 60 * 60 * 1000) } // Last 24 hours
        });
        
        if (fundingError) {
          console.error('Funding sync error:', fundingError);
        } else {
          console.log('Funding sync completed:', fundingData?.total || 0, 'records');
        }
        lastFundingSyncTime = now;
      }
    } catch (error: any) {
      console.error('Unexpected sync error:', error.message);
    }
    
    // Wait 5 seconds before next sync
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log('Sync loop stopped');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'status';

    if (action === 'start') {
      if (isSyncing) {
        return new Response(JSON.stringify({ 
          message: 'Sync already running',
          status: 'active'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      isSyncing = true;
      
      // Start sync loop in background without blocking response
      syncLoop().catch(err => {
        console.error('Sync loop error:', err);
        isSyncing = false;
      });

      console.log('Continuous sync started - syncing every 5 seconds');
      
      return new Response(JSON.stringify({ 
        message: 'Continuous sync started - syncing every 5 seconds',
        status: 'active'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (action === 'stop') {
      isSyncing = false;
      
      return new Response(JSON.stringify({ 
        message: 'Sync stopped',
        status: 'stopped'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Status check
      return new Response(JSON.stringify({ 
        status: isSyncing ? 'active' : 'stopped',
        interval: '5 seconds'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
