-- ============================================================================
-- Migration: Fix Credits, Plan Limits, and Scheduled Post Status
-- ============================================================================

-- 1) Fix get_user_plan:
-- Always return 'teams' for admin, properly evaluate subscription status & validity,
-- and guarantee 'trial' (never NULL) when subscriptions row is absent or expired.
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid)
RETURNS public.plan_tier
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.plan_tier;
BEGIN
  -- Admin check: always teams
  IF public.has_role(_user_id, 'admin') THEN
    RETURN 'teams'::public.plan_tier;
  END IF;

  SELECT
    CASE
      WHEN s.status IN ('active', 'trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND (s.plan != 'trial' OR (s.trial_end IS NULL OR s.trial_end > now()))
      THEN s.plan
      ELSE 'trial'::public.plan_tier
    END
  INTO v_plan
  FROM public.subscriptions s
  WHERE s.user_id = _user_id
  ORDER BY s.updated_at DESC
  LIMIT 1;

  RETURN COALESCE(v_plan, 'trial'::public.plan_tier);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO service_role;

-- 2) Fix consume_credit:
-- Return charged source ('subscription' vs 'topup') for accurate refund tracking,
-- record transaction log on monthly trial refill, and enforce daily caps cleanly.
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
  v_source text;
BEGIN
  -- Admin bypass
  IF public.has_role(_user_id, 'admin') THEN
    RETURN jsonb_build_object('success', true, 'admin', true, 'source', 'admin');
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
    UPDATE public.user_credits
      SET daily_credits_used = 0,
          last_daily_reset = CURRENT_DATE,
          updated_at = now()
      WHERE user_id = _user_id
      RETURNING * INTO r;
  END IF;

  -- Monthly reset for trial (30 refill)
  IF r.last_monthly_reset < monthly_start THEN
    IF v_is_free THEN
      UPDATE public.user_credits
        SET subscription_credits = 30,
            last_monthly_reset = monthly_start,
            updated_at = now()
        WHERE user_id = _user_id
        RETURNING * INTO r;

      INSERT INTO public.credit_transactions (user_id, amount, type, description)
        VALUES (_user_id, 30, 'subscription_grant', 'Free plan monthly credit refill');
    ELSE
      UPDATE public.user_credits
        SET last_monthly_reset = monthly_start,
            updated_at = now()
        WHERE user_id = _user_id
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
      WHERE user_id = _user_id;
  ELSIF r.topup_credits > 0 THEN
    v_source := 'topup';
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

  RETURN jsonb_build_object('success', true, 'source', v_source);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credit(uuid) TO service_role;

-- 3) Fix refund_credit:
-- Drop the old 2-arg overload (uuid, text) — the new 3-arg version is a different
-- signature in PostgreSQL so we must explicitly drop the old one to avoid two
-- overloads existing simultaneously.
DROP FUNCTION IF EXISTS public.refund_credit(uuid, text);

-- Support explicit or auto _credit_type ('subscription', 'topup', or 'auto'),
-- log transaction as 'refund' instead of 'generation_use'.
CREATE OR REPLACE FUNCTION public.refund_credit(
  _user_id uuid,
  _reason text DEFAULT 'generation_failed',
  _credit_type text DEFAULT 'auto'
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

  IF _credit_type = 'topup' THEN
    UPDATE public.user_credits SET
      topup_credits = topup_credits + 1,
      daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                THEN daily_credits_used - 1 ELSE daily_credits_used END,
      updated_at = now()
    WHERE user_id = _user_id;
  ELSIF _credit_type = 'subscription' THEN
    UPDATE public.user_credits SET
      subscription_credits = subscription_credits + 1,
      daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                THEN daily_credits_used - 1 ELSE daily_credits_used END,
      updated_at = now()
    WHERE user_id = _user_id;
  ELSE
    -- Auto mode
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
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, 1, 'refund', 'Credit refunded — ' || _reason);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_credit(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid, text, text) TO service_role;

-- 4) Fix team seat cap trigger to respect owner plan:
-- Only teams plan and admins can invite members (max 5); trial & studio limited to 0 team members.
CREATE OR REPLACE FUNCTION public.enforce_team_seat_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_plan public.plan_tier;
  cnt integer;
BEGIN
  SELECT owner_id INTO v_owner_id FROM public.teams WHERE id = NEW.team_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  v_plan := public.get_user_plan(v_owner_id);

  IF NOT public.has_role(v_owner_id, 'admin') AND v_plan != 'teams' THEN
    RAISE EXCEPTION 'Team seat invitations require the Teams plan';
  END IF;

  SELECT count(*) INTO cnt FROM public.team_members WHERE team_id = NEW.team_id;
  IF cnt >= 5 THEN
    RAISE EXCEPTION 'Team seat limit reached (5 members max)';
  END IF;

  RETURN NEW;
END;
$$;

-- 5) Backfill existing scheduled drafts that were saved as 'pending':
UPDATE public.drafts
SET schedule_status = 'scheduled'
WHERE schedule_status = 'pending' AND scheduled_at IS NOT NULL;
