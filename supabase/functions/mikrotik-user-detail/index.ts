import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MikroTik API Client for RouterOS v6/v7
class MikrotikAPIClient {
  private conn: Deno.Conn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(
    private host: string,
    private port: number,
    private username: string,
    private password: string
  ) {}

  async connect(): Promise<void> {
    this.conn = await Deno.connect({ hostname: this.host, port: this.port });
    this.reader = this.conn.readable.getReader();
    this.writer = this.conn.writable.getWriter();
    await this.login();
  }

  private encodeLength(len: number): Uint8Array {
    if (len < 0x80) return new Uint8Array([len]);
    if (len < 0x4000) return new Uint8Array([0x80 | (len >> 8), len & 0xff]);
    if (len < 0x200000) return new Uint8Array([0xc0 | (len >> 16), (len >> 8) & 0xff, len & 0xff]);
    if (len < 0x10000000) return new Uint8Array([0xe0 | (len >> 24), (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
    return new Uint8Array([0xf0, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }

  private async readLength(): Promise<number> {
    if (!this.reader) throw new Error('Not connected');
    const { value: firstByte } = await this.reader.read();
    if (!firstByte || firstByte.length === 0) throw new Error('Connection closed');

    const b = firstByte[0];
    if ((b & 0x80) === 0) return b;
    if ((b & 0xc0) === 0x80) {
      const { value: secondByte } = await this.reader.read();
      if (!secondByte) throw new Error('Connection closed');
      return ((b & 0x3f) << 8) | secondByte[0];
    }
    if ((b & 0xe0) === 0xc0) {
      const { value: bytes } = await this.reader.read();
      if (!bytes || bytes.length < 2) throw new Error('Connection closed');
      return ((b & 0x1f) << 16) | (bytes[0] << 8) | bytes[1];
    }
    if ((b & 0xf0) === 0xe0) {
      const { value: bytes } = await this.reader.read();
      if (!bytes || bytes.length < 3) throw new Error('Connection closed');
      return ((b & 0x0f) << 24) | (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
    }
    const { value: bytes } = await this.reader.read();
    if (!bytes || bytes.length < 4) throw new Error('Connection closed');
    return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  }

  private async sendWord(word: string): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    const wordBytes = new TextEncoder().encode(word);
    const lengthBytes = this.encodeLength(wordBytes.length);
    await this.writer.write(new Uint8Array([...lengthBytes, ...wordBytes]));
  }

  private async readWord(): Promise<string> {
    const length = await this.readLength();
    if (length === 0) return '';
    if (!this.reader) throw new Error('Not connected');

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < length) {
      const { value } = await this.reader.read();
      if (!value) throw new Error('Connection closed');
      chunks.push(value);
      received += value.length;
    }

    const fullData = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      fullData.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(fullData.slice(0, length));
  }

  private async login(): Promise<void> {
    await this.sendWord('/login');
    await this.sendWord(`=name=${this.username}`);
    await this.sendWord(`=password=${this.password}`);
    await this.sendWord('');

    const response = await this.readWord();
    if (response !== '!done') {
      throw new Error('Login failed');
    }
  }

  async command(cmd: string, params: Record<string, string> = {}): Promise<Record<string, any>[]> {
    if (!this.writer) throw new Error('Not connected');

    await this.sendWord(cmd);
    for (const [key, value] of Object.entries(params)) {
      await this.sendWord(`=${key}=${value}`);
    }
    await this.sendWord('');

    const results: Record<string, any>[] = [];
    let currentItem: Record<string, any> = {};

    while (true) {
      const word = await this.readWord();
      if (word === '!done') break;
      if (word === '!re') {
        if (Object.keys(currentItem).length > 0) {
          results.push(currentItem);
          currentItem = {};
        }
        continue;
      }
      if (word.startsWith('=')) {
        const [key, ...valueParts] = word.slice(1).split('=');
        currentItem[key] = valueParts.join('=');
      }
    }

    if (Object.keys(currentItem).length > 0) {
      results.push(currentItem);
    }

    return results;
  }

  close(): void {
    if (this.reader) this.reader.releaseLock();
    if (this.writer) this.writer.releaseLock();
    if (this.conn) this.conn.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { username, type } = await req.json();
    
    if (!username || !type) {
      return new Response(JSON.stringify({ error: 'Username and type are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fetching details for ${type} user: ${username}`);

    // Get router settings
    const { data: settings, error: settingsError } = await supabase
      .from('router_settings')
      .select('*')
      .single();

    if (settingsError || !settings) {
      throw new Error('Router settings not found');
    }

    console.log(`Connecting to MikroTik at ${settings.host}:${settings.port}`);

    const client = new MikrotikAPIClient(
      settings.host,
      settings.port,
      settings.username,
      settings.password
    );

    await client.connect();
    console.log('✓ Connected to MikroTik API');

    let userDetail: any = null;
    let userStats: any = null;

    if (type === 'pppoe') {
      // Get PPPoE active session details
      const activeResults = await client.command('/ppp/active/print', { name: username });
      if (activeResults.length > 0) {
        userDetail = activeResults[0];
      }

      // Get PPPoE secret (profile) info
      const secretResults = await client.command('/ppp/secret/print', { name: username });
      if (secretResults.length > 0) {
        userStats = secretResults[0];
      }
    } else if (type === 'hotspot') {
      // Get Hotspot active session details
      const activeResults = await client.command('/ip/hotspot/active/print', { user: username });
      if (activeResults.length > 0) {
        userDetail = activeResults[0];
      }

      // Get Hotspot user profile
      const userResults = await client.command('/ip/hotspot/user/print', { name: username });
      if (userResults.length > 0) {
        userStats = userResults[0];
      }
    }

    client.close();

    if (!userDetail) {
      return new Response(JSON.stringify({ error: 'User not found or offline' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Helper to format bytes
    const formatBytes = (bytes: number) => {
      if (!bytes || bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Helper to format uptime
    const formatUptime = (uptime: string) => {
      if (!uptime) return "0m";
      return uptime.replace(/(\d+)w/g, '$1w ')
                   .replace(/(\d+)d/g, '$1d ')
                   .replace(/(\d+)h/g, '$1h ')
                   .replace(/(\d+)m/g, '$1m ')
                   .replace(/(\d+)s/g, 's')
                   .trim();
    };

    // Format response
    const response = {
      username: userDetail.name || userDetail.user || username,
      type: type,
      session: {
        id: userDetail['.id'],
        address: userDetail.address || 'N/A',
        macAddress: userDetail['caller-id'] || userDetail['mac-address'] || 'N/A',
        uptime: formatUptime(userDetail.uptime || ''),
        encoding: userDetail.encoding || 'N/A',
        service: userDetail.service || 'N/A',
      },
      bandwidth: {
        rxRate: formatBytes(parseInt(userDetail['rx-rate'] || 0)),
        txRate: formatBytes(parseInt(userDetail['tx-rate'] || 0)),
        rxBytes: formatBytes(parseInt(userDetail['rx-byte'] || 0)),
        txBytes: formatBytes(parseInt(userDetail['tx-byte'] || 0)),
        rxPackets: parseInt(userDetail['rx-packet'] || 0).toLocaleString(),
        txPackets: parseInt(userDetail['tx-packet'] || 0).toLocaleString(),
      },
      profile: userStats ? {
        profile: userStats.profile || userStats['local-address'] || 'N/A',
        service: userStats.service || 'N/A',
        limitAt: userStats['limit-at'] || 'N/A',
        maxLimit: userStats['max-limit'] || 'N/A',
        comment: userStats.comment || 'No comment',
      } : null,
    };

    console.log(`Successfully fetched details for ${username}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching user detail:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
