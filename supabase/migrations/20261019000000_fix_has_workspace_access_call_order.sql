-- ============================================================================
-- Migration: Fix reversed has_workspace_access call order
--
-- Root cause of "Ask/Post chat assistant does nothing" for new users:
-- The canonical helper signature is has_workspace_access(_workspace_id uuid, _user_id uuid)
-- (workspace FIRST — see drafts RLS policies, set_active_workspace,
-- get_post_signup_context). Three live callers passed the args reversed,
-- so the membership check compared workspaces.id against the user's uid
-- and never matched:
--
--   1. consume_credit  -> returned {"success":false,"reason":"not_a_member"}
--      for every non-admin user, so POST /api/generate answered 402 and the
--      chat UI removed both message bubbles (error banner renders on Canvas,
--      which the user is not looking at in assistant mode / mobile Chat tab).
--   2. refund_credit   -> always bailed out early; failed generations never
--      credited back.
--   3. user_credits / user_storage RLS policies -> members could not read
--      their own workspace-scoped credit/storage rows at all.
--
-- The helper signature is frozen; the callers are corrected instead.
-- ============================================================================

-- 1) consume_credit: only the membership check line changed
CREATE OR REPLACE FUNCTION public.consume_credit(_user_id uuid, _workspace_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Resolve to the caller's owned workspace when not provided explicitly
  -- (deterministic — never an arbitrary membership).
  IF v_target_ws IS NULL THEN
    SELECT id INTO v_target_ws
    FROM public.workspaces
    WHERE owner_id = _user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_target_ws IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_workspace');
  END IF;

  -- Every charge is membership-checked against the target workspace
  IF NOT public.has_workspace_access(v_target_ws, _user_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_a_member');
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
$function$;

-- 2) refund_credit: only the membership check line changed
CREATE OR REPLACE FUNCTION public.refund_credit(_user_id uuid, _reason text DEFAULT 'generation_failed'::text, _credit_type text DEFAULT 'auto'::text, _workspace_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.user_credits%ROWTYPE;
  v_plan public.plan_tier;
  v_allocation int;
  v_target_ws UUID := _workspace_id;
BEGIN
  IF public.has_role(_user_id, 'admin') THEN
    RETURN;
  END IF;

  -- Deterministic fallback: the caller's owned workspace only
  IF v_target_ws IS NULL THEN
    SELECT id INTO v_target_ws
    FROM public.workspaces
    WHERE owner_id = _user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_target_ws IS NULL THEN
    RETURN;
  END IF;

  -- Never refund into a workspace the user no longer belongs to
  IF NOT public.has_workspace_access(v_target_ws, _user_id) THEN
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
$function$;

-- 3) RLS policies: correct the argument order so workspace members can read
--    their own workspace-scoped credit and storage rows
DROP POLICY IF EXISTS "workspace members read workspace credits" ON public.user_credits;
CREATE POLICY "workspace members read workspace credits"
  ON public.user_credits FOR SELECT
  TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "workspace members read workspace storage" ON public.user_storage;
CREATE POLICY "workspace members read workspace storage"
  ON public.user_storage FOR SELECT
  TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()));
