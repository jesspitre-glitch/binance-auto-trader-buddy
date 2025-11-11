import { useEffect, useMemo, useRef, useState } from "react";

// Streams live mark prices from Binance USD-M Futures for given symbols (e.g. ["AAVEUSDC"]) 
// Returns { prices: Record<string, number>, updatedAt: Record<string, number> }
export function useBinanceFuturesPrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [updatedAt, setUpdatedAt] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);

  // Build combined stream URL for USDC perpetual futures
  const url = useMemo(() => {
    const unique = Array.from(new Set(symbols.filter(Boolean)));
    if (unique.length === 0) return null;
    
    // Use markPrice stream for accurate USDC futures pricing
    const streams = unique
      .map((s) => `${s.toLowerCase()}@markPrice@1s`)
      .join("/");
    return `wss://fstream.binance.com/stream?streams=${streams}`;
  }, [symbols.join(",")]);

  useEffect(() => {
    if (!url) return;

    // Cleanup any existing socket
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Binance USDC Futures WS connected:", symbols.length, "symbols");
    };

    ws.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        // Combined stream: { stream, data }
        const d = payload?.data;
        // markPrice event for USDC futures: p (mark price), s (symbol), E (event time)
        const symbol = (d?.s || "").toUpperCase();
        const price = parseFloat(d?.p ?? ""); // p is mark price
        const ts = typeof d?.E === "number" ? d.E : Date.now();
        
        if (!symbol || !isFinite(price)) return;
        
        console.log(`Price update: ${symbol} = ${price}`);
        setPrices((prev) => ({ ...prev, [symbol]: price }));
        setUpdatedAt((prev) => ({ ...prev, [symbol]: ts }));
      } catch (err) {
        console.error("Error parsing WS message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("Binance WS error:", err);
    };

    ws.onclose = () => {
      console.log("Binance WS closed, reconnecting...");
      // Auto-reconnect after short delay
      reconnectRef.current = window.setTimeout(() => {
        if (symbols.length > 0) {
          // trigger reinit via state dependency
          setPrices((p) => ({ ...p }));
        }
      }, 1500);
    };

    return () => {
      try { ws.close(); } catch {}
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
  }, [url]);

  return { prices, updatedAt } as const;
}
