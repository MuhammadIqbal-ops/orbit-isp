import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// RouterOS API connection helper
class MikroTikAPI {
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

  async connect(): Promise<Deno.TcpConn> {
    try {
      const conn = await Deno.connect({
        hostname: this.host,
        port: this.port,
      });
      return conn;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to MikroTik: ${message}`);
    }
  }

  private encodeLength(length: number): Uint8Array {
    if (length < 0x80) {
      return new Uint8Array([length]);
    } else if (length < 0x4000) {
      return new Uint8Array([
        ((length >> 8) & 0xFF) | 0x80,
        length & 0xFF
      ]);
    } else if (length < 0x200000) {
      return new Uint8Array([
        ((length >> 16) & 0xFF) | 0xC0,
        (length >> 8) & 0xFF,
        length & 0xFF
      ]);
    } else if (length < 0x10000000) {
      return new Uint8Array([
        ((length >> 24) & 0xFF) | 0xE0,
        (length >> 16) & 0xFF,
        (length >> 8) & 0xFF,
        length & 0xFF
      ]);
    } else {
      return new Uint8Array([
        0xF0,
        (length >> 24) & 0xFF,
        (length >> 16) & 0xFF,
        (length >> 8) & 0xFF,
        length & 0xFF
      ]);
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

  private async readLength(conn: Deno.TcpConn): Promise<number> {
    const buf = new Uint8Array(1);
    await conn.read(buf);
    const b = buf[0];
    
    if (b < 0x80) {
      return b;
    } else if (b < 0xC0) {
      const buf2 = new Uint8Array(1);
      await conn.read(buf2);
      return ((b & 0x3F) << 8) | buf2[0];
    } else if (b < 0xE0) {
      const buf2 = new Uint8Array(2);
      await conn.read(buf2);
      return ((b & 0x1F) << 16) | (buf2[0] << 8) | buf2[1];
    } else if (b < 0xF0) {
      const buf2 = new Uint8Array(3);
      await conn.read(buf2);
      return ((b & 0x0F) << 24) | (buf2[0] << 16) | (buf2[1] << 8) | buf2[2];
    } else {
      const buf2 = new Uint8Array(4);
      await conn.read(buf2);
      return (buf2[0] << 24) | (buf2[1] << 16) | (buf2[2] << 8) | buf2[3];
    }
  }

  private async readWord(conn: Deno.TcpConn): Promise<string> {
    const length = await this.readLength(conn);
    if (length === 0) return '';
    
    const buf = new Uint8Array(length);
    let totalRead = 0;
    while (totalRead < length) {
      const n = await conn.read(buf.subarray(totalRead));
      if (n === null) break;
      totalRead += n;
    }
    
    const decoder = new TextDecoder();
    return decoder.decode(buf);
  }

  private async readSentence(conn: Deno.TcpConn): Promise<string[]> {
    const words: string[] = [];
    while (true) {
      const word = await this.readWord(conn);
      if (word === '') break;
      words.push(word);
    }
    return words;
  }

  private async writeSentence(conn: Deno.TcpConn, words: string[]): Promise<void> {
    for (const word of words) {
      const encoded = this.encodeWord(word);
      await conn.write(encoded);
    }
    // End of sentence
    await conn.write(new Uint8Array([0]));
  }

  async login(conn: Deno.TcpConn): Promise<boolean> {
    // Send login command
    await this.writeSentence(conn, ['/login', `=name=${this.username}`, `=password=${this.password}`]);
    
    // Read response
    const response = await this.readSentence(conn);
    
    if (response.length > 0 && response[0] === '!done') {
      return true;
    }
    
    throw new Error('Login failed');
  }

  async execute(conn: Deno.TcpConn, command: string, params: Record<string, string> = {}): Promise<any[]> {
    const words = [command];
    for (const [key, value] of Object.entries(params)) {
      words.push(`=${key}=${value}`);
    }
    
    await this.writeSentence(conn, words);
    
    const results: any[] = [];
    while (true) {
      const sentence = await this.readSentence(conn);
      if (sentence.length === 0) continue;
      
      if (sentence[0] === '!done') break;
      if (sentence[0] === '!trap') {
        const error = sentence.find(s => s.startsWith('=message='));
        throw new Error(error ? error.substring(9) : 'Unknown error');
      }
      
      if (sentence[0] === '!re') {
        const item: Record<string, string> = {};
        for (const word of sentence.slice(1)) {
          if (word.startsWith('=')) {
            const eq = word.indexOf('=', 1);
            if (eq > 0) {
              item[word.substring(1, eq)] = word.substring(eq + 1);
            }
          }
        }
        results.push(item);
      }
    }
    
    return results;
  }
}

async function getRouterSettings(supabase: any) {
  const { data, error } = await supabase
    .from('router_settings')
    .select('*')
    .limit(1)
    .single();
  
  if (error || !data) {
    throw new Error('Router settings not configured');
  }
  
  return data;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader || '' } } }
    );

    // Verify authentication for protected actions
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { error: authError } = await supabase.auth.getUser(token);
      if (authError) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const body = await req.json();
    const { action } = body;

    console.log(`MikroTik action: ${action}`);

    // Get router settings
    const settings = await getRouterSettings(supabase);
    const api = new MikroTikAPI(settings.host, settings.port, settings.username, settings.password);
    
    let result: any;
    let conn: Deno.TcpConn | null = null;

    try {
      conn = await api.connect();
      await api.login(conn);

      switch (action) {
        case 'test-connection':
          const sysInfo = await api.execute(conn, '/system/resource/print');
          result = {
            connected: true,
            system: sysInfo[0] || {},
            message: 'Connection successful',
          };
          break;

        case 'get-system':
          const resources = await api.execute(conn, '/system/resource/print');
          const identity = await api.execute(conn, '/system/identity/print');
          result = {
            ...resources[0],
            identity: identity[0]?.name || 'Unknown',
          };
          break;

        case 'get-traffic':
          const interfaces = await api.execute(conn, '/interface/print');
          result = interfaces.map((iface: any) => ({
            name: iface.name,
            type: iface.type,
            running: iface.running === 'true',
            disabled: iface.disabled === 'true',
            rxByte: parseInt(iface['rx-byte'] || '0'),
            txByte: parseInt(iface['tx-byte'] || '0'),
          }));
          break;

        case 'get-online-users':
          // Get PPPoE active connections
          const pppoeActive = await api.execute(conn, '/ppp/active/print');
          // Get Hotspot active users
          const hotspotActive = await api.execute(conn, '/ip/hotspot/active/print');
          
          result = {
            pppoe: pppoeActive.map((u: any) => ({
              name: u.name,
              service: u.service,
              callerId: u['caller-id'],
              address: u.address,
              uptime: u.uptime,
            })),
            hotspot: hotspotActive.map((u: any) => ({
              user: u.user,
              address: u.address,
              macAddress: u['mac-address'],
              uptime: u.uptime,
            })),
          };
          break;

        case 'get-user-detail':
          const { username, type } = body;
          if (type === 'pppoe') {
            const secret = await api.execute(conn, '/ppp/secret/print', { '?name': username });
            result = secret[0] || null;
          } else {
            const user = await api.execute(conn, '/ip/hotspot/user/print', { '?name': username });
            result = user[0] || null;
          }
          break;

        case 'toggle-user':
          const { username: toggleUser, type: toggleType, toggle } = body;
          const disabled = toggle === 'disable' ? 'yes' : 'no';
          
          if (toggleType === 'pppoe') {
            const secrets = await api.execute(conn, '/ppp/secret/print', { '?name': toggleUser });
            if (secrets.length > 0) {
              await api.execute(conn, '/ppp/secret/set', {
                '.id': secrets[0]['.id'],
                disabled,
              });
            }
          } else {
            const users = await api.execute(conn, '/ip/hotspot/user/print', { '?name': toggleUser });
            if (users.length > 0) {
              await api.execute(conn, '/ip/hotspot/user/set', {
                '.id': users[0]['.id'],
                disabled,
              });
            }
          }
          result = { success: true, message: `User ${toggle}d successfully` };
          break;

        case 'disconnect-user':
          const { username: dcUser, type: dcType } = body;
          if (dcType === 'pppoe') {
            const active = await api.execute(conn, '/ppp/active/print', { '?name': dcUser });
            if (active.length > 0) {
              await api.execute(conn, '/ppp/active/remove', { '.id': active[0]['.id'] });
            }
          } else {
            const active = await api.execute(conn, '/ip/hotspot/active/print', { '?user': dcUser });
            if (active.length > 0) {
              await api.execute(conn, '/ip/hotspot/active/remove', { '.id': active[0]['.id'] });
            }
          }
          result = { success: true, message: 'User disconnected' };
          break;

        case 'create-user':
          const { username: newUser, password: newPass, profile, service, comment } = body;
          if (service === 'pppoe') {
            await api.execute(conn, '/ppp/secret/add', {
              name: newUser,
              password: newPass,
              profile: profile || 'default',
              service: 'pppoe',
              comment: comment || '',
            });
          } else {
            await api.execute(conn, '/ip/hotspot/user/add', {
              name: newUser,
              password: newPass,
              profile: profile || 'default',
              comment: comment || '',
            });
          }
          result = { success: true, message: 'User created' };
          break;

        case 'delete-user':
          const { username: delUser, type: delType } = body;
          if (delType === 'pppoe') {
            const secrets = await api.execute(conn, '/ppp/secret/print', { '?name': delUser });
            if (secrets.length > 0) {
              await api.execute(conn, '/ppp/secret/remove', { '.id': secrets[0]['.id'] });
            }
          } else {
            const users = await api.execute(conn, '/ip/hotspot/user/print', { '?name': delUser });
            if (users.length > 0) {
              await api.execute(conn, '/ip/hotspot/user/remove', { '.id': users[0]['.id'] });
            }
          }
          result = { success: true, message: 'User deleted' };
          break;

        case 'sync-secret':
          const { secretId, syncAction } = body;
          const { data: secret } = await supabase
            .from('mikrotik_secrets')
            .select('*')
            .eq('id', secretId)
            .single();
          
          if (!secret && syncAction !== 'delete') {
            throw new Error('Secret not found');
          }

          if (syncAction === 'create') {
            if (secret.service === 'pppoe') {
              await api.execute(conn, '/ppp/secret/add', {
                name: secret.username,
                password: secret.password,
                profile: secret.profile || 'default',
                service: 'pppoe',
                comment: secret.comment || '',
                disabled: secret.disabled ? 'yes' : 'no',
              });
            } else {
              await api.execute(conn, '/ip/hotspot/user/add', {
                name: secret.username,
                password: secret.password,
                profile: secret.profile || 'default',
                comment: secret.comment || '',
                disabled: secret.disabled ? 'yes' : 'no',
              });
            }
          } else if (syncAction === 'update') {
            if (secret.service === 'pppoe') {
              const secrets = await api.execute(conn, '/ppp/secret/print', { '?name': secret.username });
              if (secrets.length > 0) {
                await api.execute(conn, '/ppp/secret/set', {
                  '.id': secrets[0]['.id'],
                  password: secret.password,
                  profile: secret.profile || 'default',
                  disabled: secret.disabled ? 'yes' : 'no',
                });
              }
            }
          } else if (syncAction === 'delete') {
            // Need to get username from request for delete
            const { username: delUsername, service: delService } = body;
            if (delService === 'pppoe') {
              const secrets = await api.execute(conn, '/ppp/secret/print', { '?name': delUsername });
              if (secrets.length > 0) {
                await api.execute(conn, '/ppp/secret/remove', { '.id': secrets[0]['.id'] });
              }
            }
          }
          result = { success: true, message: `Secret ${syncAction}d on router` };
          break;

        case 'import-secrets':
          // Import PPPoE secrets from router to database
          const pppSecrets = await api.execute(conn, '/ppp/secret/print');
          const importResults: any[] = [];
          
          for (const secret of pppSecrets) {
            const { data: existing } = await supabase
              .from('mikrotik_secrets')
              .select('id')
              .eq('username', secret.name)
              .single();
            
            if (!existing) {
              const { data: imported } = await supabase
                .from('mikrotik_secrets')
                .insert({
                  username: secret.name,
                  password: secret.password || '***',
                  service: 'pppoe',
                  profile: secret.profile,
                  disabled: secret.disabled === 'true',
                  comment: secret.comment,
                })
                .select()
                .single();
              
              if (imported) {
                importResults.push(imported);
              }
            }
          }
          result = { 
            success: true, 
            imported: importResults.length,
            message: `Imported ${importResults.length} secrets` 
          };
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

    } finally {
      if (conn) {
        conn.close();
      }
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('MikroTik function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
};

serve(handler);
