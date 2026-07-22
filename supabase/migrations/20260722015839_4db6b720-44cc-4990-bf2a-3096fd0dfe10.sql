
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
