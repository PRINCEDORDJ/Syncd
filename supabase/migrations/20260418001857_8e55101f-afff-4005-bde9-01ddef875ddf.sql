-- LinkedIn connections: store OAuth tokens per user
CREATE TABLE public.linkedin_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  linkedin_member_urn TEXT NOT NULL,
  linkedin_name TEXT,
  linkedin_picture_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own linkedin connection"
  ON public.linkedin_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own linkedin connection"
  ON public.linkedin_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own linkedin connection"
  ON public.linkedin_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own linkedin connection"
  ON public.linkedin_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_linkedin_connections_updated_at
  BEFORE UPDATE ON public.linkedin_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Short-lived state table for OAuth CSRF protection
CREATE TABLE public.linkedin_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  redirect_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.linkedin_oauth_states ENABLE ROW LEVEL SECURITY;

-- Only service role touches this table (no policies = no access for anon/authenticated)
-- Cleanup old states function (called opportunistically)
CREATE OR REPLACE FUNCTION public.cleanup_linkedin_oauth_states()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.linkedin_oauth_states WHERE created_at < now() - INTERVAL '15 minutes';
$$;