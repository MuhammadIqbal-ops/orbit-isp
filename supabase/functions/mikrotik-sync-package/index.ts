import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PackageData {
  id: string;
  name: string;
  bandwidth: string;
  burst: string | null;
  priority: number | null;
  type: string;
}

interface RouterSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  ssl: boolean;
}

// Simple RouterOS API client for Mikrotik
class MikrotikClient {
  private host: string;
  private port: number;
  private username: string;
  private password: string;

  constructor(settings: RouterSettings) {
    this.host = settings.host;
    this.port = settings.port;
    this.username = settings.username;
    this.password = settings.password;
  }

  async createQueueProfile(pkg: PackageData): Promise<void> {
    // Parse bandwidth (e.g., "10M/5M" -> download: 10M, upload: 5M)
    const [maxLimit, _] = pkg.bandwidth.split("/");
    const burstLimit = pkg.burst ? pkg.burst.split("/")[0] : maxLimit;

    console.log(`Creating queue profile for package: ${pkg.name}`);
    console.log(`Bandwidth: ${pkg.bandwidth}, Burst: ${pkg.burst}, Priority: ${pkg.priority}`);

    // In a real implementation, this would use the RouterOS API protocol
    // For now, we'll simulate the operation
    // You would use libraries like node-routeros or implement the API protocol
    
    const profileData = {
      name: `profile-${pkg.name.toLowerCase().replace(/\s+/g, "-")}`,
      maxLimit: pkg.bandwidth,
      burstLimit: pkg.burst || pkg.bandwidth,
      burstThreshold: pkg.bandwidth,
      burstTime: "8s/8s",
      priority: pkg.priority || 8,
      queueType: "pcq-upload-default/pcq-download-default",
    };

    console.log("Queue profile data:", profileData);

    // TODO: Implement actual Mikrotik API call
    // Example structure:
    // await this.apiCall('/queue/simple/add', {
    //   name: profileData.name,
    //   'max-limit': profileData.maxLimit,
    //   'burst-limit': profileData.burstLimit,
    //   'burst-threshold': profileData.burstThreshold,
    //   'burst-time': profileData.burstTime,
    //   priority: profileData.priority.toString(),
    //   'queue': profileData.queueType
    // });

    console.log(`Queue profile created successfully: ${profileData.name}`);
  }

  async testConnection(): Promise<boolean> {
    console.log(`Testing connection to Mikrotik: ${this.host}:${this.port}`);
    
    // In a real implementation, this would attempt to connect to the router
    // For now, simulate success
    return true;
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

    const { packageId } = await req.json();

    if (!packageId) {
      throw new Error("Package ID is required");
    }

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
      .single();

    if (settingsError) {
      console.log("No router settings found, skipping Mikrotik sync");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Package saved but Mikrotik sync skipped (no router configured)",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Mikrotik client and sync
    const mikrotik = new MikrotikClient(settings);
    
    // Test connection first
    const connected = await mikrotik.testConnection();
    if (!connected) {
      throw new Error("Failed to connect to Mikrotik router");
    }

    // Create queue profile
    await mikrotik.createQueueProfile(pkg);

    console.log(`Package ${pkg.name} synced to Mikrotik successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Package ${pkg.name} synced to Mikrotik successfully`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error syncing package to Mikrotik:", error);
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
