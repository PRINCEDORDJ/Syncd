-- ============================================================================
-- Migration: Admin Plan Access Fixes
-- 1) enforce_team_seat_cap: admin owners were capped at 0 team members
--    after the seat-aware change (their subscriptions row has no purchased
--    seats, so LEAST(1, 5) - 1 = 0 rejected every member insert).
--    Admins keep the product maximum of 5 team seats (4 members + owner),
--    matching the TeamsSettingsPanel UI (seatCap = 5 for admins).
-- ============================================================================

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

  IF public.has_role(v_owner_id, 'admin') THEN
    -- Admin access: unrestricted by billing, product-max 5 seats.
    v_purchased := 5;
  ELSE
    SELECT COALESCE(seats, 1) INTO v_purchased
      FROM public.subscriptions
      WHERE user_id = v_owner_id;
    v_purchased := COALESCE(v_purchased, 1);
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.team_members
  WHERE team_id = NEW.team_id;

  IF v_member_count >= LEAST(v_purchased, 5) - 1 THEN
    RAISE EXCEPTION 'Team seat limit reached (purchased seats: %)', v_purchased;
  END IF;

  RETURN NEW;
END;
$$;
