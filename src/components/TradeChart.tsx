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
        
        console.log('Trailing Stop Activation Config:', {
          enabled: trailingStopActivationEnabled,
          activationAtr: trailingStopActivationAtr,
          atr: atrValue,
        });
        
        // Start altid fra entry price for at vise trailing stop evolution korrekt
        let peakPrice = entryPrice;
        
        const data = klines.map((k: any, index: number) => {
          const timestamp = k[0];
          const price = parseFloat(k[4]); // Close price
          const high = parseFloat(k[2]);
          const low = parseFloat(k[3]);
          
          // Trailing stop beregnes løbende efter position åbnes
          let trailingStop = null;
          if (timestamp >= openTime) {
            // VIGTIGT: Brug KUN close price (ikke high/low) for at matche backend monitor logik
            // Backend monitor bruger currentPrice (close) til at opdatere peak, ikke high/low
            
            if (side === 'LONG' && price > peakPrice) {
              peakPrice = price;
            } else if (side === 'SHORT' && price < peakPrice) {
              peakPrice = price;
            }
            
            // Beregn profit i ATR units korrekt for LONG vs SHORT
            // For LONG: profit når price > entry (pris stiger)
            // For SHORT: profit når price < entry (pris falder)
            const profitInAtr = side === 'LONG' 
              ? (price - entryPrice) / atrValue 
              : (entryPrice - price) / atrValue;
            
            // Tjek om trailing stop skal være aktiv baseret på profit
            const trailingStopActive = !trailingStopActivationEnabled || (profitInAtr >= trailingStopActivationAtr);
            
            console.log(`[${new Date(timestamp).toLocaleTimeString()}] price: ${price.toFixed(4)}, peak: ${peakPrice.toFixed(4)}, profit: ${profitInAtr.toFixed(2)} ATR, active: ${trailingStopActive}`);
            
            // Beregn trailing stop fra peak KUN hvis aktiveret
            if (trailingStopActive) {
              if (side === 'LONG') {
                trailingStop = peakPrice * (1 - trailingPercent / 100);
              } else {
                trailingStop = peakPrice * (1 + trailingPercent / 100);
              }
            }
          }
          
          return {
            time: new Date(timestamp).toLocaleTimeString("da-DK", { hour: '2-digit', minute: '2-digit' }),
            timestamp,
            price,
            high,
            low,
            trailingStop,
          };
        });
        
        console.log('First 5 data points:', data.slice(0, 5));
        console.log('Last 5 data points:', data.slice(-5));
        
        // Find closest data points to entry and exit times
        const entryPoint = data.reduce((closest, current) => {
          const closestDiff = Math.abs(closest.timestamp - openTime);
          const currentDiff = Math.abs(current.timestamp - openTime);
          return currentDiff < closestDiff ? current : closest;
        }, data[0]);
        
        const exitPoint = data.reduce((closest, current) => {
          const closestDiff = Math.abs(closest.timestamp - closeTime);
          const currentDiff = Math.abs(current.timestamp - closeTime);
          return currentDiff < closestDiff ? current : closest;
        }, data[0]);
        
        // Add markers to data
        const dataWithMarkers = data.map(d => ({
          ...d,
          entryMarker: d.timestamp === entryPoint.timestamp ? trade.entry_price : null,
          exitMarker: d.timestamp === exitPoint.timestamp ? trade.exit_price : null,
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
        
        {/* Trailing Stop line - shows dynamic trailing stop movement */}
        <Line 
          type="stepAfter" 
          dataKey="trailingStop" 
          stroke="#f59e0b" 
          strokeWidth={2}
          strokeDasharray="3 3"
          dot={false}
          name="Trailing Stop"
          connectNulls={false}
        />
        
        {/* Entry marker (X) */}
        <Scatter 
          dataKey="entryMarker" 
          fill="#10b981" 
          shape={<CustomShape />}
          name="Entry"
        />
        
        {/* Exit marker (X) */}
        <Scatter 
          dataKey="exitMarker" 
          fill="#ef4444" 
          shape={<CustomShape />}
          name="Exit"
        />
        
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
          y={trade.stop_loss} 
          stroke="#ef4444" 
          strokeDasharray="3 3"
          strokeOpacity={0.7}
          label="SL"
        />
        
        {/* Exit price line */}
        <ReferenceLine 
          y={trade.exit_price} 
          stroke="#ef4444" 
          strokeDasharray="5 5"
          strokeOpacity={0.5}
          label="Exit"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};
