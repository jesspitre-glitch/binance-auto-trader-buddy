import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  const data = await response.json();
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

    // Calculate UTC day boundaries (like Binance does)
    const now = new Date();
    const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const startTime = utcDayStart.getTime();
    const endTime = now.getTime();

    console.log(`Fetching Binance income from ${utcDayStart.toISOString()} to ${now.toISOString()}`);

    // Fetch all income types for today (UTC)
    const allIncome = await getBinanceIncome(apiKey, apiSecret, startTime, endTime);
    
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

    return new Response(
      JSON.stringify({
        success: true,
        // UTC day boundaries
        startTime: utcDayStart.toISOString(),
        endTime: now.toISOString(),
        
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
      }),
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
