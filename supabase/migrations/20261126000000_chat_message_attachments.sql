-- Chat message attachments: metadata + extracted text for files shared with the
-- AI chat. Canvas media stays on the drafts table and is intentionally not
-- affected by this column.
alter table public.chat_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
