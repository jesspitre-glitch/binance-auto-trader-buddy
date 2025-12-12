import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Same hash function as in auto-trade-quant
async function getStrategyIdentifier(config: any): Promise<string> {
  const relevantFields = {
    ema_enabled: config.ema_enabled ?? true,
    ema_fast: config.ema_fast ?? 9,
    ema_medium: config.ema_medium ?? 21,
    ema_slow: config.ema_slow ?? 55,
    ema_medium_trend: config.ema_medium_trend ?? 100,
    min_ema_spread_percent: config.min_ema_spread_percent ?? 0.05,
    ema_trend_hard_filter: config.ema_trend_hard_filter ?? false,
    rsi_enabled: config.rsi_enabled ?? false,
    rsi_period: config.rsi_period ?? 14,
    rsi_overbought: config.rsi_overbought ?? 70,
    rsi_oversold: config.rsi_oversold ?? 30,
    rsi_min_long: config.rsi_min_long ?? 30,
    rsi_max_short: config.rsi_max_short ?? 70,
    rsi_zone_width: config.rsi_zone_width ?? 10,
    rsi_momentum_periods: config.rsi_momentum_periods ?? 3,
    stochrsi_enabled: config.stochrsi_enabled ?? true,
    stochrsi_period: config.stochrsi_period ?? 14,
    stochrsi_k_period: config.stochrsi_k_period ?? 3,
    stochrsi_d_period: config.stochrsi_d_period ?? 3,
    stochrsi_overbought: config.stochrsi_overbought ?? 80,
    stochrsi_oversold: config.stochrsi_oversold ?? 20,
    macd_enabled: config.macd_enabled ?? true,
    macd_fast: config.macd_fast ?? 12,
    macd_slow: config.macd_slow ?? 26,
    macd_signal: config.macd_signal ?? 9,
    macd_histogram_threshold: config.macd_histogram_threshold ?? 0,
    macd_direction_enabled: config.macd_direction_enabled ?? true,
    macd_color_change_hard_filter: config.macd_color_change_hard_filter ?? false,
    bb_enabled: config.bb_enabled ?? true,
    bb_period: config.bb_period ?? 20,
    bb_std_dev: config.bb_std_dev ?? 2,
    atr_enabled: config.atr_enabled ?? true,
    atr_period: config.atr_period ?? 14,
    min_atr: config.min_atr ?? 0.01,
    min_atr_percent: config.min_atr_percent ?? 0.06,
    atr_stop_loss_multiplier: config.atr_stop_loss_multiplier ?? 2.2,
    atr_take_profit_multiplier: config.atr_take_profit_multiplier ?? 3,
    atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier ?? 1.5,
    adaptive_atr_enabled: config.adaptive_atr_enabled ?? false,
    atr_base_min: config.atr_base_min ?? 1.0,
    atr_floor: config.atr_floor ?? 0.7,
    atr_ceiling: config.atr_ceiling ?? 2.0,
    adx_enabled: config.adx_enabled ?? true,
    adx_period: config.adx_period ?? 14,
    adx_threshold: config.adx_threshold ?? 20,
    adaptive_adx_enabled: config.adaptive_adx_enabled ?? false,
    adx_base_min: config.adx_base_min ?? 25,
    adx_floor: config.adx_floor ?? 20,
    adx_ceiling: config.adx_ceiling ?? 40,
    volume_enabled: config.volume_enabled ?? true,
    volume_avg_period: config.volume_avg_period ?? 20,
    volume_multiplier: config.volume_multiplier ?? 1.05,
    signal_conditions_required: config.signal_conditions_required ?? 4,
    histogram_momentum_enabled: config.histogram_momentum_enabled ?? false,
    histogram_momentum_periods: config.histogram_momentum_periods ?? 3,
    candle_momentum_enabled: config.candle_momentum_enabled ?? false,
    min_candle_body_percent: config.min_candle_body_percent ?? 0.3,
    higher_trend_enabled: config.higher_trend_enabled ?? true,
    higher_trend_timeframe: config.higher_trend_timeframe ?? '15m',
    trend_timeframe: config.trend_timeframe ?? '5m',
    pivot_points_enabled: config.pivot_points_enabled ?? false,
    pivot_points_timeframe: config.pivot_points_timeframe ?? '1h',
    pivot_points_lookback: config.pivot_points_lookback ?? 24,
    pivot_points_near_threshold: config.pivot_points_near_threshold ?? 0.5,
  };

  const configString = JSON.stringify(relevantFields, Object.keys(relevantFields).sort());
  const encoder = new TextEncoder();
  const data = encoder.encode(configString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

    const url = new URL(req.url);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const batchSize = parseInt(url.searchParams.get('batch') || '500');

    console.log(`Processing batch: offset=${offset}, batchSize=${batchSize}`);

    // Fetch batch of trades with indicators_snapshot
    const { data: trades, error } = await supabaseClient
      .from('trade_history')
      .select('id, strategy_hash, indicators_snapshot')
      .not('indicators_snapshot', 'is', null)
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw error;
    }

    if (!trades || trades.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No more trades to process',
        offset,
        processed: 0,
        done: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${trades.length} trades in batch`);

    let updated = 0;
    let skipped = 0;
    const updates: { id: string; newHash: string }[] = [];

    // Calculate all hashes first
    for (const trade of trades) {
      const snapshot = trade.indicators_snapshot;
      let configForHash = snapshot;
      
      if (snapshot.config) {
        configForHash = snapshot.config;
      } else if (snapshot.strategy) {
        configForHash = snapshot.strategy;
      }

      const newHash = await getStrategyIdentifier(configForHash);

      if (trade.strategy_hash !== newHash) {
        updates.push({ id: trade.id, newHash });
      } else {
        skipped++;
      }
    }

    // Batch update all changed trades
    for (const { id, newHash } of updates) {
      const { error: updateError } = await supabaseClient
        .from('trade_history')
        .update({ strategy_hash: newHash })
        .eq('id', id);

      if (!updateError) {
        updated++;
      }
    }

    const result = {
      success: true,
      offset,
      batchSize,
      processed: trades.length,
      updated,
      skipped,
      done: trades.length < batchSize,
      nextOffset: offset + trades.length
    };

    console.log('Batch complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
