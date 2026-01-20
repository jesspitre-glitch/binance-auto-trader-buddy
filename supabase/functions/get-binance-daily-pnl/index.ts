import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache to avoid Binance rate limits
interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 60_000; // 60 seconds

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
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

async function getBinanceServerTime(): Promise<number> {
  const response = await fetch('https://fapi.binance.com/fapi/v1/time');
  if (!response.ok) {
    console.error('Binance server time API error:', response.status, await response.text());
    // Fallback to local time if server time fails
    return Date.now();
  }
  const data = await response.json();
  if (!data || typeof data.serverTime !== 'number') {
    console.error('Invalid server time response:', JSON.stringify(data));
    return Date.now();
  }
  return data.serverTime;
}

/**
 * Fetch Binance Futures income history for a specific period
 * incomeTypes: TRANSFER, WELCOME_BONUS, REALIZED_PNL, FUNDING_FEE, COMMISSION, INSURANCE_CLEAR, etc.
 */
async function getBinanceIncome(
  apiKey: string, 
  apiSecret: string, 
  startTime: number, 
  endTime: number,
  incomeType?: string
): Promise<any[]> {
  const serverTime = await getBinanceServerTime();
  
  const params: Record<string, string> = {
    timestamp: serverTime.toString(),
    recvWindow: '10000',
    startTime: startTime.toString(),
    endTime: endTime.toString(),
    limit: '1000',
  };
  
  if (incomeType) {
    params.incomeType = incomeType;
  }
  
  const queryString = new URLSearchParams(params).toString();
  const signature = await createSignature(queryString, apiSecret);
  
  const url = `https://fapi.binance.com/fapi/v1/income?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Binance income API error:', error);
    throw new Error(`Failed to get income data: ${error}`);
  }

  return await response.json();
}

/**
 * Get current Binance account data (balance + unrealized PNL)
 */
async function getBinanceAccount(apiKey: string, apiSecret: string) {
  const serverTime = await getBinanceServerTime();
  const queryString = `timestamp=${serverTime}&recvWindow=10000`;
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
    throw new Error(`Failed to get account data: ${error}`);
  }

  const accountData = await response.json();
  return {
    totalWalletBalance: parseFloat(accountData.totalWalletBalance),
    totalUnrealizedProfit: parseFloat(accountData.totalUnrealizedProfit),
    totalMarginBalance: parseFloat(accountData.totalMarginBalance),
    availableBalance: parseFloat(accountData.availableBalance),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('BINANCE_API_KEY');
    const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');

    if (!apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ error: 'Binance API keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body for custom time range
    let requestedStartTime: number | null = null;
    let requestedEndTime: number | null = null;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.startTime) requestedStartTime = body.startTime;
        if (body.endTime) requestedEndTime = body.endTime;
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    // Calculate time boundaries
    const now = new Date();
    let startTime: number;
    let endTime: number;
    
    if (requestedStartTime && requestedEndTime) {
      // Use requested range
      startTime = requestedStartTime;
      endTime = requestedEndTime;
    } else {
      // Default to UTC day (like Binance does)
      const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      startTime = utcDayStart.getTime();
      endTime = now.getTime();
    }

    // Check cache first to avoid rate limits
    const cacheKey = `pnl_${startTime}_${Math.floor(endTime / 60000)}`; // Round endTime to minute for better cache hits
    const cached = getCached(cacheKey);
    if (cached) {
      console.log('Returning cached PNL data');
      return new Response(
        JSON.stringify({ ...cached, fromCache: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching Binance income from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);

    // Binance API limits: max 7 days per request, max 1000 records
    // For longer periods, we need to chunk the requests
    const MAX_CHUNK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    const allIncome: any[] = [];
    
    let chunkStart = startTime;
    while (chunkStart < endTime) {
      const chunkEnd = Math.min(chunkStart + MAX_CHUNK_MS, endTime);
      
      console.log(`Fetching chunk: ${new Date(chunkStart).toISOString()} to ${new Date(chunkEnd).toISOString()}`);
      
      const chunkIncome = await getBinanceIncome(apiKey, apiSecret, chunkStart, chunkEnd);
      allIncome.push(...chunkIncome);
      
      chunkStart = chunkEnd;
    }
    
    // Get current account data for unrealized PNL
    const accountData = await getBinanceAccount(apiKey, apiSecret);

    // Categorize income by type
    const incomeByType: Record<string, number> = {};
    for (const item of allIncome) {
      const type = item.incomeType;
      const amount = parseFloat(item.income);
      incomeByType[type] = (incomeByType[type] || 0) + amount;
    }

    // Calculate "Today's Realized PNL" exactly like Binance shows it
    // Binance's "Today's Realized PNL" = REALIZED_PNL (from closed trades)
    const realizedPnl = incomeByType['REALIZED_PNL'] || 0;
    
    // Commission (trading fees) - negative values
    const commission = incomeByType['COMMISSION'] || 0;
    
    // Funding fees - can be positive or negative
    const fundingFee = incomeByType['FUNDING_FEE'] || 0;
    
    // Total income for today (all types combined)
    const totalIncome = Object.values(incomeByType).reduce((sum, val) => sum + val, 0);

    // Binance "Today's Realized PNL" typically shows: REALIZED_PNL + COMMISSION + FUNDING_FEE
    // But the exact formula can vary by Binance app version
    // The most common display is just REALIZED_PNL
    const todaysRealizedPnl = realizedPnl;
    
    // Net P&L including all fees
    const netPnl = realizedPnl + commission + fundingFee;

    console.log('Income breakdown:', {
      realizedPnl,
      commission,
      fundingFee,
      totalIncome,
      todaysRealizedPnl,
      netPnl,
      unrealizedPnl: accountData.totalUnrealizedProfit,
      allTypes: incomeByType,
    });

    const responseData = {
      success: true,
      // Time boundaries used
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      
      // Main P&L figures (matching Binance display)
      todaysRealizedPnl,           // "Today's Realized PNL" as shown in Binance
      commission,                   // Trading fees (negative)
      fundingFee,                   // Funding fees (can be + or -)
      netPnl,                       // Net after all fees
      
      // Current account state
      unrealizedPnl: accountData.totalUnrealizedProfit,
      walletBalance: accountData.totalWalletBalance,
      marginBalance: accountData.totalMarginBalance,
      
      // Detailed breakdown
      incomeByType,
      incomeCount: allIncome.length,
      rawIncome: allIncome,         // Full income records for debugging
    };

    // Cache the response
    setCache(cacheKey, responseData);

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Get Binance daily PNL error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
