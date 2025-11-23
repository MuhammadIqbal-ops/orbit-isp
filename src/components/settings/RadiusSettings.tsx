import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Radio } from "lucide-react";

const radiusSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.number().min(1).max(65535),
  secret: z.string().min(1, "Secret is required"),
  nas_identifier: z.string().min(1, "NAS Identifier is required"),
  enabled: z.boolean(),
});

type RadiusFormValues = z.infer<typeof radiusSchema>;

export function RadiusSettings() {
  const [loading, setLoading] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const form = useForm<RadiusFormValues>({
    resolver: zodResolver(radiusSchema),
    defaultValues: {
      host: "",
      port: 1812,
      secret: "",
      nas_identifier: "mikrotik",
      enabled: false,
    },
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("radius_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettingsId(data.id);
        form.reset({
          host: data.host,
          port: data.port,
          secret: data.secret,
          nas_identifier: data.nas_identifier,
          enabled: data.enabled,
        });
      }
    } catch (error: any) {
      toast.error("Failed to load RADIUS settings");
    }
  };

  const onSubmit = async (values: RadiusFormValues) => {
    setLoading(true);
    try {
      const payload = {
        host: values.host,
        port: values.port,
        secret: values.secret,
        nas_identifier: values.nas_identifier,
        enabled: values.enabled,
      };

      if (settingsId) {
        const { error } = await supabase
          .from("radius_settings")
          .update(payload)
          .eq("id", settingsId);

        if (error) throw error;
        toast.success("RADIUS settings updated successfully");
      } else {
        const { data, error } = await supabase
          .from("radius_settings")
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        setSettingsId(data.id);
        toast.success("RADIUS settings created successfully");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save RADIUS settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Radio className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>FreeRADIUS Configuration</CardTitle>
            <CardDescription>
              Configure FreeRADIUS server for centralized authentication
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="host">RADIUS Server Host</Label>
              <Input
                id="host"
                placeholder="radius.example.com"
                {...form.register("host")}
              />
              {form.formState.errors.host && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.host.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                {...form.register("port", { valueAsNumber: true })}
              />
              {form.formState.errors.port && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.port.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="secret">Shared Secret</Label>
            <Input
              id="secret"
              type="password"
              placeholder="Enter shared secret"
              {...form.register("secret")}
            />
            {form.formState.errors.secret && (
              <p className="text-sm text-destructive">
                {form.formState.errors.secret.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nas_identifier">NAS Identifier</Label>
            <Input
              id="nas_identifier"
              placeholder="mikrotik"
              {...form.register("nas_identifier")}
            />
            {form.formState.errors.nas_identifier && (
              <p className="text-sm text-destructive">
                {form.formState.errors.nas_identifier.message}
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="enabled"
              checked={form.watch("enabled")}
              onCheckedChange={(checked) => form.setValue("enabled", checked)}
            />
            <Label htmlFor="enabled" className="font-normal">
              Enable RADIUS Authentication
            </Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save RADIUS Settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}