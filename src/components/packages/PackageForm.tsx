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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { toast } from "sonner";

const packageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.string().min(1, "Price is required"),
  bandwidth: z.string().min(1, "Bandwidth is required"),
  burst: z.string().optional(),
  priority: z.string().optional(),
  type: z.enum(["pppoe", "hotspot"], {
    required_error: "Please select a package type",
  }),
});

type PackageFormValues = z.infer<typeof packageSchema>;

interface PackageFormProps {
  packageData?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PackageForm({ packageData, onSuccess, onCancel }: PackageFormProps) {
  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: packageData?.name || "",
      price: packageData?.price?.toString() || "",
      bandwidth: packageData?.bandwidth || "",
      burst: packageData?.burst || "",
      priority: packageData?.priority?.toString() || "",
      type: packageData?.type || "pppoe",
    },
  });

  const onSubmit = async (values: PackageFormValues) => {
    try {
      const packagePayload = {
        name: values.name,
        price: parseFloat(values.price),
        bandwidth: values.bandwidth,
        burst: values.burst || null,
        priority: values.priority ? parseInt(values.priority) : null,
        type: values.type,
      };

      let packageId: string;

      if (packageData?.id) {
        const { error } = await supabase
          .from("packages")
          .update(packagePayload)
          .eq("id", packageData.id);

        if (error) throw error;
        packageId = packageData.id;
        toast.success("Package updated successfully");
      } else {
        const { data, error } = await supabase
          .from("packages")
          .insert([packagePayload])
          .select()
          .single();

        if (error) throw error;
        packageId = data.id;
        toast.success("Package created successfully");
      }

      // Sync to Mikrotik via Laravel API
      try {
        const response = await api.syncPackageToMikrotik(packageId);

        if (response.success) {
          toast.success("Package synced to Mikrotik");
        } else {
          console.error("Mikrotik sync error:", response.error);
          toast.warning("Package saved but Mikrotik sync failed");
        }
      } catch (syncError) {
        console.error("Mikrotik sync error:", syncError);
        toast.warning("Package saved but Mikrotik sync failed");
      }

      onSuccess();
      form.reset();
    } catch (error: any) {
      toast.error(error.message || "Failed to save package");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Package Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Premium 10Mbps" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Package Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
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
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Price</FormLabel>
              <FormControl>
                <Input type="number" placeholder="100000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bandwidth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bandwidth</FormLabel>
              <FormControl>
                <Input placeholder="e.g., 10M/10M" {...field} />
              </FormControl>
              <FormDescription>
                Format: download/upload (e.g., 10M/5M)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="burst"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Burst (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., 15M/10M" {...field} />
              </FormControl>
              <FormDescription>
                Maximum burst speed allowed
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priority (Optional)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="1-8" {...field} />
              </FormControl>
              <FormDescription>
                Queue priority (1-8, lower is higher priority)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 pt-4">
          <Button type="submit" className="flex-1">
            {packageData ? "Update" : "Create"} Package
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
