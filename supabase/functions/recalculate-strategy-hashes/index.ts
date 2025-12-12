import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Same hash function as in auto-trade-quant
// Exact same hash function as in auto-trade-quant - MUST match exactly!
async function getStrategyIdentifier(config: any): Promise<string> {
  const strategyParams = {
    // EMA settings
    ema_enabled: config.ema_enabled,
    ema_fast: config.ema_fast,
    ema_medium: config.ema_medium,
    ema_slow: config.ema_slow,
    ema_medium_trend: config.ema_medium_trend,
    ema_trend_hard_filter: config.ema_trend_hard_filter,
    min_ema_spread_percent: config.min_ema_spread_percent,
    // RSI settings
    rsi_enabled: config.rsi_enabled,
    rsi_period: config.rsi_period,
    rsi_min_long: config.rsi_min_long,
    rsi_max_short: config.rsi_max_short,
    rsi_zone_width: config.rsi_zone_width,
    rsi_momentum_periods: config.rsi_momentum_periods,
    rsi_overbought: config.rsi_overbought,
    rsi_oversold: config.rsi_oversold,
    // StochRSI settings
    stochrsi_enabled: config.stochrsi_enabled,
    stochrsi_period: config.stochrsi_period,
    stochrsi_k_period: config.stochrsi_k_period,
    stochrsi_d_period: config.stochrsi_d_period,
    stochrsi_overbought: config.stochrsi_overbought,
    stochrsi_oversold: config.stochrsi_oversold,
    // Pivot Points settings
    pivot_points_enabled: config.pivot_points_enabled,
    pivot_points_timeframe: config.pivot_points_timeframe,
    pivot_points_lookback: config.pivot_points_lookback,
    pivot_points_near_threshold: config.pivot_points_near_threshold,
    // MACD settings
    macd_enabled: config.macd_enabled,
    macd_fast: config.macd_fast,
    macd_slow: config.macd_slow,
    macd_signal: config.macd_signal,
    macd_histogram_threshold: config.macd_histogram_threshold,
    macd_direction_enabled: config.macd_direction_enabled,
    macd_color_change_hard_filter: config.macd_color_change_hard_filter,
    histogram_momentum_enabled: config.histogram_momentum_enabled,
    histogram_momentum_periods: config.histogram_momentum_periods,
    // Bollinger Bands settings
    bb_enabled: config.bb_enabled,
    bb_period: config.bb_period,
    bb_std_dev: config.bb_std_dev,
    // ATR settings
    atr_enabled: config.atr_enabled,
    atr_period: config.atr_period,
    min_atr: config.min_atr,
    min_atr_percent: config.min_atr_percent,
    adaptive_atr_enabled: config.adaptive_atr_enabled,
    atr_base_min: config.atr_base_min,
    atr_floor: config.atr_floor,
    atr_ceiling: config.atr_ceiling,
    atr_stop_loss_multiplier: config.atr_stop_loss_multiplier,
    atr_take_profit_multiplier: config.atr_take_profit_multiplier,
    atr_trailing_stop_multiplier: config.atr_trailing_stop_multiplier,
    break_even_atr: config.break_even_atr,
    trailing_stop_activation_enabled: config.trailing_stop_activation_enabled,
    trailing_stop_activation_atr: config.trailing_stop_activation_atr,
    // ADX settings
    adx_enabled: config.adx_enabled,
    adx_period: config.adx_period,
    adx_threshold: config.adx_threshold,
    adaptive_adx_enabled: config.adaptive_adx_enabled,
    adx_base_min: config.adx_base_min,
    adx_floor: config.adx_floor,
    adx_ceiling: config.adx_ceiling,
    // Volume settings
    volume_enabled: config.volume_enabled,
    volume_avg_period: config.volume_avg_period,
    volume_multiplier: config.volume_multiplier,
    // Candle momentum
    candle_momentum_enabled: config.candle_momentum_enabled,
    min_candle_body_percent: config.min_candle_body_percent,
    // Signal & position settings
    signal_conditions_required: config.signal_conditions_required,
    position_size_percent: config.position_size_percent,
    risk_per_trade_percent: config.risk_per_trade_percent,
    max_open_positions: config.max_open_positions,
    max_exposure_percent: config.max_exposure_percent,
    daily_loss_limit_percent: config.daily_loss_limit_percent,
    max_position_duration_minutes: config.max_position_duration_minutes,
    auto_exit_enabled: config.auto_exit_enabled,
    leverage: config.leverage,
    // Timeframe & scan settings
    scan_interval: config.scan_interval,
    trend_timeframe: config.trend_timeframe,
    higher_trend_enabled: config.higher_trend_enabled,
    higher_trend_timeframe: config.higher_trend_timeframe,
    klines_limit: config.klines_limit,
  };
  
  // Sort keys to ensure consistent hashing regardless of object property order
  const sortedJson = JSON.stringify(strategyParams, Object.keys(strategyParams).sort());
  
  // Hash using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(sortedJson);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
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
      const snapshot = trade.indicators_snapshot as any;
      
      // Extract ONLY the config fields that match getStrategyIdentifier exactly
      // Pass snapshot directly - getStrategyIdentifier will extract only the needed fields
      const newHash = await getStrategyIdentifier(snapshot);

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
