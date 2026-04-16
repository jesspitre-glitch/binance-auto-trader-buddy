import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const POSITION_MONITOR_INTERVAL_MS = 30_000;

const getUserIdFromAuthHeader = (req: Request): string | null => {
  try {
    const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice('Bearer '.length);
    const parts = token.split('.');
    if (parts.length < 2) return null;

    // JWT payload is base64url encoded
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

/**
 * ROBUST CONTINUOUS SCANNER
 * 
 * This function uses database state (scanner_status table) to persist scanner status.
 * The scanner runs when is_active=true and stops when is_active=false.
 * 
 * Actions:
 * - start: Set is_active=true in DB and run scan loop
 * - stop: Set is_active=false in DB
 * - tick: Check if active and run ONE scan (for cron/scheduled calls)
 * - status: Return current status from DB
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
    const url = new URL(req.url);
    let action = url.searchParams.get('action') || '';
    let intervalMs = parseInt(url.searchParams.get('interval_ms') || '0', 10);
    let userId = url.searchParams.get('user_id') || '';

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as { 
        action?: string; 
        interval_ms?: number;
        user_id?: string;
      } | null;
      if (body?.action) action = body.action;
      if (typeof body?.interval_ms === 'number') intervalMs = body.interval_ms;
      if (body?.user_id) userId = body.user_id;
    }

    if (!intervalMs || !isFinite(intervalMs) || intervalMs < 1000) {
      intervalMs = 3000;
    }

    // Get current scanner status from DB
    const { data: statusData, error: statusError } = await supabaseClient
      .from('scanner_status')
      .select('*')
      .eq('id', 'main')
      .maybeSingle();

    // Handle START action
    if (action === 'start') {
      if (!userId) {
        userId = getUserIdFromAuthHeader(req) ?? '';
      }

      if (!userId) {
        return new Response(JSON.stringify({ error: 'user_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Upsert scanner status
      const { error: upsertError } = await supabaseClient
        .from('scanner_status')
        .upsert({
          id: 'main',
          is_active: true,
          interval_ms: intervalMs,
          started_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
          user_id: userId,
        }, { onConflict: 'id' });

      if (upsertError) {
        console.error('[continuous-scan] Failed to start:', upsertError);
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[continuous-scan] Scanner started for user ${userId}, interval ${intervalMs}ms`);

      // Run initial scan immediately
      try {
        await supabaseClient.functions.invoke('auto-trade-quant');
        await supabaseClient
          .from('scanner_status')
          .update({ last_scan_at: new Date().toISOString() })
          .eq('id', 'main');
      } catch (scanErr) {
        console.error('[continuous-scan] Initial scan error:', scanErr);
      }

      return new Response(JSON.stringify({ 
        status: 'active', 
        interval_ms: intervalMs,
        message: 'Scanner started. Use tick action or cron to keep scanning.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle STOP action
    if (action === 'stop') {
      const { error: stopError } = await supabaseClient
        .from('scanner_status')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', 'main');

      if (stopError) {
        console.error('[continuous-scan] Failed to stop:', stopError);
      }

      console.log('[continuous-scan] Scanner stopped');

      return new Response(JSON.stringify({ status: 'stopped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle TICK action (for cron/scheduled execution)
    if (action === 'tick') {
      if (!statusData?.is_active) {
        return new Response(JSON.stringify({ 
          status: 'stopped', 
          message: 'Scanner not active, skipping tick' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[continuous-scan] Tick: Running scan...');
      
      try {
        const startedAtMs = Date.now();
        const { data, error } = await supabaseClient.functions.invoke('auto-trade-quant');
        const shouldRunMonitor = !statusData?.last_heartbeat_at || (startedAtMs - new Date(statusData.last_heartbeat_at).getTime()) >= POSITION_MONITOR_INTERVAL_MS;
        let monitorResult: any = null;
        let monitorError: any = null;

        if (shouldRunMonitor) {
          const monitorResponse = await supabaseClient.functions.invoke('monitor-positions');
          monitorResult = monitorResponse.data;
          monitorError = monitorResponse.error;
          if (monitorError) {
            console.error('[continuous-scan] Tick monitor error:', monitorError);
          }
        }
        
        await supabaseClient
          .from('scanner_status')
          .update({ 
            last_scan_at: new Date().toISOString(),
            last_heartbeat_at: new Date().toISOString()
          })
          .eq('id', 'main');

        if (error) {
          console.error('[continuous-scan] Tick scan error:', error);
          return new Response(JSON.stringify({ 
            status: 'active', 
            tick: 'error',
            error: error.message,
            monitor_result: monitorResult,
            monitor_error: monitorError?.message ?? null
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ 
          status: 'active', 
          tick: 'completed',
          scan_result: data,
          monitor_result: monitorResult,
          monitor_error: monitorError?.message ?? null
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        console.error('[continuous-scan] Tick error:', err);
        return new Response(JSON.stringify({ 
          status: 'active', 
          tick: 'error',
          error: err.message
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Handle LOOP action (runs continuous loop for ~50 seconds max to stay within edge function limits)
    if (action === 'loop') {
      if (!statusData?.is_active) {
        return new Response(JSON.stringify({ 
          status: 'stopped', 
          message: 'Scanner not active' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const loopIntervalMs = statusData.interval_ms || intervalMs || 3000;
      const maxDurationMs = 50000; // Run for max 50 seconds (leave buffer before 60s timeout)
      const startTime = Date.now();
      let scanCount = 0;
      let monitorCount = 0;
      let lastMonitorRunAt = statusData.last_heartbeat_at ? new Date(statusData.last_heartbeat_at).getTime() : 0;

      console.log(`[continuous-scan] Starting loop, interval=${loopIntervalMs}ms, maxDuration=${maxDurationMs}ms`);

      while (Date.now() - startTime < maxDurationMs) {
        // Re-check if still active
        const { data: currentStatus } = await supabaseClient
          .from('scanner_status')
          .select('is_active')
          .eq('id', 'main')
          .single();

        if (!currentStatus?.is_active) {
          console.log('[continuous-scan] Loop stopped: is_active=false');
          break;
        }

        try {
          console.log(`[continuous-scan] Loop scan #${scanCount + 1}...`);
          await supabaseClient.functions.invoke('auto-trade-quant');
          scanCount++;

          const nowMs = Date.now();
          if (nowMs - lastMonitorRunAt >= POSITION_MONITOR_INTERVAL_MS) {
            console.log('[continuous-scan] Running 30s position compliance monitor...');
            const monitorResponse = await supabaseClient.functions.invoke('monitor-positions');
            if (monitorResponse.error) {
              console.error('[continuous-scan] Loop monitor error:', monitorResponse.error);
            } else {
              monitorCount++;
              lastMonitorRunAt = nowMs;
            }
          }
          
          await supabaseClient
            .from('scanner_status')
            .update({ 
              last_scan_at: new Date().toISOString(),
              last_heartbeat_at: new Date().toISOString()
            })
            .eq('id', 'main');
        } catch (err) {
          console.error('[continuous-scan] Loop scan error:', err);
        }

        // Wait for next interval
        const elapsed = Date.now() - startTime;
        const remaining = maxDurationMs - elapsed;
        if (remaining < loopIntervalMs) break;
        
        await new Promise(r => setTimeout(r, loopIntervalMs));
      }

      console.log(`[continuous-scan] Loop completed: ${scanCount} scans in ${Date.now() - startTime}ms`);

      return new Response(JSON.stringify({ 
        status: 'active', 
        loop_completed: true,
        scans_executed: scanCount,
        monitor_runs_executed: monitorCount,
        duration_ms: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default: return status from DB
    const isActive = statusData?.is_active ?? false;
    const lastScan = statusData?.last_scan_at;
    const lastHeartbeat = statusData?.last_heartbeat_at;

    return new Response(JSON.stringify({ 
      status: isActive ? 'active' : 'stopped',
      last_scan_at: lastScan,
      last_heartbeat_at: lastHeartbeat,
      interval_ms: statusData?.interval_ms,
      started_at: statusData?.started_at
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[continuous-scan] Handler error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
