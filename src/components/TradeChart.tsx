import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Scatter, ScatterChart, ComposedChart } from "recharts";
import { Loader2, X } from "lucide-react";

interface TradeChartProps {
  trade: any;
}

export const TradeChart = ({ trade }: TradeChartProps) => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markers, setMarkers] = useState<{
    breakEvenAt: number | null;
    trailingAt: number | null;
    peakLockAt: number | null;
  }>({ breakEvenAt: null, trailingAt: null, peakLockAt: null });

  useEffect(() => {
    const fetchKlines = async () => {
      try {
        // Calculate time range: 30 min before entry to 30 min after exit (or now if still open)
        const openTime = new Date(trade.opened_at).getTime();
        const closeTime = trade.closed_at ? new Date(trade.closed_at).getTime() : Date.now();
        const startTime = openTime - (30 * 60 * 1000); // 30 min before
        const endTime = closeTime + (30 * 60 * 1000); // 30 min after
        
        console.log('Trade details:', {
          symbol: trade.symbol,
          side: trade.side,
          entry_price: trade.entry_price,
          peak_price: trade.peak_price,
          trailing_percent: trade.trailing_stop_percent,
          openTime: new Date(openTime).toISOString(),
        });
        
        // Fetch 1-minute klines from Binance
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${trade.symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=500`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error('Failed to fetch chart data');
        }
        
        const klines = await response.json();
        
        // Transform to chart data and calculate trailing stop dynamically
        const entryPrice = Number(trade.entry_price);
        const trailingPercent = Number(trade.trailing_stop_percent) || 2.0;
        const side = trade.side as 'LONG' | 'SHORT';
        const stopLoss = Number(trade.stop_loss);
        
        // Hent trailing stop aktiverings-parametre fra indicators_snapshot
        const trailingStopActivationEnabled = trade.indicators_snapshot?.trailing_stop_activation_enabled ?? true;
        const trailingStopActivationAtr = Number(trade.indicators_snapshot?.trailing_stop_activation_atr) || 1.0;
        const atrValue = Number(trade.indicators_snapshot?.atr) || (entryPrice * 0.01);
        const breakEvenAtr = Number(trade.indicators_snapshot?.break_even_atr) || 1.5;
        
        // Peak-Lock konfiguration
        const peakLockEnabled = trade.indicators_snapshot?.peak_lock_enabled ?? false;
        const peakLockActivateProfitPct = Number(trade.indicators_snapshot?.peak_lock_activate_profit_pct) || 0.6;
        const peakLockDistancePct = Number(trade.indicators_snapshot?.peak_lock_distance_pct) || 0.35;
        const peakLockMinProfitFloorPct = Number(trade.indicators_snapshot?.peak_lock_min_profit_floor_pct) || 0.15;
        const peakLockRatchetOnly = trade.indicators_snapshot?.peak_lock_ratchet_only ?? true;
        
        console.log('Trailing Stop Activation Config:', {
          enabled: trailingStopActivationEnabled,
          activationAtr: trailingStopActivationAtr,
          breakEvenAtr: breakEvenAtr,
          atr: atrValue,
          peakLockEnabled,
        });
        
        // Start altid fra entry price for at vise trailing stop evolution korrekt
        let peakPrice = entryPrice;
        let currentStopLoss = stopLoss;
        let breakEvenActivated = false;
        let peakLockActivated = false;
        let peakLockStopValue: number | null = null;
        
        // Aktiverings-tidspunkter (ms) til vertikale markører
        let trailingStopActivatedAt: number | null = null;
        let peakLockActivatedAt: number | null = null;
        let breakEvenActivatedAt: number | null = null;

        const data = klines.map((k: any, index: number) => {
          const timestamp = k[0];
          const price = parseFloat(k[4]); // Close price
          const high = parseFloat(k[2]);
          const low = parseFloat(k[3]);
          
          // Trailing stop og effective stop beregnes løbende efter position åbnes
          let trailingStop = null;
          let effectiveStop: number | null = null; // Start med null før position åbnes
          
          if (timestamp >= openTime) {
            // VIGTIGT: Brug KUN close price (ikke high/low) for at matche backend monitor logik
            // Backend monitor bruger currentPrice (close) til at opdatere peak, ikke high/low
            
            // Sæt initial effective stop til currentStopLoss når positionen åbner
            effectiveStop = currentStopLoss;
            
            // Beregn profit i ATR units korrekt for LONG vs SHORT
            const profitInAtr = side === 'LONG'
              ? (price - entryPrice) / atrValue
              : (entryPrice - price) / atrValue;
            const isInProfit = profitInAtr > 0;

            // Break-even (UI-drevet): trigger + stop offset
            const breakEvenStopOffsetAtr = Number(trade.indicators_snapshot?.break_even_atr_stop_offset) || 0;
            const breakEvenStopOffset = breakEvenStopOffsetAtr * atrValue;

            if (!breakEvenActivated) {
              const breakEvenDistance = breakEvenAtr * atrValue;
              const breakEvenReached = side === 'LONG'
                ? price >= (entryPrice + breakEvenDistance)
                : price <= (entryPrice - breakEvenDistance);

              if (breakEvenReached) {
                // LONG: entry + offset (aldrig under entry)
                // SHORT: entry - offset (aldrig over entry)
                const beStop = side === 'LONG'
                  ? Math.max(entryPrice + breakEvenStopOffset, entryPrice)
                  : Math.min(entryPrice - breakEvenStopOffset, entryPrice);

                currentStopLoss = beStop;
                breakEvenActivated = true;
                breakEvenActivatedTime = new Date(timestamp).toLocaleTimeString("da-DK", { hour: '2-digit', minute: '2-digit' });
                effectiveStop = currentStopLoss;
              }
            }

            // Update peak price
            if (side === 'LONG' && price > peakPrice) {
              peakPrice = price;
            } else if (side === 'SHORT' && price < peakPrice) {
              peakPrice = price;
            }

            // Trailing må kun aktiveres efter BE + i profit + threshold
            const trailingStopActive = breakEvenActivated && isInProfit && (!trailingStopActivationEnabled || (profitInAtr >= trailingStopActivationAtr));
            const wasTrailingStopActiveBeforeThisCandle = trailingStopActivatedAt !== null;

            if (trailingStopActive) {
              // Registrer aktiveringstidspunkt første gang trailing stop aktiveres
              if (!wasTrailingStopActiveBeforeThisCandle) {
                trailingStopActivatedAt = timestamp;
              }

              if (side === 'LONG') {
                const calculatedTrailing = peakPrice * (1 - trailingPercent / 100);
                // Trailing må kun ratchete OP for LONG (aldrig ned)
                trailingStop = currentStopLoss ? Math.max(calculatedTrailing, currentStopLoss) : calculatedTrailing;
              } else {
                const calculatedTrailing = peakPrice * (1 + trailingPercent / 100);
                // Trailing må kun ratchete NED for SHORT (aldrig op)
                trailingStop = currentStopLoss ? Math.min(calculatedTrailing, currentStopLoss) : calculatedTrailing;
              }

              // KRAV: trailing skal være i profit-zonen (strikt)
              const tsInProfitZone = side === 'LONG' ? trailingStop > entryPrice : trailingStop < entryPrice;
              if (tsInProfitZone) {
                // RATCHET: For LONG, opdater kun hvis trailingStop er HØJERE end currentStopLoss
                // For SHORT, opdater kun hvis trailingStop er LAVERE end currentStopLoss
                const shouldRatchet = side === 'LONG'
                  ? trailingStop > currentStopLoss
                  : trailingStop < currentStopLoss;
                
                if (shouldRatchet) {
                  currentStopLoss = trailingStop;
                }
                effectiveStop = currentStopLoss; // Altid vis det aktuelle (ratcheted) stop
              } else {
                trailingStop = null;
                effectiveStop = currentStopLoss;
              }
            }
            
            // 🔒 Peak-Lock Trailing logik
            const wasPeakLockActiveBeforeThisCandle = peakLockActivatedTime !== null;
            if (peakLockEnabled && breakEvenActivated) {
              const profitPct = side === 'LONG'
                ? ((price - entryPrice) / entryPrice) * 100
                : ((entryPrice - price) / entryPrice) * 100;
              
              if (profitPct >= peakLockActivateProfitPct) {
                // Registrer aktiveringstidspunkt første gang peak-lock aktiveres
                if (!wasPeakLockActiveBeforeThisCandle) {
                  peakLockActivatedTime = new Date(timestamp).toLocaleTimeString("da-DK", { hour: '2-digit', minute: '2-digit' });
                }
                peakLockActivated = true;
                
                // Beregn peak-lock stop
                const peakLockStop = side === 'LONG'
                  ? peakPrice * (1 - peakLockDistancePct / 100)
                  : peakPrice * (1 + peakLockDistancePct / 100);
                
                // Profit floor stop
                const profitFloorStop = side === 'LONG'
                  ? entryPrice * (1 + peakLockMinProfitFloorPct / 100)
                  : entryPrice * (1 - peakLockMinProfitFloorPct / 100);
                
                // Kandidat stop = max af peak-lock og floor
                const candidateStop = side === 'LONG'
                  ? Math.max(peakLockStop, profitFloorStop)
                  : Math.min(peakLockStop, profitFloorStop);
                
                // Gem peak-lock stop til visning
                peakLockStopValue = candidateStop;
                
                // Kombinér med eksisterende stop
                const newStop = side === 'LONG'
                  ? Math.max(currentStopLoss, candidateStop)
                  : Math.min(currentStopLoss, candidateStop);
                
                // Ratchet only
                if (peakLockRatchetOnly) {
                  const shouldRatchet = side === 'LONG'
                    ? newStop > currentStopLoss
                    : newStop < currentStopLoss;
                  if (shouldRatchet) {
                    currentStopLoss = newStop;
                  }
                } else {
                  currentStopLoss = newStop;
                }
                
                effectiveStop = currentStopLoss;
              }
            }
            // Hvis trailing ikke er aktiv, brug currentStopLoss (SL eller BE)
          }
          
          return {
            time: new Date(timestamp).toLocaleTimeString("da-DK", { hour: '2-digit', minute: '2-digit' }),
            timestamp,
            price,
            high,
            low,
            trailingStop,
            effectiveStop,
            breakEven: breakEvenActivated ? entryPrice : null,
            peakLockStop: peakLockActivated ? peakLockStopValue : null,
          };
        });
        
        console.log('First 5 data points:', data.slice(0, 5));
        console.log('Last 5 data points:', data.slice(-5));
        console.log('Activation times (ms):', { trailingStopActivatedAt, peakLockActivatedAt, breakEvenActivatedAt });

        // Find closest data point to entry time
        const entryPoint = data.reduce((closest, current) => {
          const closestDiff = Math.abs(closest.timestamp - openTime);
          const currentDiff = Math.abs(current.timestamp - openTime);
          return currentDiff < closestDiff ? current : closest;
        }, data[0]);
        
        // Only find exit point if position is actually closed
        // Check multiple indicators: status, closed_at, or exit_price
        const isPositionClosed = trade.status === 'CLOSED' || trade.closed_at != null || trade.exit_price != null;
        let exitPoint = null;
        if (isPositionClosed) {
          exitPoint = data.reduce((closest, current) => {
            const closestDiff = Math.abs(closest.timestamp - closeTime);
            const currentDiff = Math.abs(current.timestamp - closeTime);
            return currentDiff < closestDiff ? current : closest;
          }, data[0]);
        }
        
        // Add markers to data - only add exit marker if position is closed
        const dataWithMarkers = data.map(d => ({
          ...d,
          entryMarker: d.timestamp === entryPoint.timestamp ? trade.entry_price : null,
          exitMarker: isPositionClosed && exitPoint && d.timestamp === exitPoint.timestamp ? trade.exit_price : null,
          // Aktiveringsmarkører - vis kun på det tidspunkt de aktiveres
          trailingActivationMarker: d.time === trailingStopActivatedTime ? 'trailing' : null,
          peakLockActivationMarker: d.time === peakLockActivatedTime ? 'peakLock' : null,
          breakEvenActivationMarker: d.time === breakEvenActivatedTime ? 'breakEven' : null,
        }));
        
        setChartData(dataWithMarkers);
      } catch (error) {
        console.error('Error fetching chart data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchKlines();
  }, [trade]);

  if (loading) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        Ingen chart data tilgængelig
      </div>
    );
  }

  // Check if position is actually closed - check multiple indicators
  const isPositionClosed = trade.status === 'CLOSED' || trade.closed_at != null || trade.exit_price != null;

  const CustomShape = (props: any) => {
    const { cx, cy, fill } = props;
    const size = 8;
    return (
      <g>
        <line x1={cx - size} y1={cy - size} x2={cx + size} y2={cy + size} stroke={fill} strokeWidth={3} />
        <line x1={cx - size} y1={cy + size} x2={cx + size} y2={cy - size} stroke={fill} strokeWidth={3} />
      </g>
    );
  };

  // Beregn Y-akse range KUN baseret på pris-data og entry - ikke outliers som SL/TP
  const priceValues = chartData.map(d => d.price).filter(p => p != null && isFinite(p) && p > 0);
  const entryPrice = Number(trade.entry_price);
  
  // Inkluder effectiveStop værdier der faktisk vises på grafen
  const effectiveStopValues = chartData
    .map(d => d.effectiveStop)
    .filter(v => v != null && isFinite(v) && v > 0);
  
  // Start med pris-data og entry
  let allRelevantValues = [...priceValues, entryPrice];
  
  // Tilføj effectiveStop værdier kun hvis de er tæt på prisområdet
  if (effectiveStopValues.length > 0) {
    const priceMin = Math.min(...priceValues);
    const priceMax = Math.max(...priceValues);
    const priceRange = priceMax - priceMin;
    const maxAllowedDistance = priceRange * 3; // Max 3x prisrange væk
    
    effectiveStopValues.forEach(v => {
      if (Math.abs(v - entryPrice) <= maxAllowedDistance) {
        allRelevantValues.push(v);
      }
    });
  }
  
  // Tilføj stop_loss KUN hvis det er tæt på entry (inden for 10%)
  const stopLoss = Number(trade.stop_loss);
  if (stopLoss && isFinite(stopLoss) && stopLoss > 0) {
    const distancePercent = Math.abs(stopLoss - entryPrice) / entryPrice * 100;
    if (distancePercent <= 10) {
      allRelevantValues.push(stopLoss);
    }
  }
  
  // Tilføj take profit KUN hvis det er tæt på entry (inden for 10%)
  const takeProfit = Number(trade.take_profit);
  if (takeProfit && isFinite(takeProfit) && takeProfit > 0) {
    const distancePercent = Math.abs(takeProfit - entryPrice) / entryPrice * 100;
    if (distancePercent <= 10) {
      allRelevantValues.push(takeProfit);
    }
  }
  
  // Tilføj exit price hvis lukket
  if (trade.exit_price && isFinite(trade.exit_price) && trade.exit_price > 0) {
    allRelevantValues.push(Number(trade.exit_price));
  }
  
  const minPrice = Math.min(...allRelevantValues);
  const maxPrice = Math.max(...allRelevantValues);
  const priceRangeFinal = maxPrice - minPrice;
  const padding = Math.max(priceRangeFinal * 0.08, entryPrice * 0.002); // Min 0.2% af entry
  
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tick={{ fontSize: 10 }}
          tickFormatter={(value) =>
            new Date(value).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
          }
        />
        <YAxis
          domain={[minPrice - padding, maxPrice + padding]}
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => value.toFixed(entryPrice > 100 ? 2 : 4)}
          width={65}
        />
        <Tooltip
          labelFormatter={(value) =>
            typeof value === "number"
              ? new Date(value).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
              : String(value)
          }
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            padding: "12px",
          }}
          labelStyle={{
            color: "hsl(var(--popover-foreground))",
            fontWeight: "bold",
            marginBottom: "8px",
          }}
          itemStyle={{ color: "hsl(var(--popover-foreground))", padding: "4px 0" }}
        />
        <Legend
          wrapperStyle={{
            paddingTop: "20px",
            fontSize: "14px",
            fontWeight: "600",
          }}
          iconType="line"
        />

        {/* Price line - blå, tykkere */}
        <Line 
          type="monotone" 
          dataKey="price" 
          stroke="#2563eb" 
          strokeWidth={4}
          dot={false}
          name="💰 Pris"
        />
        
        {/* Trailing Stop line - pink/magenta, kun når trailing er aktiv */}
        <Line 
          type="stepAfter" 
          dataKey="trailingStop" 
          stroke="#ec4899" 
          strokeWidth={4}
          strokeDasharray="6 3"
          dot={false}
          name="🎯 Trailing Stop"
          connectNulls={false}
        />
        
        {/* Effective Stop line - orange, viser det aktive stop level */}
        <Line 
          type="stepAfter" 
          dataKey="effectiveStop" 
          stroke="#f97316" 
          strokeWidth={5}
          strokeDasharray="8 4"
          dot={false}
          name="🛑 Aktiv Stop"
          connectNulls={false}
        />
        
        {/* Break-even line - lilla, tydeligt dasharray */}
        <Line 
          type="stepAfter" 
          dataKey="breakEven" 
          stroke="#a855f7" 
          strokeWidth={3}
          strokeDasharray="4 4"
          strokeOpacity={0.9}
          dot={false}
          name="⚖️ Break-Even"
          connectNulls={false}
        />
        
        {/* Peak-Lock Stop line - cyan/turkis, kun når peak-lock er aktiv */}
        <Line 
          type="stepAfter" 
          dataKey="peakLockStop" 
          stroke="#06b6d4" 
          strokeWidth={3}
          strokeDasharray="3 2"
          dot={false}
          name="🔒 Peak-Lock"
          connectNulls={false}
        />
        
        {/* Entry marker (X) - grøn */}
        <Scatter 
          dataKey="entryMarker" 
          fill="#16a34a" 
          shape={<CustomShape />}
          name="📍 Entry"
        />
        
        {/* Exit marker (X) - rød, kun hvis lukket */}
        {isPositionClosed && (
          <Scatter 
            dataKey="exitMarker" 
            fill="#dc2626" 
            shape={<CustomShape />}
            name="🚪 Exit"
          />
        )}
        
        {/* Entry price line - grøn, tydeligt */}
        <ReferenceLine 
          y={trade.entry_price} 
          stroke="#16a34a" 
          strokeWidth={2}
          strokeDasharray="10 5"
          strokeOpacity={0.7}
          label={{ value: "ENTRY", fill: "#16a34a", fontSize: 12, fontWeight: "bold", position: "insideTopRight" }}
        />
        
        {/* Take Profit line - kun hvis sat */}
        {trade.take_profit && trade.take_profit > 0 && (
          <ReferenceLine 
            y={trade.take_profit} 
            stroke="#84cc16" 
            strokeWidth={2}
            strokeDasharray="6 3"
            strokeOpacity={0.8}
            label={{ value: "TAKE PROFIT", fill: "#84cc16", fontSize: 12, fontWeight: "bold", position: "insideTopRight" }}
          />
        )}
        
        {/* Initial Stop Loss line - rød, oprindelig SL (brug original_stop_loss fra snapshot, IKKE den opdaterede stop_loss) */}
        <ReferenceLine 
          y={trade.indicators_snapshot?.original_stop_loss || trade.stop_loss} 
          stroke="#dc2626" 
          strokeWidth={2}
          strokeDasharray="6 3"
          strokeOpacity={0.6}
          label={{ value: "INITIAL SL", fill: "#dc2626", fontSize: 12, fontWeight: "bold", position: "insideBottomRight" }}
        />
        
        {/* Exit price line - kun hvis lukket */}
        {isPositionClosed && trade.exit_price != null && (
          <ReferenceLine 
            y={trade.exit_price} 
            stroke="#dc2626" 
            strokeWidth={2}
            strokeDasharray="3 3"
            strokeOpacity={0.5}
            label={{ value: "EXIT", fill: "#dc2626", fontSize: 12, fontWeight: "bold", position: "insideTopRight" }}
          />
        )}
        
        {/* Vertikale aktiveringsmarkører */}
        {/* Break-Even aktiveret - lilla vertikal linje */}
        {chartData.find(d => d.breakEvenActivationMarker) && (
          <ReferenceLine 
            x={chartData.find(d => d.breakEvenActivationMarker)?.time}
            stroke="#a855f7"
            strokeWidth={2}
            strokeDasharray="4 2"
            strokeOpacity={0.8}
            label={{ value: "⚖️ BE", fill: "#a855f7", fontSize: 10, fontWeight: "bold", position: "insideTop" }}
          />
        )}
        
        {/* Trailing Stop aktiveret - pink/magenta vertikal linje */}
        {chartData.find(d => d.trailingActivationMarker) && (
          <ReferenceLine 
            x={chartData.find(d => d.trailingActivationMarker)?.time}
            stroke="#ec4899"
            strokeWidth={2}
            strokeDasharray="4 2"
            strokeOpacity={0.8}
            label={{ value: "🎯 TS", fill: "#ec4899", fontSize: 10, fontWeight: "bold", position: "insideTop" }}
          />
        )}
        
        {/* Peak-Lock aktiveret - cyan vertikal linje */}
        {chartData.find(d => d.peakLockActivationMarker) && (
          <ReferenceLine 
            x={chartData.find(d => d.peakLockActivationMarker)?.time}
            stroke="#06b6d4"
            strokeWidth={2}
            strokeDasharray="4 2"
            strokeOpacity={0.8}
            label={{ value: "🔒 PL", fill: "#06b6d4", fontSize: 10, fontWeight: "bold", position: "insideTop" }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
};
