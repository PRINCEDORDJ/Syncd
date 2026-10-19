-- ============================================================================
-- Migration: Payments Hardening — seats, realtime, webhook idempotency
-- 1) subscriptions.seats
-- 2) user_credits back into supabase_realtime publication (lost when the
--    table was re-keyed in 20260917100000)
-- 3) polar_webhook_events idempotency table + claim/complete RPCs
-- 4) seat-aware credits: apply_team_seat_change, handle_plan_change,
--    refund_credit allocation, enforce_team_seat_cap
-- ============================================================================

-- 1) subscriptions.seats -----------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS seats INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_seats_positive CHECK (seats >= 1);

COMMENT ON COLUMN public.subscriptions.seats IS 'Purchased Teams seat count (Polar seat-based pricing); 1 for single-seat plans.';

-- 2) Realtime for user_credits ------------------------------------------------
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND tablename = 'user_credits';
  IF v_count = 0 THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_credits;
  END IF;
END;
$$;

-- 3) Webhook idempotency ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.polar_webhook_events (
  event_id    TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  outcome     TEXT NOT NULL DEFAULT 'processing',
  reason      TEXT,
  attempts    INTEGER NOT NULL DEFAULT 1,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.polar_webhook_events IS 'Deduplication ledger for Polar webhook deliveries (event-level, one row per event id).';

REVOKE ALL ON public.polar_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.polar_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.claim_webhook_event(_event_id text, _type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outcome text;
  v_attempts integer;
BEGIN
  INSERT INTO public.polar_webhook_events (event_id, type, outcome, attempts)
  VALUES (_event_id, _type, 'processing', 1);

  RETURN 'claimed';

EXCEPTION
  WHEN unique_violation THEN
    SELECT outcome, attempts INTO v_outcome, v_attempts
    FROM public.polar_webhook_events
    WHERE event_id = _event_id
    FOR UPDATE;

    IF v_outcome = 'processing' AND v_attempts <= 1 THEN
      UPDATE public.polar_webhook_events
        SET attempts = 2, updated_at = now()
        WHERE event_id = _event_id;
      RETURN 'retry';
    END IF;

    RETURN 'duplicate';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_webhook_event(
  _event_id text,
  _outcome text,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.polar_webhook_events
    SET outcome = _outcome,
        reason = _reason,
        updated_at = now()
    WHERE event_id = _event_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_webhook_event(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_event(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_webhook_event(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_webhook_event(text, text, text) TO service_role;

-- 4) Seat-aware credits -------------------------------------------------------

-- 4a) apply_team_seat_change: store seats + adjust the pooled grant.
CREATE OR REPLACE FUNCTION public.apply_team_seat_change(
  _user_id uuid,
  _seats integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws uuid;
  v_old integer;
  v_old_credits integer;
  v_per_seat integer := 350;
BEGIN
  IF _seats IS NULL OR _seats < 1 THEN
    RAISE EXCEPTION 'seats must be >= 1';
  END IF;

  SELECT seats INTO v_old FROM public.subscriptions WHERE user_id = _user_id;
  v_old := COALESCE(v_old, 1);

  UPDATE public.subscriptions
    SET seats = _seats, updated_at = now()
    WHERE user_id = _user_id;

  SELECT id INTO v_ws FROM public.workspaces WHERE owner_id = _user_id LIMIT 1;
  IF v_ws IS NULL THEN
    SELECT workspace_id INTO v_ws
      FROM public.workspace_members
      WHERE user_id = _user_id
      ORDER BY (role = 'owner') DESC, created_at ASC
      LIMIT 1;
  END IF;
  IF v_ws IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.user_credits (workspace_id) VALUES (v_ws)
    ON CONFLICT (workspace_id) DO NOTHING;

  SELECT subscription_credits INTO v_old_credits
    FROM public.user_credits WHERE workspace_id = v_ws FOR UPDATE;

  IF _seats > v_old THEN
    UPDATE public.user_credits SET
      subscription_credits = subscription_credits + v_per_seat * (_seats - v_old),
      updated_at = now()
      WHERE workspace_id = v_ws;
  ELSE
    UPDATE public.user_credits SET
      subscription_credits = LEAST(subscription_credits, v_per_seat * _seats),
      updated_at = now()
      WHERE workspace_id = v_ws;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (
      _user_id,
      v_per_seat * (_seats - v_old),
      'seat_change',
      'Teams seats updated: ' || v_old || ' -> ' || _seats ||
      ' (credits before change: ' || COALESCE(v_old_credits, 0) || ')'
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_team_seat_change(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_team_seat_change(uuid, integer) TO service_role;

-- 4b) handle_plan_change: Teams grant scales by purchased seats.
DROP FUNCTION IF EXISTS public.handle_plan_change(uuid, public.plan_tier, public.plan_tier);
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
  v_seats int;
  v_ws  uuid;
BEGIN
  SELECT COALESCE(seats, 1) INTO v_seats
    FROM public.subscriptions WHERE user_id = _user_id;
  v_seats := COALESCE(v_seats, 1);

  v_new := CASE _new_plan
    WHEN 'trial'  THEN 30
    WHEN 'studio' THEN 150
    WHEN 'teams'  THEN 350 * v_seats
    ELSE 30
  END;
  v_old := CASE _old_plan
    WHEN 'trial'  THEN 30
    WHEN 'studio' THEN 150
    WHEN 'teams'  THEN 350 * v_seats
    ELSE 30
  END;

  SELECT id INTO v_ws FROM public.workspaces WHERE owner_id = _user_id LIMIT 1;
  IF v_ws IS NULL THEN
    SELECT workspace_id INTO v_ws
      FROM public.workspace_members
      WHERE user_id = _user_id
      ORDER BY (role = 'owner') DESC, created_at ASC
      LIMIT 1;
  END IF;
  IF v_ws IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.user_credits (workspace_id) VALUES (v_ws)
    ON CONFLICT (workspace_id) DO NOTHING;

  IF v_new > v_old THEN
    UPDATE public.user_credits SET
      subscription_credits = v_new,
      last_monthly_reset = date_trunc('month', now())::date,
      updated_at = now()
      WHERE workspace_id = v_ws;
  ELSE
    UPDATE public.user_credits SET
      subscription_credits = LEAST(subscription_credits, v_new),
      updated_at = now()
      WHERE workspace_id = v_ws;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (
      _user_id,
      v_new - v_old,
      'plan_change',
      'Plan changed from ' || _old_plan::text || ' to ' || _new_plan::text
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_plan_change(uuid, public.plan_tier, public.plan_tier)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_plan_change(uuid, public.plan_tier, public.plan_tier)
  TO service_role;

-- 4c) refund_credit: allocation is seat-aware for Teams workspaces.
DROP FUNCTION IF EXISTS public.refund_credit(uuid, text, text, uuid);
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
  v_seats int;
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

  SELECT COALESCE(s.seats, 1) INTO v_seats
    FROM public.workspaces w
    LEFT JOIN public.subscriptions s ON s.user_id = w.owner_id
    WHERE w.id = v_target_ws;
  v_seats := COALESCE(v_seats, 1);

  v_allocation := CASE v_plan
    WHEN 'trial'  THEN 30
    WHEN 'studio' THEN 150
    WHEN 'teams'  THEN 350 * v_seats
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
REVOKE EXECUTE ON FUNCTION public.refund_credit(UUID, text, text, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit(UUID, text, text, UUID) TO service_role;

-- 4d) enforce_team_seat_cap: membership capped by purchased seats (max 5).
CREATE OR REPLACE FUNCTION public.enforce_team_seat_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_plan public.plan_tier;
  v_purchased integer;
  v_member_count integer;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.teams
  WHERE id = NEW.team_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Team not found';
  END IF;

  v_plan := public.get_user_plan(v_owner_id);

  IF NOT public.has_role(v_owner_id, 'admin') AND v_plan != 'teams' THEN
    RAISE EXCEPTION 'Team seat invitations require the Teams plan';
  END IF;

  SELECT COALESCE(seats, 1) INTO v_purchased
    FROM public.subscriptions
    WHERE user_id = v_owner_id;
  v_purchased := COALESCE(v_purchased, 1);

  SELECT count(*) INTO v_member_count
  FROM public.team_members
  WHERE team_id = NEW.team_id;

  IF v_member_count >= LEAST(v_purchased, 5) - 1 THEN
    RAISE EXCEPTION 'Team seat limit reached (purchased seats: %)', v_purchased;
  END IF;

  RETURN NEW;
END;
$$;
