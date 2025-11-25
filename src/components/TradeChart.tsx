import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Scatter, ScatterChart, ComposedChart } from "recharts";
import { Loader2, X } from "lucide-react";

interface TradeChartProps {
  trade: any;
}

export const TradeChart = ({ trade }: TradeChartProps) => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        
        console.log('Trailing Stop Activation Config:', {
          enabled: trailingStopActivationEnabled,
          activationAtr: trailingStopActivationAtr,
          breakEvenAtr: breakEvenAtr,
          atr: atrValue,
        });
        
        // Start altid fra entry price for at vise trailing stop evolution korrekt
        let peakPrice = entryPrice;
        let currentStopLoss = stopLoss;
        let breakEvenActivated = false;
        
        const data = klines.map((k: any, index: number) => {
          const timestamp = k[0];
          const price = parseFloat(k[4]); // Close price
          const high = parseFloat(k[2]);
          const low = parseFloat(k[3]);
          
          // Trailing stop og effective stop beregnes løbende efter position åbnes
          let trailingStop = null;
          let effectiveStop = currentStopLoss;
          
          if (timestamp >= openTime) {
            // VIGTIGT: Brug KUN close price (ikke high/low) for at matche backend monitor logik
            // Backend monitor bruger currentPrice (close) til at opdatere peak, ikke high/low
            
            // Beregn profit i ATR units korrekt for LONG vs SHORT
            const profitInAtr = side === 'LONG' 
              ? (price - entryPrice) / atrValue 
              : (entryPrice - price) / atrValue;
            
            // Check break-even activation FØRST (matches backend logic)
            if (!breakEvenActivated) {
              const breakEvenDistance = breakEvenAtr * atrValue;
              const breakEvenReached = side === 'LONG'
                ? price >= (entryPrice + breakEvenDistance)
                : price <= (entryPrice - breakEvenDistance);
              
              if (breakEvenReached) {
                currentStopLoss = entryPrice;
                breakEvenActivated = true;
                effectiveStop = currentStopLoss;
              }
            }
            
            // Update peak price
            if (side === 'LONG' && price > peakPrice) {
              peakPrice = price;
            } else if (side === 'SHORT' && price < peakPrice) {
              peakPrice = price;
            }
            
            // Tjek om trailing stop skal være aktiv baseret på profit
            const trailingStopActive = !trailingStopActivationEnabled || (profitInAtr >= trailingStopActivationAtr);
            
            // Beregn trailing stop fra peak KUN hvis aktiveret
            if (trailingStopActive) {
              if (side === 'LONG') {
                const calculatedTrailing = peakPrice * (1 - trailingPercent / 100);
                trailingStop = currentStopLoss ? Math.max(calculatedTrailing, currentStopLoss) : calculatedTrailing;
              } else {
                const calculatedTrailing = peakPrice * (1 + trailingPercent / 100);
                trailingStop = currentStopLoss ? Math.min(calculatedTrailing, currentStopLoss) : calculatedTrailing;
              }
              // Opdater currentStopLoss så trailing kun kan bevæge sig én vej
              currentStopLoss = trailingStop;
              effectiveStop = trailingStop;
            } else {
              effectiveStop = currentStopLoss;
            }
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
          };
        });
        
        console.log('First 5 data points:', data.slice(0, 5));
        console.log('Last 5 data points:', data.slice(-5));
        
        // Find closest data point to entry time
        const entryPoint = data.reduce((closest, current) => {
          const closestDiff = Math.abs(closest.timestamp - openTime);
          const currentDiff = Math.abs(current.timestamp - openTime);
          return currentDiff < closestDiff ? current : closest;
        }, data[0]);
        
        // Only find exit point if position is actually closed
        const isPositionClosed = trade.status === 'CLOSED';
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

  // Check if position is actually closed
  const isPositionClosed = trade.status === 'CLOSED';

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

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="time" 
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
        />
        <YAxis 
          domain={['auto', 'auto']}
          tick={{ fontSize: 10 }}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '4px' }}
          labelStyle={{ color: '#fff' }}
        />
        <Legend />
        
        {/* Price line */}
        <Line 
          type="monotone" 
          dataKey="price" 
          stroke="#8884d8" 
          strokeWidth={2}
          dot={false}
          name="Price"
        />
        
        {/* Effective Stop line - den rigtige stop der gælder (bedste af SL/break-even/trailing) */}
        <Line 
          type="stepAfter" 
          dataKey="effectiveStop" 
          stroke="#f59e0b" 
          strokeWidth={3}
          strokeDasharray="5 3"
          dot={false}
          name="Effective Stop"
          connectNulls={false}
        />
        
        {/* Break-even line (shows when BE is activated) */}
        <Line 
          type="stepAfter" 
          dataKey="breakEven" 
          stroke="#8b5cf6" 
          strokeWidth={2}
          strokeDasharray="2 2"
          strokeOpacity={0.6}
          dot={false}
          name="Break-Even"
          connectNulls={false}
        />
        
        {/* Entry marker (X) */}
        <Scatter 
          dataKey="entryMarker" 
          fill="#10b981" 
          shape={<CustomShape />}
          name="Entry"
        />
        
        {/* Exit marker (X) - only show if position is closed */}
        {isPositionClosed && (
          <Scatter 
            dataKey="exitMarker" 
            fill="#ef4444" 
            shape={<CustomShape />}
            name="Exit"
          />
        )}
        
        {/* Entry price line */}
        <ReferenceLine 
          y={trade.entry_price} 
          stroke="#10b981" 
          strokeDasharray="5 5"
          strokeOpacity={0.5}
          label="Entry"
        />
        
        {/* Take Profit line */}
        <ReferenceLine 
          y={trade.take_profit} 
          stroke="#10b981" 
          strokeWidth={2}
          strokeDasharray="5 5"
          strokeOpacity={0.9}
          label={{ value: "TP", fill: "#10b981", fontSize: 12, fontWeight: "bold" }}
        />
        
        {/* Stop Loss line */}
        <ReferenceLine 
          y={trade.stop_loss || trade.indicators_snapshot?.stop_loss} 
          stroke="#ef4444" 
          strokeWidth={2}
          strokeDasharray="3 3"
          strokeOpacity={0.9}
          label={{ value: "SL", fill: "#ef4444", fontSize: 12, fontWeight: "bold" }}
        />
        
        {/* Exit price line - only show if position is closed */}
        {isPositionClosed && trade.exit_price != null && (
          <ReferenceLine 
            y={trade.exit_price} 
            stroke="#ef4444" 
            strokeDasharray="5 5"
            strokeOpacity={0.5}
            label="Exit"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
};
