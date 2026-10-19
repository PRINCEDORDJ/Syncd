-- AI chat threads: first-class conversation records so chat history can be
-- browsed independently of drafts. One thread per conversation; a thread may be
-- attached to at most one draft and a draft may have many threads.
-- Deleting a draft deletes its chats (draft_id FK cascades to chat_threads,
-- which cascades to chat_messages); standalone chats (draft_id is null) survive.
-- Threads are personal: RLS restricts every operation to auth.uid() = user_id.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  draft_id uuid references public.drafts(id) on delete cascade,
  title text not null default 'New chat',
  last_message_preview text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_threads_ws_user
  on public.chat_threads (workspace_id, user_id, last_message_at desc);
create index if not exists idx_chat_threads_draft
  on public.chat_threads (draft_id);

--
-- Backfill existing conversations from chat_messages.
--
-- One row per distinct thread, owned by the user/workspace of its first
-- message, titled by the first user message in the thread.
insert into public.chat_threads
  (thread_id, user_id, workspace_id, title, last_message_preview, last_message_at)
select first_msg.thread_id,
       first_msg.user_id,
       first_msg.workspace_id,
       coalesce(
         left(
           (select m.content
              from public.chat_messages m
             where m.thread_id = first_msg.thread_id
               and m.role = 'user'
             order by m.created_at asc, m.id asc
             limit 1),
           80
         ),
         'Imported chat'
       ),
       coalesce(
         left(
           (select m.content
              from public.chat_messages m
             where m.thread_id = first_msg.thread_id
             order by m.created_at asc, m.id asc
             limit 1),
           120
         ),
         ''
       ),
       coalesce(
         (select max(m.created_at)
            from public.chat_messages m
           where m.thread_id = first_msg.thread_id),
         first_msg.created_at
       )
from (
  select distinct on (thread_id) thread_id, user_id, workspace_id, created_at
    from public.chat_messages
   order by thread_id asc, created_at asc, id asc
) as first_msg
on conflict (thread_id) do nothing;

-- Link threads to their draft via drafts.thread_id, which is the legacy join
-- column. Ongoing persistence now writes chat_threads.draft_id directly.
update public.chat_threads ct
   set draft_id = d.id
  from public.drafts d
 where d.thread_id = ct.thread_id
   and d.user_id = ct.user_id
   and ct.draft_id is null;

--
-- chat_messages: outcome flag separate from the "canvas update" summary chip.
--
-- canvas_edited marks an assistant turn that changed the canvas, so the
-- message content (the model's thoughts) is still rendered as a bubble with a
-- "Canvas updated" badge on restore. Legacy rows keep is_canvas_update.
alter table public.chat_messages
  add column if not exists canvas_edited boolean not null default false;

-- Messages hang off their thread: delete a thread and its messages go too.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_thread_id_fkey'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_thread_id_fkey
      foreign key (thread_id) references public.chat_threads (thread_id) on delete cascade;
  end if;
end$$;

--
-- Realtime: threads power the sidebar/chat-panel history list.
--
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'chat_threads'
  ) then
    alter publication supabase_realtime add table public.chat_threads;
  end if;
end$$;

--
-- RLS: personal threads only.
--
alter table public.chat_threads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'chat_threads'
       and policyname = 'View own chat threads'
  ) then
    create policy "View own chat threads"
      on public.chat_threads
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'chat_threads'
       and policyname = 'Insert own chat threads'
  ) then
    create policy "Insert own chat threads"
      on public.chat_threads
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'chat_threads'
       and policyname = 'Update own chat threads'
  ) then
    create policy "Update own chat threads"
      on public.chat_threads
      for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'chat_threads'
       and policyname = 'Delete own chat threads'
  ) then
    create policy "Delete own chat threads"
      on public.chat_threads
      for delete
      using (auth.uid() = user_id);
  end if;
end$$;
