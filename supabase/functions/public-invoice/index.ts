import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role key to bypass RLS for public invoice access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { invoice_id } = body;

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: 'Invoice ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching public invoice: ${invoice_id}`);

    // Fetch invoice with related data
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select(`
        id,
        amount,
        due_date,
        status,
        payment_reference,
        payment_url,
        notes,
        created_at,
        subscription:subscriptions(
          id,
          mikrotik_username,
          start_date,
          end_date,
          customer:customers(
            id,
            name,
            email,
            phone,
            address
          ),
          package:packages(
            id,
            name,
            bandwidth,
            price,
            type
          )
        )
      `)
      .eq('id', invoice_id)
      .single();

    if (error || !invoice) {
      console.error('Invoice not found:', error);
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if invoice is already paid
    if (invoice.status === 'paid') {
      const { data: payment } = await supabase
        .from('payments')
        .select('payment_date, method, transaction_id')
        .eq('invoice_id', invoice_id)
        .single();

      return new Response(
        JSON.stringify({
          invoice,
          payment,
          already_paid: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        invoice,
        already_paid: false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Public invoice function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
