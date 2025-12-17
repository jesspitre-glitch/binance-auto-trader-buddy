import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getCurrentPrice(symbol: string, supabaseClient: any): Promise<number> {
  // Try to get price from cache first (much faster, no rate limits)
  const { data: cached, error: cacheError } = await supabaseClient
    .from('price_cache')
    .select('price, updated_at')
    .eq('symbol', symbol)
    .single();
  
  // Use cached price if it's less than 5 seconds old
  if (cached && !cacheError) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < 5000) {
      return parseFloat(cached.price);
    }
  }
  
  // Fallback to API if cache miss or stale
  try {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch price for ${symbol}`);
    }
    const data = await response.json();
    const price = parseFloat(data.price);
    
    // Update cache for next time
    await supabaseClient
      .from('price_cache')
      .upsert({ symbol, price, updated_at: new Date().toISOString() });
    
    return price;
  } catch (error) {
    // If API fails but we have cached data, use it even if stale
    if (cached) {
      console.warn(`API failed for ${symbol}, using stale cache (age: ${Date.now() - new Date(cached.updated_at).getTime()}ms)`);
      return parseFloat(cached.price);
    }
    throw error;
  }
}

async function createSignature(queryString: string, apiSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(queryString)
  );
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getBinanceAccountBalance(apiKey: string, apiSecret: string) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get account balance: ${error}`);
  }

  const accountData = await response.json();
  return {
    totalMarginBalance: parseFloat(accountData.totalMarginBalance),
    totalWalletBalance: parseFloat(accountData.totalWalletBalance),
    totalUnrealizedProfit: parseFloat(accountData.totalUnrealizedProfit),
    availableBalance: parseFloat(accountData.availableBalance),
  };
}

async function getPositionFromBinance(symbol: string, apiKey: string, apiSecret: string) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get position: ${error}`);
  }

  const positions = await response.json();
  return positions.find((p: any) => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);
}

async function cancelAllOpenOrders(symbol: string, apiKey: string, apiSecret: string) {
  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&timestamp=${timestamp}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/allOpenOrders?${queryString}&signature=${signature}`,
    {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.warn(`Failed to cancel orders for ${symbol}:`, error);
    return { cancelled: false, error };
  }

  const result = await response.json();
  console.log(`Cancelled orders for ${symbol}:`, result);
  return { cancelled: true, result };
}

async function closePositionOnBinance(symbol: string, side: string, quantity: number) {
  const apiKey = Deno.env.get('BINANCE_API_KEY');
  const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
  
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API credentials not configured');
  }

  // Get current position to verify quantity
  const position = await getPositionFromBinance(symbol, apiKey, apiSecret);
  
  if (!position) {
    console.log(`No open position found for ${symbol}, skipping close`);
    return null;
  }

  const positionAmt = Math.abs(parseFloat(position.positionAmt));
  const closeSide = side === 'LONG' ? 'SELL' : 'BUY';
  
  // Place the closing order
  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&side=${closeSide}&type=MARKET&quantity=${positionAmt}&timestamp=${timestamp}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);

  const response = await fetch(
    `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`,
    {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to close position:', error);
    throw new Error(`Failed to close position: ${error}`);
  }

  const orderResult = await response.json();
  
  // Cancel all remaining open orders for this symbol (stop-loss, etc.)
  await cancelAllOpenOrders(symbol, apiKey, apiSecret);
  
  // Wait a bit for order to fill
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Get the filled order details to get actual exit price
  const orderQueryString = `symbol=${symbol}&orderId=${orderResult.orderId}&timestamp=${Date.now()}&recvWindow=10000`;
  const orderSignature = await createSignature(orderQueryString, apiSecret);
  
  const orderResponse = await fetch(
    `https://fapi.binance.com/fapi/v1/order?${orderQueryString}&signature=${orderSignature}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );

  if (orderResponse.ok) {
    const orderDetails = await orderResponse.json();
    return {
      orderId: orderResult.orderId,
      avgPrice: parseFloat(orderDetails.avgPrice),
      executedQty: parseFloat(orderDetails.executedQty),
      cumQuote: parseFloat(orderDetails.cumQuote),
    };
  }

  return {
    orderId: orderResult.orderId,
    avgPrice: parseFloat(orderResult.avgPrice || orderResult.price || '0'),
    executedQty: parseFloat(orderResult.executedQty || '0'),
  };
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

    // Get all open positions
    const { data: positions, error: positionsError } = await supabaseClient
      .from('positions')
      .select('*')
      .eq('status', 'OPEN');

    if (positionsError) throw positionsError;
    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({ message: 'No open positions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Monitoring ${positions.length} open positions`);

    const results = [];

    for (const position of positions) {
      try {
        // Get current price from cache (much faster, avoids rate limits)
        const currentPrice = await getCurrentPrice(position.symbol, supabaseClient);
        
        // Update current price in database
        await supabaseClient
          .from('positions')
          .update({ current_price: currentPrice })
          .eq('id', position.id);

        let shouldClose = false;
        let closeReason = '';

        // Get indicator config for this position (ALTID hent fra database - også for synkroniserede positioner!)
        let trailingActivationEnabled = true; // default
        let trailingActivationAtr = 1.0; // default
        let autoExitEnabled = true; // default - hvis slukket lukkes positioner ikke automatisk
        let maxPositionDurationMinutes: number | null = null; // default - hvis null/0 lukkes positioner ikke pga timeout
        let conditionalTimeExitEnabled = true; // default - betinget tids-exit (Anti-Sour Exit)
        let adxFloor = 20; // default ADX min
        
        // Tjek om trailing stop ALLEREDE er aktiveret (fra database)
        let trailingAlreadyActivated = position.trailing_stop != null && position.trailing_stop > 0;
        
        // Hent ALTID konfiguration fra database - ikke kun for auto-trade positioner
        // Dette sikrer at synkroniserede Binance-positioner også får timeout og andre indstillinger
        const { data: configData } = await supabaseClient
          .from('indicator_config')
          .select('trailing_stop_activation_enabled, trailing_stop_activation_atr, auto_exit_enabled, max_position_duration_minutes, conditional_time_exit_enabled, adx_floor')
          .eq('user_id', position.user_id)
          .single();
        
        if (configData) {
          trailingActivationEnabled = configData.trailing_stop_activation_enabled ?? true;
          trailingActivationAtr = configData.trailing_stop_activation_atr ?? 1.0;
          autoExitEnabled = configData.auto_exit_enabled ?? true;
          maxPositionDurationMinutes = configData.max_position_duration_minutes;
          conditionalTimeExitEnabled = configData.conditional_time_exit_enabled ?? true;
          adxFloor = configData.adx_floor ?? 20;
          
          // Log for synkroniserede positioner uden strategy_hash
          if (!position.strategy_hash) {
            console.log(`📋 Synkroniseret position ${position.symbol} bruger aktuel config: timeout=${maxPositionDurationMinutes}min, autoExit=${autoExitEnabled}, conditionalTimeExit=${conditionalTimeExitEnabled}`);
          }
        }

        // If auto exit is disabled, skip this position
        if (!autoExitEnabled) {
          console.log(`⏭️ Position ${position.symbol} - auto exit disabled, skipping automatic monitoring`);
          results.push({
            symbol: position.symbol,
            action: 'skipped',
            reason: 'Auto exit disabled in strategy config'
          });
          continue;
        }

        // 🔍 AUDIT v6: Identificer exit type - LEGACY_PERCENT_FALLBACK vs ATR_EXIT_OK
        const snapshotAtr = position.indicators_snapshot?.atr;
        const legacyPercentExit = position.indicators_snapshot?.legacy_percent_exit === true;
        const exitType = position.indicators_snapshot?.exit_type || 'UNKNOWN';
        const isSyncedPosition = position.indicators_snapshot?.is_synced_position || false;
        
        // Position er LEGACY hvis: legacy_percent_exit=true ELLER exit_type indeholder FALLBACK ELLER ATR er null/0
        const isLegacyPosition = legacyPercentExit || 
                                  exitType === 'PERCENT_FALLBACK_LEGACY' || 
                                  exitType === 'PERCENT_FALLBACK' ||
                                  !snapshotAtr || snapshotAtr <= 0 || !isFinite(snapshotAtr);
        
        // Log position type tydeligt
        if (isLegacyPosition) {
          console.log(`\n⚠️ LEGACY_PERCENT_FALLBACK: ${position.symbol} ${position.side}`);
          console.log(`   exit_type: ${exitType}`);
          console.log(`   legacy_percent_exit: ${legacyPercentExit}`);
          console.log(`   ATR: ${snapshotAtr ?? 'NULL'}`);
          console.log(`   -> Bruger 3% SL fallback og 1.8% trailing`);
        } else {
          console.log(`\n✅ ATR_EXIT_OK: ${position.symbol} ${position.side}`);
          console.log(`   exit_type: ${exitType}`);
          console.log(`   ATR: ${snapshotAtr}`);
          console.log(`   -> Bruger ATR-baseret exit system`);
        }
        
        // Beregn profit - forskelligt for legacy vs ATR positioner
        const profitDistance = position.side === 'LONG'
          ? currentPrice - position.entry_price
          : position.entry_price - currentPrice;
        
        const atr = snapshotAtr || 0;
        const profitInAtr = atr > 0 ? profitDistance / atr : 0;
        const profitPercent = (profitDistance / position.entry_price) * 100;
        
        // For legacy positioner: brug procent-baseret profit threshold (1% ~ 1 ATR equivalent)
        // For ATR positioner: brug ATR-baseret threshold
        let trailingStopActive: boolean;
        
        if (isLegacyPosition) {
          // Legacy: 1.8% trailing activation (hardcoded for legacy)
          const legacyActivationPercent = 1.0; // 1% profit for activation
          const profitMeetsThreshold = profitPercent >= legacyActivationPercent;
          trailingStopActive = trailingAlreadyActivated || !trailingActivationEnabled || profitMeetsThreshold;
          
          if (trailingActivationEnabled) {
            console.log(`   LEGACY trailing activation: profit=${profitPercent.toFixed(2)}% (need ${legacyActivationPercent}%) - Active: ${trailingStopActive}`);
          }
        } else {
          // ATR-baseret
          const profitMeetsThreshold = profitInAtr >= trailingActivationAtr;
          trailingStopActive = trailingAlreadyActivated || !trailingActivationEnabled || profitMeetsThreshold;
          
          if (trailingActivationEnabled) {
            if (trailingAlreadyActivated) {
              console.log(`   ✅ Trailing stop FORBLIVER aktiv (profit=${profitInAtr.toFixed(2)} ATR, blev aktiveret tidligere)`);
            } else {
              console.log(`   Trailing activation check: profit=${profitInAtr.toFixed(2)} ATR (need ${trailingActivationAtr} ATR) - Active: ${trailingStopActive}`);
            }
          }
        }

        let newStopLoss = position.stop_loss;
        let newPeakPrice = position.peak_price || position.entry_price;
        let newTrailingStop = position.trailing_stop;
        
        // 🔴 FIX: Track break-even state LOKALT for at undgå at miste data ved trade-close
        // Disse værdier bruges i enhancedSnapshot ved close
        let breakEvenActivatedThisCycle = false;
        let breakEvenAtPrice: number | null = position.indicators_snapshot?.break_even_at_price ?? null;
        let breakEvenTriggerPrice: number | null = position.indicators_snapshot?.break_even_trigger_price ?? null;
        let stopLossAfterBE: number | null = position.indicators_snapshot?.stop_loss_after_be ?? null;
        let breakEvenActivatedState = position.break_even_activated || false;
        
        // Break-even logic: Move SL to entry hvis profit er nået (DO THIS FIRST!)
        if (!position.break_even_activated) {
          if (isLegacyPosition) {
            // LEGACY: Brug 1% break-even threshold (hardcoded for legacy positioner)
            const legacyBreakEvenPercent = 1.0; // 1% profit for break-even
            const breakEvenReached = profitPercent >= legacyBreakEvenPercent;
            
            console.log(`   LEGACY break-even check: profit=${profitPercent.toFixed(2)}% (need ${legacyBreakEvenPercent}%)`);
            
            if (breakEvenReached) {
              // 🔴 FIX: Sæt lokale variabler så de overlever til trade-close
              breakEvenActivatedThisCycle = true;
              breakEvenActivatedState = true;
              breakEvenAtPrice = position.entry_price;
              breakEvenTriggerPrice = currentPrice;
              newStopLoss = breakEvenAtPrice;
              stopLossAfterBE = newStopLoss;
              
              const updatedSnapshot = {
                ...position.indicators_snapshot,
                break_even_at_price: breakEvenAtPrice,
                break_even_trigger_price: breakEvenTriggerPrice,
                break_even_triggered_at: new Date().toISOString(),
                stop_loss_after_be: stopLossAfterBE,
              };
              await supabaseClient
                .from('positions')
                .update({ 
                  stop_loss: newStopLoss, 
                  break_even_activated: true,
                  indicators_snapshot: updatedSnapshot
                })
                .eq('id', position.id);
              
              // 📊 BREAK-EVEN SUMMARY med assertion
              const diff = Math.abs((stopLossAfterBE ?? 0) - (breakEvenAtPrice ?? 0));
              const assertionPassed = diff < 1e-10;
              
              console.log(`\n📊 ═══════════════════════════════════════════════════════`);
              console.log(`📊 BREAK-EVEN SUMMARY - ${position.symbol} ${position.side}`);
              console.log(`📊 ═══════════════════════════════════════════════════════`);
              console.log(`   Type: LEGACY (1% threshold)`);
              console.log(`   entry_price: ${position.entry_price}`);
              console.log(`   break_even_trigger_price: ${breakEvenTriggerPrice}`);
              console.log(`   break_even_at_price: ${breakEvenAtPrice}`);
              console.log(`   stop_loss_after_be: ${stopLossAfterBE}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   ASSERTION: stop_loss_after_be == break_even_at_price`);
              console.log(`   diff: ${diff.toExponential(10)}`);
              if (assertionPassed) {
                console.log(`   ✅ ASSERTION PASSED (diff < 1e-10)`);
              } else {
                console.log(`   ❌ ASSERTION FAILED!`);
                console.log(`   ÅRSAG: stop_loss_after_be (${stopLossAfterBE}) != break_even_at_price (${breakEvenAtPrice})`);
                console.log(`   Mulige årsager:`);
                console.log(`     1. Afrundingsfejl i beregning`);
                console.log(`     2. Race condition mellem BE og trailing stop`);
                console.log(`     3. Uventet manipulation af newStopLoss variabel`);
              }
              console.log(`📊 ═══════════════════════════════════════════════════════\n`);
            }
          } else {
            // ATR-baseret break-even
            const breakEvenAtrMultiplier = position.indicators_snapshot?.break_even_atr || 1.0;
            const breakEvenDistance = breakEvenAtrMultiplier * snapshotAtr;
            console.log(`   Break-even check (ATR): ${breakEvenAtrMultiplier} × ${snapshotAtr.toFixed(6)} = ${breakEvenDistance.toFixed(6)}`);
            
            let breakEvenReached = false;
            if (position.side === 'LONG') {
              breakEvenReached = currentPrice >= (position.entry_price + breakEvenDistance);
            } else {
              breakEvenReached = currentPrice <= (position.entry_price - breakEvenDistance);
            }
            
            if (breakEvenReached) {
              // 🔴 FIX: Sæt lokale variabler så de overlever til trade-close
              breakEvenActivatedThisCycle = true;
              breakEvenActivatedState = true;
              breakEvenAtPrice = position.entry_price;
              breakEvenTriggerPrice = currentPrice;
              newStopLoss = breakEvenAtPrice;
              stopLossAfterBE = newStopLoss;
              
              const updatedSnapshot = {
                ...position.indicators_snapshot,
                break_even_at_price: breakEvenAtPrice,
                break_even_trigger_price: breakEvenTriggerPrice,
                break_even_triggered_at: new Date().toISOString(),
                stop_loss_after_be: stopLossAfterBE,
              };
              await supabaseClient
                .from('positions')
                .update({ 
                  stop_loss: newStopLoss, 
                  break_even_activated: true,
                  indicators_snapshot: updatedSnapshot
                })
                .eq('id', position.id);
              
              // 📊 BREAK-EVEN SUMMARY med assertion
              const diff = Math.abs((stopLossAfterBE ?? 0) - (breakEvenAtPrice ?? 0));
              const assertionPassed = diff < 1e-10;
              
              console.log(`\n📊 ═══════════════════════════════════════════════════════`);
              console.log(`📊 BREAK-EVEN SUMMARY - ${position.symbol} ${position.side}`);
              console.log(`📊 ═══════════════════════════════════════════════════════`);
              console.log(`   Type: ATR-BASED (${breakEvenAtrMultiplier}x ATR)`);
              console.log(`   entry_price: ${position.entry_price}`);
              console.log(`   break_even_trigger_price: ${breakEvenTriggerPrice}`);
              console.log(`   break_even_at_price: ${breakEvenAtPrice}`);
              console.log(`   stop_loss_after_be: ${stopLossAfterBE}`);
              console.log(`   ATR: ${snapshotAtr}, Threshold distance: ${breakEvenDistance.toFixed(6)}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   ASSERTION: stop_loss_after_be == break_even_at_price`);
              console.log(`   diff: ${diff.toExponential(10)}`);
              if (assertionPassed) {
                console.log(`   ✅ ASSERTION PASSED (diff < 1e-10)`);
              } else {
                console.log(`   ❌ ASSERTION FAILED!`);
                console.log(`   ÅRSAG: stop_loss_after_be (${stopLossAfterBE}) != break_even_at_price (${breakEvenAtPrice})`);
                console.log(`   Mulige årsager:`);
                console.log(`     1. Afrundingsfejl i beregning`);
                console.log(`     2. Race condition mellem BE og trailing stop`);
                console.log(`     3. Uventet manipulation af newStopLoss variabel`);
              }
              console.log(`📊 ═══════════════════════════════════════════════════════\n`);
            }
          }
        } else {
          // 🔴 FIX: Break-even er ALLEREDE aktiveret - sørg for at newStopLoss reflekterer BE-prisen
          // Dette er kritisk for at trailing_stop_exit_audit.stop_loss_at_exit er korrekt
          const existingBEPrice = position.indicators_snapshot?.break_even_at_price;
          
          if (existingBEPrice !== null && existingBEPrice !== undefined && isFinite(existingBEPrice)) {
            // 🔴 Sæt alle lokale variabler konsistent med eksisterende BE-state
            newStopLoss = existingBEPrice;
            breakEvenAtPrice = existingBEPrice;
            breakEvenActivatedState = true;
            stopLossAfterBE = existingBEPrice;
            
            console.log(`📋 Break-even ALLEREDE AKTIV for ${position.symbol}:`);
            console.log(`   break_even_at_price: ${existingBEPrice}`);
            console.log(`   newStopLoss synkroniseret: ${newStopLoss}`);
          } else {
            // 🔴 AUDIT WARNING: break_even_activated=true men break_even_at_price er null
            console.log(`\n⚠️ ═══════════════════════════════════════════`);
            console.log(`⚠️ BREAK-EVEN AUDIT WARNING - ${position.symbol} ${position.side}`);
            console.log(`⚠️ ═══════════════════════════════════════════`);
            console.log(`   ❌ break_even_activated: TRUE`);
            console.log(`   ❌ break_even_at_price: NULL/UNDEFINED`);
            console.log(`   Mulige årsager:`);
            console.log(`     1. Position åbnet før break_even_at_price blev implementeret`);
            console.log(`     2. Race condition ved BE aktivering`);
            console.log(`     3. snapshot opdateret uden break_even_at_price felt`);
            console.log(`   FIX: Sætter newStopLoss = entry_price retroaktivt`);
            console.log(`⚠️ ═══════════════════════════════════════════\n`);
            
            // Retroaktiv fix: Brug entry_price som BE-pris
            newStopLoss = position.entry_price;
            breakEvenAtPrice = position.entry_price;
            breakEvenActivatedState = true;
            stopLossAfterBE = position.entry_price;
            
            const fixedSnapshot = {
              ...position.indicators_snapshot,
              break_even_at_price: position.entry_price,
              break_even_retroactive_fix: true,
              break_even_fix_timestamp: new Date().toISOString(),
            };
            await supabaseClient
              .from('positions')
              .update({ 
                indicators_snapshot: fixedSnapshot,
                stop_loss: position.entry_price // 🔴 Opdater også DB-felt
              })
              .eq('id', position.id);
          }
        }
        
        // NOW calculate trailing stop (using updated stop loss from break-even)
        if (trailingStopActive) {
          if (position.side === 'LONG' && currentPrice > newPeakPrice) {
            console.log(`Updating peak: ${newPeakPrice} → ${currentPrice} for ${position.symbol}`);
            newPeakPrice = currentPrice;
          } else if (position.side === 'SHORT' && currentPrice < newPeakPrice) {
            console.log(`Updating peak: ${newPeakPrice} → ${currentPrice} for ${position.symbol}`);
            newPeakPrice = currentPrice;
          }
          
          if (isLegacyPosition) {
            // LEGACY: Brug 1.8% trailing stop distance (hardcoded for legacy positioner)
            const legacyTrailingPercent = 1.8;
            const trailingDistance = position.entry_price * (legacyTrailingPercent / 100);
            console.log(`   LEGACY trailing stop beregning:`);
            console.log(`   Trailing %: ${legacyTrailingPercent}%`);
            console.log(`   Distance: ${trailingDistance.toFixed(6)}`);
            
            if (position.side === 'LONG') {
              const calculatedTrailingStop = newPeakPrice - trailingDistance;
              newTrailingStop = newStopLoss ? Math.max(calculatedTrailingStop, newStopLoss) : calculatedTrailingStop;
              console.log(`   LONG: peak=${newPeakPrice}, calculated=${calculatedTrailingStop.toFixed(4)}, final=${newTrailingStop.toFixed(4)}`);
            } else {
              const calculatedTrailingStop = newPeakPrice + trailingDistance;
              newTrailingStop = newStopLoss ? Math.min(calculatedTrailingStop, newStopLoss) : calculatedTrailingStop;
              console.log(`   SHORT: peak=${newPeakPrice}, calculated=${calculatedTrailingStop.toFixed(4)}, final=${newTrailingStop.toFixed(4)}`);
            }
          } else {
            // ATR-baseret trailing stop
            // 🔴 BACKWARDS COMPATIBILITY: Læs fra begge mulige feltnavne
            const rawMultiplier = position.indicators_snapshot?.atr_trailing_stop_multiplier 
                               ?? position.indicators_snapshot?.trailing_stop_atr_multiplier;
            const DEFAULT_TRAILING_MULTIPLIER = 1.8;
            const multiplierUsedFallback = rawMultiplier === null || rawMultiplier === undefined;
            const atrTrailingMultiplier = rawMultiplier ?? DEFAULT_TRAILING_MULTIPLIER;
            
            // 🔴 AUDIT WARNING: Trailing stop bruges men multiplier er null
            if (multiplierUsedFallback) {
              console.log(`\n⚠️ ═══════════════════════════════════════════════════════`);
              console.log(`⚠️ TRAILING STOP AUDIT WARNING - ${position.symbol} ${position.side}`);
              console.log(`⚠️ ═══════════════════════════════════════════════════════`);
              console.log(`   ❌ atr_trailing_stop_multiplier: ${position.indicators_snapshot?.atr_trailing_stop_multiplier ?? 'NULL'}`);
              console.log(`   ❌ trailing_stop_atr_multiplier: ${position.indicators_snapshot?.trailing_stop_atr_multiplier ?? 'NULL'}`);
              console.log(`   📋 Position ID: ${position.id}`);
              console.log(`   📋 Strategy Hash: ${position.strategy_hash || 'NULL'}`);
              console.log(`   📋 is_synced_position: ${position.indicators_snapshot?.is_synced_position || false}`);
              console.log(`   📋 exit_type: ${position.indicators_snapshot?.exit_type || 'UNKNOWN'}`);
              console.log(`   🔧 FALLBACK APPLIED: ${DEFAULT_TRAILING_MULTIPLIER}x`);
              console.log(`   Mulige årsager:`);
              console.log(`     1. Position åbnet før multiplier blev gemt i snapshot`);
              console.log(`     2. Position synkroniseret fra Binance uden config`);
              console.log(`     3. Config-felt mangler i indicator_config`);
              console.log(`⚠️ ═══════════════════════════════════════════════════════\n`);
            }
            
            const trailingDistance = snapshotAtr * atrTrailingMultiplier;
            console.log(`   ATR trailing stop beregning:`);
            console.log(`   ATR: ${snapshotAtr.toFixed(6)}`);
            console.log(`   Multiplier: ${atrTrailingMultiplier}x${multiplierUsedFallback ? ' (FALLBACK!)' : ''}`);
            console.log(`   Distance: ${trailingDistance.toFixed(6)}`);
            
            // 🔴 CLAMP TRACKING: Beregn expected trailing og track clamp separat
            let calculatedTrailingStop: number;
            let clampApplied = false;
            let clampReason: string | null = null;
            let clampDelta = 0;
            
            if (position.side === 'LONG') {
              calculatedTrailingStop = newPeakPrice - trailingDistance;
              // Clamp: trailing må ikke gå under eksisterende SL (typisk BE eller initial SL)
              if (newStopLoss && calculatedTrailingStop < newStopLoss) {
                clampApplied = true;
                clampDelta = newStopLoss - calculatedTrailingStop;
                clampReason = breakEvenActivatedState ? 'CLAMP_TO_BREAK_EVEN' : 'CLAMP_TO_STOP_LOSS';
                newTrailingStop = newStopLoss;
              } else {
                newTrailingStop = calculatedTrailingStop;
              }
              console.log(`   LONG: peak=${newPeakPrice}, expected=${calculatedTrailingStop.toFixed(8)}, final=${newTrailingStop.toFixed(8)}${clampApplied ? ` (${clampReason}, delta=${clampDelta.toFixed(8)})` : ''}`);
            } else {
              calculatedTrailingStop = newPeakPrice + trailingDistance;
              // Clamp: trailing må ikke gå over eksisterende SL (typisk BE eller initial SL)
              if (newStopLoss && calculatedTrailingStop > newStopLoss) {
                clampApplied = true;
                clampDelta = calculatedTrailingStop - newStopLoss;
                clampReason = breakEvenActivatedState ? 'CLAMP_TO_BREAK_EVEN' : 'CLAMP_TO_STOP_LOSS';
                newTrailingStop = newStopLoss;
              } else {
                newTrailingStop = calculatedTrailingStop;
              }
              console.log(`   SHORT: peak=${newPeakPrice}, expected=${calculatedTrailingStop.toFixed(8)}, final=${newTrailingStop.toFixed(8)}${clampApplied ? ` (${clampReason}, delta=${clampDelta.toFixed(8)})` : ''}`);
            }
            
            // 🔴 GEM clamp info i position context for brug i trailing_stop_exit_audit
            // @ts-ignore - dynamisk tilføjet property
            position._trailingClampInfo = {
              expected_trailing_level: calculatedTrailingStop,
              effective_trailing_level: newTrailingStop,
              was_clamped: clampApplied,
              clamp_reason: clampReason,
              clamp_delta: clampDelta,
              clamp_protection_level: clampApplied ? newStopLoss : null,
            };
          }
          
          // Tjek om trailing stop er ramt (kun hvis aktiveret og beregnet)
          if (newTrailingStop && newTrailingStop > 0) {
            if (position.side === 'LONG' && currentPrice <= newTrailingStop) {
              shouldClose = true;
              closeReason = isLegacyPosition ? 'LEGACY_TRAILING_STOP_HIT' : 'TRAILING_STOP_HIT';
              console.log(`TRAILING STOP HIT (LONG): price=${currentPrice} <= trailing=${newTrailingStop}`);
            } else if (position.side === 'SHORT' && currentPrice >= newTrailingStop) {
              shouldClose = true;
              closeReason = isLegacyPosition ? 'LEGACY_TRAILING_STOP_HIT' : 'TRAILING_STOP_HIT';
              console.log(`TRAILING STOP HIT (SHORT): price=${currentPrice} >= trailing=${newTrailingStop}`);
            }
          }
        } else {
          if (isLegacyPosition) {
            console.log(`   LEGACY trailing stop NOT active yet (need 1.0% profit, have ${profitPercent.toFixed(2)}%)`);
          } else {
            console.log(`   Trailing stop NOT active yet (need ${trailingActivationAtr} ATR profit, have ${profitInAtr.toFixed(2)} ATR)`);
          }
        }
        // (Break-even check er allerede håndteret ovenfor - ingen duplikering)

        // Check stop loss (ALTID - trailing stop er kun en bonus beskyttelse)
        if (!shouldClose && newStopLoss) {
          if (position.side === 'LONG' && currentPrice <= newStopLoss) {
            shouldClose = true;
            closeReason = position.break_even_activated ? 'BREAK_EVEN_HIT' : 'STOP_LOSS_HIT';
            console.log(`STOP LOSS HIT (LONG): price=${currentPrice} <= SL=${newStopLoss} for ${position.symbol}`);
          } else if (position.side === 'SHORT' && currentPrice >= newStopLoss) {
            shouldClose = true;
            closeReason = position.break_even_activated ? 'BREAK_EVEN_HIT' : 'STOP_LOSS_HIT';
            console.log(`STOP LOSS HIT (SHORT): price=${currentPrice} >= SL=${newStopLoss} for ${position.symbol}`);
          }
        }

        // Definer tidspunkt variabler (bruges til både timeout check og duration beregning)
        const openedAt = new Date(position.opened_at);
        const now = new Date();

        // Check timeout (only if enabled - max_position_duration_minutes > 0)
        if (!shouldClose && maxPositionDurationMinutes && maxPositionDurationMinutes > 0) {
          const minutesSinceOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60);
          
          if (minutesSinceOpen >= maxPositionDurationMinutes) {
            // Betinget Tids-Exit (Anti-Sour Exit) logik
            if (conditionalTimeExitEnabled) {
              // Hent indikatorer fra snapshot
              const snapshot = position.indicators_snapshot || {};
              const openingADX = snapshot.adx || 0;
              const currentADX = snapshot.adx || 0; // Ville kræve live ADX beregning
              const histogramMomentum = snapshot.histogram_momentum_met || false;
              const atr = snapshot.atr || 0;
              
              // Beregn prisbevægelse siden åbning
              const priceMovement = Math.abs(currentPrice - position.entry_price);
              const priceMovementInAtr = atr > 0 ? priceMovement / atr : 0;
              
              // Tjek om pris har lavet nye favorable ekstremer (peak opdateret for nylig)
              const oldPeak = position.peak_price || position.entry_price;
              const peakImproved = position.side === 'LONG' 
                ? currentPrice > oldPeak 
                : currentPrice < oldPeak;
              
              // Position er AKTIV og må IKKE lukkes hvis:
              // 1. ADX > ADX Min (stærk trend)
              // 2. Trailing Stop er aktiveret
              // 3. Pris laver nye favorable ekstremer
              const isActivePosition = 
                currentADX > adxFloor || // Stærk trend
                trailingAlreadyActivated || // Trailing stop aktiveret
                peakImproved; // Pris forbedres stadig
              
              if (isActivePosition) {
                console.log(`🚫 Position ${position.symbol} HOLDES ÅBEN trods timeout (${minutesSinceOpen.toFixed(0)}/${maxPositionDurationMinutes} min) - AKTIV POSITION:`);
                console.log(`   ADX: ${currentADX.toFixed(1)} (floor: ${adxFloor}), Trailing: ${trailingAlreadyActivated}, Peak improved: ${peakImproved}`);
              } else {
                // Position er DØD - tjek alle betingelser for tids-exit
                // Alle disse skal være opfyldt for at lukke:
                const deadConditions = {
                  durationExceeded: minutesSinceOpen >= maxPositionDurationMinutes,
                  lowADX: currentADX <= adxFloor,
                  noHistogramMomentum: !histogramMomentum,
                  lowPriceMovement: priceMovementInAtr < 0.3,
                  noTrailingStop: !trailingAlreadyActivated
                };
                
                const allDeadConditionsMet = Object.values(deadConditions).every(v => v);
                
                if (allDeadConditionsMet) {
                  shouldClose = true;
                  closeReason = 'TIMEOUT_NO_MOMENTUM';
                  console.log(`⏱️💀 Position ${position.symbol} LUKKES - INGEN MOMENTUM:`);
                  console.log(`   Duration: ${minutesSinceOpen.toFixed(0)}/${maxPositionDurationMinutes} min`);
                  console.log(`   ADX: ${currentADX.toFixed(1)} (floor: ${adxFloor})`);
                  console.log(`   Histogram momentum: ${histogramMomentum}`);
                  console.log(`   Price movement: ${priceMovementInAtr.toFixed(2)} ATR (need < 0.3)`);
                  console.log(`   Trailing stop: ${trailingAlreadyActivated}`);
                } else {
                  console.log(`⏱️⚠️ Position ${position.symbol} over max duration men HOLDES ÅBEN - ikke alle dead conditions opfyldt:`);
                  console.log(`   Conditions: ${JSON.stringify(deadConditions)}`);
                }
              }
            } else {
              // Klassisk timeout uden betingelser
              shouldClose = true;
              closeReason = 'TIMEOUT';
              console.log(`⏱️ Position ${position.symbol} exceeded max duration (${minutesSinceOpen.toFixed(0)}/${maxPositionDurationMinutes} min), closing...`);
            }
          }
        } else if (!shouldClose && (!maxPositionDurationMinutes || maxPositionDurationMinutes === 0)) {
          console.log(`⏱️ Position ${position.symbol} - max duration disabled (set to ${maxPositionDurationMinutes}), will only close on stop loss or trailing stop`);
        }

        // Calculate unrealized PnL
        const pnl = position.side === 'LONG' 
          ? (currentPrice - position.entry_price) * position.quantity
          : (position.entry_price - currentPrice) * position.quantity;
        
        const pnlPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100 * (position.side === 'LONG' ? 1 : -1);

        // Update position with new values (ALTID opdater trailing_stop hvis beregnet)
        const updateData: any = {
          unrealized_pnl: pnl,
          current_price: currentPrice,
        };
        
        if (trailingStopActive) {
          updateData.peak_price = newPeakPrice;
          updateData.trailing_stop = newTrailingStop;
          updateData.stop_loss = newStopLoss; // Opdater også SL hvis break-even aktiveret
        }
        
        await supabaseClient
          .from('positions')
          .update(updateData)
          .eq('id', position.id);

        if (shouldClose) {
          console.log(`Closing position ${position.symbol} - Reason: ${closeReason}`);
          
          try {
            // Close position on Binance and get actual exit price
            const closeResult = await closePositionOnBinance(position.symbol, position.side, position.quantity);
            
            if (!closeResult) {
              console.log(`Position ${position.symbol} already closed on Binance`);
              continue;
            }

            // Use actual exit price from Binance order
            const actualExitPrice = closeResult.avgPrice;
            const actualQuantity = closeResult.executedQty;
            
            // Calculate actual P&L based on real exit price
            const actualPnl = position.side === 'LONG' 
              ? (actualExitPrice - position.entry_price) * actualQuantity
              : (position.entry_price - actualExitPrice) * actualQuantity;
            
            const actualPnlPercent = ((actualExitPrice - position.entry_price) / position.entry_price) * 100 * (position.side === 'LONG' ? 1 : -1);

            console.log(`Position closed - Entry: ${position.entry_price}, Exit: ${actualExitPrice}, P&L: ${actualPnl.toFixed(2)} USDT`);
            
            // Update position status with close reason
            await supabaseClient
              .from('positions')
              .update({ 
                status: 'CLOSED',
                closed_at: new Date().toISOString(),
                current_price: actualExitPrice,
                unrealized_pnl: actualPnl,
                close_reason: closeReason,
              })
              .eq('id', position.id);

            // Add to trade history with actual values from Binance and indicators
            // Gem stop_loss, trailing_stop og multiplier værdier i indicators_snapshot
            const DEFAULT_TRAILING_MULTIPLIER = 1.8;
            // 🔴 BACKWARDS COMPATIBILITY: Læs fra begge mulige feltnavne
            const rawTrailingMultiplier = position.indicators_snapshot?.atr_trailing_stop_multiplier 
                                       ?? position.indicators_snapshot?.trailing_stop_atr_multiplier;
            const trailingMultiplierUsed = rawTrailingMultiplier ?? DEFAULT_TRAILING_MULTIPLIER;
            const trailingMultiplierWasFallback = rawTrailingMultiplier === null || rawTrailingMultiplier === undefined;
            
            // 🔴 HARD AUDIT: Tjek om break_even_activated=true men break_even_at_price er null
            const finalBreakEvenActivated = breakEvenActivatedState || position.break_even_activated || false;
            const finalBreakEvenAtPrice = breakEvenAtPrice ?? position.indicators_snapshot?.break_even_at_price ?? null;
            const finalBreakEvenTriggerPrice = breakEvenTriggerPrice ?? position.indicators_snapshot?.break_even_trigger_price ?? null;
            const finalStopLossAfterBE = stopLossAfterBE ?? position.indicators_snapshot?.stop_loss_after_be ?? null;
            
            if (finalBreakEvenActivated && (finalBreakEvenAtPrice === null || finalBreakEvenAtPrice === undefined)) {
              console.log(`\n❌ ═══════════════════════════════════════════════════════`);
              console.log(`❌ BREAK-EVEN AUDIT ERROR - ${position.symbol} ${position.side}`);
              console.log(`❌ ═══════════════════════════════════════════════════════`);
              console.log(`   ❌ KRITISK: break_even_activated = TRUE`);
              console.log(`   ❌ KRITISK: break_even_at_price = NULL`);
              console.log(`   📋 symbol: ${position.symbol}`);
              console.log(`   📋 side: ${position.side}`);
              console.log(`   📋 entry_price: ${position.entry_price}`);
              console.log(`   📋 break_even_trigger_price: ${finalBreakEvenTriggerPrice ?? 'NULL'}`);
              console.log(`   📋 stop_loss ved close: ${newStopLoss}`);
              console.log(`   📋 breakEvenActivatedThisCycle: ${breakEvenActivatedThisCycle}`);
              console.log(`   📋 position.break_even_activated: ${position.break_even_activated}`);
              console.log(`   📋 position.indicators_snapshot?.break_even_at_price: ${position.indicators_snapshot?.break_even_at_price ?? 'NULL'}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   🔧 RETROAKTIV FIX: Sætter break_even_at_price = entry_price`);
              console.log(`❌ ═══════════════════════════════════════════════════════\n`);
            }
            
            // 🔴 Byg enhancedSnapshot med LOKALE værdier (ikke fra position.indicators_snapshot)
            // 🔴 MACD SCHEMA FIX: Fjern gammelt MACD_signal felt og behold kun de 4 korrekte felter
            const rawSnapshot = position.indicators_snapshot || {};
            
            // 🔴 Udtræk MACD værdier fra eksisterende snapshot (sat ved trade open)
            const macdSignalPeriod = rawSnapshot.macd_signal_period ?? rawSnapshot.MACD_signal ?? null;
            const macdLine = rawSnapshot.macd_line ?? null;
            const macdSignalLine = rawSnapshot.macd_signal_line ?? null;
            const macdHistogram = rawSnapshot.macd_histogram ?? null;
            
            // 🔴 MACD SCHEMA AUDIT - Type-check alle 4 felter
            const macdSchemaErrors: string[] = [];
            
            // Check 1: macd_signal_period skal være int (eller null)
            if (macdSignalPeriod !== null && !Number.isInteger(macdSignalPeriod)) {
              macdSchemaErrors.push(`macd_signal_period er ikke int: ${macdSignalPeriod} (type: ${typeof macdSignalPeriod})`);
            }
            
            // Check 2: runtime-felter må ikke være null (hvis MACD var aktiv)
            const macdWasActive = macdSignalPeriod !== null;
            if (macdWasActive) {
              if (macdLine === null || macdLine === undefined) {
                macdSchemaErrors.push(`macd_line er null/undefined`);
              }
              if (macdSignalLine === null || macdSignalLine === undefined) {
                macdSchemaErrors.push(`macd_signal_line er null/undefined`);
              }
              if (macdHistogram === null || macdHistogram === undefined) {
                macdSchemaErrors.push(`macd_histogram er null/undefined`);
              }
            }
            
            // Check 3: Histogram konsistens - skal matche (macd_line - macd_signal_line)
            if (macdLine !== null && macdSignalLine !== null && macdHistogram !== null) {
              const expectedHistogram = macdLine - macdSignalLine;
              const histogramDiff = Math.abs(macdHistogram - expectedHistogram);
              if (histogramDiff > 1e-10) {
                macdSchemaErrors.push(`macd_histogram inkonsistent: ${macdHistogram} vs expected ${expectedHistogram} (diff: ${histogramDiff.toExponential(10)})`);
              }
            }
            
            // Log MACD SCHEMA AUDIT
            if (macdSchemaErrors.length > 0) {
              console.log(`\n❌ ═══════════════════════════════════════════════════════`);
              console.log(`❌ MACD SCHEMA AUDIT ERROR - ${position.symbol} ${position.side}`);
              console.log(`❌ ═══════════════════════════════════════════════════════`);
              console.log(`   Gammel MACD_signal i snapshot: ${rawSnapshot.MACD_signal ?? 'IKKE FUNDET'}`);
              console.log(`   macd_signal_period: ${macdSignalPeriod} (type: ${typeof macdSignalPeriod})`);
              console.log(`   macd_line: ${macdLine}`);
              console.log(`   macd_signal_line: ${macdSignalLine}`);
              console.log(`   macd_histogram: ${macdHistogram}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              for (const err of macdSchemaErrors) {
                console.log(`   ❌ ${err}`);
              }
              console.log(`❌ ═══════════════════════════════════════════════════════\n`);
            } else if (macdWasActive) {
              console.log(`✅ MACD SCHEMA OK: period=${macdSignalPeriod}, line=${macdLine}, signal=${macdSignalLine}, hist=${macdHistogram}`);
            }
            
            // 🔴 Byg snapshot UDEN det gamle MACD_signal felt
            // Destructure for at fjerne MACD_signal
            const { MACD_signal: _removedMacdSignal, ...cleanSnapshot } = rawSnapshot;
            
            // 📊 Beregn TRAILING STOP AUDIT felter (altid beregnet, gemmes kun ved trailing exit)
            const snapshotAtrForExit = position.indicators_snapshot?.atr || null;
            const trailingDistanceForExit = (snapshotAtrForExit && trailingMultiplierUsed) 
              ? snapshotAtrForExit * trailingMultiplierUsed 
              : null;
            
            // Distance fra peak i procent (hvor langt trailing stop var fra peak)
            const distanceFromPeakPct = (newPeakPrice && newTrailingStop && newPeakPrice !== 0)
              ? Math.abs(newPeakPrice - newTrailingStop) / newPeakPrice * 100
              : null;
            
            // Distance fra peak i ATR (for audit)
            const distanceFromPeakAtr = (snapshotAtrForExit && snapshotAtrForExit > 0 && newPeakPrice && newTrailingStop)
              ? Math.abs(newPeakPrice - newTrailingStop) / snapshotAtrForExit
              : null;
            
            // Er dette en trailing stop exit?
            const isTrailingStopExit = closeReason.includes('TRAILING_STOP');
            
            const enhancedSnapshot = {
              ...cleanSnapshot,
              stop_loss: newStopLoss,
              trailing_stop: newTrailingStop,
              trailing_stop_percent: position.trailing_stop_percent,
              peak_price: newPeakPrice,
              // 🔴 FIX: Brug lokale BE-værdier (opdateret i denne cycle) IKKE position.break_even_activated
              break_even_activated: finalBreakEvenActivated,
              break_even_at_price: finalBreakEvenAtPrice ?? (finalBreakEvenActivated ? position.entry_price : null),
              break_even_trigger_price: finalBreakEvenTriggerPrice,
              stop_loss_after_be: finalStopLossAfterBE ?? (finalBreakEvenActivated ? position.entry_price : null),
              // 🔴 FIX: Gem BEGGE feltnavne for backwards compatibility
              atr_trailing_stop_multiplier: trailingMultiplierUsed,
              trailing_stop_atr_multiplier: trailingMultiplierUsed, // Alias for eksisterende dashboards
              trailing_stop_multiplier_was_fallback: trailingMultiplierWasFallback,
              close_timestamp: new Date().toISOString(),
              exit_price: actualExitPrice,
              // 🔴 MACD SCHEMA: Explicit sæt de 4 korrekte felter (overskriver eventuelle gamle)
              macd_signal_period: macdSignalPeriod, // int config
              macd_line: macdLine, // decimal runtime
              macd_signal_line: macdSignalLine, // decimal runtime  
              macd_histogram: macdHistogram, // decimal runtime
              // 🔴 Explicit fjern gammelt felt ved at sætte til undefined (vil ikke blive inkluderet i JSON)
              MACD_signal: undefined,
              
              // 📊 TRAILING STOP EXIT AUDIT FELTER - bygget nedenfor med clamp-info
              trailing_stop_exit_audit: (() => {
                // 🔴 CLAMP INFO: Hent fra position context (sat i trailing-beregningen)
                // @ts-ignore - dynamisk tilføjet property
                const clampInfo = position._trailingClampInfo || {
                  expected_trailing_level: null,
                  effective_trailing_level: newTrailingStop,
                  was_clamped: false,
                  clamp_reason: null,
                  clamp_delta: 0,
                  clamp_protection_level: null,
                };
                
                // 🔴 EXPECTED: Ren beregning fra peak ± ATR*multiplier (ingen clamp)
                const expectedTrailingLevel = clampInfo.expected_trailing_level 
                  ?? (newPeakPrice && trailingDistanceForExit
                    ? (position.side === 'LONG' ? newPeakPrice - trailingDistanceForExit : newPeakPrice + trailingDistanceForExit)
                    : null);
                
                // 🔴 EFFECTIVE: Det niveau der faktisk bruges (kan være clamped)
                const effectiveTrailingLevel = clampInfo.effective_trailing_level ?? newTrailingStop;
                
                // 🔴 trailing_calculation_matches: Validerer at REN MATEMATIK er korrekt (ignorer clamp)
                const trailingMathIsCorrect = (expectedTrailingLevel !== null && newPeakPrice && trailingDistanceForExit)
                  ? Math.abs(expectedTrailingLevel - (position.side === 'LONG' ? newPeakPrice - trailingDistanceForExit : newPeakPrice + trailingDistanceForExit)) < 1e-6
                  : null;
                
                // 🔴 clamp_applied_correctly: Validerer at clamp-reglen blev udført korrekt
                let clampAppliedCorrectly: boolean | null = null;
                if (clampInfo.was_clamped && clampInfo.clamp_protection_level !== null && effectiveTrailingLevel !== null) {
                  if (position.side === 'LONG') {
                    clampAppliedCorrectly = effectiveTrailingLevel >= clampInfo.clamp_protection_level - 1e-10;
                  } else {
                    clampAppliedCorrectly = effectiveTrailingLevel <= clampInfo.clamp_protection_level + 1e-10;
                  }
                } else if (!clampInfo.was_clamped) {
                  clampAppliedCorrectly = expectedTrailingLevel !== null && effectiveTrailingLevel !== null
                    ? Math.abs(effectiveTrailingLevel - expectedTrailingLevel) < 1e-6
                    : null;
                }
                
                return {
                  peak_price: newPeakPrice,
                  
                  // 🔴 TODELT AUDIT: expected vs effective
                  expected_trailing_level: expectedTrailingLevel,
                  effective_exit_level: isTrailingStopExit ? effectiveTrailingLevel : newStopLoss,
                  effective_exit_mechanism: isTrailingStopExit 
                    ? (clampInfo.was_clamped ? `TRAILING_CLAMPED_${clampInfo.clamp_reason}` : 'TRAILING')
                    : (finalBreakEvenActivated ? 'BREAK_EVEN_SL' : 'INITIAL_SL'),
                  
                  // 🔴 CLAMP TRACKING
                  was_clamped: clampInfo.was_clamped,
                  clamp_reason: clampInfo.clamp_reason,
                  clamp_delta: clampInfo.clamp_delta,
                  clamp_protection_level: clampInfo.clamp_protection_level,
                  
                  // 🔴 VERIFIKATION
                  trailing_calculation_matches: trailingMathIsCorrect,
                  clamp_applied_correctly: clampAppliedCorrectly,
                  
                  // Backwards compatibility felter
                  trailing_stop_price_at_exit: effectiveTrailingLevel,
                  stop_loss_at_exit: isTrailingStopExit ? effectiveTrailingLevel : newStopLoss,
                  original_stop_loss: newStopLoss,
                  break_even_was_active: finalBreakEvenActivated,
                  break_even_at_price_at_exit: finalBreakEvenAtPrice,
                  
                  // ATR AUDIT
                  atr_value_used_for_trailing: snapshotAtrForExit,
                  atr_value_at_exit: snapshotAtrForExit,
                  atr_source: 'entry',
                  atr_timeframe: position.indicators_snapshot?.atr_audit?.atr_timeframe 
                    ?? position.indicators_snapshot?.trend_timeframe 
                    ?? position.indicators_snapshot?.scan_interval 
                    ?? 'unknown',
                  atr_period: position.indicators_snapshot?.atr_audit?.atr_period 
                    ?? position.indicators_snapshot?.atr_period 
                    ?? 14,
                  trailing_distance: trailingDistanceForExit,
                  distance_from_peak_pct: distanceFromPeakPct,
                  distance_from_peak_atr: distanceFromPeakAtr,
                  multiplier_used: trailingMultiplierUsed,
                  multiplier_was_fallback: trailingMultiplierWasFallback,
                  is_legacy_position: isLegacyPosition,
                  exit_trigger_price: actualExitPrice,
                  entry_price: position.entry_price,
                  expected_trailing_from_peak: expectedTrailingLevel,
                };
              })(),
            };
            
            // 🔴 FINAL ASSERTION: Verificer at BE-felter er konsistente
            if (enhancedSnapshot.break_even_activated && enhancedSnapshot.break_even_at_price !== null) {
              const beAssertionDiff = Math.abs((enhancedSnapshot.stop_loss_after_be ?? 0) - (enhancedSnapshot.break_even_at_price ?? 0));
              if (beAssertionDiff >= 1e-10) {
                console.log(`\n⚠️ BREAK-EVEN FINAL ASSERTION WARNING:`);
                console.log(`   stop_loss_after_be: ${enhancedSnapshot.stop_loss_after_be}`);
                console.log(`   break_even_at_price: ${enhancedSnapshot.break_even_at_price}`);
                console.log(`   diff: ${beAssertionDiff.toExponential(10)} (expected < 1e-10)`);
              }
              
              // 🔴 CRITICAL AUDIT: Verificer stop_loss_at_exit matcher BE-price når BE er aktiv
              const slAtExitFromAudit = enhancedSnapshot.trailing_stop_exit_audit?.stop_loss_at_exit;
              const expectedSlWithBE = enhancedSnapshot.break_even_at_price;
              if (slAtExitFromAudit !== null && slAtExitFromAudit !== undefined && 
                  expectedSlWithBE !== null && expectedSlWithBE !== undefined) {
                const slAuditDiff = Math.abs(slAtExitFromAudit - expectedSlWithBE);
                if (slAuditDiff >= 1e-10) {
                  console.log(`\n❌ ═══════════════════════════════════════════════════════`);
                  console.log(`❌ STOP_LOSS_AT_EXIT AUDIT ASSERTION FAILED!`);
                  console.log(`❌ ═══════════════════════════════════════════════════════`);
                  console.log(`   break_even_activated: ${enhancedSnapshot.break_even_activated}`);
                  console.log(`   break_even_at_price: ${expectedSlWithBE}`);
                  console.log(`   stop_loss_at_exit (audit): ${slAtExitFromAudit}`);
                  console.log(`   DIFF: ${slAuditDiff} (expected < 1e-10)`);
                  console.log(`   ─────────────────────────────────────────────────────────`);
                  console.log(`   KONKLUSION: stop_loss_at_exit afviger fra BE-price!`);
                  console.log(`   Dette indikerer at newStopLoss ikke blev synkroniseret korrekt`);
                  console.log(`   med break-even state ved loop-start.`);
                  console.log(`❌ ═══════════════════════════════════════════════════════\n`);
                } else {
                  console.log(`✅ STOP_LOSS_AT_EXIT AUDIT OK: ${slAtExitFromAudit} matches BE price ${expectedSlWithBE}`);
                }
              }
            }

            // 📊 TRAILING STOP SUMMARY - Log når exit_reason er trailing stop relateret
            if (closeReason.includes('TRAILING_STOP')) {
              const audit = enhancedSnapshot.trailing_stop_exit_audit;
              
              // 🔴 AUDIT ASSERTION: Verificer at stop_loss_at_exit matcher effective_exit_level ved trailing exit
              const trailingExitMismatch = audit.stop_loss_at_exit !== audit.effective_exit_level;
              if (trailingExitMismatch) {
                console.log(`\n❌ ═══════════════════════════════════════════════════════`);
                console.log(`❌ TRAILING EXIT AUDIT ASSERTION FAILED!`);
                console.log(`❌ ═══════════════════════════════════════════════════════`);
                console.log(`   stop_loss_at_exit: ${audit.stop_loss_at_exit}`);
                console.log(`   effective_exit_level: ${audit.effective_exit_level}`);
                console.log(`   DISSE BØR VÆRE IDENTISKE VED TRAILING EXIT!`);
                console.log(`❌ ═══════════════════════════════════════════════════════\n`);
              }
              
              // 🔴 AUDIT ASSERTION: Verificer at trailing level matcher expected beregning
              // NB: Kun flag divergence hvis IKKE clamped - clamp er bevidst divergens
              const expectedTrailing = audit.expected_trailing_level;
              const actualTrailing = audit.trailing_stop_price_at_exit;
              if (expectedTrailing && actualTrailing && !audit.was_clamped) {
                const trailingDiff = Math.abs(actualTrailing - expectedTrailing);
                if (trailingDiff >= 1e-6) {
                  console.log(`\n❌ TRAILING CALCULATION DIVERGENCE DETECTED (INGEN CLAMP)!`);
                  console.log(`   actual trailing: ${actualTrailing}`);
                  console.log(`   expected from peak: ${expectedTrailing}`);
                  console.log(`   diff: ${trailingDiff.toExponential(10)}`);
                  console.log(`   was_clamped: ${audit.was_clamped}`);
                  console.log(`   break_even_was_active: ${audit.break_even_was_active}`);
                }
              }
              
              console.log(`\n📊 ═══════════════════════════════════════════════════════`);
              console.log(`📊 TRAILING STOP EXIT AUDIT - ${position.symbol} ${position.side}`);
              console.log(`📊 ═══════════════════════════════════════════════════════`);
              console.log(`   EXIT NIVEAUER (TODELT AUDIT):`);
              console.log(`   📍 expected_trailing_level: ${audit.expected_trailing_level?.toFixed(8) ?? 'NULL'} (ren beregning)`);
              console.log(`   📍 effective_exit_level: ${audit.effective_exit_level} (${audit.effective_exit_mechanism})`);
              console.log(`   📍 trailing_stop_price_at_exit: ${audit.trailing_stop_price_at_exit}`);
              console.log(`   📍 stop_loss_at_exit: ${audit.stop_loss_at_exit}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   🔒 CLAMP TRACKING:`);
              console.log(`   🔒 was_clamped: ${audit.was_clamped}`);
              if (audit.was_clamped) {
                console.log(`   🔒 clamp_reason: ${audit.clamp_reason}`);
                console.log(`   🔒 clamp_delta: ${audit.clamp_delta?.toFixed(8)}`);
                console.log(`   🔒 clamp_protection_level: ${audit.clamp_protection_level}`);
                console.log(`   ${audit.clamp_applied_correctly === true ? '✅' : '❌'} clamp_applied_correctly: ${audit.clamp_applied_correctly}`);
              }
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   BREAK-EVEN STATUS:`);
              console.log(`   🔴 break_even_was_active: ${audit.break_even_was_active}`);
              console.log(`   🔴 break_even_at_price_at_exit: ${audit.break_even_at_price_at_exit ?? 'NULL'}`);
              console.log(`   📍 original_stop_loss: ${audit.original_stop_loss}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   PRISER:`);
              console.log(`   📍 entry_price: ${audit.entry_price}`);
              console.log(`   📍 peak_price: ${audit.peak_price}`);
              console.log(`   📍 exit_trigger_price: ${audit.exit_trigger_price}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   ATR & MULTIPLIER:`);
              console.log(`   📐 atr_value_at_exit: ${audit.atr_value_at_exit ?? 'NULL'}`);
              console.log(`   📐 multiplier_used: ${audit.multiplier_used}x${audit.multiplier_was_fallback ? ' ⚠️ FALLBACK' : ''}`);
              console.log(`   📐 trailing_distance: ${audit.trailing_distance?.toFixed(8) ?? 'NULL'}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   DISTANCE FRA PEAK:`);
              console.log(`   📏 distance_from_peak_pct: ${audit.distance_from_peak_pct?.toFixed(4) ?? 'NULL'}%`);
              console.log(`   📏 distance_from_peak_atr: ${audit.distance_from_peak_atr?.toFixed(4) ?? 'NULL'} ATR`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   VERIFIKATION:`);
              console.log(`   ${audit.trailing_calculation_matches === true ? '✅' : audit.trailing_calculation_matches === false ? '❌' : '⚪'} trailing_calculation_matches: ${audit.trailing_calculation_matches} (ren matematik)`);
              console.log(`   ${audit.clamp_applied_correctly === true ? '✅' : audit.clamp_applied_correctly === false ? '❌' : '⚪'} clamp_applied_correctly: ${audit.clamp_applied_correctly}`);
              console.log(`   🏷️ is_legacy_position: ${audit.is_legacy_position}`);
              console.log(`   ─────────────────────────────────────────────────────────`);
              console.log(`   CLOSE INFO:`);
              console.log(`   📋 close_reason: ${closeReason}`);
              console.log(`   📋 exit_type: ${position.indicators_snapshot?.exit_type || 'UNKNOWN'}`);
              if (audit.multiplier_was_fallback) {
                console.log(`   ⚠️ FALLBACK AUDIT: Multiplier var NULL - brugte default`);
              }
              if (audit.trailing_calculation_matches === false && !audit.was_clamped) {
                console.log(`   ❌ TRAILING CALCULATION MISMATCH (ingen clamp)!`);
                console.log(`      actual: ${audit.trailing_stop_price_at_exit}`);
                console.log(`      expected: ${audit.expected_trailing_level}`);
              }
              console.log(`📊 ═══════════════════════════════════════════════════════\n`);
            }

            // 🔴 SCHEMA VALIDATION AUDIT - Log errors for v2 trades before saving to history
            const schemaVersion = enhancedSnapshot?.schema_version ?? 1;
            if (schemaVersion >= 2) {
              const schemaErrors: string[] = [];
              
              // MACD guaranteed fields
              if (enhancedSnapshot.macd_signal_period === undefined) schemaErrors.push('macd_signal_period');
              if (enhancedSnapshot.macd_line === undefined) schemaErrors.push('macd_line');
              if (enhancedSnapshot.macd_signal_line === undefined) schemaErrors.push('macd_signal_line');
              if (enhancedSnapshot.macd_histogram === undefined) schemaErrors.push('macd_histogram');
              
              // ATR (required for exits)
              if (enhancedSnapshot.atr === undefined || enhancedSnapshot.atr === null) schemaErrors.push('atr');
              if (enhancedSnapshot.atr_percent === undefined) schemaErrors.push('atr_percent');
              
              // ATR audit (required for v2 - entydigt dokumentation af ATR source)
              if (!enhancedSnapshot.atr_audit) {
                schemaErrors.push('atr_audit');
              } else {
                if (enhancedSnapshot.atr_audit.atr_timeframe === undefined) schemaErrors.push('atr_audit.atr_timeframe');
                if (enhancedSnapshot.atr_audit.atr_period === undefined) schemaErrors.push('atr_audit.atr_period');
                if (enhancedSnapshot.atr_audit.atr_source === undefined) schemaErrors.push('atr_audit.atr_source');
              }
              
              // Break-even: if triggered, at_price must exist
              if (enhancedSnapshot.break_even_activated === true && enhancedSnapshot.break_even_at_price === null) {
                schemaErrors.push('break_even_at_price (BE activated but price null)');
              }
              
              // ADX audit (if ADX enabled)
              if (enhancedSnapshot.adx_enabled === true && !enhancedSnapshot.adx_audit) {
                schemaErrors.push('adx_audit (ADX enabled but audit missing)');
              }
              
              // Trailing stop exit audit (if exit reason is trailing_stop)
              if (closeReason?.toUpperCase().includes('TRAILING') && !enhancedSnapshot.trailing_stop_exit_audit) {
                schemaErrors.push('trailing_stop_exit_audit (trailing exit but audit missing)');
              }
              
              // StochRSI separate fields
              if (enhancedSnapshot.stochrsi_enabled === true) {
                if (enhancedSnapshot.stochRSI_k === undefined) schemaErrors.push('stochRSI_k');
                if (enhancedSnapshot.stochRSI_d === undefined) schemaErrors.push('stochRSI_d');
              }
              
              // Soft conditions total
              if (enhancedSnapshot.soft_conditions_total === undefined) schemaErrors.push('soft_conditions_total');
              
              // Exit type flag
              if (enhancedSnapshot.exit_type === undefined) schemaErrors.push('exit_type');
              
              if (schemaErrors.length > 0) {
                console.log(`\n🚨 ═══════════════════════════════════════════════════════`);
                console.log(`🚨 SCHEMA VALIDATION AUDIT - ERRORS DETECTED!`);
                console.log(`🚨 ═══════════════════════════════════════════════════════`);
                console.log(`   📋 position_id: ${position.id}`);
                console.log(`   📋 symbol: ${position.symbol}`);
                console.log(`   📋 side: ${position.side}`);
                console.log(`   📋 schema_version: ${schemaVersion}`);
                console.log(`   📋 close_reason: ${closeReason}`);
                console.log(`   📋 closed_at: ${new Date().toISOString()}`);
                console.log(`   ─────────────────────────────────────────────────────────`);
                console.log(`   ❌ MISSING GUARANTEED FIELDS (${schemaErrors.length}):`);
                schemaErrors.forEach((err, i) => {
                  console.log(`      ${i + 1}. ${err}`);
                });
                console.log(`   ─────────────────────────────────────────────────────────`);
                console.log(`   ⚠️ Dette er en REGRESSION - v2 trades skal have alle felter!`);
                console.log(`🚨 ═══════════════════════════════════════════════════════\n`);
                
                // Add schema error info to the snapshot for traceability
                enhancedSnapshot.schema_error = true;
                enhancedSnapshot.schema_error_reason = schemaErrors.join(', ');
              } else {
                console.log(`✅ SCHEMA VALIDATION OK | ${position.symbol} | v${schemaVersion} | All guaranteed fields present`);
              }
            }

            const { error: historyError } = await supabaseClient.from('trade_history').insert({
              user_id: position.user_id,
              symbol: position.symbol,
              side: position.side,
              entry_price: position.entry_price,
              exit_price: actualExitPrice,
              quantity: actualQuantity,
              pnl: actualPnl,
              pnl_percent: actualPnlPercent,
              opened_at: position.opened_at,
              closed_at: new Date().toISOString(),
              duration_minutes: Math.floor((now.getTime() - openedAt.getTime()) / (1000 * 60)),
              strategy_hash: position.strategy_hash,
              open_reason: position.open_reason,
              close_reason: closeReason,
              indicators_snapshot: enhancedSnapshot,
            });

            if (historyError) {
              console.error(`Failed to insert trade history for ${position.symbol}:`, historyError);
            } else {
              console.log(`Trade history saved for ${position.symbol}`);
            }
            
            // Immediately sync with Binance to ensure DB matches reality
            console.log(`Syncing with Binance after closing ${position.symbol}`);
            await supabaseClient.functions.invoke('sync-binance-futures-positions');

            // Update user portfolio with actual balance from Binance
            try {
              const apiKey = Deno.env.get('BINANCE_API_KEY');
              const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
              
              if (apiKey && apiSecret) {
                const accountBalance = await getBinanceAccountBalance(apiKey, apiSecret);
                
                const { data: portfolio } = await supabaseClient
                  .from('user_portfolio')
                  .select('*')
                  .eq('user_id', position.user_id)
                  .single();

                if (portfolio) {
                  await supabaseClient
                    .from('user_portfolio')
                    .update({
                      futures_capital: accountBalance.totalMarginBalance,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', position.user_id);
                  
                  console.log(`Portfolio updated: ${accountBalance.totalMarginBalance} USDT`);
                } else {
                  // Create portfolio if it doesn't exist
                  await supabaseClient
                    .from('user_portfolio')
                    .insert({
                      user_id: position.user_id,
                      futures_capital: accountBalance.totalMarginBalance,
                    });
                }
              }
            } catch (error) {
              console.error('Failed to update portfolio balance:', error);
            }

            // After closing, immediately sync with Binance (source of truth)
            await supabaseClient.functions.invoke('sync-binance-futures-positions');

            results.push({
              symbol: position.symbol,
              action: 'CLOSED',
              reason: closeReason,
              pnl: actualPnl,
              pnlPercent: actualPnlPercent,
              entryPrice: position.entry_price,
              exitPrice: actualExitPrice,
            });
          } catch (error) {
            console.error(`Failed to close position ${position.symbol}:`, error);
            results.push({
              symbol: position.symbol,
              action: 'CLOSE_FAILED',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          results.push({
            symbol: position.symbol,
            action: 'MONITORED',
            currentPrice: currentPrice,
            unrealizedPnl: pnl,
          });
        }
      } catch (error) {
        console.error(`Error monitoring position ${position.symbol}:`, error);
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
