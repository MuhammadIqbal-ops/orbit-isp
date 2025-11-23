-- Function to automatically assign admin role to first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  -- Count existing users
  SELECT COUNT(*) INTO user_count FROM auth.users;
  
  -- If this is the first user, make them admin
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to run after user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create FreeRADIUS settings table
CREATE TABLE IF NOT EXISTS public.radius_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 1812,
  secret TEXT NOT NULL,
  nas_identifier TEXT NOT NULL DEFAULT 'mikrotik',
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.radius_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for radius_settings
CREATE POLICY "Admins can view radius_settings"
  ON public.radius_settings FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert radius_settings"
  ON public.radius_settings FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update radius_settings"
  ON public.radius_settings FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete radius_settings"
  ON public.radius_settings FOR DELETE
  USING (is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_radius_settings_updated_at
  BEFORE UPDATE ON public.radius_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();