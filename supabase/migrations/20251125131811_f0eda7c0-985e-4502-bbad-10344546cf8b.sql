-- Create billing_logs table for audit trail
CREATE TABLE public.billing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for billing_logs
CREATE POLICY "Admins can view billing_logs"
  ON public.billing_logs FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert billing_logs"
  ON public.billing_logs FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Add indexes for better query performance
CREATE INDEX idx_billing_logs_invoice_id ON public.billing_logs(invoice_id);
CREATE INDEX idx_billing_logs_subscription_id ON public.billing_logs(subscription_id);
CREATE INDEX idx_billing_logs_created_at ON public.billing_logs(created_at DESC);

-- Add payment_reference to invoices for tracking external payment IDs
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_url TEXT;

-- Add metadata columns if not exists
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transaction_id TEXT;