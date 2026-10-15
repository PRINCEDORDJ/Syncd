-- Migration: Persist AI chat threads per draft
-- chat_messages stores the full conversation history for a workspace draft,
-- linked via a client-generated thread_id (drafts.thread_id stamps the thread
-- onto a draft once it is saved).

-- ============================================================================
-- 1. Add thread_id to drafts
-- ============================================================================
ALTER TABLE public.drafts ADD COLUMN IF NOT EXISTS thread_id uuid;
CREATE INDEX IF NOT EXISTS idx_drafts_thread_id ON public.drafts(thread_id);

-- ============================================================================
-- 2. chat_messages table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  draft_id uuid REFERENCES public.drafts(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  is_canvas_update boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
  ON public.chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON public.chat_messages(user_id, created_at DESC);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RLS — chat is personal to its author, even inside a shared workspace
-- ============================================================================
DROP POLICY IF EXISTS "View own chat messages" ON public.chat_messages;
CREATE POLICY "View own chat messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Insert own chat messages" ON public.chat_messages;
CREATE POLICY "Insert own chat messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Update own chat messages" ON public.chat_messages;
CREATE POLICY "Update own chat messages"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Delete own chat messages" ON public.chat_messages;
CREATE POLICY "Delete own chat messages"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
