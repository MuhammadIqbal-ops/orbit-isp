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
    // Try default HTTP/HTTPS ports first, then fall back to configured port
    const protocol = settings.ssl ? 'https' : 'http';
    const defaultPort = settings.ssl ? 443 : 80;
    const candidatePorts = Array.from(new Set([defaultPort, settings.port]));
    const auth = btoa(`${settings.username}:${settings.password}`);

    let lastError: string | null = null;
    let data: any = null;

    for (const port of candidatePorts) {
      const apiUrl = `${protocol}://${settings.host}:${port}/rest/system/resource`;
      console.log(`Trying MikroTik REST at ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        data = await response.json();
        console.log("MikroTik system data:", data);
        lastError = null;
        break;
      } else {
        const text = await response.text();
        console.error(`MikroTik API error on port ${port}: ${response.status} ${response.statusText} - ${text}`);
        lastError = `${response.status} ${response.statusText}`;
      }
    }

    if (!data) {
      throw new Error(`Failed to connect to MikroTik REST API: ${lastError}`);
    }

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
