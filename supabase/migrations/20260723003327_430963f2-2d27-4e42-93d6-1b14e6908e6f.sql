
REVOKE EXECUTE ON FUNCTION public.sync_draft_storage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_team_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_draft_storage() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_team_role(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO service_role;
