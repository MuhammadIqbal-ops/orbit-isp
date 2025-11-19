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

const paymentSchema = z.object({
  invoice_id: z.string().min(1, "Invoice is required"),
  amount: z.string().min(1, "Amount is required"),
  method: z.enum(["cash", "bank_transfer", "card", "mobile_money"]),
  payment_date: z.string().min(1, "Payment date is required"),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface PaymentFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function PaymentForm({ onSuccess, onCancel }: PaymentFormProps) {
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      invoice_id: "",
      amount: "",
      method: "cash",
      payment_date: new Date().toISOString().split("T")[0],
    },
  });

  useEffect(() => {
    fetchUnpaidInvoices();
  }, []);

  const fetchUnpaidInvoices = async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select(
        `
        *,
        subscriptions(
          customers(name)
        )
      `
      )
      .neq("status", "paid")
      .order("due_date");

    if (error) {
      toast.error("Failed to load invoices");
      return;
    }
    setInvoices(data || []);
  };

  const onSubmit = async (values: PaymentFormValues) => {
    setLoading(true);
    try {
      // Record payment
      const { error: paymentError } = await supabase.from("payments").insert([
        {
          invoice_id: values.invoice_id,
          amount: parseFloat(values.amount),
          method: values.method,
          payment_date: values.payment_date,
        },
      ]);

      if (paymentError) throw paymentError;

      // Update invoice status to paid
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({ status: "paid" })
        .eq("id", values.invoice_id);

      if (invoiceError) throw invoiceError;

      toast.success("Payment recorded successfully");
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Failed to record payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="invoice_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Invoice</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select invoice" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {invoices.map((invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.subscriptions?.customers?.name} - $
                      {Number(invoice.amount).toFixed(2)} (Due:{" "}
                      {new Date(invoice.due_date).toLocaleDateString()})
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
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="method"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Method</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="payment_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </div>
      </form>
    </Form>
  );
}
