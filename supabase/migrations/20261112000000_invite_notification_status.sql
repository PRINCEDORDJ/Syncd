-- ─── Invite notifications: persist accept/decline outcome ───────────────────
-- The accept/decline RPCs previously only marked the notification read, so the
-- UI had no way to know the invite was resolved (cards re-rendered with live
-- Accept/Decline buttons after a reload). Merge the outcome into the payload.

-- ── RPC: accept_workspace_invite (adds notification payload status) ──────────

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

  -- Mark the related notification read and persist the resolved state
  update public.notifications
  set read_at = coalesce(read_at, now()),
      payload = payload || jsonb_build_object('status', 'accepted')
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

-- ── RPC: decline_workspace_invite (adds notification payload status) ─────────

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

  -- Mark the related notification read and persist the resolved state
  update public.notifications
  set read_at = coalesce(read_at, now()),
      payload = payload || jsonb_build_object('status', 'declined')
  where user_id = v_user
    and type = 'workspace_invite'
    and payload ->> 'invite_id' = p_invite_id::text;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.decline_workspace_invite(uuid) from anon;
grant execute on function public.decline_workspace_invite(uuid) to authenticated;
