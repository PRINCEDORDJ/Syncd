-- ============================================================================
-- Migration: Workspace-Scoped Credits & Storage + Single Workspace Cap
-- ============================================================================

-- 1) Re-key user_credits to workspace_id
ALTER TABLE public.user_credits RENAME TO user_credits_old;

CREATE TABLE public.user_credits (
  workspace_id          UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_credits  INTEGER NOT NULL DEFAULT 30,
  topup_credits         INTEGER NOT NULL DEFAULT 0,
  daily_credits_used    INTEGER NOT NULL DEFAULT 0,
  last_daily_reset      DATE NOT NULL DEFAULT CURRENT_DATE,
  last_monthly_reset    DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Backfill from user_credits_old joined to workspaces
INSERT INTO public.user_credits (workspace_id, subscription_credits, topup_credits, daily_credits_used, last_daily_reset, last_monthly_reset, updated_at)
SELECT w.id, uco.subscription_credits, uco.topup_credits, uco.daily_credits_used, uco.last_daily_reset, uco.last_monthly_reset, uco.updated_at
FROM public.user_credits_old uco
JOIN public.workspaces w ON w.owner_id = uco.user_id
ON CONFLICT (workspace_id) DO NOTHING;

-- Initialize any workspaces missing user_credits
INSERT INTO public.user_credits (workspace_id, subscription_credits, topup_credits, daily_credits_used, last_daily_reset, last_monthly_reset, updated_at)
SELECT w.id, 30, 0, 0, CURRENT_DATE, date_trunc('month', CURRENT_DATE)::DATE, now()
FROM public.workspaces w
WHERE NOT EXISTS (SELECT 1 FROM public.user_credits uc WHERE uc.workspace_id = w.id);

DROP TABLE public.user_credits_old;

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read workspace credits"
  ON public.user_credits FOR SELECT
  TO authenticated
  USING (public.has_workspace_access(auth.uid(), workspace_id));

GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;

-- 2) Re-key user_storage to workspace_id
ALTER TABLE public.user_storage RENAME TO user_storage_old;

CREATE TABLE public.user_storage (
  workspace_id  UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bytes_used    BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Backfill by summing drafts.media_bytes per workspace
INSERT INTO public.user_storage (workspace_id, bytes_used, updated_at)
SELECT w.id, COALESCE(SUM(d.media_bytes), 0), now()
FROM public.workspaces w
LEFT JOIN public.drafts d ON d.workspace_id = w.id
GROUP BY w.id;

DROP TABLE public.user_storage_old;

ALTER TABLE public.user_storage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read workspace storage"
  ON public.user_storage FOR SELECT
  TO authenticated
  USING (public.has_workspace_access(auth.uid(), workspace_id));

GRANT SELECT ON public.user_storage TO authenticated;
GRANT ALL ON public.user_storage TO service_role;

-- 3) get_workspace_plan(p_workspace_id)
CREATE OR REPLACE FUNCTION public.get_workspace_plan(p_workspace_id UUID)
RETURNS public.plan_tier
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.workspaces
  WHERE id = p_workspace_id;

  IF v_owner_id IS NULL THEN
    RETURN 'trial'::public.plan_tier;
  END IF;

  RETURN public.get_user_plan(v_owner_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_workspace_plan(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_workspace_plan(UUID) TO authenticated, service_role;

-- 4) consume_credit(_user_id, _workspace_id)
DROP FUNCTION IF EXISTS public.consume_credit(UUID);
DROP FUNCTION IF EXISTS public.consume_credit(UUID, UUID);

CREATE OR REPLACE FUNCTION public.consume_credit(
  _user_id UUID,
  _workspace_id UUID DEFAULT NULL
)
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
  v_source text;
  v_target_ws UUID := _workspace_id;
BEGIN
  -- Admin bypass
  IF public.has_role(_user_id, 'admin') THEN
    RETURN jsonb_build_object('success', true, 'admin', true, 'source', 'admin');
  END IF;

  -- Resolve workspace if not provided
  IF v_target_ws IS NULL THEN
    SELECT wm.workspace_id INTO v_target_ws
    FROM public.workspace_members wm
    WHERE wm.user_id = _user_id AND wm.status = 'active'
    ORDER BY (wm.role = 'owner') DESC, wm.created_at ASC
    LIMIT 1;
  ELSE
    IF NOT public.has_workspace_access(_user_id, v_target_ws) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'no_workspace_access');
    END IF;
  END IF;

  IF v_target_ws IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_workspace');
  END IF;

  -- Derive plan from workspace owner
  v_plan := public.get_workspace_plan(v_target_ws);
  v_is_free := (v_plan = 'trial');

  SELECT * INTO r FROM public.user_credits WHERE workspace_id = v_target_ws FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (workspace_id) VALUES (v_target_ws) RETURNING * INTO r;
  END IF;

  -- Daily reset
  IF r.last_daily_reset < CURRENT_DATE THEN
    UPDATE public.user_credits
      SET daily_credits_used = 0,
          last_daily_reset = CURRENT_DATE,
          updated_at = now()
      WHERE workspace_id = v_target_ws
      RETURNING * INTO r;
  END IF;

  -- Monthly reset for trial (30 refill)
  IF r.last_monthly_reset < monthly_start THEN
    IF v_is_free THEN
      UPDATE public.user_credits
        SET subscription_credits = 30,
            last_monthly_reset = monthly_start,
            updated_at = now()
        WHERE workspace_id = v_target_ws
        RETURNING * INTO r;

      INSERT INTO public.credit_transactions (user_id, amount, type, description)
        VALUES (_user_id, 30, 'subscription_grant', 'Free plan monthly credit refill (workspace)');
    ELSE
      UPDATE public.user_credits
        SET last_monthly_reset = monthly_start,
            updated_at = now()
        WHERE workspace_id = v_target_ws
        RETURNING * INTO r;
    END IF;
  END IF;

  -- Free daily cap
  IF v_is_free AND r.daily_credits_used >= 5 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'daily_limit_reached');
  END IF;

  -- Deduct subscription first, then topup
  IF r.subscription_credits > 0 THEN
    v_source := 'subscription';
    UPDATE public.user_credits SET
      subscription_credits = subscription_credits - 1,
      daily_credits_used = CASE WHEN v_is_free THEN daily_credits_used + 1 ELSE daily_credits_used END,
      updated_at = now()
      WHERE workspace_id = v_target_ws;
  ELSIF r.topup_credits > 0 THEN
    v_source := 'topup';
    UPDATE public.user_credits SET
      topup_credits = topup_credits - 1,
      daily_credits_used = CASE WHEN v_is_free THEN daily_credits_used + 1 ELSE daily_credits_used END,
      updated_at = now()
      WHERE workspace_id = v_target_ws;
  ELSE
    RETURN jsonb_build_object('success', false, 'reason', 'no_credits');
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, -1, 'generation_use', 'AI generation (workspace ' || v_target_ws || ')');

  RETURN jsonb_build_object('success', true, 'source', v_source);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_credit(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credit(UUID, UUID) TO service_role;

-- 5) refund_credit(_user_id, _reason, _credit_type, _workspace_id)
DROP FUNCTION IF EXISTS public.refund_credit(UUID, text, text);
DROP FUNCTION IF EXISTS public.refund_credit(UUID, text, text, UUID);

CREATE OR REPLACE FUNCTION public.refund_credit(
  _user_id UUID,
  _reason text DEFAULT 'generation_failed',
  _credit_type text DEFAULT 'auto',
  _workspace_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.user_credits%ROWTYPE;
  v_plan public.plan_tier;
  v_allocation int;
  v_target_ws UUID := _workspace_id;
BEGIN
  IF public.has_role(_user_id, 'admin') THEN
    RETURN;
  END IF;

  IF v_target_ws IS NULL THEN
    SELECT wm.workspace_id INTO v_target_ws
    FROM public.workspace_members wm
    WHERE wm.user_id = _user_id AND wm.status = 'active'
    ORDER BY (wm.role = 'owner') DESC, wm.created_at ASC
    LIMIT 1;
  END IF;

  IF v_target_ws IS NULL THEN
    RETURN;
  END IF;

  v_plan := public.get_workspace_plan(v_target_ws);
  v_allocation := CASE v_plan
    WHEN 'trial'  THEN 30
    WHEN 'studio' THEN 150
    WHEN 'teams'  THEN 350
    ELSE 30
  END;

  SELECT * INTO r FROM public.user_credits WHERE workspace_id = v_target_ws FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF _credit_type = 'topup' THEN
    UPDATE public.user_credits SET
      topup_credits = topup_credits + 1,
      daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                THEN daily_credits_used - 1 ELSE daily_credits_used END,
      updated_at = now()
    WHERE workspace_id = v_target_ws;
  ELSIF _credit_type = 'subscription' THEN
    UPDATE public.user_credits SET
      subscription_credits = subscription_credits + 1,
      daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                THEN daily_credits_used - 1 ELSE daily_credits_used END,
      updated_at = now()
    WHERE workspace_id = v_target_ws;
  ELSE
    IF r.subscription_credits < v_allocation THEN
      UPDATE public.user_credits SET
        subscription_credits = subscription_credits + 1,
        daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                  THEN daily_credits_used - 1 ELSE daily_credits_used END,
        updated_at = now()
      WHERE workspace_id = v_target_ws;
    ELSE
      UPDATE public.user_credits SET
        topup_credits = topup_credits + 1,
        daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                  THEN daily_credits_used - 1 ELSE daily_credits_used END,
        updated_at = now()
      WHERE workspace_id = v_target_ws;
    END IF;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, 1, 'refund', 'Credit refunded — ' || _reason);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_credit(UUID, text, text, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit(UUID, text, text, UUID) TO service_role;

-- 6) grant_subscription_credits & grant_topup_credits (Polar webhook)
CREATE OR REPLACE FUNCTION public.grant_subscription_credits(_user_id uuid, _amount integer, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ws uuid;
BEGIN
  SELECT id INTO v_ws FROM public.workspaces WHERE owner_id = _user_id LIMIT 1;
  IF v_ws IS NULL THEN
    SELECT workspace_id INTO v_ws FROM public.workspace_members WHERE user_id = _user_id ORDER BY (role = 'owner') DESC LIMIT 1;
  END IF;
  IF v_ws IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.user_credits (workspace_id, subscription_credits, last_monthly_reset)
    VALUES (v_ws, _amount, date_trunc('month', now())::date)
    ON CONFLICT (workspace_id) DO UPDATE SET
      subscription_credits = _amount,
      last_monthly_reset = date_trunc('month', now())::date,
      updated_at = now();

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, _amount, 'subscription_grant', _reason || ' (workspace ' || v_ws || ')');
END; $$;
REVOKE EXECUTE ON FUNCTION public.grant_subscription_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_subscription_credits(uuid, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_topup_credits(_user_id uuid, _amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ws uuid;
BEGIN
  SELECT id INTO v_ws FROM public.workspaces WHERE owner_id = _user_id LIMIT 1;
  IF v_ws IS NULL THEN
    SELECT workspace_id INTO v_ws FROM public.workspace_members WHERE user_id = _user_id ORDER BY (role = 'owner') DESC LIMIT 1;
  END IF;
  IF v_ws IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.user_credits (workspace_id, topup_credits)
    VALUES (v_ws, _amount)
    ON CONFLICT (workspace_id) DO UPDATE SET
      topup_credits = user_credits.topup_credits + _amount,
      updated_at = now();

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, _amount, 'topup_purchase', 'Top-up pack purchase (workspace ' || v_ws || ')');
END; $$;
REVOKE EXECUTE ON FUNCTION public.grant_topup_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_topup_credits(uuid, integer) TO service_role;

-- 7) sync_draft_storage trigger
CREATE OR REPLACE FUNCTION public.sync_draft_storage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta bigint := 0;
  v_ws uuid;
  v_uid uuid;
  v_plan public.plan_tier;
  v_limit bigint;
  v_used bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := COALESCE(NEW.media_bytes, 0);
    v_ws := NEW.workspace_id;
    v_uid := NEW.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta := COALESCE(NEW.media_bytes, 0) - COALESCE(OLD.media_bytes, 0);
    v_ws := NEW.workspace_id;
    v_uid := NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := -COALESCE(OLD.media_bytes, 0);
    v_ws := OLD.workspace_id;
    v_uid := OLD.user_id;
  END IF;

  IF v_ws IS NULL OR v_delta = 0 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Quota check on increases (skip for admin)
  IF v_delta > 0 AND (v_uid IS NULL OR NOT public.has_role(v_uid, 'admin')) THEN
    v_plan := public.get_workspace_plan(v_ws);
    v_limit := CASE v_plan
      WHEN 'trial'  THEN 209715200::bigint    -- 200 MB
      WHEN 'studio' THEN 5368709120::bigint   -- 5 GB
      WHEN 'teams'  THEN 21474836480::bigint  -- 20 GB
      ELSE 209715200::bigint
    END;
    SELECT COALESCE(bytes_used, 0) INTO v_used FROM public.user_storage WHERE workspace_id = v_ws;
    IF (COALESCE(v_used, 0) + v_delta) > v_limit THEN
      RAISE EXCEPTION 'storage_quota_exceeded' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.user_storage (workspace_id, bytes_used, updated_at)
    VALUES (v_ws, GREATEST(0, v_delta), now())
    ON CONFLICT (workspace_id) DO UPDATE
      SET bytes_used = GREATEST(0, public.user_storage.bytes_used + v_delta),
          updated_at = now();

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;

-- 8) Single Workspace per Owner Enforced at DB Level
CREATE OR REPLACE FUNCTION public.enforce_single_workspace_per_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF public.has_role(NEW.owner_id, 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.workspaces
  WHERE owner_id = NEW.owner_id;

  IF v_count >= 1 THEN
    RAISE EXCEPTION 'workspace_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_workspace ON public.workspaces;
CREATE TRIGGER trg_enforce_single_workspace
  BEFORE INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_workspace_per_owner();

-- 9) Auto initialize workspace credits and storage
CREATE OR REPLACE FUNCTION public.handle_new_workspace_init()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.plan_tier;
  v_credits int;
BEGIN
  v_plan := public.get_workspace_plan(NEW.id);
  v_credits := CASE v_plan
    WHEN 'trial'  THEN 30
    WHEN 'studio' THEN 150
    WHEN 'teams'  THEN 350
    ELSE 30
  END;

  INSERT INTO public.user_credits (workspace_id, subscription_credits, topup_credits, daily_credits_used, last_daily_reset, last_monthly_reset, updated_at)
  VALUES (NEW.id, v_credits, 0, 0, CURRENT_DATE, date_trunc('month', CURRENT_DATE)::DATE, now())
  ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO public.user_storage (workspace_id, bytes_used, updated_at)
  VALUES (NEW.id, 0, now())
  ON CONFLICT (workspace_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_workspace ON public.workspaces;
CREATE TRIGGER trg_init_workspace
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_workspace_init();
