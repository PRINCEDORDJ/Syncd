-- Remove the legacy signup credits trigger.
--
-- Credits are now scoped to workspaces and are initialized by
-- handle_new_workspace_init() when onboarding creates a workspace. The old
-- auth.users trigger still calls handle_new_user_credits(), which inserts
-- user_id into the workspace-scoped user_credits table.

DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_credits();