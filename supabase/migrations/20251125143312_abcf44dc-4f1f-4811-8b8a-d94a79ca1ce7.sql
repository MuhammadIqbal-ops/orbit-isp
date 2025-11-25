-- Create mikrotik_secrets table for PPPoE/Hotspot credentials
CREATE TABLE public.mikrotik_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('pppoe', 'hotspot')),
  profile TEXT,
  local_address TEXT,
  remote_address TEXT,
  comment TEXT,
  disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mikrotik_secrets ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can view secrets" 
ON public.mikrotik_secrets 
FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert secrets" 
ON public.mikrotik_secrets 
FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update secrets" 
ON public.mikrotik_secrets 
FOR UPDATE 
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete secrets" 
ON public.mikrotik_secrets 
FOR DELETE 
USING (is_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_mikrotik_secrets_updated_at
BEFORE UPDATE ON public.mikrotik_secrets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();