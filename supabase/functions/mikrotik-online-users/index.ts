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

    console.log(`Fetching online users from MikroTik at ${settings.host}`);

    // REST API uses port 80 (HTTP) or 443 (HTTPS), not 8728
    const protocol = settings.ssl ? 'https' : 'http';
    const restPort = settings.ssl ? 443 : 80;
    const auth = btoa(`${settings.username}:${settings.password}`);
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    };

    // Fetch PPPoE active connections
    const pppoeUrl = `${protocol}://${settings.host}:${restPort}/rest/ppp/active`;
    const pppoeResponse = await fetch(pppoeUrl, { method: 'GET', headers });
    
    let pppoeUsers = [];
    if (pppoeResponse.ok) {
      pppoeUsers = await pppoeResponse.json();
      console.log(`Found ${pppoeUsers.length} active PPPoE users`);
    } else {
      console.error(`Failed to fetch PPPoE users: ${pppoeResponse.status}`);
    }

    // Fetch Hotspot active connections
    const hotspotUrl = `${protocol}://${settings.host}:${restPort}/rest/ip/hotspot/active`;
    const hotspotResponse = await fetch(hotspotUrl, { method: 'GET', headers });
    
    let hotspotUsers = [];
    if (hotspotResponse.ok) {
      hotspotUsers = await hotspotResponse.json();
      console.log(`Found ${hotspotUsers.length} active Hotspot users`);
    } else {
      console.error(`Failed to fetch Hotspot users: ${hotspotResponse.status}`);
    }

    // Helper to format uptime
    const formatUptime = (uptime: string) => {
      if (!uptime) return "0m";
      // Uptime format from MikroTik: "1d2h3m4s" or "2h3m4s"
      return uptime.replace(/(\d+)w/g, '$1w ')
                   .replace(/(\d+)d/g, '$1d ')
                   .replace(/(\d+)h/g, '$1h ')
                   .replace(/(\d+)m/g, '$1m')
                   .replace(/(\d+)s/g, '')
                   .trim();
    };

    // Format PPPoE users
    const formattedPPPoE = pppoeUsers.map((user: any) => ({
      id: user['.id'],
      username: user.name || "unknown",
      type: "pppoe",
      address: user.address || "N/A",
      uptime: formatUptime(user.uptime),
      downloadSpeed: "N/A", // Real-time speed requires additional API call
      uploadSpeed: "N/A",
    }));

    // Format Hotspot users
    const formattedHotspot = hotspotUsers.map((user: any) => ({
      id: user['.id'],
      username: user.user || "unknown",
      type: "hotspot",
      address: user.address || "N/A",
      uptime: formatUptime(user.uptime),
      downloadSpeed: "N/A",
      uploadSpeed: "N/A",
    }));

    const onlineUsers = [...formattedPPPoE, ...formattedHotspot];

    return new Response(JSON.stringify(onlineUsers), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching online users:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
