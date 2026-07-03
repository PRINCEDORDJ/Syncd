
-- 1. Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated where not needed
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_linkedin_oauth_states() FROM PUBLIC, anon, authenticated;

-- has_role and get_user_plan are used by the app for signed-in users; keep authenticated, revoke anon
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated, service_role;

-- Ensure service_role can still invoke trigger/maintenance functions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user_subscription() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_linkedin_oauth_states() TO service_role;

-- 2. user_roles: add explicit deny policies for INSERT/UPDATE/DELETE for authenticated users
-- (service_role bypasses RLS, so admin flows still work)
CREATE POLICY "No client inserts on user_roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client updates on user_roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "No client deletes on user_roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (false);

-- 3. Storage: replace broad public listing policy on avatars with owner-scoped listing.
-- Public URL reads (/storage/v1/object/public/...) bypass RLS, so avatars remain viewable by URL.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

CREATE POLICY "Users can list their own avatar folder"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
