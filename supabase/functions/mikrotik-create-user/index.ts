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

// Low-level MikroTik API client (TCP) used as fallback when REST is not available
class MikrotikAPIClient {
  private conn: Deno.Conn | null = null;
  private host: string;
  private port: number;
  private username: string;
  private password: string;

  constructor(host: string, port: number, username: string, password: string) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
  }

  async connect(): Promise<void> {
    try {
      this.conn = await Deno.connect({ hostname: this.host, port: this.port });
      await this.login();
    } catch (error: any) {
      throw new Error(`Failed to connect to MikroTik API: ${error.message}`);
    }
  }

  private async login(): Promise<void> {
    const loginCmd = `/login\n=name=${this.username}\n=password=${this.password}\n`;
    await this.sendCommand(loginCmd);
  }

  private async sendCommand(cmd: string): Promise<string> {
    if (!this.conn) throw new Error("Not connected");

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    await this.conn.write(encoder.encode(cmd + "\n"));

    const buffer = new Uint8Array(4096);
    const n = await this.conn.read(buffer);
    return decoder.decode(buffer.subarray(0, n || 0));
  }

  async command(cmd: string, params: Record<string, string> = {}): Promise<Record<string, any>[]> {
    let cmdString = cmd;
    for (const [key, value] of Object.entries(params)) {
      cmdString += `\n=${key}=${value}`;
    }

    const response = await this.sendCommand(cmdString);
    return this.parseResponse(response);
  }

  private parseResponse(response: string): Record<string, any>[] {
    const results: Record<string, any>[] = [];
    const lines = response.split("\n");
    let currentItem: Record<string, any> = {};

    for (const line of lines) {
      if (line.startsWith("=")) {
        const [key, value] = line.substring(1).split("=", 2);
        currentItem[key] = value;
      } else if (line === "!done" && Object.keys(currentItem).length > 0) {
        results.push(currentItem);
        currentItem = {};
      }
    }

    return results;
  }

  async close(): Promise<void> {
    if (this.conn) {
      try {
        this.conn.close();
      } catch (error) {
        console.error("Error closing connection:", error);
      }
    }
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

    console.log("Creating MikroTik user for subscription:", subscriptionId, username);

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
      console.log("No router settings found, skipping MikroTik sync");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Subscription created but MikroTik sync skipped",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const restUrl = `http${settings.ssl ? "s" : ""}://${settings.host}:80/rest`;
    const auth = btoa(`${settings.username}:${settings.password}`);

    // Helper to parse bandwidth / queue params from package
    const maxLimit = pkg.bandwidth as string; // e.g. "10M/2M"
    const burstLimit = (pkg.burst as string) || maxLimit;
    const priority = (pkg.priority ?? 8).toString();

    // ---------- Try REST API first ----------
    try {
      if (pkg.type === "pppoe") {
        // Create PPPoE secret
        const pppoeData: Record<string, string> = {
          name: username,
          password,
          service: "pppoe",
          profile: "default",
          comment: `sub:${subscriptionId}`,
          disabled: "no",
        };

        const secretResp = await fetch(`${restUrl}/ppp/secret/add`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(pppoeData),
        });

        if (!secretResp.ok) {
          throw new Error(`REST PPPoE secret error: ${secretResp.statusText}`);
        }
        console.log("PPPoE secret created via REST API");
      } else if (pkg.type === "hotspot") {
        const hotspotData: Record<string, string> = {
          name: username,
          password,
          profile: "default",
          comment: `sub:${subscriptionId}`,
          disabled: "no",
        };

        const hotspotResp = await fetch(`${restUrl}/ip/hotspot/user/add`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(hotspotData),
        });

        if (!hotspotResp.ok) {
          throw new Error(`REST Hotspot user error: ${hotspotResp.statusText}`);
        }
        console.log("Hotspot user created via REST API");
      }

      // Simple Queue for bandwidth control (applies to both types)
      const queueName = `${username}-queue`;
      const queueData: Record<string, string> = {
        name: queueName,
        target: username,
        "max-limit": maxLimit,
        "burst-limit": burstLimit,
        priority,
      };

      const queueResp = await fetch(`${restUrl}/queue/simple/add`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(queueData),
      });

      if (!queueResp.ok) {
        throw new Error(`REST queue error: ${queueResp.statusText}`);
      }

      console.log("Simple queue created via REST API");

      return new Response(
        JSON.stringify({
          success: true,
          message: `User ${username} created in MikroTik via REST API`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (restError: any) {
      console.log("REST API failed, falling back to API protocol:", restError.message);
    }

    // ---------- Fallback: MikroTik API protocol over TCP ----------
    const apiClient = new MikrotikAPIClient(
      settings.host,
      settings.port,
      settings.username,
      settings.password
    );

    try {
      await apiClient.connect();

      if (pkg.type === "pppoe") {
        await apiClient.command("/ppp/secret/add", {
          name: username,
          password,
          service: "pppoe",
          profile: "default",
          comment: `sub:${subscriptionId}`,
          disabled: "no",
        });
        console.log("PPPoE secret created via API protocol");
      } else if (pkg.type === "hotspot") {
        await apiClient.command("/ip/hotspot/user/add", {
          name: username,
          password,
          profile: "default",
          comment: `sub:${subscriptionId}`,
          disabled: "no",
        });
        console.log("Hotspot user created via API protocol");
      }

      await apiClient.command("/queue/simple/add", {
        name: `${username}-queue`,
        target: username,
        "max-limit": maxLimit,
        "burst-limit": burstLimit,
        priority,
      });
      console.log("Simple queue created via API protocol");

      await apiClient.close();

      return new Response(
        JSON.stringify({
          success: true,
          message: `User ${username} created in MikroTik via API protocol`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (apiError: any) {
      await apiClient.close();
      throw new Error(`API protocol failed: ${apiError.message}`);
    }
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
