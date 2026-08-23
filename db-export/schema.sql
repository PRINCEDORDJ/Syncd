-- Consolidated schema for Syncd
-- Generated from supabase/migrations in filename order.
-- Run top-to-bottom against a fresh Supabase project (SQL editor or psql).


-- ============================================================
-- 20260417021643_97e5ec16-b679-4776-9558-7332bd8e1b32.sql
-- ============================================================
-- Reusable updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  voice_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create a profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drafts table
CREATE TABLE public.drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled draft',
  raw_input TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'Authoritative & Warm',
  char_count INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own drafts"
  ON public.drafts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own drafts"
  ON public.drafts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drafts"
  ON public.drafts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own drafts"
  ON public.drafts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_drafts_user_id_updated ON public.drafts(user_id, updated_at DESC);

CREATE TRIGGER update_drafts_updated_at
BEFORE UPDATE ON public.drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 20260418001857_8e55101f-afff-4005-bde9-01ddef875ddf.sql
-- ============================================================
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

-- ============================================================
-- 20260421044951_ad131da5-e90e-41cc-85eb-ed59a6b940a6.sql
-- ============================================================
-- Plan tier enum
CREATE TYPE public.plan_tier AS ENUM ('trial', 'studio', 'teams');

-- Subscription status enum
CREATE TYPE public.subscription_status AS ENUM ('active', 'canceled', 'past_due', 'expired', 'trialing');

-- Subscriptions table
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  plan plan_tier NOT NULL DEFAULT 'trial',
  status subscription_status NOT NULL DEFAULT 'trialing',
  polar_customer_id TEXT,
  polar_subscription_id TEXT UNIQUE,
  polar_product_id TEXT,
  current_period_end TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '7 days'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_polar_subscription_id ON public.subscriptions(polar_subscription_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users view own subscription"
ON public.subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- No client-side INSERT/UPDATE/DELETE - only service role (webhooks) can modify

-- Updated_at trigger
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create trial subscription on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status, trial_end)
  VALUES (NEW.id, 'trial', 'trialing', now() + INTERVAL '7 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert (chained alongside existing handle_new_user)
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_subscription();

-- Backfill subscriptions for existing users
INSERT INTO public.subscriptions (user_id, plan, status, trial_end)
SELECT id, 'trial', 'trialing', now() + INTERVAL '7 days'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Helper function: get effective plan for a user
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id UUID)
RETURNS plan_tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN s.status IN ('active', 'trialing') AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND (s.plan != 'trial' OR (s.trial_end IS NULL OR s.trial_end > now()))
      THEN s.plan
      ELSE 'trial'::plan_tier
    END
  FROM public.subscriptions s
  WHERE s.user_id = _user_id
  LIMIT 1;
$$;

-- ============================================================
-- 20260501063448_c80b9f3c-3069-4cc8-95f5-09f22a54d089.sql
-- ============================================================
ALTER TABLE public.drafts ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';

-- ============================================================
-- 20260507165058_98eb3e1a-c00a-4276-9163-814a81b5685a.sql
-- ============================================================
-- Restrict profile reads to owner
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add explicit owner-scoped SELECT policy for linkedin_oauth_states
CREATE POLICY "Users can view their own oauth state"
  ON public.linkedin_oauth_states
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 20260513205612_5754d149-d65a-4f49-a03a-21758fdc9b57.sql
-- ============================================================

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


-- ============================================================
-- 20260513210726_3620e9d2-647c-44a4-8005-deceff47e7ab.sql
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly accessible"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete their own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);


-- ============================================================
-- 20260514142845_6ed630f6-b2bc-41c8-8ee3-2cdb215ea192.sql
-- ============================================================
ALTER TABLE public.drafts ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- 20260703003651_8acf47dc-e9b8-46ff-ad7c-ff56593bde3d.sql
-- ============================================================

-- 1. Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated where not needed
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_linkedin_oauth_states() FROM PUBLIC, anon, authenticated;

-- has_role and get_user_plan are used by the app for signed-in users; keep authenticated, revoke anon
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated, service_role;

-- Ensure service_role can still invoke trigger/maintenance functions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user_subscription() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_linkedin_oauth_states() TO service_role;

-- 2. user_roles: add explicit deny policies for INSERT/UPDATE/DELETE for authenticated users
-- (service_role bypasses RLS, so admin flows still work)
CREATE POLICY "No client inserts on user_roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client updates on user_roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "No client deletes on user_roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (false);

-- 3. Storage: replace broad public listing policy on avatars with owner-scoped listing.
-- Public URL reads (/storage/v1/object/public/...) bypass RLS, so avatars remain viewable by URL.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

CREATE POLICY "Users can list their own avatar folder"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- 20260710221015_912e24cc-4710-4b1f-804b-64015f61954f.sql
-- ============================================================
ALTER TABLE public.drafts ADD COLUMN IF NOT EXISTS videos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- 20260713012245_1e33d32d-effb-4c0d-8e8b-7ab78e2fc806.sql
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- ============================================================
-- 20260722015839_4db6b720-44cc-4990-bf2a-3096fd0dfe10.sql
-- ============================================================

-- ============ CREDITS ============
CREATE TABLE public.user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_credits integer NOT NULL DEFAULT 30,
  topup_credits integer NOT NULL DEFAULT 0,
  daily_credits_used integer NOT NULL DEFAULT 0,
  last_daily_reset date NOT NULL DEFAULT CURRENT_DATE,
  last_monthly_reset date NOT NULL DEFAULT date_trunc('month', now())::date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own credits" ON public.user_credits FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_tx_user_id_idx ON public.credit_transactions(user_id, created_at DESC);
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON public.credit_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Auto-provision credits on new signup
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_credits (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 30, 'subscription_grant', 'Free plan signup grant');
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_credits() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();

-- Backfill credits for existing users
INSERT INTO public.user_credits (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- consume_credit(user_id, is_free)
CREATE OR REPLACE FUNCTION public.consume_credit(_user_id uuid, _is_free boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.user_credits%ROWTYPE;
  monthly_start date := date_trunc('month', now())::date;
BEGIN
  -- Admin bypass: unlimited
  IF public.has_role(_user_id, 'admin') THEN
    RETURN jsonb_build_object('success', true, 'admin', true);
  END IF;

  SELECT * INTO r FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id) VALUES (_user_id) RETURNING * INTO r;
  END IF;

  -- Daily reset
  IF r.last_daily_reset < CURRENT_DATE THEN
    UPDATE public.user_credits SET daily_credits_used = 0, last_daily_reset = CURRENT_DATE
      WHERE user_id = _user_id RETURNING * INTO r;
  END IF;

  -- Monthly reset for paid tiers (free stays at fixed monthly cap, but we still reset counters)
  IF r.last_monthly_reset < monthly_start THEN
    -- Free users get 30 credits refilled monthly (topups preserved); paid handled via webhook
    IF _is_free THEN
      UPDATE public.user_credits
        SET subscription_credits = 30, last_monthly_reset = monthly_start
        WHERE user_id = _user_id RETURNING * INTO r;
    ELSE
      UPDATE public.user_credits SET last_monthly_reset = monthly_start
        WHERE user_id = _user_id RETURNING * INTO r;
    END IF;
  END IF;

  -- Free daily cap
  IF _is_free AND r.daily_credits_used >= 5 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'daily_limit_reached');
  END IF;

  -- Deduct subscription first, then topup
  IF r.subscription_credits > 0 THEN
    UPDATE public.user_credits SET
      subscription_credits = subscription_credits - 1,
      daily_credits_used = CASE WHEN _is_free THEN daily_credits_used + 1 ELSE daily_credits_used END,
      updated_at = now()
      WHERE user_id = _user_id;
  ELSIF r.topup_credits > 0 THEN
    UPDATE public.user_credits SET
      topup_credits = topup_credits - 1,
      daily_credits_used = CASE WHEN _is_free THEN daily_credits_used + 1 ELSE daily_credits_used END,
      updated_at = now()
      WHERE user_id = _user_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'reason', 'no_credits');
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, -1, 'generation_use', 'AI generation');
  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.consume_credit(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- grant subscription credits (called by Polar webhook)
CREATE OR REPLACE FUNCTION public.grant_subscription_credits(_user_id uuid, _amount integer, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, subscription_credits, last_monthly_reset)
    VALUES (_user_id, _amount, date_trunc('month', now())::date)
    ON CONFLICT (user_id) DO UPDATE SET
      subscription_credits = _amount,
      last_monthly_reset = date_trunc('month', now())::date,
      updated_at = now();
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, _amount, 'subscription_grant', _reason);
END; $$;
REVOKE EXECUTE ON FUNCTION public.grant_subscription_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;

-- grant topup credits (called by Polar webhook on one-time order)
CREATE OR REPLACE FUNCTION public.grant_topup_credits(_user_id uuid, _amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, topup_credits)
    VALUES (_user_id, _amount)
    ON CONFLICT (user_id) DO UPDATE SET
      topup_credits = user_credits.topup_credits + _amount,
      updated_at = now();
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, _amount, 'topup_purchase', 'Top-up pack purchase');
END; $$;
REVOKE EXECUTE ON FUNCTION public.grant_topup_credits(uuid, integer) FROM PUBLIC, anon, authenticated;

-- ============ TEAMS ============
CREATE TYPE public.team_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My team',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.team_role NOT NULL DEFAULT 'editor',
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(team_id, email)
);
CREATE INDEX team_members_user_idx ON public.team_members(user_id);
CREATE INDEX team_members_email_idx ON public.team_members(lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND accepted_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.teams WHERE id = _team_id AND owner_id = _user_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_role(_team_id uuid, _user_id uuid)
RETURNS public.team_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.teams WHERE id = _team_id AND owner_id = _user_id) THEN 'owner'::public.team_role
    ELSE (SELECT role FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id AND accepted_at IS NOT NULL LIMIT 1)
  END;
$$;
GRANT EXECUTE ON FUNCTION public.get_team_role(uuid, uuid) TO authenticated;

-- Teams RLS
CREATE POLICY "Members can view their teams" ON public.teams FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_team_member(id, auth.uid()));
CREATE POLICY "Owners manage teams" ON public.teams FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners delete teams" ON public.teams FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Team members RLS
CREATE POLICY "Members view own team members" ON public.team_members FOR SELECT TO authenticated
  USING (public.is_team_member(team_id, auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Owners insert members" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()));
CREATE POLICY "Owners update members" ON public.team_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()) OR user_id = auth.uid())
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Owners delete members" ON public.team_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()));

-- Enforce seat cap (max 5 members incl. owner)
CREATE OR REPLACE FUNCTION public.enforce_team_seat_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM public.team_members WHERE team_id = NEW.team_id;
  IF cnt >= 5 THEN
    RAISE EXCEPTION 'Team seat limit reached (5 members max)';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER team_members_seat_cap BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_seat_cap();

-- ============ DRAFTS: teams + scheduling ============
ALTER TABLE public.drafts ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.drafts ADD COLUMN scheduled_at timestamptz;
ALTER TABLE public.drafts ADD COLUMN schedule_status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.drafts ADD COLUMN schedule_error text;
CREATE INDEX drafts_scheduled_idx ON public.drafts(scheduled_at) WHERE schedule_status = 'scheduled';
CREATE INDEX drafts_team_id_idx ON public.drafts(team_id);

-- Rewrite drafts RLS to include team access
DROP POLICY IF EXISTS "Users can view own drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can insert own drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can update own drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can delete own drafts" ON public.drafts;

CREATE POLICY "View drafts (own or team)" ON public.drafts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "Insert own drafts" ON public.drafts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update drafts (owner or editor)" ON public.drafts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.get_team_role(team_id, auth.uid()) IN ('owner','editor')))
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.get_team_role(team_id, auth.uid()) IN ('owner','editor')));
CREATE POLICY "Delete drafts (owner only)" ON public.drafts FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ============================================================
-- 20260722015901_a5fe73da-536c-4ece-bd64-e6c22d6da932.sql
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.enforce_team_seat_cap() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 20260723003258_58b4eac8-3329-4591-b1e3-6946e59d186f.sql
-- ============================================================

-- ============================================================================
-- 1) CREDIT LOGIC: drop old consume_credit(uuid, boolean), replace with (uuid)
-- ============================================================================
DROP FUNCTION IF EXISTS public.consume_credit(uuid, boolean);

CREATE OR REPLACE FUNCTION public.consume_credit(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.user_credits%ROWTYPE;
  monthly_start date := date_trunc('month', now())::date;
  v_plan public.plan_tier;
  v_is_free boolean;
BEGIN
  -- Admin bypass
  IF public.has_role(_user_id, 'admin') THEN
    RETURN jsonb_build_object('success', true, 'admin', true);
  END IF;

  -- Derive plan server-side
  v_plan := public.get_user_plan(_user_id);
  v_is_free := (v_plan = 'trial');

  SELECT * INTO r FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id) VALUES (_user_id) RETURNING * INTO r;
  END IF;

  -- Daily reset
  IF r.last_daily_reset < CURRENT_DATE THEN
    UPDATE public.user_credits SET daily_credits_used = 0, last_daily_reset = CURRENT_DATE
      WHERE user_id = _user_id RETURNING * INTO r;
  END IF;

  -- Monthly reset for trial (30 refill)
  IF r.last_monthly_reset < monthly_start THEN
    IF v_is_free THEN
      UPDATE public.user_credits
        SET subscription_credits = 30, last_monthly_reset = monthly_start
        WHERE user_id = _user_id RETURNING * INTO r;
    ELSE
      UPDATE public.user_credits SET last_monthly_reset = monthly_start
        WHERE user_id = _user_id RETURNING * INTO r;
    END IF;
  END IF;

  -- Free daily cap
  IF v_is_free AND r.daily_credits_used >= 5 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'daily_limit_reached');
  END IF;

  IF r.subscription_credits > 0 THEN
    UPDATE public.user_credits SET
      subscription_credits = subscription_credits - 1,
      daily_credits_used = CASE WHEN v_is_free THEN daily_credits_used + 1 ELSE daily_credits_used END,
      updated_at = now()
      WHERE user_id = _user_id;
  ELSIF r.topup_credits > 0 THEN
    UPDATE public.user_credits SET
      topup_credits = topup_credits - 1,
      daily_credits_used = CASE WHEN v_is_free THEN daily_credits_used + 1 ELSE daily_credits_used END,
      updated_at = now()
      WHERE user_id = _user_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'reason', 'no_credits');
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, -1, 'generation_use', 'AI generation');
  RETURN jsonb_build_object('success', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.consume_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credit(uuid) TO service_role;

-- ============================================================================
-- 2) refund_credit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refund_credit(_user_id uuid, _reason text DEFAULT 'generation_failed')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.user_credits%ROWTYPE;
  v_plan public.plan_tier;
  v_allocation int;
BEGIN
  IF public.has_role(_user_id, 'admin') THEN
    RETURN;
  END IF;

  v_plan := public.get_user_plan(_user_id);
  v_allocation := CASE v_plan
    WHEN 'trial'  THEN 30
    WHEN 'studio' THEN 100
    WHEN 'teams'  THEN 350
    ELSE 30
  END;

  SELECT * INTO r FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF r.subscription_credits < v_allocation THEN
    UPDATE public.user_credits SET
      subscription_credits = subscription_credits + 1,
      daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                THEN daily_credits_used - 1 ELSE daily_credits_used END,
      updated_at = now()
    WHERE user_id = _user_id;
  ELSE
    UPDATE public.user_credits SET
      topup_credits = topup_credits + 1,
      daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                THEN daily_credits_used - 1 ELSE daily_credits_used END,
      updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, 1, 'generation_use', 'Credit refunded — ' || _reason);
END; $$;

REVOKE EXECUTE ON FUNCTION public.refund_credit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid, text) TO service_role;

-- ============================================================================
-- 3) handle_plan_change
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_plan_change(
  _user_id  uuid,
  _new_plan public.plan_tier,
  _old_plan public.plan_tier
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new int;
  v_old int;
BEGIN
  v_new := CASE _new_plan WHEN 'trial' THEN 30 WHEN 'studio' THEN 100 WHEN 'teams' THEN 350 ELSE 30 END;
  v_old := CASE _old_plan WHEN 'trial' THEN 30 WHEN 'studio' THEN 100 WHEN 'teams' THEN 350 ELSE 30 END;

  INSERT INTO public.user_credits (user_id) VALUES (_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  IF v_new > v_old THEN
    UPDATE public.user_credits SET
      subscription_credits = v_new,
      last_monthly_reset = date_trunc('month', now())::date,
      updated_at = now()
    WHERE user_id = _user_id;
  ELSE
    UPDATE public.user_credits SET
      subscription_credits = LEAST(subscription_credits, v_new),
      updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (
      _user_id,
      v_new - v_old,
      'plan_change',
      'Plan changed from ' || _old_plan::text || ' to ' || _new_plan::text
    );
END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_plan_change(uuid, public.plan_tier, public.plan_tier) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_plan_change(uuid, public.plan_tier, public.plan_tier) TO service_role;

-- ============================================================================
-- 4) Storage quota tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_storage (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bytes_used bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_storage TO authenticated;
GRANT ALL ON public.user_storage TO service_role;

ALTER TABLE public.user_storage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own storage" ON public.user_storage;
CREATE POLICY "user reads own storage"
  ON public.user_storage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add media_bytes column to drafts
ALTER TABLE public.drafts ADD COLUMN IF NOT EXISTS media_bytes bigint NOT NULL DEFAULT 0;

-- Trigger fn: keep user_storage.bytes_used in sync and enforce quota
CREATE OR REPLACE FUNCTION public.sync_draft_storage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta bigint := 0;
  v_uid uuid;
  v_plan public.plan_tier;
  v_limit bigint;
  v_used bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := COALESCE(NEW.media_bytes, 0);
    v_uid := NEW.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta := COALESCE(NEW.media_bytes, 0) - COALESCE(OLD.media_bytes, 0);
    v_uid := NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := -COALESCE(OLD.media_bytes, 0);
    v_uid := OLD.user_id;
  END IF;

  IF v_uid IS NULL OR v_delta = 0 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Quota check on increases (skip for admin)
  IF v_delta > 0 AND NOT public.has_role(v_uid, 'admin') THEN
    v_plan := public.get_user_plan(v_uid);
    v_limit := CASE v_plan
      WHEN 'trial'  THEN 209715200::bigint    -- 200 MB
      WHEN 'studio' THEN 5368709120::bigint   -- 5 GB
      WHEN 'teams'  THEN 21474836480::bigint  -- 20 GB
      ELSE 209715200::bigint
    END;
    SELECT COALESCE(bytes_used, 0) INTO v_used FROM public.user_storage WHERE user_id = v_uid;
    IF (COALESCE(v_used, 0) + v_delta) > v_limit THEN
      RAISE EXCEPTION 'storage_quota_exceeded' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.user_storage (user_id, bytes_used, updated_at)
    VALUES (v_uid, GREATEST(0, v_delta), now())
    ON CONFLICT (user_id) DO UPDATE
      SET bytes_used = GREATEST(0, public.user_storage.bytes_used + v_delta),
          updated_at = now();

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;

DROP TRIGGER IF EXISTS drafts_storage_sync_ins ON public.drafts;
DROP TRIGGER IF EXISTS drafts_storage_sync_upd ON public.drafts;
DROP TRIGGER IF EXISTS drafts_storage_sync_del ON public.drafts;

CREATE TRIGGER drafts_storage_sync_ins
  AFTER INSERT ON public.drafts
  FOR EACH ROW EXECUTE FUNCTION public.sync_draft_storage();

CREATE TRIGGER drafts_storage_sync_upd
  AFTER UPDATE OF media_bytes ON public.drafts
  FOR EACH ROW EXECUTE FUNCTION public.sync_draft_storage();

CREATE TRIGGER drafts_storage_sync_del
  AFTER DELETE ON public.drafts
  FOR EACH ROW EXECUTE FUNCTION public.sync_draft_storage();

-- ============================================================================
-- 5) Realtime publication
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_credits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drafts;


-- ============================================================
-- 20260723003327_430963f2-2d27-4e42-93d6-1b14e6908e6f.sql
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.sync_draft_storage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_team_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_draft_storage() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_team_role(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO service_role;


-- ============================================================
-- 20260723014607_restore_team_function_permissions.sql
-- ============================================================
-- Restore execute permissions for authenticated users on team helper functions.
-- These functions are SECURITY DEFINER and are called by RLS policies on drafts,
-- teams, and team_members tables. The previous migration (20260723003327)
-- inadvertently revoked authenticated role access, causing "permission denied
-- for function is_team_member" errors when authenticated users query these tables.

GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_role(uuid, uuid) TO authenticated;

-- ============================================================
-- 20260725232200_linkedin_realtime_expiry.sql
-- ============================================================
-- Enable Realtime for linkedin_connections so clients get push updates
ALTER TABLE public.linkedin_connections REPLICA IDENTITY FULL;

-- RPC: delete all expired linkedin connections (called by the scheduler worker)
CREATE OR REPLACE FUNCTION public.expire_linkedin_connections()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.linkedin_connections
    WHERE expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

-- Grant execution to service_role only
REVOKE ALL ON FUNCTION public.expire_linkedin_connections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_linkedin_connections() TO service_role;


-- ============================================================
-- 20260823000000_daily_credits_cron.sql
-- ============================================================
-- ============================================================================
-- Daily credits reset function and pg_cron schedule
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_daily_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_credits
  SET daily_credits_used = 0,
      last_daily_reset = CURRENT_DATE,
      updated_at = now()
  WHERE last_daily_reset < CURRENT_DATE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_daily_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_daily_credits() TO service_role;

-- Schedule the cron job to run every day at midnight UTC (requires pg_cron extension)
DO $$
BEGIN
  -- Check if pg_cron extension is available before scheduling
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    -- Ensure pg_cron is created if not already
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Unschedule existing job if any to avoid duplicates
    PERFORM cron.unschedule('reset-daily-credits-job');

    -- Schedule new job
    PERFORM cron.schedule(
      'reset-daily-credits-job',
      '0 0 * * *',
      'SELECT public.reset_daily_credits();'
    );
  END IF;
END;
$$;

