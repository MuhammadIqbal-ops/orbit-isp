import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get router settings
    const { data: settings, error: settingsError } = await supabase
      .from("router_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings) {
      throw new Error("Router settings not configured");
    }

    console.log(`Connecting to MikroTik at ${settings.host}:${settings.port}`);

    // Connect to MikroTik REST API (v7)
    // REST API uses port 80 (HTTP) or 443 (HTTPS), not 8728 (API socket port)
    const protocol = settings.ssl ? 'https' : 'http';
    const restPort = settings.ssl ? 443 : 80;
    const apiUrl = `${protocol}://${settings.host}:${restPort}/rest/system/resource`;
    const auth = btoa(`${settings.username}:${settings.password}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`MikroTik API error: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to connect to MikroTik: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("MikroTik system data:", data);

    // Parse uptime from seconds to readable format
    const uptimeSeconds = parseInt(data.uptime || 0);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;

    // Parse CPU load (RouterOS returns as percentage * 100)
    const cpuLoad = parseInt(data['cpu-load'] || 0);

    // Parse memory usage
    const totalMemory = parseInt(data['total-memory'] || 1);
    const freeMemory = parseInt(data['free-memory'] || 0);
    const memoryUsage = Math.round(((totalMemory - freeMemory) / totalMemory) * 100);

    const systemData = {
      cpu: cpuLoad,
      memory: memoryUsage,
      uptime: uptimeFormatted,
      version: data.version || "Unknown",
      board: data['board-name'] || "Unknown",
      temperature: parseInt(data['cpu-temperature'] || 0),
    };

    return new Response(JSON.stringify(systemData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching system data:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
