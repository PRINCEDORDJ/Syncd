-- Store which LinkedIn connection a draft should publish to.
-- Teams users can connect multiple LinkedIn accounts; without this column the
-- scheduler always published with the most recent connection. NULL keeps the
-- legacy behavior (most recent active connection) for old/scheduled drafts.

ALTER TABLE public.drafts
  ADD COLUMN IF NOT EXISTS linkedin_connection_id uuid
  REFERENCES public.linkedin_connections(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drafts_linkedin_connection_id
  ON public.drafts(linkedin_connection_id);
