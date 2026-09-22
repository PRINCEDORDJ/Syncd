-- Keep the Teams plan seat limit consistent with the product limit.
-- The owner is not stored in team_members, so the insert trigger must reserve
-- one of the five seats for the team owner.

CREATE OR REPLACE FUNCTION public.enforce_team_seat_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_plan public.plan_tier;
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

  SELECT count(*) INTO v_member_count
  FROM public.team_members
  WHERE team_id = NEW.team_id;

  -- The owner occupies one seat, so at most four team_members may be added.
  IF v_member_count >= 4 THEN
    RAISE EXCEPTION 'Team seat limit reached (5 seats max, including the owner)';
  END IF;

  RETURN NEW;
END;
$$;