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
    const onlineUsers = [
      {
        id: "1",
        username: "user001",
        type: "pppoe",
        address: "10.10.10.1",
        uptime: "2h 15m",
        downloadSpeed: "8.5 Mbps",
        uploadSpeed: "5.2 Mbps",
      },
      {
        id: "2",
        username: "user002",
        type: "hotspot",
        address: "10.10.20.15",
        uptime: "45m",
        downloadSpeed: "3.2 Mbps",
        uploadSpeed: "1.8 Mbps",
      },
      {
        id: "3",
        username: "user003",
        type: "pppoe",
        address: "10.10.10.5",
        uptime: "5h 30m",
        downloadSpeed: "15.8 Mbps",
        uploadSpeed: "8.9 Mbps",
      },
    ];

    return new Response(JSON.stringify(onlineUsers), {
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
