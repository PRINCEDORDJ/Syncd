-- LinkedIn post analytics for Syncd-published posts.
--
-- 1. drafts.linkedin_post_urn — the URN returned when a draft is published
--    through Syncd (manual publish or the scheduler). Never backfilled from
--    LinkedIn: only posts dispatched through Syncd are tracked.
-- 2. drafts.published_at — set the first time a draft is published; bounds the
--    30-day stats refresh window.
-- 3. linkedin_post_stats — latest engagement snapshot per published post
--    (reactions/comments/shares/reposts). One row per draft, upserted by the
--    stats worker (service role). RLS: owner can read, nobody writes via API.

ALTER TABLE public.drafts
  ADD COLUMN IF NOT EXISTS linkedin_post_urn text;

ALTER TABLE public.drafts
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Backfill: approximate the publish time for already-published drafts so the
-- refresh window works for pre-existing rows.
UPDATE public.drafts
SET published_at = updated_at
WHERE published AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drafts_linkedin_post_urn
  ON public.drafts (linkedin_post_urn)
  WHERE linkedin_post_urn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drafts_published_at
  ON public.drafts (published_at)
  WHERE published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.linkedin_post_stats (
  draft_id UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_connection_id UUID REFERENCES public.linkedin_connections(id) ON DELETE SET NULL,
  linkedin_post_urn TEXT NOT NULL,
  reactions INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refresh_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refresh_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (draft_id)
);

ALTER TABLE public.linkedin_post_stats ENABLE ROW LEVEL SECURITY;

-- Owner can read their own stats; the service-role stats worker also writes
-- them (bypassing RLS). Owner INSERT/UPDATE exists so the client can seed a
-- stats row right after publishing a brand-new draft from the workspace.
CREATE POLICY "Users view own post stats"
  ON public.linkedin_post_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own post stats"
  ON public.linkedin_post_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own post stats"
  ON public.linkedin_post_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_post_stats_refresh
  ON public.linkedin_post_stats (refresh_after);

CREATE INDEX IF NOT EXISTS idx_linkedin_post_stats_user_id
  ON public.linkedin_post_stats (user_id);

CREATE TRIGGER update_linkedin_post_stats_updated_at
  BEFORE UPDATE ON public.linkedin_post_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
