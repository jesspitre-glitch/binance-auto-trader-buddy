import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let isScanning = false;
let loopPromise: Promise<void> | null = null;
let loopController: AbortController | null = null;

async function scanLoop(intervalMs: number) {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  console.log('[continuous-scan] Loop started with interval:', intervalMs);
  
  while (isScanning) {
    try {
      const start = Date.now();
      console.log(`[continuous-scan] Invoking auto-trade-quant... isScanning=${isScanning}`);
      const { data, error } = await supabaseClient.functions.invoke('auto-trade-quant');
      if (error) {
        console.error('[continuous-scan] auto-trade-quant error:', error);
      } else {
        console.log('[continuous-scan] Scan completed');
      }
      
      // Check again before waiting
      if (!isScanning) {
        console.log('[continuous-scan] Stop flag detected, breaking loop');
        break;
      }
      
      const elapsed = Date.now() - start;
      const wait = Math.max(250, intervalMs - elapsed);
      await new Promise((r) => setTimeout(r, wait));
    } catch (err) {
      console.error('[continuous-scan] Unexpected error:', err);
      if (!isScanning) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  
  console.log('[continuous-scan] Loop stopped');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get('action') || '';
    let intervalMs = parseInt(url.searchParams.get('interval_ms') || '0', 10);

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as { action?: string; interval_ms?: number } | null;
      if (body?.action) action = body.action;
      if (typeof body?.interval_ms === 'number') intervalMs = body.interval_ms;
    }

    if (!intervalMs || !isFinite(intervalMs) || intervalMs < 1000) {
      intervalMs = 3000; // default 3s
    }

    if (action === 'start') {
      if (isScanning) {
        console.log('[continuous-scan] Already running, ignoring start request');
        return new Response(JSON.stringify({ status: 'active', message: 'Already running' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log('[continuous-scan] Starting scanner with interval:', intervalMs);
      isScanning = true;
      loopController = new AbortController();
      loopPromise = scanLoop(intervalMs);
      
      return new Response(JSON.stringify({ status: 'active', interval_ms: intervalMs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'stop') {
      console.log('[continuous-scan] Stop requested, isScanning before:', isScanning);
      isScanning = false;
      
      // Give loop time to detect stop flag
      if (loopPromise) {
        await Promise.race([
          loopPromise,
          new Promise((r) => setTimeout(r, 2000)) // Max 2s wait
        ]).catch(() => {});
      }
      
      loopPromise = null;
      loopController = null;
      console.log('[continuous-scan] Stop completed');
      
      return new Response(JSON.stringify({ status: 'stopped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // status
    return new Response(JSON.stringify({ status: isScanning ? 'active' : 'stopped' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[continuous-scan] handler error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
