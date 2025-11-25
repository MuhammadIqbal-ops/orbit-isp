import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// MikroTik API Protocol implementation for Deno
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

  private encodeLength(len: number): Uint8Array {
    if (len < 0x80) {
      return new Uint8Array([len]);
    } else if (len < 0x4000) {
      return new Uint8Array([len >> 8 | 0x80, len & 0xFF]);
    } else if (len < 0x200000) {
      return new Uint8Array([len >> 16 | 0xC0, len >> 8 & 0xFF, len & 0xFF]);
    } else if (len < 0x10000000) {
      return new Uint8Array([len >> 24 | 0xE0, len >> 16 & 0xFF, len >> 8 & 0xFF, len & 0xFF]);
    } else {
      return new Uint8Array([0xF0, len >> 24 & 0xFF, len >> 16 & 0xFF, len >> 8 & 0xFF, len & 0xFF]);
    }
  }

  private encodeWord(word: string): Uint8Array {
    const encoder = new TextEncoder();
    const wordBytes = encoder.encode(word);
    const lengthBytes = this.encodeLength(wordBytes.length);
    const result = new Uint8Array(lengthBytes.length + wordBytes.length);
    result.set(lengthBytes, 0);
    result.set(wordBytes, lengthBytes.length);
    return result;
  }

  private async readLength(): Promise<number> {
    if (!this.conn) throw new Error("Not connected");
    
    const firstByte = new Uint8Array(1);
    await this.conn.read(firstByte);
    const b = firstByte[0];

    if ((b & 0x80) === 0) {
      return b;
    } else if ((b & 0xC0) === 0x80) {
      const secondByte = new Uint8Array(1);
      await this.conn.read(secondByte);
      return ((b & 0x3F) << 8) + secondByte[0];
    } else if ((b & 0xE0) === 0xC0) {
      const bytes = new Uint8Array(2);
      await this.conn.read(bytes);
      return ((b & 0x1F) << 16) + (bytes[0] << 8) + bytes[1];
    } else if ((b & 0xF0) === 0xE0) {
      const bytes = new Uint8Array(3);
      await this.conn.read(bytes);
      return ((b & 0x0F) << 24) + (bytes[0] << 16) + (bytes[1] << 8) + bytes[2];
    } else {
      const bytes = new Uint8Array(4);
      await this.conn.read(bytes);
      return (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
    }
  }

  private async readWord(): Promise<string> {
    const len = await this.readLength();
    if (len === 0) return "";
    
    const buffer = new Uint8Array(len);
    await this.conn!.read(buffer);
    return new TextDecoder().decode(buffer);
  }

  async connect(): Promise<void> {
    try {
      this.conn = await Deno.connect({ hostname: this.host, port: this.port });
      
      // Login
      const loginCmd = new Uint8Array([
        ...this.encodeWord("/login"),
        ...this.encodeWord(`=name=${this.username}`),
        ...this.encodeWord(`=password=${this.password}`),
        0
      ]);
      await this.conn.write(loginCmd);

      // Read response
      let word = await this.readWord();
      while (word !== "") {
        word = await this.readWord();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to MikroTik API: ${message}`);
    }
  }

  async command(cmd: string, params: Record<string, string> = {}): Promise<Record<string, any>[]> {
    if (!this.conn) throw new Error("Not connected");

    const words = [this.encodeWord(cmd)];
    for (const [key, value] of Object.entries(params)) {
      words.push(this.encodeWord(`=${key}=${value}`));
    }
    words.push(new Uint8Array([0]));

    const cmdBytes = new Uint8Array(words.reduce((acc, w) => acc + w.length, 0));
    let offset = 0;
    for (const w of words) {
      cmdBytes.set(w, offset);
      offset += w.length;
    }

    await this.conn.write(cmdBytes);

    const results: Record<string, any>[] = [];
    let currentItem: Record<string, any> = {};

    while (true) {
      const word = await this.readWord();
      
      if (word === "") {
        if (Object.keys(currentItem).length > 0) {
          results.push(currentItem);
          currentItem = {};
        }
        break;
      } else if (word === "!done") {
        if (Object.keys(currentItem).length > 0) {
          results.push(currentItem);
        }
        break;
      } else if (word === "!re") {
        if (Object.keys(currentItem).length > 0) {
          results.push(currentItem);
          currentItem = {};
        }
      } else if (word.startsWith("=")) {
        const [key, ...valueParts] = word.substring(1).split("=");
        currentItem[key] = valueParts.join("=");
      }
    }

    return results;
  }

  close() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
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

    let data: any = null;
    let lastError: string | null = null;

    // Try REST API first (RouterOS v7) - only on HTTP/HTTPS ports
    const protocol = settings.ssl ? 'https' : 'http';
    const defaultPort = settings.ssl ? 443 : 80;
    const restPorts = [defaultPort];
    const auth = btoa(`${settings.username}:${settings.password}`);

    for (const port of restPorts) {
      try {
        const apiUrl = `${protocol}://${settings.host}:${port}/rest/system/resource`;
        console.log(`Trying MikroTik REST API at ${apiUrl}`);

        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          data = await response.json();
          console.log("MikroTik system data via REST API:", data);
          lastError = null;
          break;
        } else {
          lastError = `REST ${response.status}`;
          console.log(`REST API failed on port ${port}: ${response.status}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = message;
        console.log(`REST API error on port ${port}: ${message}`);
      }
    }

    // If REST failed, try API protocol (RouterOS v6/v7)
    if (!data) {
      console.log(`REST API failed. Trying MikroTik API protocol on port ${settings.port}...`);
      
      try {
        const client = new MikrotikAPIClient(settings.host, settings.port, settings.username, settings.password);
        await client.connect();
        console.log(`✓ Connected via API protocol on port ${settings.port}`);

        const results = await client.command("/system/resource/print");
        if (results.length > 0) {
          data = results[0];
          console.log("MikroTik system data via API protocol:", data);
          lastError = null;
        }
        client.close();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = message;
        console.error(`API protocol error on port ${settings.port}: ${message}`);
      }
    }

    if (!data) {
      throw new Error(`Failed to connect to MikroTik: ${lastError}`);
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
