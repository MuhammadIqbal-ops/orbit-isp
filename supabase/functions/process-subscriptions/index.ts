import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Subscription {
  id: string;
  customer_id: string;
  package_id: string;
  end_date: string;
  start_date: string;
  status: string;
  auto_renew: boolean;
  mikrotik_username: string;
  packages: {
    price: number;
    name: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Starting subscription processing...");

    const GRACE_DAYS = parseInt(Deno.env.get("BILLING_GRACE_DAYS") || "3");
    
    const today = new Date();
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    // Format dates as YYYY-MM-DD
    const todayStr = today.toISOString().split("T")[0];
    const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];
    
    // Helper function to log billing actions
    const logBillingAction = async (action: string, message: string, meta: any = {}) => {
      await supabase.from("billing_logs").insert({
        action,
        message,
        meta,
        ...meta.invoice_id && { invoice_id: meta.invoice_id },
        ...meta.subscription_id && { subscription_id: meta.subscription_id }
      });
    };

    // 1. Get subscriptions expiring in the next 7 days
    const { data: expiringSubs, error: expiringError } = await supabase
      .from("subscriptions")
      .select("*, packages(price, name)")
      .eq("status", "active")
      .gte("end_date", todayStr)
      .lte("end_date", sevenDaysStr);

    if (expiringError) {
      console.error("Error fetching expiring subscriptions:", expiringError);
    } else {
      console.log(`Found ${expiringSubs?.length || 0} subscriptions expiring soon`);

      // Generate invoices for expiring subscriptions (if not already exists)
      for (const sub of (expiringSubs as Subscription[]) || []) {
        // Check if invoice already exists
        const { data: existingInvoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("subscription_id", sub.id)
          .eq("due_date", sub.end_date)
          .single();

        if (!existingInvoice) {
          const { error: invoiceError } = await supabase
            .from("invoices")
            .insert({
              subscription_id: sub.id,
              amount: sub.packages.price,
              due_date: sub.end_date,
              status: "unpaid",
            });

          if (invoiceError) {
            console.error(`Error creating invoice for subscription ${sub.id}:`, invoiceError);
            await logBillingAction(
              "invoice_create_failed",
              `Failed to create expiring notice invoice: ${invoiceError.message}`,
              { subscription_id: sub.id, error: invoiceError.message }
            );
          } else {
            console.log(`Created invoice for subscription ${sub.id}`);
            await logBillingAction(
              "invoice_created",
              `Invoice created for expiring subscription`,
              { subscription_id: sub.id, due_date: sub.end_date, amount: sub.packages.price }
            );
          }
        }
      }
    }

    // 2. Get expired subscriptions
    const { data: expiredSubs, error: expiredError } = await supabase
      .from("subscriptions")
      .select("*, packages(price, name)")
      .eq("status", "active")
      .lt("end_date", todayStr);

    if (expiredError) {
      console.error("Error fetching expired subscriptions:", expiredError);
    } else {
      console.log(`Found ${expiredSubs?.length || 0} expired subscriptions`);

      // Get router settings for Mikrotik operations
      const { data: routerSettings } = await supabase
        .from("router_settings")
        .select("*")
        .single();

      // Process each expired subscription
      for (const sub of (expiredSubs as Subscription[]) || []) {
        // Check if there's an unpaid invoice
        const { data: unpaidInvoices } = await supabase
          .from("invoices")
          .select("id, status, due_date")
          .eq("subscription_id", sub.id)
          .in("status", ["unpaid", "overdue"])
          .order("due_date", { ascending: false });

        if (unpaidInvoices && unpaidInvoices.length > 0) {
          const latestInvoice = unpaidInvoices[0];
          const dueDate = new Date(latestInvoice.due_date);
          const daysSinceDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          
          console.log(`Invoice ${latestInvoice.id} is ${daysSinceDue} days overdue (grace period: ${GRACE_DAYS} days)`);
          
          // Mark invoice as overdue if past grace period
          if (daysSinceDue > 0 && latestInvoice.status === "unpaid") {
            await supabase
              .from("invoices")
              .update({ status: "overdue" })
              .eq("id", latestInvoice.id);
            
            await logBillingAction(
              "invoice_overdue",
              `Invoice marked as overdue (${daysSinceDue} days past due)`,
              { invoice_id: latestInvoice.id, subscription_id: sub.id, days_overdue: daysSinceDue }
            );
          }
          
          // Auto-disable after grace period
          if (daysSinceDue > GRACE_DAYS && sub.status === "active") {
            const { error: updateError } = await supabase
              .from("subscriptions")
              .update({ status: "expired" })
              .eq("id", sub.id);

            if (updateError) {
              console.error(`Error updating subscription ${sub.id}:`, updateError);
              await logBillingAction(
                "subscription_disable_failed",
                `Failed to disable subscription: ${updateError.message}`,
                { subscription_id: sub.id, error: updateError.message }
              );
            } else {
              console.log(`Suspended subscription ${sub.id} (${daysSinceDue} days overdue, beyond grace period)`);
              
              await logBillingAction(
                "subscription_expired",
                `Subscription expired due to unpaid invoice (${daysSinceDue} days overdue)`,
                { subscription_id: sub.id, invoice_id: latestInvoice.id, days_overdue: daysSinceDue }
              );

              // Disable user in Mikrotik
              if (routerSettings) {
                try {
                  const response = await supabase.functions.invoke("mikrotik-toggle-user", {
                    body: { username: sub.mikrotik_username, enable: false },
                  });
                  
                  if (response.error) {
                    console.error(`Error disabling user in Mikrotik:`, response.error);
                    await logBillingAction(
                      "mikrotik_disable_failed",
                      `Failed to disable user in MikroTik: ${response.error}`,
                      { subscription_id: sub.id, username: sub.mikrotik_username }
                    );
                  } else {
                    console.log(`Disabled user ${sub.mikrotik_username} in Mikrotik`);
                    await logBillingAction(
                      "mikrotik_user_disabled",
                      `User disabled in MikroTik due to unpaid invoice`,
                      { subscription_id: sub.id, username: sub.mikrotik_username }
                    );
                  }
                } catch (error) {
                  console.error(`Error calling mikrotik-toggle-user:`, error);
                  await logBillingAction(
                    "mikrotik_disable_error",
                    `Exception while disabling user: ${error}`,
                    { subscription_id: sub.id, username: sub.mikrotik_username }
                  );
                }
              }
            }
          }
        } else if (sub.auto_renew) {
          // Check if there's a paid invoice
          const { data: paidInvoice } = await supabase
            .from("invoices")
            .select("id, status")
            .eq("subscription_id", sub.id)
            .eq("status", "paid")
            .order("due_date", { ascending: false })
            .limit(1)
            .single();

          if (paidInvoice) {
            // Extend subscription by 30 days
            const newEndDate = new Date(sub.end_date);
            newEndDate.setDate(newEndDate.getDate() + 30);
            const newEndDateStr = newEndDate.toISOString().split("T")[0];

            const { error: renewError } = await supabase
              .from("subscriptions")
              .update({ 
                end_date: newEndDateStr,
                start_date: sub.end_date,
                status: "active"
              })
              .eq("id", sub.id);

            if (renewError) {
              console.error(`Error renewing subscription ${sub.id}:`, renewError);
              await logBillingAction(
                "subscription_renew_failed",
                `Failed to renew subscription: ${renewError.message}`,
                { subscription_id: sub.id, error: renewError.message }
              );
            } else {
              console.log(`Renewed subscription ${sub.id} until ${newEndDateStr}`);
              
              await logBillingAction(
                "subscription_renewed",
                `Subscription auto-renewed for 30 days`,
                { subscription_id: sub.id, new_end_date: newEndDateStr }
              );

              // Generate next invoice
              const { data: nextInvoice, error: nextInvoiceError } = await supabase
                .from("invoices")
                .insert({
                  subscription_id: sub.id,
                  amount: sub.packages.price,
                  due_date: newEndDateStr,
                  status: "unpaid",
                })
                .select()
                .single();

              if (nextInvoiceError) {
                console.error(`Error creating next invoice for subscription ${sub.id}:`, nextInvoiceError);
                await logBillingAction(
                  "invoice_create_failed",
                  `Failed to create renewal invoice: ${nextInvoiceError.message}`,
                  { subscription_id: sub.id, error: nextInvoiceError.message }
                );
              } else {
                console.log(`Created next invoice for subscription ${sub.id}`);
                await logBillingAction(
                  "invoice_created",
                  `Renewal invoice created`,
                  { subscription_id: sub.id, invoice_id: nextInvoice.id, amount: sub.packages.price }
                );
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Subscription processing completed",
        processed: {
          expiring: expiringSubs?.length || 0,
          expired: expiredSubs?.length || 0,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error processing subscriptions:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
