import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address } = await req.json();
    
    if (!address) {
      throw new Error("Wallet address is required");
    }

    const apiKey = Deno.env.get("COINBASE_API_KEY");
    if (!apiKey) {
      throw new Error("Coinbase API key not configured");
    }

    // Generate session token from Coinbase
    const response = await fetch("https://api.developer.coinbase.com/onramp/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        destination_wallets: [{
          address: address,
          blockchains: ["base"],
          assets: ["USDC", "DAI"],
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Coinbase API error:", errorText);
      throw new Error(`Coinbase API error: ${response.status}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({ sessionToken: data.token }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
