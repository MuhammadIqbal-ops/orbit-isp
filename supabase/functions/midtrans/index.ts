import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') || '';
const MIDTRANS_CLIENT_KEY = Deno.env.get('MIDTRANS_CLIENT_KEY') || '';
const MIDTRANS_IS_PRODUCTION = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true';

const MIDTRANS_API_URL = MIDTRANS_IS_PRODUCTION 
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

interface SnapTokenRequest {
  invoice_id: string;
  amount: number;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  description?: string;
}

async function createSnapToken(data: SnapTokenRequest): Promise<{ token: string; redirect_url: string }> {
  const orderId = `INV-${data.invoice_id}-${Date.now()}`;
  
  const payload = {
    transaction_details: {
      order_id: orderId,
      gross_amount: data.amount,
    },
    customer_details: {
      first_name: data.customer_name,
      email: data.customer_email || '',
      phone: data.customer_phone || '',
    },
    item_details: [
      {
        id: data.invoice_id,
        price: data.amount,
        quantity: 1,
        name: data.description || 'Internet Subscription',
      },
    ],
    callbacks: {
      finish: `${Deno.env.get('SUPABASE_URL')?.replace('/rest/v1', '')}/functions/v1/midtrans?action=callback`,
    },
  };

  const authString = btoa(`${MIDTRANS_SERVER_KEY}:`);
  
  const response = await fetch(MIDTRANS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${authString}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Midtrans error:', errorText);
    throw new Error(`Midtrans API error: ${response.status}`);
  }

  const result = await response.json();
  return {
    token: result.token,
    redirect_url: result.redirect_url,
  };
}

function verifySignature(orderId: string, statusCode: string, grossAmount: string, signatureKey: string): boolean {
  const payload = `${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY}`;
  const hash = createHmac('sha512', MIDTRANS_SERVER_KEY)
    .update(payload)
    .digest('hex');
  return hash === signatureKey;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const actionFromQuery = url.searchParams.get('action');
    
    let body: any = {};
    if (req.method === 'POST') {
      body = await req.json();
    }

    const action = actionFromQuery || body.action;
    console.log(`Midtrans action: ${action}`);

    switch (action) {
      case 'create-snap-token': {
        // Verify authentication
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { token, redirect_url } = await createSnapToken(body);
        
        // Update invoice with payment reference
        const orderId = `INV-${body.invoice_id}-${Date.now()}`;
        await supabase
          .from('invoices')
          .update({ 
            payment_reference: orderId,
            payment_url: redirect_url,
          })
          .eq('id', body.invoice_id);

        return new Response(
          JSON.stringify({ snap_token: token, order_id: orderId, redirect_url }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'notification': {
        // Midtrans webhook notification
        const { 
          order_id, 
          transaction_status, 
          status_code, 
          gross_amount,
          signature_key,
          payment_type,
          transaction_id,
        } = body;

        console.log(`Payment notification: ${order_id} - ${transaction_status}`);

        // Verify signature
        if (!verifySignature(order_id, status_code, gross_amount, signature_key)) {
          console.error('Invalid signature');
          return new Response(
            JSON.stringify({ error: 'Invalid signature' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extract invoice_id from order_id (format: INV-{invoice_id}-{timestamp})
        const invoiceIdMatch = order_id.match(/^INV-(.+)-\d+$/);
        if (!invoiceIdMatch) {
          throw new Error('Invalid order_id format');
        }
        const invoiceId = invoiceIdMatch[1];

        // Handle different transaction statuses
        let invoiceStatus = 'unpaid';
        
        if (transaction_status === 'capture' || transaction_status === 'settlement') {
          invoiceStatus = 'paid';
          
          // Create payment record
          await supabase.from('payments').insert({
            invoice_id: invoiceId,
            amount: parseFloat(gross_amount),
            method: payment_type,
            transaction_id: transaction_id,
          });

          // Update subscription status if needed
          const { data: invoice } = await supabase
            .from('invoices')
            .select('subscription_id')
            .eq('id', invoiceId)
            .single();

          if (invoice?.subscription_id) {
            await supabase
              .from('subscriptions')
              .update({ status: 'active' })
              .eq('id', invoice.subscription_id);
          }

          // Log billing event
          await supabase.from('billing_logs').insert({
            invoice_id: invoiceId,
            action: 'payment_received',
            message: `Payment received via ${payment_type}`,
            meta: { transaction_id, amount: gross_amount },
          });

        } else if (transaction_status === 'pending') {
          invoiceStatus = 'pending';
        } else if (transaction_status === 'deny' || transaction_status === 'cancel' || transaction_status === 'expire') {
          invoiceStatus = 'unpaid';
          
          await supabase.from('billing_logs').insert({
            invoice_id: invoiceId,
            action: 'payment_failed',
            message: `Payment ${transaction_status}`,
            meta: { transaction_id, status: transaction_status },
          });
        }

        // Update invoice status
        await supabase
          .from('invoices')
          .update({ status: invoiceStatus })
          .eq('id', invoiceId);

        return new Response(
          JSON.stringify({ status: 'ok' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'callback': {
        // Handle redirect callback from Midtrans
        // This is typically just a redirect, but we can log it
        console.log('Payment callback received');
        return new Response(
          JSON.stringify({ message: 'Callback received' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('Midtrans function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
