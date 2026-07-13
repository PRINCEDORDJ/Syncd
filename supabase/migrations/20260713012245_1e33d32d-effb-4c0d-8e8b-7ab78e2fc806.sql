REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;