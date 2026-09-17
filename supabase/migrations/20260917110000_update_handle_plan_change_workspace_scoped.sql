-- ============================================================================
-- Update handle_plan_change to workspace-scoped user_credits
-- Also fixes studio credit allocation: 100 → 150
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
  v_ws  uuid;
BEGIN
  v_new := CASE _new_plan
    WHEN 'trial'  THEN 30
    WHEN 'studio' THEN 150
    WHEN 'teams'  THEN 350
    ELSE 30
  END;
  v_old := CASE _old_plan
    WHEN 'trial'  THEN 30
    WHEN 'studio' THEN 150
    WHEN 'teams'  THEN 350
    ELSE 30
  END;

  -- Resolve workspace for this user (owner takes priority)
  SELECT id INTO v_ws
  FROM public.workspaces
  WHERE owner_id = _user_id
  LIMIT 1;

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
END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_plan_change(uuid, public.plan_tier, public.plan_tier) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_plan_change(uuid, public.plan_tier, public.plan_tier) TO service_role;
