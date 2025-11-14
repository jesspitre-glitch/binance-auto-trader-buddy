import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let isScanning = false;
let loopPromise: Promise<void> | null = null;

async function scanLoop(intervalMs: number) {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  while (isScanning) {
    try {
      const start = Date.now();
      console.log(`[continuous-scan] Invoking auto-trade-quant...`);
      const { data, error } = await supabaseClient.functions.invoke('auto-trade-quant');
      if (error) {
        console.error('[continuous-scan] auto-trade-quant error:', error);
      } else {
        console.log('[continuous-scan] Scan completed');
      }
      const elapsed = Date.now() - start;
      const wait = Math.max(250, intervalMs - elapsed);
      await new Promise((r) => setTimeout(r, wait));
    } catch (err) {
      console.error('[continuous-scan] Unexpected error:', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
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
        return new Response(JSON.stringify({ status: 'active', message: 'Already running' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      isScanning = true;
      loopPromise = scanLoop(intervalMs);
      return new Response(JSON.stringify({ status: 'active', interval_ms: intervalMs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'stop') {
      isScanning = false;
      await loopPromise?.catch(() => {});
      loopPromise = null;
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
