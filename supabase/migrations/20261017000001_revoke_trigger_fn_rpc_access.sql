-- Follow-up: trigger functions are fired by the server and do not require
-- EXECUTE privileges for the invoking role; revoke RPC exposure (same
-- treatment as 20260713012245_* did for has_role/get_user_plan).
REVOKE ALL ON FUNCTION public.enforce_team_creation_plan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_team_invite_signup() FROM PUBLIC, anon, authenticated;
