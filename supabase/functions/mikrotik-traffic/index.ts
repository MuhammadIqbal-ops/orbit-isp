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
    // Mock data for demonstration - replace with actual Mikrotik API integration
    const now = Date.now();
    const trafficData = Array.from({ length: 12 }, (_, i) => ({
      time: new Date(now - (11 - i) * 5000).toLocaleTimeString(),
      download: Math.floor(Math.random() * 50) + 20,
      upload: Math.floor(Math.random() * 30) + 10,
    }));

    return new Response(JSON.stringify(trafficData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
