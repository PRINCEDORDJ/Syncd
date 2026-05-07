-- Restrict profile reads to owner
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add explicit owner-scoped SELECT policy for linkedin_oauth_states
CREATE POLICY "Users can view their own oauth state"
  ON public.linkedin_oauth_states
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);