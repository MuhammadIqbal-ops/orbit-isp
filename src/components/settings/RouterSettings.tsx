import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Network, Wifi, WifiOff, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

const routerSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.string().min(1, "Port is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  ssl: z.boolean(),
});

type RouterFormValues = z.infer<typeof routerSchema>;

interface ConnectionTestResult {
  success: boolean;
  message: string;
  data?: {
    version?: string;
    'board-name'?: string;
    uptime?: string;
    'cpu-load'?: string;
  };
}

export function RouterSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const form = useForm<RouterFormValues>({
    resolver: zodResolver(routerSchema),
    defaultValues: {
      host: "",
      port: "8728",
      username: "",
      password: "",
      ssl: false,
    },
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("router_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettingsId(data.id);
        form.reset({
          host: data.host,
          port: data.port.toString(),
          username: data.username,
          password: data.password,
          ssl: data.ssl,
        });
      }
    } catch (error: any) {
      toast.error("Failed to load router settings");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: RouterFormValues) => {
    setSaving(true);
    try {
      const settingsPayload = {
        host: values.host,
        port: parseInt(values.port),
        username: values.username,
        password: values.password,
        ssl: values.ssl,
      };

      if (settingsId) {
        const { error } = await supabase
          .from("router_settings")
          .update(settingsPayload)
          .eq("id", settingsId);

        if (error) throw error;
        toast.success("Router settings updated successfully");
      } else {
        const { data, error } = await supabase
          .from("router_settings")
          .insert([settingsPayload])
          .select()
          .single();

        if (error) throw error;
        setSettingsId(data.id);
        toast.success("Router settings saved successfully");
      }
      
      // Clear previous test result after saving
      setTestResult(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to save router settings");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const response = await api.testRouterConnection();
      
      if (response.success) {
        setTestResult({
          success: true,
          message: "Connected to MikroTik router successfully!",
          data: response.data,
        });
        toast.success("Connection successful!");
      } else {
        setTestResult({
          success: false,
          message: response.message || "Failed to connect to router",
        });
        toast.error(response.message || "Connection failed");
      }
    } catch (error: any) {
      const errorMessage = error.message || "Failed to connect to Laravel backend";
      setTestResult({
        success: false,
        message: errorMessage,
      });
      toast.error(errorMessage);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading settings...</div>;
  }

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Network className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Mikrotik Router Configuration</CardTitle>
            <CardDescription>
              Configure connection to your Mikrotik RouterOS device
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="host"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Router Host/IP</FormLabel>
                  <FormControl>
                    <Input placeholder="192.168.88.1" {...field} />
                  </FormControl>
                  <FormDescription>
                    IP address or hostname of your Mikrotik router
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="port"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Port</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="8728" {...field} />
                  </FormControl>
                  <FormDescription>
                    Default API port is 8728 (or 8729 for SSL)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="admin" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ssl"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">SSL Connection</FormLabel>
                    <FormDescription>
                      Use SSL/TLS for secure connection
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Connection Test Result */}
            {testResult && (
              <div
                className={`rounded-lg border p-4 ${
                  testResult.success
                    ? "border-green-500/30 bg-green-500/10"
                    : "border-destructive/30 bg-destructive/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  {testResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p
                      className={`font-medium ${
                        testResult.success ? "text-green-500" : "text-destructive"
                      }`}
                    >
                      {testResult.success ? "Connection Successful" : "Connection Failed"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {testResult.message}
                    </p>
                    {testResult.success && testResult.data && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        {testResult.data.version && (
                          <div>
                            <span className="text-muted-foreground">Version:</span>{" "}
                            <span className="font-medium">{testResult.data.version}</span>
                          </div>
                        )}
                        {testResult.data['board-name'] && (
                          <div>
                            <span className="text-muted-foreground">Board:</span>{" "}
                            <span className="font-medium">{testResult.data['board-name']}</span>
                          </div>
                        )}
                        {testResult.data.uptime && (
                          <div>
                            <span className="text-muted-foreground">Uptime:</span>{" "}
                            <span className="font-medium">{testResult.data.uptime}</span>
                          </div>
                        )}
                        {testResult.data['cpu-load'] && (
                          <div>
                            <span className="text-muted-foreground">CPU Load:</span>{" "}
                            <span className="font-medium">{testResult.data['cpu-load']}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Router Settings
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={testConnection}
                disabled={testing || !form.getValues("host")}
              >
                {testing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Wifi className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}