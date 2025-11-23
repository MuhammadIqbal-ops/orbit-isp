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
import { Loader2, Network } from "lucide-react";

const routerSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.string().min(1, "Port is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  ssl: z.boolean(),
});

type RouterFormValues = z.infer<typeof routerSchema>;

export function RouterSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    } catch (error: any) {
      toast.error(error.message || "Failed to save router settings");
    } finally {
      setSaving(false);
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

            <Button type="submit" disabled={saving} className="mt-2">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Router Settings
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
