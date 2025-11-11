import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { Loader2 } from "lucide-react";

interface TradeChartProps {
  trade: any;
}

export const TradeChart = ({ trade }: TradeChartProps) => {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKlines = async () => {
      try {
        // Calculate time range: 30 min before entry to 30 min after exit
        const openTime = new Date(trade.opened_at).getTime();
        const closeTime = new Date(trade.closed_at).getTime();
        const startTime = openTime - (30 * 60 * 1000); // 30 min before
        const endTime = closeTime + (30 * 60 * 1000); // 30 min after
        
        // Fetch 1-minute klines from Binance
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${trade.symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=500`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error('Failed to fetch chart data');
        }
        
        const klines = await response.json();
        
        // Transform to chart data
        const data = klines.map((k: any) => ({
          time: new Date(k[0]).toLocaleTimeString("da-DK", { hour: '2-digit', minute: '2-digit' }),
          timestamp: k[0],
          price: parseFloat(k[4]), // Close price
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
        }));
        
        setChartData(data);
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

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
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
        
        {/* Entry price line */}
        <ReferenceLine 
          y={trade.entry_price} 
          stroke="#10b981" 
          strokeDasharray="5 5"
          label={{ value: 'Entry', position: 'insideTopRight', fill: '#10b981', fontSize: 12 }}
        />
        
        {/* Exit price line */}
        <ReferenceLine 
          y={trade.exit_price} 
          stroke="#ef4444" 
          strokeDasharray="5 5"
          label={{ value: 'Exit', position: 'insideBottomRight', fill: '#ef4444', fontSize: 12 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
