import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

async function getBinanceAccountData(apiKey: string, apiSecret: string) {
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const apiKey = Deno.env.get('BINANCE_API_KEY');
    const apiSecret = Deno.env.get('BINANCE_SECRET_KEY');

    if (!apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ error: 'Binance API keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's date in UTC
    const today = new Date();
    const snapshotDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Get all active trading sessions
    const { data: sessions, error: sessionError } = await supabaseClient
      .from('trading_session')
      .select('user_id')
      .eq('is_active', true);

    if (sessionError) {
      console.error('Failed to fetch trading sessions:', sessionError);
    }

    // Get Binance account data
    const accountData = await getBinanceAccountData(apiKey, apiSecret);
    
    console.log(`Daily snapshot for ${snapshotDate}:`, {
      walletBalance: accountData.totalWalletBalance,
      unrealizedPnl: accountData.totalUnrealizedProfit,
    });

    // For each active user, create or update snapshot
    const userIds = sessions?.map(s => s.user_id) || [];
    
    // Also check user_portfolio for any users with portfolios
    const { data: portfolios } = await supabaseClient
      .from('user_portfolio')
      .select('user_id');
    
    const portfolioUserIds = portfolios?.map(p => p.user_id) || [];
    const allUserIds = [...new Set([...userIds, ...portfolioUserIds])];

    const results = [];
    
    for (const userId of allUserIds) {
      // Upsert the daily snapshot
      const { data, error } = await supabaseClient
        .from('daily_balance_snapshots')
        .upsert({
          user_id: userId,
          snapshot_date: snapshotDate,
          futures_balance: accountData.totalWalletBalance,
          unrealized_pnl: accountData.totalUnrealizedProfit,
        }, {
          onConflict: 'user_id,snapshot_date',
        })
        .select();

      if (error) {
        console.error(`Failed to save snapshot for user ${userId}:`, error);
        results.push({ userId, error: error.message });
      } else {
        results.push({ userId, success: true, data });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        snapshotDate,
        accountData,
        usersProcessed: allUserIds.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Daily balance snapshot error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
