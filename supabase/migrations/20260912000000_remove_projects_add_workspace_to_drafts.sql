-- Migration: Remove projects, add workspace_id to drafts
-- Workspaces now directly own their drafts.

-- ============================================================================
-- 1. Add workspace_id to drafts
-- ============================================================================
ALTER TABLE public.drafts ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_drafts_workspace_id ON public.drafts(workspace_id);

-- ============================================================================
-- 2. Backfill existing drafts → user's first (oldest) workspace
-- ============================================================================
UPDATE public.drafts d
SET workspace_id = (
  SELECT w.id FROM public.workspaces w
  WHERE w.owner_id = d.user_id
  ORDER BY w.created_at ASC LIMIT 1
)
WHERE d.workspace_id IS NULL;

-- Now that all rows have a value, enforce NOT NULL
ALTER TABLE public.drafts ALTER COLUMN workspace_id SET NOT NULL;

-- ============================================================================
-- 3. Update RLS policies on drafts to be workspace-scoped
-- ============================================================================

-- Helper: check if a user has access to a workspace (owner or active member)
-- NOTE: The existing has_workspace_access(_workspace_id, _user_id) already exists
-- with reversed parameter order. We reuse it as-is in the RLS policies below.

DROP POLICY IF EXISTS "View drafts (own or team)" ON public.drafts;
CREATE POLICY "View drafts (own workspace or team)"
  ON public.drafts FOR SELECT TO authenticated
  USING (
    public.has_workspace_access(auth.uid(), workspace_id)
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Insert own drafts" ON public.drafts;
CREATE POLICY "Insert draft into own workspace"
  ON public.drafts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_workspace_access(auth.uid(), workspace_id)
  );

DROP POLICY IF EXISTS "Update drafts (owner or editor)" ON public.drafts;
CREATE POLICY "Update draft (workspace member or team editor)"
  ON public.drafts FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_workspace_access(auth.uid(), workspace_id)
    OR (team_id IS NOT NULL AND public.get_team_role(team_id, auth.uid()) IN ('owner', 'editor'))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_workspace_access(auth.uid(), workspace_id)
    OR (team_id IS NOT NULL AND public.get_team_role(team_id, auth.uid()) IN ('owner', 'editor'))
  );

DROP POLICY IF EXISTS "Delete drafts (owner only)" ON public.drafts;
CREATE POLICY "Delete draft (owner only)"
  ON public.drafts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. Drop all project-related tables, views, functions, enums
-- ============================================================================

-- Tables (CASCADE removes RLS policies, triggers, indexes)
DROP TABLE IF EXISTS public.project_team_access CASCADE;
DROP TABLE IF EXISTS public.project_invites CASCADE;
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;

-- Views
DROP VIEW IF EXISTS public.my_projects CASCADE;

-- Functions
DROP FUNCTION IF EXISTS public.can_manage_project(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_project_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.accept_project_invite(uuid) CASCADE;

-- Enums
DROP TYPE IF EXISTS public.project_access_level CASCADE;

-- ============================================================================
-- 5. Revoke has_workspace_access from anon (security best practice)
-- ============================================================================
REVOKE ALL ON FUNCTION public.has_workspace_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_workspace_access(uuid, uuid) TO authenticated, service_role;
