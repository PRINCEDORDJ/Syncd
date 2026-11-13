-- Allow workspace editors and owners to delete drafts within their workspace,
-- matching the permissions already granted for UPDATE.

DROP POLICY IF EXISTS "Delete draft (owner only)" ON public.drafts;
DROP POLICY IF EXISTS "Delete draft (workspace member or owner)" ON public.drafts;

CREATE POLICY "Delete draft (workspace member or owner)"
  ON public.drafts FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_workspace_access(auth.uid(), workspace_id)
    OR (team_id IS NOT NULL AND public.get_team_role(team_id, auth.uid()) IN ('owner', 'editor'))
  );

