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

    const today = new Date();
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    // Format dates as YYYY-MM-DD
    const todayStr = today.toISOString().split("T")[0];
    const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];

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
          } else {
            console.log(`Created invoice for subscription ${sub.id}`);
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
        const { data: unpaidInvoice } = await supabase
          .from("invoices")
          .select("id, status")
          .eq("subscription_id", sub.id)
          .eq("status", "unpaid")
          .order("due_date", { ascending: false })
          .limit(1)
          .single();

        if (unpaidInvoice) {
          // Suspend subscription and disable user in Mikrotik
          const { error: updateError } = await supabase
            .from("subscriptions")
            .update({ status: "expired" })
            .eq("id", sub.id);

          if (updateError) {
            console.error(`Error updating subscription ${sub.id}:`, updateError);
          } else {
            console.log(`Suspended subscription ${sub.id}`);

            // Disable user in Mikrotik
            if (routerSettings) {
              try {
                const response = await supabase.functions.invoke("mikrotik-toggle-user", {
                  body: { username: sub.mikrotik_username, enabled: false },
                });
                console.log(`Disabled user ${sub.mikrotik_username} in Mikrotik`);
              } catch (error) {
                console.error(`Error disabling user in Mikrotik:`, error);
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
            } else {
              console.log(`Renewed subscription ${sub.id} until ${newEndDateStr}`);

              // Generate next invoice
              const { error: nextInvoiceError } = await supabase
                .from("invoices")
                .insert({
                  subscription_id: sub.id,
                  amount: sub.packages.price,
                  due_date: newEndDateStr,
                  status: "unpaid",
                });

              if (nextInvoiceError) {
                console.error(`Error creating next invoice for subscription ${sub.id}:`, nextInvoiceError);
              } else {
                console.log(`Created next invoice for subscription ${sub.id}`);
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
