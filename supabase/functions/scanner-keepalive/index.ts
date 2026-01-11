import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * SCANNER KEEPALIVE
 * 
 * This function is designed to be called by an external scheduler (cron job, Supabase scheduled function, etc.)
 * every minute. It checks if the scanner should be running and triggers a loop if so.
 * 
 * This ensures the scanner keeps running even when the user closes their browser.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    console.log('[scanner-keepalive] Checking scanner status...');

    // Check if scanner should be running
    const { data: statusData, error: statusError } = await supabaseClient
      .from('scanner_status')
      .select('*')
      .eq('id', 'main')
      .maybeSingle();

    if (statusError) {
      console.error('[scanner-keepalive] Error fetching status:', statusError);
      return new Response(JSON.stringify({ error: statusError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!statusData?.is_active) {
      console.log('[scanner-keepalive] Scanner not active, nothing to do');
      return new Response(JSON.stringify({ 
        status: 'idle',
        message: 'Scanner not active'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if last heartbeat is recent (within last 2 minutes)
    const lastHeartbeat = statusData.last_heartbeat_at ? new Date(statusData.last_heartbeat_at) : null;
    const now = new Date();
    const heartbeatAgeMs = lastHeartbeat ? now.getTime() - lastHeartbeat.getTime() : Infinity;
    
    console.log(`[scanner-keepalive] Last heartbeat: ${lastHeartbeat?.toISOString() ?? 'never'}, age: ${heartbeatAgeMs}ms`);

    // Always trigger a loop to keep scanning
    console.log('[scanner-keepalive] Triggering scanner loop...');
    
    const { data: loopResult, error: loopError } = await supabaseClient.functions.invoke('continuous-scan-quant', {
      body: { action: 'loop' }
    });

    if (loopError) {
      console.error('[scanner-keepalive] Loop error:', loopError);
      return new Response(JSON.stringify({ 
        status: 'error',
        error: loopError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[scanner-keepalive] Loop result:', loopResult);

    return new Response(JSON.stringify({ 
      status: 'triggered',
      loop_result: loopResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[scanner-keepalive] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
