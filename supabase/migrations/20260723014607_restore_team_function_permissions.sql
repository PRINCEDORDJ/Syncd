-- Restore execute permissions for authenticated users on team helper functions.
-- These functions are SECURITY DEFINER and are called by RLS policies on drafts,
-- teams, and team_members tables. The previous migration (20260723003327)
-- inadvertently revoked authenticated role access, causing "permission denied
-- for function is_team_member" errors when authenticated users query these tables.

GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_role(uuid, uuid) TO authenticated;