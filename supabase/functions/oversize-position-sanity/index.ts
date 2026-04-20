import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fix 5: Hourly sanity-tjek — advarer hvis nogen åben position er > 2× sin slot-cap
const OVERSIZE_THRESHOLD_MULTIPLIER = 2.0;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const alerts: any[] = [];

  try {
    const { data: positions, error: posErr } = await supabaseClient
      .from('positions')
      .select('id, user_id, symbol, side, quantity, entry_price, slot_id')
      .eq('status', 'OPEN');

    if (posErr) throw posErr;

    // Group by user for efficient slot/portfolio fetching
    const userIds = Array.from(new Set((positions || []).map((p) => p.user_id)));

    for (const userId of userIds) {
      const { data: portfolio } = await supabaseClient
        .from('user_portfolio')
        .select('futures_capital')
        .eq('user_id', userId)
        .maybeSingle();
      const portfolioCapital = Number(portfolio?.futures_capital) || 0;
      if (!(portfolioCapital > 0)) continue;

      const { data: slots } = await supabaseClient
        .from('strategy_slots')
        .select('id, name, capital_percent, indicator_config:config_id(position_size_percent, leverage)')
        .eq('user_id', userId);

      const slotById = new Map<string, any>();
      for (const s of slots || []) {
        slotById.set((s as any).id, s);
      }

      const userPositions = (positions || []).filter((p) => p.user_id === userId);
      for (const p of userPositions) {
        if (!p.slot_id) continue;
        const slot: any = slotById.get(p.slot_id);
        if (!slot) continue;
        const cfg = slot.indicator_config;
        if (!cfg) continue;

        const capitalPct = Number(slot.capital_percent) || 0;
        const posPct = Number(cfg.position_size_percent) || 0;
        const lev = Number(cfg.leverage) || 1;
        const entry = Number(p.entry_price) || 0;
        if (!(capitalPct > 0) || !(posPct > 0) || !(entry > 0)) continue;

        const slotCapQty = (portfolioCapital * (capitalPct / 100) * (posPct / 100) * lev) / entry;
        const actualQty = Math.abs(Number(p.quantity) || 0);
        const ratio = slotCapQty > 0 ? actualQty / slotCapQty : 0;

        if (ratio > OVERSIZE_THRESHOLD_MULTIPLIER) {
          const alert = {
            position_id: p.id,
            user_id: userId,
            symbol: p.symbol,
            slot: slot.name,
            actual_qty: actualQty,
            slot_cap_qty: slotCapQty,
            ratio: ratio.toFixed(2),
            notional_excess_usd: (actualQty - slotCapQty) * entry,
          };
          alerts.push(alert);
          console.error(
            `🚨 OVERSIZE POSITION DETECTED: ${p.symbol} (${slot.name}) qty=${actualQty} > ` +
            `${OVERSIZE_THRESHOLD_MULTIPLIER}× slot-cap ${slotCapQty.toFixed(8)} (ratio=${ratio.toFixed(2)})`
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, alerts_count: alerts.length, alerts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('oversize-position-sanity error:', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message, alerts }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
