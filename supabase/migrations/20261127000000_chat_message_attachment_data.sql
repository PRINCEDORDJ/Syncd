-- Persist the actual bytes of chat attachments (as data URLs) so they survive
-- reloads and can be opened/downloaded later. Kept in a separate column from
-- `attachments` (metadata + extracted text) so thread loads never pull blobs.
alter table public.chat_messages
  add column if not exists attachment_data jsonb not null default '[]'::jsonb;
