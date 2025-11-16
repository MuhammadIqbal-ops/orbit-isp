-- Create customers table
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone text,
  address text,
  email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create packages table
CREATE TABLE public.packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL,
  bandwidth text NOT NULL,
  burst text,
  priority int,
  type text NOT NULL CHECK (type IN ('pppoe', 'hotspot')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
  mikrotik_username text NOT NULL UNIQUE,
  mikrotik_password text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  auto_renew boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create invoices table
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'overdue')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount numeric NOT NULL,
  payment_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create router_settings table
CREATE TABLE public.router_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host text NOT NULL,
  port int NOT NULL DEFAULT 8728,
  username text NOT NULL,
  password text NOT NULL,
  ssl boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create user_roles table for admin access
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.router_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id = is_admin.user_id
      AND role = 'admin'
  )
$$;

-- RLS Policies - Only admins can access everything
CREATE POLICY "Admins can view customers" ON public.customers FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert customers" ON public.customers FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update customers" ON public.customers FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete customers" ON public.customers FOR DELETE USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view packages" ON public.packages FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert packages" ON public.packages FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update packages" ON public.packages FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete packages" ON public.packages FOR DELETE USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view subscriptions" ON public.subscriptions FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert subscriptions" ON public.subscriptions FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update subscriptions" ON public.subscriptions FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete subscriptions" ON public.subscriptions FOR DELETE USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view invoices" ON public.invoices FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view payments" ON public.payments FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert payments" ON public.payments FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update payments" ON public.payments FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete payments" ON public.payments FOR DELETE USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view router_settings" ON public.router_settings FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert router_settings" ON public.router_settings FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update router_settings" ON public.router_settings FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete router_settings" ON public.router_settings FOR DELETE USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_router_settings_updated_at BEFORE UPDATE ON public.router_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();