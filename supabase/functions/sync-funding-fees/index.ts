import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Create HMAC-SHA256 signature for Binance API
async function createSignature(queryString: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const messageData = encoder.encode(queryString);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Get Binance server time
async function getBinanceServerTime(): Promise<number> {
  const response = await fetch("https://fapi.binance.com/fapi/v1/time");
  const data = await response.json();
  return data.serverTime;
}

// Fetch funding fee income from Binance
async function fetchFundingFees(
  apiKey: string,
  secretKey: string,
  startTime?: number,
  endTime?: number
): Promise<any[]> {
  const serverTime = await getBinanceServerTime();
  
  const params: Record<string, string> = {
    incomeType: "FUNDING_FEE",
    timestamp: serverTime.toString(),
    recvWindow: "10000",
  };
  
  if (startTime) params.startTime = startTime.toString();
  if (endTime) params.endTime = endTime.toString();
  params.limit = "1000";
  
  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  
  const signature = await createSignature(queryString, secretKey);
  const url = `https://fapi.binance.com/fapi/v1/income?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Binance API error: ${response.status} - ${error}`);
  }
  
  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const binanceApiKey = Deno.env.get("BINANCE_API_KEY");
    const binanceSecretKey = Deno.env.get("BINANCE_SECRET_KEY");

    if (!binanceApiKey || !binanceSecretKey) {
      throw new Error("Binance API keys not configured");
    }

    // Get request body for optional parameters
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body provided, use defaults
    }

    // Default: sync last 7 days
    const now = Date.now();
    const defaultStartTime = now - (7 * 24 * 60 * 60 * 1000);
    const startTime = body.startTime || defaultStartTime;
    const endTime = body.endTime || now;

    console.log(`[sync-funding-fees] Fetching from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);

    // Fetch funding fees from Binance
    const fundingFees = await fetchFundingFees(binanceApiKey, binanceSecretKey, startTime, endTime);
    console.log(`[sync-funding-fees] Retrieved ${fundingFees.length} funding fee records from Binance`);

    if (fundingFees.length === 0) {
      return new Response(
        JSON.stringify({ success: true, inserted: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user ID from trading session (first active user)
    const { data: sessions } = await supabase
      .from("trading_session")
      .select("user_id")
      .eq("is_active", true)
      .limit(1);

    if (!sessions || sessions.length === 0) {
      console.log("[sync-funding-fees] No active trading session found");
      return new Response(
        JSON.stringify({ success: true, inserted: 0, message: "No active trading session" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = sessions[0].user_id;

    // Prepare records for upsert
    const records = fundingFees.map((fee: any) => ({
      user_id: userId,
      symbol: fee.symbol,
      income_type: fee.incomeType,
      income: parseFloat(fee.income),
      asset: fee.asset,
      binance_time: parseInt(fee.time),
      transaction_id: fee.tranId ? parseInt(fee.tranId) : null,
    }));

    // Upsert to avoid duplicates (using unique index on user_id, symbol, binance_time, transaction_id)
    let insertedCount = 0;
    for (const record of records) {
      const { error } = await supabase
        .from("funding_fees")
        .upsert(record, {
          onConflict: "user_id,symbol,binance_time,transaction_id",
          ignoreDuplicates: true,
        });

      if (!error) {
        insertedCount++;
      }
    }

    const totalIncome = records.reduce((sum: number, r: any) => sum + r.income, 0);
    console.log(`[sync-funding-fees] Synced ${insertedCount}/${records.length} records. Total funding: ${totalIncome.toFixed(4)} USDT`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: insertedCount,
        total: records.length,
        totalFundingUSDT: totalIncome,
        period: {
          start: new Date(startTime).toISOString(),
          end: new Date(endTime).toISOString(),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[sync-funding-fees] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
