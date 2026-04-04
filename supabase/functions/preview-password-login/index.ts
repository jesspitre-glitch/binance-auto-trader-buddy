import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { email, password } = await req.json();

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return new Response(
        JSON.stringify({ success: false, message: "Email og password er påkrævet." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Backend auth er ikke konfigureret korrekt.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("auth_timeout"), 10000);

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        "x-client-info": "preview-password-login",
      },
      body: JSON.stringify({
        email,
        password,
        gotrue_meta_security: {},
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const responseText = await authResponse.text();
    const contentType = authResponse.headers.get("content-type") || "";
    const looksLikeHtml = responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html");

    if (!contentType.includes("application/json") || looksLikeHtml) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Login-serveren svarer ikke lige nu. Prøv igen om lidt.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload = JSON.parse(responseText);

    return new Response(JSON.stringify({ success: authResponse.ok, ...payload }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Ukendt loginfejl";
    const message = rawMessage.includes("timed out") || rawMessage.includes("Failed to fetch")
      ? "Login-serveren svarer ikke lige nu. Prøv igen om lidt."
      : rawMessage;

    console.error("[preview-password-login]", rawMessage);

    return new Response(JSON.stringify({ success: false, message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});