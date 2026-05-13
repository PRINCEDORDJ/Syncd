
-- Roles enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role helper (security definer to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- RLS: users can view their own roles; admins can view all
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Update get_user_plan: admins always resolve to 'teams' (unlimited)
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid)
RETURNS plan_tier
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN public.has_role(_user_id, 'admin') THEN 'teams'::plan_tier
      WHEN s.status IN ('active', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND (s.plan != 'trial' OR (s.trial_end IS NULL OR s.trial_end > now()))
      THEN s.plan
      ELSE 'trial'::plan_tier
    END
  FROM public.subscriptions s
  WHERE s.user_id = _user_id
  LIMIT 1;
$function$;

-- Grant admin to kinlion00@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('94aeefc0-567a-4e6e-8e9f-7714a7b7cba0', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
