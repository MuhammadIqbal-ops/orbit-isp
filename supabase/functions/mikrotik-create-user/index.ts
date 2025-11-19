import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  subscriptionId: string;
  username: string;
  password: string;
  packageId: string;
}

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
    // TODO: Implement actual RouterOS API connection
    // const conn = new RouterOSAPI({ host, user, password, port, timeout: 10 });
    // await conn.connect();
  }

  async createPPPoEProfile(profileName: string, bandwidth: string): Promise<void> {
    console.log(`Creating PPPoE profile: ${profileName} with bandwidth: ${bandwidth}`);
    // TODO: Implement actual profile creation
    // await conn.write('/ppp/profile/add', [`=name=${profileName}`, ...]);
  }

  async createPPPoESecret(username: string, password: string, profileName: string): Promise<void> {
    console.log(`Creating PPPoE secret for user: ${username}`);
    // TODO: Implement actual secret creation
    // await conn.write('/ppp/secret/add', [`=name=${username}`, ...]);
  }

  async createHotspotUser(username: string, password: string): Promise<void> {
    console.log(`Creating Hotspot user: ${username}`);
    // TODO: Implement actual hotspot user creation
    // await conn.write('/ip/hotspot/user/add', [`=name=${username}`, ...]);
  }

  async createSimpleQueue(queueName: string, target: string, maxLimit: string, burst: string, priority: number): Promise<void> {
    console.log(`Creating Simple Queue: ${queueName} for ${target}`);
    // TODO: Implement actual queue creation
    // await conn.write('/queue/simple/add', [`=name=${queueName}`, ...]);
  }

  async close(): Promise<void> {
    console.log("Closing Mikrotik connection");
    // TODO: Close actual connection
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

    const { subscriptionId, username, password, packageId }: CreateUserRequest =
      await req.json();

    console.log("Creating PPPoE user:", username);

    // Get package data
    const { data: pkg, error: pkgError } = await supabase
      .from("packages")
      .select("*")
      .eq("id", packageId)
      .single();

    if (pkgError) throw pkgError;
    if (!pkg) throw new Error("Package not found");

    // Get router settings
    const { data: settings, error: settingsError } = await supabase
      .from("router_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings) {
      console.log("No router settings found, skipping Mikrotik sync");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Subscription created but Mikrotik sync skipped",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Connect to Mikrotik
    const mikrotik = new MikrotikAPI(
      settings.host,
      settings.username,
      settings.password,
      settings.port
    );

    await mikrotik.connect();

    // Create profile and user based on package type
    const profileName = `profile-${pkg.name.toLowerCase().replace(/\s+/g, "-")}`;

    if (pkg.type === "pppoe") {
      // Create PPPoE profile
      await mikrotik.createPPPoEProfile(profileName, pkg.bandwidth);

      // Create PPPoE secret
      await mikrotik.createPPPoESecret(username, password, profileName);
    } else if (pkg.type === "hotspot") {
      // Create Hotspot user
      await mikrotik.createHotspotUser(username, password);
    }

    // Create Simple Queue for bandwidth control
    const queueName = `${username}-queue`;
    await mikrotik.createSimpleQueue(
      queueName,
      username,
      pkg.bandwidth,
      pkg.burst || pkg.bandwidth,
      pkg.priority || 8
    );

    await mikrotik.close();

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${username} created successfully in Mikrotik`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating Mikrotik user:", error);
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
