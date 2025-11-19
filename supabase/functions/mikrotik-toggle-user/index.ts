import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Mock Mikrotik API implementation
// TODO: Replace with actual node-routeros library when deploying to Node.js environment
class MikrotikAPI {
  private host: string;
  private username: string;
  private password: string;
  private port: number;

  constructor(host: string, username: string, password: string, port: number) {
    this.host = host;
    this.username = username;
    this.password = password;
    this.port = port;
  }

  async connect(): Promise<void> {
    console.log(`Simulating connection to Mikrotik at ${this.host}:${this.port}`);
  }

  async togglePPPoEUser(username: string, enable: boolean): Promise<boolean> {
    console.log(`${enable ? "Enabling" : "Disabling"} PPPoE user: ${username}`);
    // TODO: Implement actual user toggle
    // const secrets = await conn.write('/ppp/secret/print', [`?name=${username}`]);
    // if (secrets.length > 0) {
    //   const id = secrets[0]['.id'];
    //   await conn.write(enable ? '/ppp/secret/enable' : '/ppp/secret/disable', [`=${id}`]);
    //   return true;
    // }
    return true;
  }

  async toggleHotspotUser(username: string, enable: boolean): Promise<boolean> {
    console.log(`${enable ? "Enabling" : "Disabling"} Hotspot user: ${username}`);
    // TODO: Implement actual user toggle
    // const users = await conn.write('/ip/hotspot/user/print', [`?name=${username}`]);
    // if (users.length > 0) {
    //   const id = users[0]['.id'];
    //   await conn.write(enable ? '/ip/hotspot/user/enable' : '/ip/hotspot/user/disable', [`=${id}`]);
    //   return true;
    // }
    return true;
  }

  async close(): Promise<void> {
    console.log("Closing Mikrotik connection");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { username, enable } = await req.json();

    console.log(`${enable ? "Enabling" : "Disabling"} user:`, username);

    // Get router settings
    const { data: settings, error: settingsError } = await supabase
      .from("router_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings) {
      throw new Error("Router settings not configured");
    }

    // Connect to Mikrotik
    const mikrotik = new MikrotikAPI(
      settings.host,
      settings.username,
      settings.password,
      settings.port
    );

    await mikrotik.connect();

    // Try PPPoE first, then Hotspot
    let success = await mikrotik.togglePPPoEUser(username, enable);
    if (!success) {
      success = await mikrotik.toggleHotspotUser(username, enable);
    }

    if (!success) {
      throw new Error(`User not found: ${username}`);
    }

    await mikrotik.close();

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${username} ${enable ? "enabled" : "disabled"} successfully`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error toggling Mikrotik user:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
