import { useState } from 'react';
import { testApiConnection } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, RefreshCw, Server, Wifi } from 'lucide-react';

export function ApiConnectionTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    connected: boolean;
    url: string;
    message: string;
    latency?: number;
  } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    const res = await testApiConnection();
    setResult(res);
    setTesting(false);
  };

  return (
    <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            API Connection Test
          </span>
          {result && (
            <Badge 
              variant={result.connected ? 'default' : 'destructive'}
              className="animate-in fade-in"
            >
              {result.connected ? (
                <><Wifi className="h-3 w-3 mr-1" /> Connected</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Disconnected</>
              )}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            API Endpoint
          </div>
          <code className="text-sm font-mono text-foreground break-all">
            {result?.url || import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}
          </code>
        </div>
        
        {result && (
          <div 
            className={`p-4 rounded-lg border animate-in fade-in slide-in-from-top-2 ${
              result.connected 
                ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400' 
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}
          >
            <div className="flex items-start gap-3">
              {result.connected ? (
                <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium">{result.message}</p>
                {result.latency && (
                  <p className="text-xs mt-1 opacity-80">
                    Response time: {result.latency}ms
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {!result && (
          <div className="p-4 rounded-lg border border-dashed border-border text-center text-muted-foreground">
            <p className="text-sm">Click the button below to test API connection</p>
          </div>
        )}
        
        <Button 
          onClick={handleTest} 
          disabled={testing} 
          className="w-full"
          size="lg"
        >
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing Connection...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Test Connection
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Tip:</strong> Make sure Laravel server is running:
          </p>
          <code className="block p-2 rounded bg-muted font-mono text-[10px]">
            cd isp-billing-api && php artisan serve
          </code>
        </div>
      </CardContent>
    </Card>
  );
}

export default ApiConnectionTest;
