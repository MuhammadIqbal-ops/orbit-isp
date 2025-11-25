import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Key, RefreshCw } from "lucide-react";

const formSchema = z.object({
  customer_id: z.string().optional().nullable(),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  service: z.enum(["pppoe", "hotspot"]),
  profile: z.string().optional().nullable(),
  local_address: z.string().optional().nullable(),
  remote_address: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
  disabled: z.boolean().default(false),
});

interface SecretFormProps {
  secretId?: string;
  onSuccess?: () => void;
}

export function SecretForm({ secretId, onSuccess }: SecretFormProps) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
      service: "pppoe",
      profile: "",
      local_address: "",
      remote_address: "",
      comment: "",
      disabled: false,
    },
  });

  useEffect(() => {
    fetchCustomers();
    if (secretId) {
      fetchSecret();
    }
  }, [secretId]);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    setCustomers(data || []);
  };

  const fetchSecret = async () => {
    if (!secretId) return;
    
    const { data, error } = await supabase
      .from("mikrotik_secrets")
      .select("*")
      .eq("id", secretId)
      .single();

    if (error) {
      toast.error("Failed to fetch secret");
      return;
    }

    if (data) {
      form.reset({
        customer_id: data.customer_id,
        username: data.username,
        password: data.password,
        service: data.service as "pppoe" | "hotspot",
        profile: data.profile,
        local_address: data.local_address,
        remote_address: data.remote_address,
        comment: data.comment,
        disabled: data.disabled,
      });
    }
  };

  const generatePassword = () => {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    form.setValue("password", password);
    toast.success("Password generated!");
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    try {
      if (secretId) {
        const { error } = await supabase
          .from("mikrotik_secrets")
          .update(values)
          .eq("id", secretId);

        if (error) throw error;
        toast.success("Secret updated successfully!");
      } else {
        const insertData = {
          username: values.username!,
          password: values.password!,
          service: values.service!,
          disabled: values.disabled || false,
          customer_id: values.customer_id || null,
          profile: values.profile || null,
          local_address: values.local_address || null,
          remote_address: values.remote_address || null,
          comment: values.comment || null,
        };
        
        const { error } = await supabase
          .from("mikrotik_secrets")
          .insert([insertData]);

        if (error) throw error;
        toast.success("Secret created successfully!");
        form.reset();
      }
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to save secret");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="customer_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Customer (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="service"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Service Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="pppoe">PPPoE</SelectItem>
                  <SelectItem value="hotspot">Hotspot</SelectItem>
                </SelectContent>
              </Select>
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
                <Input placeholder="Enter username" {...field} />
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
              <div className="flex gap-2">
                <FormControl>
                  <Input placeholder="Enter password" type="text" {...field} />
                </FormControl>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={generatePassword}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="profile"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profile (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="default-profile" {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="local_address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Local Address (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="192.168.1.1" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="remote_address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remote Address (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="192.168.1.2" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Comment (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Add notes..." {...field} value={field.value || ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="disabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <FormLabel>Disabled</FormLabel>
                <p className="text-xs text-muted-foreground">
                  Disable this secret without deleting it
                </p>
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

        <div className="flex gap-2">
          <Button type="submit" disabled={loading} className="flex-1">
            <Key className="mr-2 h-4 w-4" />
            {loading ? "Saving..." : secretId ? "Update Secret" : "Create Secret"}
          </Button>
        </div>
      </form>
    </Form>
  );
}