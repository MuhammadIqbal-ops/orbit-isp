import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MikroTik API Client
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

  async connect() {
    try {
      this.conn = await Deno.connect({ hostname: this.host, port: this.port });
      await this.login();
    } catch (error: any) {
      throw new Error(`Failed to connect to MikroTik API: ${error.message}`);
    }
  }

  private encodeLength(len: number): Uint8Array {
    if (len < 0x80) {
      return new Uint8Array([len]);
    } else if (len < 0x4000) {
      return new Uint8Array([len >> 8 | 0x80, len & 0xFF]);
    } else if (len < 0x200000) {
      return new Uint8Array([len >> 16 | 0xC0, (len >> 8) & 0xFF, len & 0xFF]);
    } else if (len < 0x10000000) {
      return new Uint8Array([len >> 24 | 0xE0, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
    } else {
      return new Uint8Array([0xF0, (len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
    }
  }

  private async sendWord(word: string) {
    if (!this.conn) throw new Error("Not connected");
    const encoded = new TextEncoder().encode(word);
    const length = this.encodeLength(encoded.length);
    await this.conn.write(length);
    await this.conn.write(encoded);
  }

  private async readBytes(length: number): Promise<Uint8Array> {
    if (!this.conn) throw new Error("Not connected");
    const buffer = new Uint8Array(length);
    let totalRead = 0;
    while (totalRead < length) {
      const n = await this.conn.read(buffer.subarray(totalRead));
      if (n === null) throw new Error("Connection closed");
      totalRead += n;
    }
    return buffer;
  }

  private async readLength(): Promise<number> {
    const firstByte = await this.readBytes(1);
    const b = firstByte[0];
    
    if ((b & 0x80) === 0) {
      return b;
    } else if ((b & 0xC0) === 0x80) {
      const secondByte = await this.readBytes(1);
      return ((b & 0x3F) << 8) + secondByte[0];
    } else if ((b & 0xE0) === 0xC0) {
      const bytes = await this.readBytes(2);
      return ((b & 0x1F) << 16) + (bytes[0] << 8) + bytes[1];
    } else if ((b & 0xF0) === 0xE0) {
      const bytes = await this.readBytes(3);
      return ((b & 0x0F) << 24) + (bytes[0] << 16) + (bytes[1] << 8) + bytes[2];
    } else {
      const bytes = await this.readBytes(4);
      return (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
    }
  }

  private async readWord(): Promise<string> {
    const length = await this.readLength();
    if (length === 0) return "";
    const bytes = await this.readBytes(length);
    return new TextDecoder().decode(bytes);
  }

  private async login() {
    await this.sendWord("/login");
    await this.sendWord(`=name=${this.username}`);
    await this.sendWord(`=password=${this.password}`);
    await this.sendWord("");

    while (true) {
      const word = await this.readWord();
      if (word === "") break;
      if (word === "!trap") {
        const message = await this.readWord();
        throw new Error(`Login failed: ${message}`);
      }
    }
  }

  async command(cmd: string, params: Record<string, string> = {}): Promise<Record<string, any>[]> {
    if (!this.conn) throw new Error("Not connected");

    await this.sendWord(cmd);
    for (const [key, value] of Object.entries(params)) {
      await this.sendWord(`=${key}=${value}`);
    }
    await this.sendWord("");

    const results: Record<string, any>[] = [];
    let currentItem: Record<string, any> = {};

    while (true) {
      const word = await this.readWord();
      
      if (word === "") break;
      
      if (word === "!re") {
        currentItem = {};
      } else if (word === "!done") {
        if (Object.keys(currentItem).length > 0) {
          results.push(currentItem);
        }
        break;
      } else if (word === "!trap") {
        const message = await this.readWord();
        throw new Error(`Command failed: ${message}`);
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('Fetching router settings from database...');
    const { data: router, error: routerError } = await supabase
      .from('router_settings')
      .select('*')
      .limit(1)
      .single();

    if (routerError || !router) {
      throw new Error('Router settings not found. Please configure router settings first.');
    }

    console.log(`Attempting to import PPPoE secrets from MikroTik at ${router.host}`);

    let secrets: any[] = [];

    // Try REST API first
    try {
      console.log(`Trying MikroTik REST API at http://${router.host}:80/rest/ppp/secret`);
      const restResponse = await fetch(`http://${router.host}:80/rest/ppp/secret`, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(`${router.username}:${router.password}`),
        },
      });

      if (!restResponse.ok) {
        throw new Error(`REST API returned ${restResponse.status}`);
      }

      secrets = await restResponse.json();
      console.log(`Successfully fetched ${secrets.length} secrets via REST API`);
    } catch (restError: any) {
      console.log(`REST API failed: ${restError.message}`);
      console.log('Falling back to MikroTik API protocol...');

      // Fallback to API protocol
      const apiClient = new MikrotikAPIClient(router.host, router.port, router.username, router.password);
      
      try {
        await apiClient.connect();
        console.log('Connected to MikroTik API');

        const apiSecrets = await apiClient.command('/ppp/secret/print');
        console.log(`Successfully fetched ${apiSecrets.length} secrets via API protocol`);
        
        secrets = apiSecrets.map(s => ({
          '.id': s['.id'],
          name: s.name,
          password: s.password,
          service: s.service || 'any',
          profile: s.profile || 'default',
          'local-address': s['local-address'] || '',
          'remote-address': s['remote-address'] || '',
          comment: s.comment || '',
          disabled: s.disabled === 'true',
        }));
        
        apiClient.close();
      } catch (apiError: any) {
        apiClient.close();
        throw new Error(`Failed to fetch secrets from MikroTik: ${apiError.message}`);
      }
    }

    // Import secrets to database
    console.log(`Importing ${secrets.length} secrets to database...`);
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const secret of secrets) {
      try {
        // Check if secret already exists
        const { data: existing } = await supabase
          .from('mikrotik_secrets')
          .select('id')
          .eq('username', secret.name)
          .eq('service', secret.service || 'any')
          .single();

        if (existing) {
          console.log(`Secret ${secret.name} already exists, skipping...`);
          skipped++;
          continue;
        }

        // Insert new secret
        const { error: insertError } = await supabase
          .from('mikrotik_secrets')
          .insert({
            username: secret.name,
            password: secret.password,
            service: secret.service || 'any',
            profile: secret.profile || 'default',
            local_address: secret['local-address'] || null,
            remote_address: secret['remote-address'] || null,
            comment: secret.comment || null,
            disabled: secret.disabled || false,
          });

        if (insertError) {
          console.error(`Failed to insert secret ${secret.name}:`, insertError);
          errors++;
        } else {
          console.log(`Imported secret: ${secret.name}`);
          imported++;
        }
      } catch (error) {
        console.error(`Error processing secret ${secret.name}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Import completed: ${imported} imported, ${skipped} skipped, ${errors} errors`,
        imported,
        skipped,
        errors,
        total: secrets.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in mikrotik-import-secrets:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
