-- Allow multiple LinkedIn connections per user (Teams plan supports up to 10).
-- Previously user_id had a UNIQUE constraint limiting to one connection.

-- 1. Drop the single-connection unique constraint
ALTER TABLE public.linkedin_connections
  DROP CONSTRAINT IF EXISTS linkedin_connections_user_id_key;

-- 2. Add composite unique to prevent linking the same LinkedIn profile twice
ALTER TABLE public.linkedin_connections
  ADD CONSTRAINT linkedin_connections_user_member_urn_unique
  UNIQUE (user_id, linkedin_member_urn);

-- 3. Add an index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_linkedin_connections_user_id
  ON public.linkedin_connections (user_id);
