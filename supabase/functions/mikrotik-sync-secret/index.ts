import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const lines = response.split('\n');
    let currentItem: Record<string, any> = {};
    
    for (const line of lines) {
      if (line.startsWith('=')) {
        const [key, value] = line.substring(1).split('=', 2);
        currentItem[key] = value;
      } else if (line === '!done' && Object.keys(currentItem).length > 0) {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  try {
    const { action, secretId } = await req.json();
    
    console.log(`Syncing secret ${secretId} with action: ${action}`);

    // Fetch router settings
    const { data: routerSettings, error: routerError } = await supabaseClient
      .from('router_settings')
      .select('*')
      .single();

    if (routerError || !routerSettings) {
      throw new Error('Router settings not configured');
    }

    // Fetch secret details
    const { data: secret, error: secretError } = await supabaseClient
      .from('mikrotik_secrets')
      .select('*')
      .eq('id', secretId)
      .single();

    if (secretError || !secret) {
      throw new Error('Secret not found');
    }

    console.log(`Connecting to MikroTik at ${routerSettings.host}:${routerSettings.port}`);

    // Try REST API first
    const restUrl = `http${routerSettings.ssl ? 's' : ''}://${routerSettings.host}:${routerSettings.port}/rest`;
    const auth = btoa(`${routerSettings.username}:${routerSettings.password}`);

    try {
      if (action === 'create' || action === 'update') {
        if (secret.service === 'pppoe') {
          // Create/Update PPPoE Secret
          const pppoeData = {
            name: secret.username,
            password: secret.password,
            service: 'pppoe',
            profile: secret.profile || 'default',
            'local-address': secret.local_address || '',
            'remote-address': secret.remote_address || '',
            comment: secret.comment || '',
            disabled: secret.disabled ? 'yes' : 'no',
          };

          if (action === 'create') {
            const response = await fetch(`${restUrl}/ppp/secret/add`, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(pppoeData),
            });

            if (!response.ok) {
              throw new Error(`REST API error: ${response.statusText}`);
            }
            console.log('PPPoE secret created via REST API');
          } else {
            // For update, we need to find the existing secret first
            const findResponse = await fetch(`${restUrl}/ppp/secret/print?name=${secret.username}`, {
              headers: { 'Authorization': `Basic ${auth}` },
            });

            if (findResponse.ok) {
              const secrets = await findResponse.json();
              if (secrets && secrets.length > 0) {
                const secretId = secrets[0]['.id'];
                const updateResponse = await fetch(`${restUrl}/ppp/secret/set`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ '.id': secretId, ...pppoeData }),
                });

                if (!updateResponse.ok) {
                  throw new Error(`REST API update error: ${updateResponse.statusText}`);
                }
                console.log('PPPoE secret updated via REST API');
              }
            }
          }
        } else if (secret.service === 'hotspot') {
          // Create/Update Hotspot User
          const hotspotData = {
            name: secret.username,
            password: secret.password,
            profile: secret.profile || 'default',
            comment: secret.comment || '',
            disabled: secret.disabled ? 'yes' : 'no',
          };

          if (action === 'create') {
            const response = await fetch(`${restUrl}/ip/hotspot/user/add`, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(hotspotData),
            });

            if (!response.ok) {
              throw new Error(`REST API error: ${response.statusText}`);
            }
            console.log('Hotspot user created via REST API');
          } else {
            // For update, find existing user first
            const findResponse = await fetch(`${restUrl}/ip/hotspot/user/print?name=${secret.username}`, {
              headers: { 'Authorization': `Basic ${auth}` },
            });

            if (findResponse.ok) {
              const users = await findResponse.json();
              if (users && users.length > 0) {
                const userId = users[0]['.id'];
                const updateResponse = await fetch(`${restUrl}/ip/hotspot/user/set`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ '.id': userId, ...hotspotData }),
                });

                if (!updateResponse.ok) {
                  throw new Error(`REST API update error: ${updateResponse.statusText}`);
                }
                console.log('Hotspot user updated via REST API');
              }
            }
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Secret ${action}d successfully in MikroTik`,
            method: 'REST API'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (action === 'delete') {
        // Delete from MikroTik
        if (secret.service === 'pppoe') {
          const findResponse = await fetch(`${restUrl}/ppp/secret/print?name=${secret.username}`, {
            headers: { 'Authorization': `Basic ${auth}` },
          });

          if (findResponse.ok) {
            const secrets = await findResponse.json();
            if (secrets && secrets.length > 0) {
              const secretId = secrets[0]['.id'];
              await fetch(`${restUrl}/ppp/secret/remove`, {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ '.id': secretId }),
              });
              console.log('PPPoE secret deleted via REST API');
            }
          }
        } else if (secret.service === 'hotspot') {
          const findResponse = await fetch(`${restUrl}/ip/hotspot/user/print?name=${secret.username}`, {
            headers: { 'Authorization': `Basic ${auth}` },
          });

          if (findResponse.ok) {
            const users = await findResponse.json();
            if (users && users.length > 0) {
              const userId = users[0]['.id'];
              await fetch(`${restUrl}/ip/hotspot/user/remove`, {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ '.id': userId }),
              });
              console.log('Hotspot user deleted via REST API');
            }
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Secret deleted successfully from MikroTik',
            method: 'REST API'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (restError: any) {
      console.log('REST API failed, trying API protocol:', restError.message);
      
      // Fallback to API protocol
      const apiClient = new MikrotikAPIClient(
        routerSettings.host,
        routerSettings.port,
        routerSettings.username,
        routerSettings.password
      );

      try {
        await apiClient.connect();

        if (action === 'create' || action === 'update') {
          if (secret.service === 'pppoe') {
            const params: Record<string, string> = {
              name: secret.username,
              password: secret.password,
              service: 'pppoe',
              profile: secret.profile || 'default',
              comment: secret.comment || '',
              disabled: secret.disabled ? 'yes' : 'no',
            };

            if (secret.local_address) params['local-address'] = secret.local_address;
            if (secret.remote_address) params['remote-address'] = secret.remote_address;

            if (action === 'create') {
              await apiClient.command('/ppp/secret/add', params);
              console.log('PPPoE secret created via API protocol');
            } else {
              // Find and update
              const existing = await apiClient.command('/ppp/secret/print', { name: secret.username });
              if (existing.length > 0) {
                params['.id'] = existing[0]['.id'];
                await apiClient.command('/ppp/secret/set', params);
                console.log('PPPoE secret updated via API protocol');
              }
            }
          } else if (secret.service === 'hotspot') {
            const params: Record<string, string> = {
              name: secret.username,
              password: secret.password,
              profile: secret.profile || 'default',
              comment: secret.comment || '',
              disabled: secret.disabled ? 'yes' : 'no',
            };

            if (action === 'create') {
              await apiClient.command('/ip/hotspot/user/add', params);
              console.log('Hotspot user created via API protocol');
            } else {
              const existing = await apiClient.command('/ip/hotspot/user/print', { name: secret.username });
              if (existing.length > 0) {
                params['.id'] = existing[0]['.id'];
                await apiClient.command('/ip/hotspot/user/set', params);
                console.log('Hotspot user updated via API protocol');
              }
            }
          }
        } else if (action === 'delete') {
          if (secret.service === 'pppoe') {
            const existing = await apiClient.command('/ppp/secret/print', { name: secret.username });
            if (existing.length > 0) {
              await apiClient.command('/ppp/secret/remove', { '.id': existing[0]['.id'] });
              console.log('PPPoE secret deleted via API protocol');
            }
          } else if (secret.service === 'hotspot') {
            const existing = await apiClient.command('/ip/hotspot/user/print', { name: secret.username });
            if (existing.length > 0) {
              await apiClient.command('/ip/hotspot/user/remove', { '.id': existing[0]['.id'] });
              console.log('Hotspot user deleted via API protocol');
            }
          }
        }

        await apiClient.close();

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Secret ${action}d successfully in MikroTik`,
            method: 'API Protocol'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (apiError: any) {
        await apiClient.close();
        throw new Error(`API protocol failed: ${apiError.message}`);
      }
    }

    throw new Error('Invalid action');
  } catch (error: any) {
    console.error('Error syncing secret:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});