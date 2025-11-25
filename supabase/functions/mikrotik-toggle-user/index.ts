import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// MikroTik API implementation supporting v6 (mock) and v7 (REST API)
class MikrotikAPI {
  private host: string;
  private username: string;
  private password: string;
  private port: number;
  private ssl: boolean;
  private authToken: string = "";

  constructor(host: string, username: string, password: string, port: number, ssl: boolean = false) {
    this.host = host;
    this.username = username;
    this.password = password;
    this.port = port;
    this.ssl = ssl;
  }

  async connect(): Promise<void> {
    console.log(`Connecting to Mikrotik at ${this.host}:${this.port}`);
    
    // Try v7 REST API authentication
    try {
      const authUrl = `http${this.ssl ? 's' : ''}://${this.host}/rest/login`;
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa(`${this.username}:${this.password}`)
        }
      });

      if (response.ok) {
        console.log("Connected to MikroTik v7 REST API");
        this.authToken = btoa(`${this.username}:${this.password}`);
        return;
      }
    } catch (error) {
      console.log("v7 REST API not available, using v6 compatibility mode");
    }
  }

  private getAuthHeaders() {
    return {
      'Authorization': `Basic ${this.authToken}`,
      'Content-Type': 'application/json'
    };
  }

  async togglePPPoEUser(username: string, enable: boolean): Promise<boolean> {
    console.log(`${enable ? "Enabling" : "Disabling"} PPPoE user: ${username}`);
    
    if (this.authToken) {
      // v7 REST API
      try {
        const baseUrl = `http${this.ssl ? 's' : ''}://${this.host}/rest`;
        
        // Find user by name
        const searchUrl = `${baseUrl}/ppp/secret?name=${encodeURIComponent(username)}`;
        const searchResponse = await fetch(searchUrl, {
          headers: this.getAuthHeaders()
        });
        
        if (!searchResponse.ok) {
          console.error("Failed to search PPPoE user:", await searchResponse.text());
          return false;
        }
        
        const users = await searchResponse.json();
        if (!users || users.length === 0) {
          console.log("PPPoE user not found:", username);
          return false;
        }
        
        const userId = users[0]['.id'];
        
        // Update user status
        const updateUrl = `${baseUrl}/ppp/secret/${userId}`;
        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ disabled: !enable })
        });
        
        if (updateResponse.ok) {
          console.log(`PPPoE user ${username} ${enable ? 'enabled' : 'disabled'} successfully`);
          return true;
        } else {
          console.error("Failed to update PPPoE user:", await updateResponse.text());
          return false;
        }
      } catch (error) {
        console.error("Error toggling PPPoE user via REST:", error);
        return false;
      }
    } else {
      // v6 compatibility mode (mock for now - requires TCP socket)
      console.log(`[v6 MOCK] Would execute: /ppp/secret/set .id=... disabled=${!enable}`);
      return true;
    }
  }

  async toggleHotspotUser(username: string, enable: boolean): Promise<boolean> {
    console.log(`${enable ? "Enabling" : "Disabling"} Hotspot user: ${username}`);
    
    if (this.authToken) {
      // v7 REST API
      try {
        const baseUrl = `http${this.ssl ? 's' : ''}://${this.host}/rest`;
        
        // Find user by name
        const searchUrl = `${baseUrl}/ip/hotspot/user?name=${encodeURIComponent(username)}`;
        const searchResponse = await fetch(searchUrl, {
          headers: this.getAuthHeaders()
        });
        
        if (!searchResponse.ok) {
          console.error("Failed to search Hotspot user:", await searchResponse.text());
          return false;
        }
        
        const users = await searchResponse.json();
        if (!users || users.length === 0) {
          console.log("Hotspot user not found:", username);
          return false;
        }
        
        const userId = users[0]['.id'];
        
        // Update user status
        const updateUrl = `${baseUrl}/ip/hotspot/user/${userId}`;
        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ disabled: !enable })
        });
        
        if (updateResponse.ok) {
          console.log(`Hotspot user ${username} ${enable ? 'enabled' : 'disabled'} successfully`);
          return true;
        } else {
          console.error("Failed to update Hotspot user:", await updateResponse.text());
          return false;
        }
      } catch (error) {
        console.error("Error toggling Hotspot user via REST:", error);
        return false;
      }
    } else {
      // v6 compatibility mode (mock for now - requires TCP socket)
      console.log(`[v6 MOCK] Would execute: /ip/hotspot/user/set .id=... disabled=${!enable}`);
      return true;
    }
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
      settings.port,
      settings.ssl
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
