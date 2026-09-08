-- Fix: workspace_members and project_members INSERT RLS chicken-and-egg bug
--
-- Problem: When a user creates a new workspace, the flow is:
--   1. INSERT into workspaces (passes: owner_id = auth.uid())
--   2. INSERT into workspace_members with role='owner' (FAILS)
--
-- The workspace_members INSERT policy called can_manage_workspace(), which checks
-- whether the user already has a member row in workspace_members. But since we're
-- inserting the FIRST member row, no such row exists yet — deadlock.
--
-- Same issue exists for project_members when inserting the project creator as owner.
--
-- Fix: Extend the INSERT WITH CHECK to also permit the workspace owner (via workspaces.owner_id)
-- to add themselves with role='owner', bypassing the can_manage_workspace() call.

-- ── workspace_members ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Workspace owners manage members" ON public.workspace_members;

CREATE POLICY "Workspace owners manage members"
  ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    can_manage_workspace(workspace_id, auth.uid())
    OR (
      -- Allow workspace owner to insert themselves as the initial owner member
      user_id = auth.uid()
      AND role = 'owner'
      AND EXISTS (
        SELECT 1 FROM public.workspaces
        WHERE id = workspace_id AND owner_id = auth.uid()
      )
    )
  );

-- ── project_members ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Project managers manage members" ON public.project_members;

CREATE POLICY "Project managers manage members"
  ON public.project_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    can_manage_project(project_id, auth.uid())
    OR (
      -- Allow project creator to insert themselves as the initial owner member
      user_id = auth.uid()
      AND access_level = 'owner'
      AND EXISTS (
        SELECT 1 FROM public.projects
        WHERE id = project_id AND created_by = auth.uid()
      )
    )
  );
