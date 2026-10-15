-- Migration: Teams invite flow, role enforcement, team creation gate
--
-- 1. teams: missing INSERT policy (creation is currently blocked by RLS) +
--    server-side plan gate (Teams plan or admin).
-- 2. team_members: one-time invite tokens with expiry; editor/viewer only.
-- 3. get_team_invite / accept_team_invite RPCs for the /invite link flow.
-- 4. Signup auto-accept: users who sign up with an invited email join the team.
-- 5. has_workspace_edit_access + drafts INSERT/UPDATE policies: team viewers
--    are read-only in team-linked workspaces.
-- 6. team_members DELETE: accepted members may leave on their own.

-- ============================================================================
-- 1. teams creation: RLS policy + plan gate
-- ============================================================================
DROP POLICY IF EXISTS "Owners create teams" ON public.teams;
CREATE POLICY "Owners create teams"
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_team_creation_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(NEW.owner_id, 'admin')
     OR public.get_user_plan(NEW.owner_id) = 'teams' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Creating a team requires the Teams plan';
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_team_creation_plan ON public.teams;
CREATE TRIGGER trg_enforce_team_creation_plan
  BEFORE INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_team_creation_plan();

-- ============================================================================
-- 2. team_members: invite token + expiry + role constraint
-- ============================================================================
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS invite_token uuid
  DEFAULT gen_random_uuid();
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS expires_at timestamptz
  NOT NULL DEFAULT (now() + interval '30 days');

CREATE UNIQUE INDEX IF NOT EXISTS team_members_invite_token_idx
  ON public.team_members (invite_token)
  WHERE invite_token IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_members_role_check'
      AND conrelid = 'public.team_members'::regclass
  ) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_role_check CHECK (role IN ('editor', 'viewer'));
  END IF;
END $$;

-- ============================================================================
-- 3. Invite RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_team_invite(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member public.team_members%ROWTYPE;
  v_team public.teams%ROWTYPE;
  v_email text;
BEGIN
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Sign in to view this invite';
  END IF;

  SELECT * INTO v_member FROM public.team_members WHERE invite_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = v_member.team_id;

  RETURN jsonb_build_object(
    'found', true,
    'team_id', v_member.team_id,
    'team_name', v_team.name,
    'email', v_member.email,
    'role', v_member.role,
    'email_matches', lower(v_member.email) = v_email,
    'accepted', v_member.accepted_at IS NOT NULL,
    'expired', v_member.expires_at < now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_team_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_invite(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_team_invite(p_token uuid)
RETURNS public.team_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member public.team_members%ROWTYPE;
  v_email text;
BEGIN
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Sign in to accept this invite';
  END IF;

  SELECT * INTO v_member
  FROM public.team_members
  WHERE invite_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already used';
  END IF;
  IF lower(v_member.email) <> v_email THEN
    RAISE EXCEPTION 'This invite was sent to a different email address';
  END IF;
  IF v_member.accepted_at IS NOT NULL THEN
    RETURN v_member;
  END IF;
  IF v_member.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  UPDATE public.team_members
  SET user_id = auth.uid(),
      accepted_at = now(),
      invite_token = NULL
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  RETURN v_member;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_team_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO authenticated, service_role;

-- ============================================================================
-- 4. Signup auto-accept: match pending invites by email
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_team_invite_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.team_members
  SET user_id = NEW.id,
      accepted_at = now(),
      invite_token = NULL
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created_team_invite ON auth.users;
CREATE TRIGGER on_auth_user_created_team_invite
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_team_invite_signup();

-- ============================================================================
-- 5. Viewer enforcement: has_workspace_edit_access + drafts policies
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_workspace_edit_access(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.workspaces w
    where w.id = _workspace_id
      and w.owner_id = _user_id
  )
  or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = _user_id
      and wm.status = 'active'::public.grant_status
  )
  or exists (
    select 1
    from public.workspace_team_access wta
    where wta.workspace_id = _workspace_id
      and wta.status = 'active'::public.grant_status
      and public.get_team_role(wta.team_id, _user_id) in ('owner', 'editor')
  );
$function$;

REVOKE ALL ON FUNCTION public.has_workspace_edit_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_workspace_edit_access(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Update draft (workspace member or team editor)" ON public.drafts;
CREATE POLICY "Update draft (workspace member or team editor)"
  ON public.drafts FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR has_workspace_edit_access(workspace_id, auth.uid())
    OR (team_id IS NOT NULL AND get_team_role(team_id, auth.uid()) = ANY (ARRAY['owner'::team_role, 'editor'::team_role]))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR has_workspace_edit_access(workspace_id, auth.uid())
    OR (team_id IS NOT NULL AND get_team_role(team_id, auth.uid()) = ANY (ARRAY['owner'::team_role, 'editor'::team_role]))
  );

DROP POLICY IF EXISTS "Insert draft into own workspace" ON public.drafts;
CREATE POLICY "Insert draft into own workspace"
  ON public.drafts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND has_workspace_edit_access(workspace_id, auth.uid())
  );

-- ============================================================================
-- 6. Leave team: accepted members may delete their own row
-- ============================================================================
DROP POLICY IF EXISTS "Owners delete members" ON public.team_members;
CREATE POLICY "Delete members (owner or self)"
  ON public.team_members FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()
    )
    OR (user_id = auth.uid() AND accepted_at IS NOT NULL)
  );
