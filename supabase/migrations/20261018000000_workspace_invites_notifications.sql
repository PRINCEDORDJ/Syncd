-- =============================================================================
-- Workspace invites, notifications inbox & active workspace
--
-- Brings the live-DB-only workspace_invites objects into the repo, adds the
-- notifications table (realtime inbox), server-persisted active workspace on
-- profiles, and the invite RPC lifecycle. Also removes the non-deterministic
-- "LIMIT 1" workspace fallback from consume_credit / refund_credit so credit
-- pools are always charged against an explicit, membership-checked workspace.
-- =============================================================================

-- ── workspace_invites: formalize + extend ────────────────────────────────────

alter table public.workspace_invites
  add column if not exists invited_user_id uuid references auth.users(id) on delete set null;

-- Normalise existing emails to lowercase (required for the unique index below)
update public.workspace_invites
set email = lower(email)
where email is distinct from lower(email);

-- One live invite per email per workspace
create unique index if not exists workspace_invites_one_pending
  on public.workspace_invites (workspace_id, lower(email))
  where status = 'pending' and email is not null;

create index if not exists workspace_invites_email_status
  on public.workspace_invites (lower(email), status)
  where status = 'pending';

-- RLS: workspace managers can see invites; the invitee can see their own.
-- All writes go through security definer RPCs — drop the client write policies
-- that previously allowed direct inserts/updates/deletes.
drop policy if exists "Workspace admins manage invites" on public.workspace_invites;
drop policy if exists "Workspace admins update invites" on public.workspace_invites;
drop policy if exists "Workspace admins delete invites" on public.workspace_invites;

-- ── notifications ────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- Idempotency for invite notifications: at most one per (user, invite)
create unique index if not exists notifications_one_per_invite
  on public.notifications (user_id, (payload ->> 'invite_id'))
  where type = 'workspace_invite' and (payload ->> 'invite_id') is not null;

alter table public.notifications enable row level security;

drop policy if exists "user reads own notifications" on public.notifications;
create policy "user reads own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "user marks own notifications read" on public.notifications;
create policy "user marks own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Inserts only via security definer RPCs; no client insert/delete policies.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ── profiles.active_workspace_id ─────────────────────────────────────────────

alter table public.profiles
  add column if not exists active_workspace_id uuid references public.workspaces(id) on delete set null;

-- ── RPC: set_active_workspace ────────────────────────────────────────────────

create or replace function public.set_active_workspace(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if not public.has_workspace_access(p_workspace_id, v_user) then
    return jsonb_build_object('success', false, 'reason', 'not_a_member');
  end if;

  update public.profiles
  set active_workspace_id = p_workspace_id,
      updated_at = now()
  where user_id = v_user;

  if not found then
    insert into public.profiles (user_id, active_workspace_id, display_name)
    values (v_user, p_workspace_id, split_part(coalesce(auth.jwt() ->> 'email', 'User'), '@', 1))
    on conflict (user_id) do update
      set active_workspace_id = excluded.active_workspace_id,
          updated_at = now();
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.set_active_workspace(uuid) from anon;
grant execute on function public.set_active_workspace(uuid) to authenticated;

-- ── RPC: create_workspace_invite ─────────────────────────────────────────────

create or replace function public.create_workspace_invite(
  p_workspace_id uuid,
  p_email text,
  p_role public.workspace_role default 'member'::public.workspace_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_plan public.plan_tier;
  v_member_count int;
  v_pending_count int;
  v_recent_count int;
  v_invited_user uuid;
  v_inviter_name text;
  v_workspace_name text;
  v_invite_id uuid;
  v_existing public.workspace_invites;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_email');
  end if;

  -- Caller must be owner/admin of the workspace
  if not public.can_manage_workspace(p_workspace_id, v_user) then
    return jsonb_build_object('success', false, 'reason', 'not_authorized');
  end if;

  -- Plan gate: invites require the workspace owner's Teams plan (admins bypass)
  v_plan := public.get_workspace_plan(p_workspace_id);
  if v_plan <> 'teams' and not public.has_role(v_user, 'admin') then
    return jsonb_build_object('success', false, 'reason', 'plan_does_not_allow_invites');
  end if;

  -- Rate limit: max 10 invites created per workspace per hour
  select count(*) into v_recent_count
  from public.workspace_invites
  where workspace_id = p_workspace_id
    and created_at > now() - interval '1 hour';
  if v_recent_count >= 10 then
    return jsonb_build_object('success', false, 'reason', 'rate_limited');
  end if;

  -- Seat cap: active members + pending invites must stay below 5
  select count(*) into v_member_count
  from public.workspace_members
  where workspace_id = p_workspace_id
    and status = 'active'::public.grant_status;

  select count(*) into v_pending_count
  from public.workspace_invites
  where workspace_id = p_workspace_id
    and status = 'pending'::public.invite_status
    and expires_at > now();

  if v_member_count + v_pending_count >= 5 then
    return jsonb_build_object('success', false, 'reason', 'seat_limit_reached');
  end if;

  -- Reject if the email already belongs to a current member
  if exists (
    select 1
    from public.workspace_members wm
    join auth.users u on u.id = wm.user_id
    where wm.workspace_id = p_workspace_id
      and wm.status = 'active'::public.grant_status
      and lower(u.email) = v_email
  ) then
    return jsonb_build_object('success', false, 'reason', 'already_a_member');
  end if;

  -- Link to an existing confirmed account, if any
  select u.id into v_invited_user
  from auth.users u
  where lower(u.email) = v_email
    and u.email_confirmed_at is not null
  limit 1;

  -- Inviter + workspace names for the notification payload
  select coalesce(p.display_name, split_part(coalesce(u.email, 'Someone'), '@', 1))
    into v_inviter_name
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where u.id = v_user;

  select name into v_workspace_name
  from public.workspaces
  where id = p_workspace_id;

  -- Reuse a previous non-pending invite row for this email, or insert a new one
  select * into v_existing
  from public.workspace_invites
  where workspace_id = p_workspace_id
    and lower(email) = v_email
  order by created_at desc
  limit 1
  for update;

  if found and v_existing.status = 'pending'::public.invite_status then
    -- Already pending: keep the original invite (unique index enforces one live
    -- invite per email) and just refresh linkage/expiry.
    v_invite_id := v_existing.id;
    update public.workspace_invites
    set invited_user_id = coalesce(v_invited_user, invited_user_id),
        expires_at = now() + interval '7 days',
        updated_at = now()
    where id = v_invite_id;
  elsif found then
    v_invite_id := v_existing.id;
    update public.workspace_invites
    set status = 'pending'::public.invite_status,
        role = p_role,
        invited_by = v_user,
        invited_user_id = v_invited_user,
        expires_at = now() + interval '7 days',
        updated_at = now()
    where id = v_invite_id;
  else
    insert into public.workspace_invites (
      workspace_id, email, role, status, invited_by, invited_user_id, expires_at
    ) values (
      p_workspace_id, v_email, p_role, 'pending'::public.invite_status,
      v_user, v_invited_user, now() + interval '7 days'
    )
    returning id into v_invite_id;
  end if;

  -- In-app inbox entry when the invitee already has a confirmed account
  if v_invited_user is not null then
    insert into public.notifications (user_id, type, payload)
    values (
      v_invited_user,
      'workspace_invite',
      jsonb_build_object(
        'invite_id', v_invite_id,
        'workspace_id', p_workspace_id,
        'workspace_name', coalesce(v_workspace_name, 'Workspace'),
        'invited_by_name', coalesce(v_inviter_name, 'Someone'),
        'role', p_role
      )
    )
    on conflict do nothing;
  end if;

  -- Identical response whether or not the email has an account
  return jsonb_build_object('success', true, 'invite_id', v_invite_id);
end;
$$;

revoke execute on function public.create_workspace_invite(uuid, text, public.workspace_role) from anon;
grant execute on function public.create_workspace_invite(uuid, text, public.workspace_role) to authenticated;

-- ── RPC: accept_workspace_invite (replaces the live-DB-only version) ─────────

drop function if exists public.accept_workspace_invite(uuid);

create or replace function public.accept_workspace_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.workspace_invites;
  v_jwt_email text;
  v_member_count int;
  v_workspace_name text;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  -- Verified email only: JWT claim + confirmed auth.users row
  v_jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_jwt_email = '' or not exists (
    select 1 from auth.users u
    where u.id = v_user
      and u.email_confirmed_at is not null
      and lower(u.email) = v_jwt_email
  ) then
    return jsonb_build_object('success', false, 'reason', 'email_not_verified');
  end if;

  select * into v_invite
  from public.workspace_invites
  where id = p_invite_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'invite_not_found');
  end if;

  if v_invite.status <> 'pending'::public.invite_status then
    return jsonb_build_object('success', false, 'reason', 'invite_not_pending');
  end if;

  if v_invite.expires_at <= now() then
    update public.workspace_invites
    set status = 'expired'::public.invite_status, updated_at = now()
    where id = p_invite_id;
    return jsonb_build_object('success', false, 'reason', 'invite_expired');
  end if;

  if lower(coalesce(v_invite.email, '')) <> v_jwt_email then
    return jsonb_build_object('success', false, 'reason', 'email_mismatch');
  end if;

  -- Re-check seat cap at accept time (seats can fill between invite and accept)
  select count(*) into v_member_count
  from public.workspace_members
  where workspace_id = v_invite.workspace_id
    and status = 'active'::public.grant_status;
  if v_member_count >= 5 then
    return jsonb_build_object('success', false, 'reason', 'seat_limit_reached');
  end if;

  -- Insert membership. Never touches or removes any workspace the caller owns.
  insert into public.workspace_members (
    workspace_id, user_id, role, status, invited_by, accepted_at
  ) values (
    v_invite.workspace_id, v_user, v_invite.role,
    'active'::public.grant_status, v_invite.invited_by, now()
  )
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        accepted_at = excluded.accepted_at,
        updated_at = now();

  update public.workspace_invites
  set status = 'accepted'::public.invite_status, updated_at = now()
  where id = p_invite_id;

  -- Mark the related notification read
  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = v_user
    and type = 'workspace_invite'
    and payload ->> 'invite_id' = p_invite_id::text;

  -- Switch the caller's active workspace to the new one
  perform public.set_active_workspace(v_invite.workspace_id);

  select name into v_workspace_name
  from public.workspaces
  where id = v_invite.workspace_id;

  return jsonb_build_object(
    'success', true,
    'workspace_id', v_invite.workspace_id,
    'workspace_name', coalesce(v_workspace_name, 'Workspace'),
    'role', v_invite.role
  );
end;
$$;

revoke execute on function public.accept_workspace_invite(uuid) from anon;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;

-- ── RPC: decline_workspace_invite ────────────────────────────────────────────

create or replace function public.decline_workspace_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.workspace_invites;
  v_jwt_email text;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  v_jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into v_invite
  from public.workspace_invites
  where id = p_invite_id
  for update;

  if not found or v_invite.status <> 'pending'::public.invite_status then
    return jsonb_build_object('success', false, 'reason', 'invite_not_found');
  end if;

  if lower(coalesce(v_invite.email, '')) <> v_jwt_email then
    return jsonb_build_object('success', false, 'reason', 'email_mismatch');
  end if;

  update public.workspace_invites
  set status = 'declined'::public.invite_status, updated_at = now()
  where id = p_invite_id;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = v_user
    and type = 'workspace_invite'
    and payload ->> 'invite_id' = p_invite_id::text;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.decline_workspace_invite(uuid) from anon;
grant execute on function public.decline_workspace_invite(uuid) to authenticated;

-- ── RPC: revoke_workspace_invite ─────────────────────────────────────────────

create or replace function public.revoke_workspace_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.workspace_invites;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select * into v_invite
  from public.workspace_invites
  where id = p_invite_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'invite_not_found');
  end if;

  if not public.can_manage_workspace(v_invite.workspace_id, v_user) then
    return jsonb_build_object('success', false, 'reason', 'not_authorized');
  end if;

  update public.workspace_invites
  set status = 'revoked'::public.invite_status, updated_at = now()
  where id = p_invite_id;

  -- Remove the invitee's unread notification
  delete from public.notifications
  where type = 'workspace_invite'
    and read_at is null
    and payload ->> 'invite_id' = p_invite_id::text;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.revoke_workspace_invite(uuid) from anon;
grant execute on function public.revoke_workspace_invite(uuid) to authenticated;

-- ── RPC: link_pending_invites (signup / first-login hook) ────────────────────

create or replace function public.link_pending_invites()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_jwt_email text;
  v_invited_user uuid;
  v_inviter_name text;
  v_workspace_name text;
  v_invite record;
  v_linked int := 0;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  v_jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_jwt_email = '' or not exists (
    select 1 from auth.users u
    where u.id = v_user
      and u.email_confirmed_at is not null
  ) then
    return jsonb_build_object('success', true, 'linked', 0);
  end if;

  for v_invite in
    select wi.*
    from public.workspace_invites wi
    where wi.status = 'pending'::public.invite_status
      and wi.expires_at > now()
      and lower(wi.email) = v_jwt_email
      and (wi.invited_user_id is null or wi.invited_user_id = v_user)
    order by wi.created_at asc
  loop
    -- Attach the invite to this account
    if v_invite.invited_user_id is distinct from v_user then
      update public.workspace_invites
      set invited_user_id = v_user, updated_at = now()
      where id = v_invite.id;
    end if;

    select coalesce(p.display_name, split_part(coalesce(u.email, 'Someone'), '@', 1))
      into v_inviter_name
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    where u.id = v_invite.invited_by;

    select name into v_workspace_name
    from public.workspaces
    where id = v_invite.workspace_id;

    insert into public.notifications (user_id, type, payload)
    values (
      v_user,
      'workspace_invite',
      jsonb_build_object(
        'invite_id', v_invite.id,
        'workspace_id', v_invite.workspace_id,
        'workspace_name', coalesce(v_workspace_name, 'Workspace'),
        'invited_by_name', coalesce(v_inviter_name, 'Someone'),
        'role', v_invite.role
      )
    )
    on conflict do nothing;

    v_linked := v_linked + 1;
  end loop;

  return jsonb_build_object('success', true, 'linked', v_linked);
end;
$$;

revoke execute on function public.link_pending_invites() from anon;
grant execute on function public.link_pending_invites() to authenticated;

-- ── Credits: explicit workspace, membership-checked (no LIMIT 1 fallback) ────
--
-- Previously consume_credit / refund_credit fell back to an arbitrary
-- "first active membership" workspace when _workspace_id was NULL. With users
-- belonging to several workspaces that would charge the wrong pool. Now the
-- fallback resolves only the caller's OWNED workspace, and every resolution
-- is membership-checked.

create or replace function public.consume_credit(
  _user_id uuid,
  _workspace_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  r public.user_credits%ROWTYPE;
  monthly_start date := date_trunc('month', now())::date;
  v_plan public.plan_tier;
  v_is_free boolean;
  v_source text;
  v_target_ws UUID := _workspace_id;
BEGIN
  -- Admin bypass
  IF public.has_role(_user_id, 'admin') THEN
    RETURN jsonb_build_object('success', true, 'admin', true, 'source', 'admin');
  END IF;

  -- Resolve to the caller's owned workspace when not provided explicitly
  -- (deterministic — never an arbitrary membership).
  IF v_target_ws IS NULL THEN
    SELECT id INTO v_target_ws
    FROM public.workspaces
    WHERE owner_id = _user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_target_ws IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_workspace');
  END IF;

  -- Every charge is membership-checked against the target workspace
  IF NOT public.has_workspace_access(_user_id, v_target_ws) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_a_member');
  END IF;

  -- Derive plan from workspace owner
  v_plan := public.get_workspace_plan(v_target_ws);
  v_is_free := (v_plan = 'trial');

  SELECT * INTO r FROM public.user_credits WHERE workspace_id = v_target_ws FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (workspace_id) VALUES (v_target_ws) RETURNING * INTO r;
  END IF;

  -- Daily reset
  IF r.last_daily_reset < CURRENT_DATE THEN
    UPDATE public.user_credits
      SET daily_credits_used = 0,
          last_daily_reset = CURRENT_DATE,
          updated_at = now()
      WHERE workspace_id = v_target_ws
      RETURNING * INTO r;
  END IF;

  -- Monthly reset for trial (30 refill)
  IF r.last_monthly_reset < monthly_start THEN
    IF v_is_free THEN
      UPDATE public.user_credits
        SET subscription_credits = 30,
            last_monthly_reset = monthly_start,
            updated_at = now()
        WHERE workspace_id = v_target_ws
        RETURNING * INTO r;

      INSERT INTO public.credit_transactions (user_id, amount, type, description)
        VALUES (_user_id, 30, 'subscription_grant', 'Free plan monthly credit refill (workspace)');
    ELSE
      UPDATE public.user_credits
        SET last_monthly_reset = monthly_start,
            updated_at = now()
        WHERE workspace_id = v_target_ws
        RETURNING * INTO r;
    END IF;
  END IF;

  -- Free daily cap
  IF v_is_free AND r.daily_credits_used >= 5 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'daily_limit_reached');
  END IF;

  -- Deduct subscription first, then topup
  IF r.subscription_credits > 0 THEN
    v_source := 'subscription';
    UPDATE public.user_credits SET
      subscription_credits = subscription_credits - 1,
      daily_credits_used = CASE WHEN v_is_free THEN daily_credits_used + 1 ELSE daily_credits_used END,
      updated_at = now()
      WHERE workspace_id = v_target_ws;
  ELSIF r.topup_credits > 0 THEN
    v_source := 'topup';
    UPDATE public.user_credits SET
      topup_credits = topup_credits - 1,
      daily_credits_used = CASE WHEN v_is_free THEN daily_credits_used + 1 ELSE daily_credits_used END,
      updated_at = now()
      WHERE workspace_id = v_target_ws;
  ELSE
    RETURN jsonb_build_object('success', false, 'reason', 'no_credits');
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, -1, 'generation_use', 'AI generation (workspace ' || v_target_ws || ')');

  RETURN jsonb_build_object('success', true, 'source', v_source);
END;
$$;

create or replace function public.refund_credit(
  _user_id uuid,
  _reason text default 'generation_failed'::text,
  _credit_type text default 'auto'::text,
  _workspace_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  r public.user_credits%ROWTYPE;
  v_plan public.plan_tier;
  v_allocation int;
  v_target_ws UUID := _workspace_id;
BEGIN
  IF public.has_role(_user_id, 'admin') THEN
    RETURN;
  END IF;

  -- Deterministic fallback: the caller's owned workspace only
  IF v_target_ws IS NULL THEN
    SELECT id INTO v_target_ws
    FROM public.workspaces
    WHERE owner_id = _user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_target_ws IS NULL THEN
    RETURN;
  END IF;

  -- Never refund into a workspace the user no longer belongs to
  IF NOT public.has_workspace_access(_user_id, v_target_ws) THEN
    RETURN;
  END IF;

  v_plan := public.get_workspace_plan(v_target_ws);
  v_allocation := CASE v_plan
    WHEN 'trial'  THEN 30
    WHEN 'studio' THEN 150
    WHEN 'teams'  THEN 350
    ELSE 30
  END;

  SELECT * INTO r FROM public.user_credits WHERE workspace_id = v_target_ws FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF _credit_type = 'topup' THEN
    UPDATE public.user_credits SET
      topup_credits = topup_credits + 1,
      daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                THEN daily_credits_used - 1 ELSE daily_credits_used END,
      updated_at = now()
    WHERE workspace_id = v_target_ws;
  ELSIF _credit_type = 'subscription' THEN
    UPDATE public.user_credits SET
      subscription_credits = subscription_credits + 1,
      daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                THEN daily_credits_used - 1 ELSE daily_credits_used END,
      updated_at = now()
    WHERE workspace_id = v_target_ws;
  ELSE
    IF r.subscription_credits < v_allocation THEN
      UPDATE public.user_credits SET
        subscription_credits = subscription_credits + 1,
        daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                  THEN daily_credits_used - 1 ELSE daily_credits_used END,
        updated_at = now()
      WHERE workspace_id = v_target_ws;
    ELSE
      UPDATE public.user_credits SET
        topup_credits = topup_credits + 1,
        daily_credits_used = CASE WHEN v_plan = 'trial' AND daily_credits_used > 0
                                  THEN daily_credits_used - 1 ELSE daily_credits_used END,
        updated_at = now()
      WHERE workspace_id = v_target_ws;
    END IF;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (_user_id, 1, 'refund', 'Credit refunded — ' || _reason);
END;
$$;
