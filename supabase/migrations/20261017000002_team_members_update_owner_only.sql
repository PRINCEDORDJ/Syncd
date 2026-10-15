-- Self-updates on team_members are no longer needed (acceptance goes through
-- accept_team_invite(), leaving is a DELETE). Remove the self clause so a
-- viewer cannot promote their own role to editor.
DROP POLICY IF EXISTS "Owners update members" ON public.team_members;
CREATE POLICY "Owners update members"
  ON public.team_members FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()
    )
  );
