import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const subscriptionSchema = z.object({
  customer_id: z.string().min(1, "Customer is required"),
  package_id: z.string().min(1, "Package is required"),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  mikrotik_username: z.string().min(3, "Username must be at least 3 characters"),
  mikrotik_password: z.string().min(6, "Password must be at least 6 characters"),
  auto_renew: z.boolean(),
  status: z.enum(["active", "suspended", "expired"]),
});

type SubscriptionFormValues = z.infer<typeof subscriptionSchema>;

interface SubscriptionFormProps {
  subscriptionData?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function SubscriptionForm({
  subscriptionData,
  onSuccess,
  onCancel,
}: SubscriptionFormProps) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);

  const form = useForm<SubscriptionFormValues>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: subscriptionData || {
      customer_id: "",
      package_id: "",
      start_date: new Date().toISOString().split("T")[0],
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      mikrotik_username: "",
      mikrotik_password: "",
      auto_renew: true,
      status: "active",
    },
  });

  useEffect(() => {
    fetchCustomers();
    fetchPackages();
  }, []);

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("status", "active")
      .order("name");

    if (error) {
      toast.error("Failed to load customers");
      return;
    }
    setCustomers(data || []);
  };

  const fetchPackages = async () => {
    const { data, error } = await supabase
      .from("packages")
      .select("*")
      .order("name");

    if (error) {
      toast.error("Failed to load packages");
      return;
    }
    setPackages(data || []);
  };

  const onSubmit = async (values: SubscriptionFormValues) => {
    setLoading(true);
    try {
      if (subscriptionData) {
        const { error } = await supabase
          .from("subscriptions")
          .update({
            customer_id: values.customer_id,
            package_id: values.package_id,
            start_date: values.start_date,
            end_date: values.end_date,
            mikrotik_username: values.mikrotik_username,
            mikrotik_password: values.mikrotik_password,
            auto_renew: values.auto_renew,
            status: values.status,
          })
          .eq("id", subscriptionData.id);

        if (error) throw error;
        toast.success("Subscription updated successfully");
      } else {
        // Create subscription
        const { data: subscription, error: subError } = await supabase
          .from("subscriptions")
          .insert([{
            customer_id: values.customer_id,
            package_id: values.package_id,
            start_date: values.start_date,
            end_date: values.end_date,
            mikrotik_username: values.mikrotik_username,
            mikrotik_password: values.mikrotik_password,
            auto_renew: values.auto_renew,
            status: values.status,
          }])
          .select()
          .single();

        if (subError) throw subError;

        // Create PPPoE user in Mikrotik
        const { error: mikrotikError } = await supabase.functions.invoke(
          "mikrotik-create-user",
          {
            body: {
              subscriptionId: subscription.id,
              username: values.mikrotik_username,
              password: values.mikrotik_password,
              packageId: values.package_id,
            },
          }
        );

        if (mikrotikError) {
          console.error("Mikrotik user creation failed:", mikrotikError);
          toast.warning(
            "Subscription created but Mikrotik user creation failed"
          );
        } else {
          toast.success("Subscription created and synced to Mikrotik");
        }
      }
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Failed to save subscription");
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
              <FormLabel>Customer</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
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
          name="package_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Package</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select package" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name} - {pkg.bandwidth} ({pkg.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="mikrotik_username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PPPoE Username</FormLabel>
                <FormControl>
                  <Input placeholder="user001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mikrotik_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PPPoE Password</FormLabel>
                <FormControl>
                  <Input type="password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="auto_renew"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Auto Renew</FormLabel>
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

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {subscriptionData ? "Update" : "Create"} Subscription
          </Button>
        </div>
      </form>
    </Form>
  );
}
