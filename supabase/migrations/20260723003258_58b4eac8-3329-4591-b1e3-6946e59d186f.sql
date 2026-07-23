
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
