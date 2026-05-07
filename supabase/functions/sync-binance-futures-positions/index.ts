import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Binance er master — alle handler styres af appen, ingen manuelle handler.

// 🛡️ CLOSE REASON NORMALIZER (mirror of monitor-positions)
const MECHANICAL_REASONS = new Set([
  'HARD_STOP_LOSS_HIT','MAX_SL_AFTER_MFE_HIT','BREAK_EVEN_HIT','PEAK_LOCK_HIT',
  'TRAILING_STOP_HIT','LEGACY_TRAILING_STOP_HIT','STALE_EXIT','TIMEOUT','TAKE_PROFIT_HIT','MANUAL'
]);
function normalizeCloseReason(args: {
  rawReason?: string | null; side: 'LONG' | 'SHORT';
  entryPrice: number; exitPrice: number; pnl: number; pnlPercent?: number | null;
  stopLoss?: number | null; symbol?: string;
}): { finalReason: string; inferred: boolean; audit: any } {
  const { rawReason, side, entryPrice, exitPrice, pnl, pnlPercent, stopLoss, symbol } = args;
  const raw = (rawReason ?? '').toString().trim().toUpperCase();
  const valid = isFinite(entryPrice) && isFinite(exitPrice) && entryPrice > 0 && exitPrice > 0;
  if ((raw === 'BREAK_EVEN_HIT' || raw === 'TRAILING_STOP_HIT' || raw === 'LEGACY_TRAILING_STOP_HIT') && pnl < 0) {
    const final = 'STOP_LOSS_HIT';
    console.log(`🛡️ CLOSE_REASON_NORMALIZED | symbol=${symbol} | raw=${raw} | final=${final} | pnl=${pnl.toFixed(4)} | side=${side} | reason=negative_pnl_safeguard`);
    return { finalReason: final, inferred: true, audit: { inferred_close_reason: true, inferred_close_reason_from: 'negative_pnl_safeguard', raw_close_reason: rawReason ?? null, normalized_close_reason: final, entry_price: entryPrice, exit_price: exitPrice, side, pnl, pnl_percent: pnlPercent ?? null }};
  }
  if (MECHANICAL_REASONS.has(raw)) return { finalReason: raw, inferred: false, audit: null };
  if (!valid) return { finalReason: raw || 'UNKNOWN', inferred: false, audit: null };
  const slNum = stopLoss != null ? Number(stopLoss) : null;
  const slHit = slNum != null && isFinite(slNum) && slNum > 0 && (
    (side === 'LONG' && exitPrice <= slNum) || (side === 'SHORT' && exitPrice >= slNum)
  );
  let final: string; let from = 'pnl_only';
  if (slHit) { final = 'HARD_STOP_LOSS_HIT'; from = 'stop_loss_price_crossed'; }
  else if (pnl < 0) { final = 'STOP_LOSS_HIT'; from = 'pnl_negative'; }
  else {
    const pctAbs = Math.abs(pnlPercent ?? ((exitPrice - entryPrice) / (entryPrice || 1)) * 100);
    if (pctAbs < 0.05) { final = 'BREAK_EVEN_HIT'; from = 'pnl_near_zero'; }
    else { final = 'MANUAL_OR_EXTERNAL_CLOSE'; from = 'pnl_positive'; }
  }
  console.log(`🛡️ CLOSE_REASON_NORMALIZED | symbol=${symbol} | raw=${rawReason ?? 'null'} | final=${final} | pnl=${pnl.toFixed(4)} | side=${side} | from=${from}`);
  return { finalReason: final, inferred: true, audit: { inferred_close_reason: true, inferred_close_reason_from: from, raw_close_reason: rawReason ?? null, normalized_close_reason: final, entry_price: entryPrice, exit_price: exitPrice, side, pnl, pnl_percent: pnlPercent ?? null, stop_loss_used: slNum, stop_loss_hit: slHit }};
}


// Slot quantity tolerance (10% headroom over expected slot quantity to absorb rounding)
const SLOT_QUANTITY_TOLERANCE_MULTIPLIER = 1.10;

/**
 * Beregner max forventet quantity for et slot baseret på slot-konfiguration.
 * Formel: (portfolio × slotCapital% × positionSize% × leverage) / entryPrice
 */
function calculateMaxExpectedSlotQuantity(params: {
  portfolioCapital: number;
  slotCapitalPercent: number;
  positionSizePercent: number;
  leverage: number;
  entryPrice: number;
}): number {
  const { portfolioCapital, slotCapitalPercent, positionSizePercent, leverage, entryPrice } = params;
  if (!(portfolioCapital > 0) || !(slotCapitalPercent > 0) || !(positionSizePercent > 0) || !(entryPrice > 0)) {
    return 0;
  }
  const slotCapital = portfolioCapital * (slotCapitalPercent / 100);
  const margin = slotCapital * (positionSizePercent / 100);
  const notional = margin * (leverage > 0 ? leverage : 1);
  return notional / entryPrice;
}

/**
 * Fordeler Binances aggregerede quantity proportionalt over DB-rows OG capper hver row mod slot-max.
 * Fix 1+3: Single-row bypass fjernet — også enlige rows valideres mod slot-cap.
 *          Auto-nedskalering: hvis row's beregnede andel > slot-cap × 1.10, nedskaleres til slot-cap.
 *
 * Eksisterende DB-qty bruges som vægt ved proportional fordeling. Hver row capper mod sin egen
 * slot-cap (calculateMaxExpectedSlotQuantity × SLOT_QUANTITY_TOLERANCE_MULTIPLIER). Excess qty
 * (orphan på Binance) tabes — DB skal aldrig "tro" en slot ejer mere end dens lovlige andel.
 */
function distributeBinanceQuantityAcrossRows(
  existingRows: any[],
  totalBinanceQty: number,
  slotCaps?: number[]
): number[] {
  if (existingRows.length === 0) return [];

  const existingQtys = existingRows.map((row) => Math.abs(Number(row.quantity) || 0));
  const existingTotalQty = existingQtys.reduce((sum, qty) => sum + qty, 0);

  // Proportional fordeling baseret på DB-qty (eller lige fordelt hvis intet er kendt)
  let raw: number[];
  if (existingTotalQty > 0) {
    let remainingQty = totalBinanceQty;
    raw = existingRows.map((_, index) => {
      if (index === existingRows.length - 1) return remainingQty;
      const allocated = totalBinanceQty * (existingQtys[index] / existingTotalQty);
      remainingQty -= allocated;
      return allocated;
    });
  } else {
    const equalShare = totalBinanceQty / existingRows.length;
    raw = existingRows.map(() => equalShare);
  }

  // Fix 3: Cap hver row mod slot-max hvis caps er givet
  if (!slotCaps || slotCaps.length !== existingRows.length) {
    return raw;
  }

  return raw.map((qty, idx) => {
    const cap = slotCaps[idx];
    if (!(cap > 0)) return qty; // Ingen cap kendt → bevar
    const ceiling = cap * SLOT_QUANTITY_TOLERANCE_MULTIPLIER;
    if (qty > ceiling) {
      console.warn(
        `⚠️ SLOT-CAP DOWNSCALE: row ${idx} qty ${qty.toFixed(8)} > cap ${ceiling.toFixed(8)} (cap×${SLOT_QUANTITY_TOLERANCE_MULTIPLIER}) — nedskaleret`
      );
      return ceiling;
    }
    return qty;
  });
}

function calculatePositionPnl(side: 'LONG' | 'SHORT', currentPrice: number, entryPrice: number, quantity: number): number {
  return side === 'LONG'
    ? (currentPrice - entryPrice) * quantity
    : (entryPrice - currentPrice) * quantity;
}

async function createSignature(queryString: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(queryString);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getBinanceServerTime(): Promise<number> {
  const response = await fetch('https://fapi.binance.com/fapi/v1/time');
  const data = await response.json();
  return data.serverTime;
}

async function getBinanceAccount(apiKey: string, apiSecret: string) {
  const serverTime = await getBinanceServerTime();
  const queryString = `timestamp=${serverTime}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const url = `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Binance account error:', errorText);
    throw new Error(`Binance API error: ${response.statusText}`);
  }
  
  return await response.json();
}

async function getBinancePositions(apiKey: string, apiSecret: string) {
  const serverTime = await getBinanceServerTime();
  const queryString = `timestamp=${serverTime}&recvWindow=10000`;
  const signature = await createSignature(queryString, apiSecret);
  
  const url = `https://fapi.binance.com/fapi/v3/positionRisk?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Binance positions error:', errorText);
    throw new Error(`Binance API error: ${response.statusText}`);
  }
  
  const positions = await response.json();
  
  // Filter only positions with quantity > 0
  return positions.filter((p: any) => parseFloat(p.positionAmt) !== 0);
}

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
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    if (!res.ok) return NaN;
    const data = await res.json();
    const price = parseFloat(data.price);
    
    // Update cache for next time
    await supabaseClient
      .from('price_cache')
      .upsert({ symbol, price, updated_at: new Date().toISOString() });
    
    return price;
  } catch (error) {
    // If API fails but we have cached data, use it even if stale
    if (cached) {
      console.warn(`API failed for ${symbol}, using stale cache`);
      return parseFloat(cached.price);
    }
    return NaN;
  }
}

// Try to detect the actual close order type from Binance (TP/SL/Trailing)
async function getRecentCloseReason(
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<'EXTERNAL_CLOSE' | 'STOP_LOSS_HIT' | 'TAKE_PROFIT_HIT' | 'TRAILING_STOP_HIT'> {
  try {
    const serverTime = await getBinanceServerTime();
    const params = new URLSearchParams({
      symbol,
      timestamp: serverTime.toString(),
      recvWindow: '10000',
      limit: '50',
    });
    const signature = await createSignature(params.toString(), apiSecret);
    const url = `https://fapi.binance.com/fapi/v1/allOrders?${params.toString()}&signature=${signature}`;
    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
    if (!res.ok) return 'EXTERNAL_CLOSE';
    const orders = await res.json();
    // Look for the most recent filled reduce-only order
    const recent = orders
      .filter((o: any) => o.status === 'FILLED')
      .sort((a: any, b: any) => (b.updateTime || b.time) - (a.updateTime || a.time))[0];
    if (!recent) return 'EXTERNAL_CLOSE';
    const type: string = recent.origType || recent.type || '';
    if (type.includes('TAKE_PROFIT')) return 'TAKE_PROFIT_HIT';
    if (type.includes('TRAILING_STOP')) return 'TRAILING_STOP_HIT';
    if (type.includes('STOP')) return 'STOP_LOSS_HIT';
    return 'EXTERNAL_CLOSE';
  } catch (_err) {
    return 'EXTERNAL_CLOSE';
  }
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

    const apiKey = Deno.env.get('BINANCE_API_KEY');
    const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');
    
    if (!apiKey || !apiSecret) {
      throw new Error('Binance API keys not configured');
    }

    // Fetch account data (balance) from Binance
    const accountData = await getBinanceAccount(apiKey, apiSecret);
    const totalMarginBalance = parseFloat(accountData.totalMarginBalance);
    const totalWalletBalance = parseFloat(accountData.totalWalletBalance);
    const totalUnrealizedProfit = parseFloat(accountData.totalUnrealizedProfit);
    const availableBalance = parseFloat(accountData.availableBalance);

    // Get all active users from trading_session
    const { data: activeSessions } = await supabaseClient
      .from('trading_session')
      .select('user_id')
      .eq('is_active', true);

    if (!activeSessions || activeSessions.length === 0) {
      console.log('No active trading sessions');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active sessions to sync',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allUpdates = [];

    // Process each active user
    for (const session of activeSessions) {
      const userId = session.user_id;
      console.log(`Syncing positions for user ${userId}`);

      // Preserve user-defined trading capital.
      // This sync must never overwrite futures_capital with Binance account balance,
      // because auto-trade uses futures_capital as the sizing baseline.
      // We only bootstrap the portfolio row if it does not exist yet.
      const { data: existingPortfolio } = await supabaseClient
        .from('user_portfolio')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!existingPortfolio) {
        await supabaseClient
          .from('user_portfolio')
          .insert({
            user_id: userId,
            futures_capital: totalMarginBalance,
            binance_unrealized_pnl: totalUnrealizedProfit,
            binance_total_margin_balance: totalMarginBalance,
            binance_synced_at: new Date().toISOString(),
          });
      } else {
        // Update live Binance snapshot fields ONLY (preserve user-defined futures_capital)
        await supabaseClient
          .from('user_portfolio')
          .update({
            binance_unrealized_pnl: totalUnrealizedProfit,
            binance_total_margin_balance: totalMarginBalance,
            binance_synced_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }
      
      // Create daily balance snapshot if it doesn't exist yet (Binance-style P&L tracking)
      const todayDateStr = new Date().toISOString().split('T')[0];
      const { data: existingSnapshot } = await supabaseClient
        .from('daily_balance_snapshots')
        .select('id')
        .eq('user_id', userId)
        .eq('snapshot_date', todayDateStr)
        .maybeSingle();
      
      if (!existingSnapshot) {
        console.log(`Creating daily balance snapshot for ${todayDateStr}: ${totalMarginBalance}`);
        await supabaseClient
          .from('daily_balance_snapshots')
          .insert({
            user_id: userId,
            snapshot_date: todayDateStr,
            futures_balance: totalMarginBalance,
            unrealized_pnl: totalUnrealizedProfit,
          });
      }

      // Fetch positions from Binance
      const binancePositions = await getBinancePositions(apiKey, apiSecret);
      
      // Get current positions from database for this user
      const { data: dbPositions } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'OPEN');

      // Fix 3: Hent alle aktive slots + deres configs så vi kan beregne per-row slot-cap
      const { data: slotsForCap } = await supabaseClient
        .from('strategy_slots')
        .select('id, capital_percent, indicator_config:config_id(position_size_percent, leverage)')
        .eq('user_id', userId);
      const slotById = new Map<string, { capital_percent: number; position_size_percent: number; leverage: number }>();
      for (const s of slotsForCap || []) {
        const cfg: any = (s as any).indicator_config;
        slotById.set((s as any).id, {
          capital_percent: Number((s as any).capital_percent) || 0,
          position_size_percent: Number(cfg?.position_size_percent) || 0,
          leverage: Number(cfg?.leverage) || 1,
        });
      }
      const portfolioCapital = Number(existingPortfolio?.futures_capital) || 0;

      const updates = [];

      // Sync each Binance position to database
      const binanceSymbols = new Set<string>();
      
      for (const binancePos of binancePositions) {
        const quantity = parseFloat(binancePos.positionAmt);
        const side = quantity > 0 ? 'LONG' : 'SHORT';
        const absQuantity = Math.abs(quantity);
        const currentPrice = parseFloat(binancePos.markPrice);
        const unrealizedPnl = parseFloat(binancePos.unRealizedProfit);
        const binanceEntryPrice = parseFloat(binancePos.entryPrice);
        
        binanceSymbols.add(binancePos.symbol);
        
        // Find ALL matching positions in DB for this symbol
        const matchingPositions = dbPositions?.filter(p => p.symbol === binancePos.symbol) || [];
        
        if (matchingPositions.length > 0) {
          const totalDbQty = matchingPositions.reduce((sum, p) => sum + Math.abs(Number(p.quantity) || 0), 0);
          const qtyDrift = Math.abs(absQuantity - totalDbQty);

          // Fix 3: Beregn slot-cap pr. row, så distributionen kan nedskalere oversize rows
          const slotCaps = matchingPositions.map((dbPos) => {
            const slotInfo = dbPos.slot_id ? slotById.get(dbPos.slot_id) : null;
            if (!slotInfo || !(portfolioCapital > 0)) return 0;
            return calculateMaxExpectedSlotQuantity({
              portfolioCapital,
              slotCapitalPercent: slotInfo.capital_percent,
              positionSizePercent: slotInfo.position_size_percent,
              leverage: slotInfo.leverage,
              entryPrice: binanceEntryPrice,
            });
          });

          const distributedQuantities = distributeBinanceQuantityAcrossRows(matchingPositions, absQuantity, slotCaps);
          const syncTimestamp = new Date().toISOString();
          const qtyTolerance = Math.max(absQuantity * 0.0001, 0.00000001);

          if (qtyDrift > qtyTolerance) {
            console.warn(`⚠️ BINANCE MASTER OVERRIDE: ${binancePos.symbol} qty ${totalDbQty.toFixed(8)} → ${absQuantity.toFixed(8)} across ${matchingPositions.length} DB row(s)`);
          }

          for (let index = 0; index < matchingPositions.length; index += 1) {
            const dbPos = matchingPositions[index];
            const syncedQty = distributedQuantities[index];
            const syncedPnl = calculatePositionPnl(side, currentPrice, binanceEntryPrice, syncedQty);

            console.log(
              `Syncing Binance-master ${binancePos.symbol} (slot: ${dbPos.slot_id || 'legacy'}): ` +
              `dbQty ${Number(dbPos.quantity || 0)}, syncedQty ${syncedQty}, dbEntry ${Number(dbPos.entry_price || 0)}, ` +
              `binanceEntry ${binanceEntryPrice}, price ${currentPrice}, pnl ${syncedPnl.toFixed(8)}`
            );

            let updateData: any = {
              side,
              quantity: syncedQty,
              entry_price: binanceEntryPrice,
              current_price: currentPrice,
              unrealized_pnl: syncedPnl,
              updated_at: syncTimestamp,
            };

            if (!dbPos.indicators_snapshot) {
              const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
              const { data: recentSignals } = await supabaseClient
                .from('scan_results')
                .select('*')
                .eq('user_id', userId)
                .eq('symbol', binancePos.symbol)
                .eq('signal', side)
                .gte('created_at', tenMinutesAgo)
                .order('created_at', { ascending: false })
                .limit(1);

              if (recentSignals && recentSignals.length > 0) {
                const signal = recentSignals[0];
                const indicators = signal.indicators as any;
                updateData.indicators_snapshot = signal.indicators;
                updateData.open_reason = `${side} signal på ${binancePos.symbol} - ` +
                  `Trend: ${indicators.trend || 'UNKNOWN'}. ` +
                  `RSI: ${indicators.rsi?.toFixed(2) || 'N/A'}, ` +
                  `MACD: ${indicators.macd?.toFixed(4) || 'N/A'}, ` +
                  `EMA: Fast ${indicators.emaFast?.toFixed(2) || 'N/A'} vs Slow ${indicators.emaSlow?.toFixed(2) || 'N/A'}, ` +
                  `ADX: ${indicators.adx?.toFixed(2) || 'N/A'}`;
              }
            }

            const { error } = await supabaseClient
              .from('positions')
              .update(updateData)
              .eq('id', dbPos.id);

            if (error) {
              console.error('Update error:', error);
            } else {
              updates.push({
                symbol: binancePos.symbol,
                action: 'binance_master_synced',
                id: dbPos.id,
                quantity: syncedQty,
                entry_price: binanceEntryPrice,
                pnl: syncedPnl,
              });
            }
          }
        } else {
          // 🟢 BINANCE ER MASTER: Alle Binance-positioner SKAL trackes i DB
          console.log(`Fandt ny Binance position: ${binancePos.symbol} - søger efter bot-signal for slot-tildeling...`);
          
          const entryPrice = parseFloat(binancePos.entryPrice);
          const binanceLeverage = binancePos.leverage ? parseInt(binancePos.leverage) : null;
          
          // Get user's active slots for slot assignment
          const { data: activeSlots } = await supabaseClient
            .from('strategy_slots')
            .select('id, config_id, name, capital_percent, indicator_config:config_id(position_size_percent, risk_per_trade_percent, leverage, atr_stop_loss_multiplier)')
            .eq('user_id', userId)
            .eq('is_active', true);
          
          // Get user's indicator config for leverage fallback
          const { data: userConfig } = await supabaseClient
            .from('indicator_config')
            .select('atr_stop_loss_multiplier, leverage')
            .eq('user_id', userId)
            .limit(1)
            .single();
          
          const leverageUsed = binanceLeverage ?? userConfig?.leverage ?? null;
          
          // Check if bot detected a signal for this symbol recently (within last 10 minutes)
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const { data: recentSignals } = await supabaseClient
            .from('scan_results')
            .select('*, slot_id')
            .eq('user_id', userId)
            .eq('symbol', binancePos.symbol)
            .eq('signal', side)
            .gte('created_at', tenMinutesAgo)
            .order('created_at', { ascending: false })
            .limit(1);
          
          let signalSlotId: string | null = null;
          let signalSlotName = 'Unassigned';
          let indicators: any = null;
          let hasValidSignal = false;
          
          if (recentSignals && recentSignals.length > 0) {
            const signal = recentSignals[0];
            indicators = signal.indicators as any;
            signalSlotId = signal.slot_id || null;
            
            const matchedSlot = activeSlots?.find(s => s.id === signalSlotId) || null;
            signalSlotName = matchedSlot?.name || 'Unknown';
            hasValidSignal = indicators && indicators.atr && indicators.atr > 0;
            
            if (hasValidSignal) {
              console.log(`✅ Bot-signal fundet for ${binancePos.symbol} → slot ${signalSlotName}`);
            } else {
              console.warn(`⚠️ Bot-signal fundet men ATR ugyldig for ${binancePos.symbol}`);
            }
          } else {
            console.warn(`⚠️ Ingen bot-signal for ${binancePos.symbol} - tildeles som SYNCED_UNASSIGNED`);
            
            // Try to find the best slot by checking which slot has open capacity
            // and matches the position's characteristics
            if (activeSlots && activeSlots.length > 0) {
              // Check which slots already have this symbol open
              const { data: existingSlotPositions } = await supabaseClient
                .from('positions')
                .select('slot_id')
                .eq('user_id', userId)
                .eq('status', 'OPEN');
              
              const slotsWithPositions = new Set(existingSlotPositions?.map(p => p.slot_id).filter(Boolean) || []);
              
              // Find first active slot without a position
              const availableSlot = activeSlots.find(s => !slotsWithPositions.has(s.id));
              if (availableSlot) {
                signalSlotId = availableSlot.id;
                signalSlotName = availableSlot.name;
                console.log(`📌 Auto-tildelt til ledig slot: ${signalSlotName}`);
              }
            }
          }
          
          // Build indicators snapshot
          const indicatorsSnapshot = hasValidSignal ? {
            ...indicators,
            is_synced_position: true,
            exit_type: 'ATR_BASED',
            leverage: leverageUsed,
            slot_id: signalSlotId,
            slot_name: signalSlotName,
          } : {
            is_synced_position: true,
            exit_type: 'FALLBACK_SL',
            leverage: leverageUsed,
            slot_id: signalSlotId,
            slot_name: signalSlotName,
            synced_without_signal: true,
          };
          
          // Calculate stop loss
          let stopLoss: number;
          if (hasValidSignal && indicators.stop_loss && indicators.stop_loss > 0) {
            stopLoss = indicators.stop_loss;
            console.log(`✅ Using bot signal SL: ${stopLoss.toFixed(4)}`);
          } else if (hasValidSignal && indicators.atr > 0) {
            const slMultiplier = userConfig?.atr_stop_loss_multiplier ?? 2.0;
            stopLoss = side === 'LONG' 
              ? entryPrice - (indicators.atr * slMultiplier)
              : entryPrice + (indicators.atr * slMultiplier);
            console.log(`✅ ATR-baseret SL: ${stopLoss.toFixed(4)}`);
          } else {
            // Fallback 3% SL when no signal data
            const defaultSlPercent = 3.0;
            stopLoss = side === 'LONG'
              ? entryPrice * (1 - defaultSlPercent / 100)
              : entryPrice * (1 + defaultSlPercent / 100);
            console.log(`⚠️ Fallback 3% SL: ${stopLoss.toFixed(4)} (ingen signal-data)`);
          }
          
          const openReason = hasValidSignal
            ? `${side} signal på ${binancePos.symbol} - ` +
              `Trend: ${indicators.trend || 'UNKNOWN'}. ` +
              `RSI: ${indicators.rsi?.toFixed(2) || 'N/A'}, ` +
              `MACD: ${indicators.macd?.toFixed(4) || 'N/A'}, ` +
              `EMA: Fast ${indicators.emaFast?.toFixed(2) || 'N/A'} vs Slow ${indicators.emaSlow?.toFixed(2) || 'N/A'}, ` +
              `ADX: ${indicators.adx?.toFixed(2) || 'N/A'}`
            : `SYNCED from Binance - ${side} ${binancePos.symbol} (no bot signal, auto-assigned to ${signalSlotName})`;
          
          console.log(`✅ Opretter Binance-master position: ${binancePos.symbol} ${side} qty=${absQuantity} slot=${signalSlotName}`);
          
          const positionData: any = {
            user_id: userId,
            symbol: binancePos.symbol,
            side,
            entry_price: entryPrice,
            quantity: absQuantity,
            current_price: currentPrice,
            peak_price: currentPrice,
            stop_loss: stopLoss,
            trailing_stop: stopLoss,
            trailing_stop_percent: 2.0,
            unrealized_pnl: unrealizedPnl,
            status: 'OPEN',
            open_reason: openReason,
            indicators_snapshot: indicatorsSnapshot,
          };
          
          if (signalSlotId) {
            positionData.slot_id = signalSlotId;
          }
          
          const { error } = await supabaseClient
            .from('positions')
            .insert(positionData);
          
          if (error) console.error('Insert error:', error);
          updates.push({ symbol: binancePos.symbol, action: hasValidSignal ? 'created_with_signal' : 'created_synced_master', slot: signalSlotName, stop_loss: stopLoss });
        }
      }

      // Close positions that are no longer on Binance
      if (dbPositions) {
        for (const dbPos of dbPositions) {
          if (!binanceSymbols.has(dbPos.symbol)) {
            // Only process if still OPEN (don't overwrite if already closed by monitor/manual)
            if (dbPos.status !== 'OPEN') {
              console.log(`Skipping ${dbPos.symbol} - already closed with reason: ${dbPos.close_reason}`);
              continue;
            }
            
            console.log(`Closing position ${dbPos.symbol} - not found on Binance (was closed externally)`);
            const nowIso = new Date().toISOString();

            // Best-effort snapshot price for history
            const exitPrice = await getCurrentPrice(dbPos.symbol, supabaseClient);
            const qty = Number(dbPos.quantity) || 0;
            const entry = Number(dbPos.entry_price) || 0;
            const sideDb = dbPos.side as 'LONG' | 'SHORT';

            // Try to infer reason from Binance recent orders first, then fallback to SL/TP thresholds
            let inferredReason: 'EXTERNAL_CLOSE' | 'STOP_LOSS_HIT' | 'TAKE_PROFIT_HIT' | 'TRAILING_STOP_HIT' = await getRecentCloseReason(dbPos.symbol, apiKey!, apiSecret!);
            if (inferredReason === 'EXTERNAL_CLOSE') {
              if (sideDb === 'LONG') {
                if (dbPos.stop_loss && exitPrice <= Number(dbPos.stop_loss)) inferredReason = 'STOP_LOSS_HIT';
                else if (dbPos.take_profit && exitPrice >= Number(dbPos.take_profit)) inferredReason = 'TAKE_PROFIT_HIT';
              } else {
                if (dbPos.stop_loss && exitPrice >= Number(dbPos.stop_loss)) inferredReason = 'STOP_LOSS_HIT';
                else if (dbPos.take_profit && exitPrice <= Number(dbPos.take_profit)) inferredReason = 'TAKE_PROFIT_HIT';
              }
            }

            const pnlRaw = sideDb === 'LONG' ? (exitPrice - entry) * qty : (entry - exitPrice) * qty;
            const positionValue = entry * qty || 1;
            const pnlPct = (pnlRaw / positionValue) * 100;
            const durationMin = dbPos.opened_at ? Math.floor((Date.now() - new Date(dbPos.opened_at).getTime()) / (1000 * 60)) : null;
            
            const { data: updatedRows } = await supabaseClient
              .from('positions')
              .update({
                status: 'CLOSED',
                closed_at: nowIso,
                close_reason: inferredReason,
              })
              .eq('id', dbPos.id)
              .eq('status', 'OPEN')
              .select('id'); // Only update if still OPEN
            
            // Insert trade history only if we actually changed the row (avoids duplicates)
            if (updatedRows && updatedRows.length > 0) {
              // Get leverage from indicators_snapshot or user config
              const snapshotLev = (dbPos.indicators_snapshot as any)?.leverage;
              let leverageUsed: number | null = snapshotLev != null ? Number(snapshotLev) : null;
              
              // If no leverage in snapshot, try to get from user's active config
              if (leverageUsed == null) {
                const { data: userConfig } = await supabaseClient
                  .from('indicator_config')
                  .select('leverage')
                  .eq('user_id', dbPos.user_id)
                  .limit(1)
                  .single();
                leverageUsed = userConfig?.leverage ?? null;
              }
              
              console.log(`[SYNC] Trade history for ${dbPos.symbol}: leverage_used=${leverageUsed}`);
              
              await supabaseClient
                .from('trade_history')
                .insert({
                  user_id: dbPos.user_id,
                  symbol: dbPos.symbol,
                  side: dbPos.side,
                  entry_price: entry,
                  exit_price: exitPrice,
                  quantity: qty,
                  pnl: pnlRaw,
                  pnl_percent: pnlPct,
                  opened_at: dbPos.opened_at,
                  closed_at: nowIso,
                  duration_minutes: durationMin,
                  strategy_hash: dbPos.strategy_hash,
                  open_reason: dbPos.open_reason,
                  close_reason: inferredReason,
                  leverage_used: leverageUsed,
                  indicators_snapshot: dbPos.indicators_snapshot,
                  slot_id: dbPos.slot_id,
                  low_price: dbPos.low_price,
                  mae: dbPos.low_price && sideDb === 'LONG' ? entry - Number(dbPos.low_price) : 
                       dbPos.low_price && sideDb === 'SHORT' ? Number(dbPos.low_price) - entry : null,
                  // Fee fields left null for sync-closed positions (no API call to get historical fees)
                  entry_fee: null,
                  exit_fee: null,
                  total_fee: null,
                  funding_fee: null,
                  net_pnl: null,
                  fees_data_missing: true,
                });

              updates.push({ symbol: dbPos.symbol, action: 'closed', id: dbPos.id });
            } else {
              console.log(`No update applied for ${dbPos.symbol} (already closed)`);
            }
          }
        }
      }

      // 🛡️ CRITICAL SAFETY: Validate positions have SL set (but respect break-even positions!)
      const { data: openPositions } = await supabaseClient
        .from('positions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'OPEN');

      if (openPositions && openPositions.length > 0) {
        for (const pos of openPositions) {
          const entryPrice = Number(pos.entry_price);
          const currentSL = pos.stop_loss ? Number(pos.stop_loss) : null;
          const side = pos.side as 'LONG' | 'SHORT';
          const breakEvenActivated = pos.break_even_activated === true;
          
          let needsFix = false;
          let fixReason = '';
          
          // ONLY fix if SL is completely missing or invalid
          // NEVER touch SL if break_even is activated (it's intentionally moved to profit side)
          if (breakEvenActivated) {
            // Break-even is active - SL should be at or better than entry
            // Do NOT "correct" this - it's intentional!
            continue;
          }
          
          // Only fix completely missing/invalid stop losses
          if (!currentSL || isNaN(currentSL) || !isFinite(currentSL) || currentSL <= 0) {
            needsFix = true;
            fixReason = `missing/invalid (was: ${currentSL})`;
          }
          // For positions WITHOUT break-even, check SL is on the correct (loss) side
          // LONG: SL should be below entry (loss if price drops)
          // SHORT: SL should be above entry (loss if price rises)
          else if (side === 'LONG' && currentSL > entryPrice) {
            // SL above entry for LONG is wrong (that's the profit side)
            needsFix = true;
            fixReason = `incorrectly on profit side for LONG without BE (SL ${currentSL.toFixed(4)} > entry ${entryPrice.toFixed(4)})`;
          }
          else if (side === 'SHORT' && currentSL < entryPrice) {
            // SL below entry for SHORT is wrong (that's the profit side) - unless BE is active
            needsFix = true;
            fixReason = `incorrectly on profit side for SHORT without BE (SL ${currentSL.toFixed(4)} < entry ${entryPrice.toFixed(4)})`;
          }
          
          if (needsFix) {
            // Calculate correct SL using 3% safety margin on the LOSS side
            const defaultSlPercent = 3.0;
            let correctedSL: number;
            
            if (side === 'LONG') {
              correctedSL = entryPrice * (1 - defaultSlPercent / 100);
            } else {
              correctedSL = entryPrice * (1 + defaultSlPercent / 100);
            }
            
            console.log(`🛡️ SAFETY FIX: ${pos.symbol} ${side} - SL was ${fixReason}, correcting to ${correctedSL.toFixed(6)}`);
            
            // ONLY update stop_loss, NOT trailing_stop (let monitor-positions handle trailing)
            await supabaseClient
              .from('positions')
              .update({
                stop_loss: correctedSL,
                updated_at: new Date().toISOString(),
              })
              .eq('id', pos.id);
            
            updates.push({ 
              symbol: pos.symbol, 
              action: 'sl_corrected', 
              reason: fixReason,
              new_sl: correctedSL 
            });
          }
        }
      }

      allUpdates.push({
        userId: userId,
        updates: updates,
      });
    }

    console.log(`Sync completed - Updated ${allUpdates.length} users`);

    return new Response(JSON.stringify({ 
      success: true, 
      userUpdates: allUpdates,
      totalPositions: (await getBinancePositions(apiKey, apiSecret)).length,
      balance: {
        totalMarginBalance,
        totalWalletBalance,
        totalUnrealizedProfit,
        availableBalance,
      },
    }), {
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