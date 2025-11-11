import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgradeHeader = req.headers.get("upgrade") || "";
  
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400, headers: corsHeaders });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  // Connect to Binance WebSocket for USDT-M futures
  const binanceSocket = new WebSocket("wss://fstream.binance.com/ws/!ticker@arr");
  
  binanceSocket.onopen = () => {
    console.log("Connected to Binance WebSocket");
  };

  binanceSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Filter for USDT pairs only
      const usdtPairs = data.filter((ticker: any) => 
        ticker.s && ticker.s.endsWith('USDT')
      ).map((ticker: any) => ({
        symbol: ticker.s,
        price: parseFloat(ticker.c),
        change: parseFloat(ticker.P),
        volume: parseFloat(ticker.v),
        high: parseFloat(ticker.h),
        low: parseFloat(ticker.l),
      }));

      if (usdtPairs.length > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(usdtPairs));
      }
    } catch (error) {
      console.error("Error processing Binance data:", error);
    }
  };

  binanceSocket.onerror = (error) => {
    console.error("Binance WebSocket error:", error);
  };

  binanceSocket.onclose = () => {
    console.log("Binance WebSocket closed");
    socket.close();
  };

  socket.onclose = () => {
    console.log("Client disconnected");
    binanceSocket.close();
  };

  return response;
});