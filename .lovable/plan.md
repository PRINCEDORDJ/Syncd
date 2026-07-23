# Plan — Scheduling UI, Credits, and Logic Hardening

Five workstreams; database work first, then API, then UI, then docs.

## 1. Credit-logic hardening (DB + API)

New migration `credit_logic_fixes` with three RPCs and a webhook wire-up.

**Schema note (verified):** `subscriptions.plan` and `.status` are enums (`plan_tier` with values `trial | studio | teams`; status includes `active | trialing | canceled | past_due | expired`). Plans use `trial`, not `free` — the incoming pseudocode's `'free'` label maps to `'trial'`.

### a. Rewrite `consume_credit(_user_id uuid)` — drop `_is_free`

- Derive plan server-side via existing `get_user_plan(_user_id)` (already handles admin bypass + trial fallback + status/period checks).
- `is_free := (plan = 'trial')`.
- Keep daily reset, monthly reset (trial-only refill to 30), daily cap of 5, subscription-then-topup deduction, and the existing `credit_transactions` log row.
- Admin bypass short-circuits as today.

### b. New `refund_credit(_user_id uuid, _reason text default 'generation_failed')`

- Derive plan via `get_user_plan`; skip entirely when admin.
- Restore into `subscription_credits` first if below plan allocation from `PLAN_LIMITS` (30 / 100 / 350), else into `topup_credits`.
- Decrement `daily_credits_used` (floor 0) when trial.
- Insert a `credit_transactions` row (`amount = 1`, `type = 'generation_use'`, description prefixed `Credit refunded —` ).

### c. New `handle_plan_change(_user_id uuid, _new_plan plan_tier, _old_plan plan_tier)`

- Upgrade (new allocation > old): set `subscription_credits = new_allocation`, `last_monthly_reset = current_date`.
- Downgrade / cancel: `subscription_credits = least(subscription_credits, new_allocation)`; leave `topup_credits` alone.
- Log delta into `credit_transactions` with `type = 'plan_change'`.

### d. API wiring

- `src/routes/api.generate.ts`: drop the `_is_free` argument to `consume_credit`; wrap the AI gateway call so any thrown error or non-2xx (excluding 402/429 which already messaging) triggers `refund_credit` before returning. Ensure streaming failures after the response body starts do not double-refund (only refund when the upstream `fetch` itself throws or `!response.ok`).
- `src/routes/api.public.polar.webhook.ts`: on `subscription.updated` / `subscription.active` / `subscription.uncanceled`, look up the existing stored `plan` in `subscriptions` before the upsert; if it differs from the new derived plan, call `handle_plan_change(user, new, old)` after the upsert. Keep the existing `grant_subscription_credits` call as the initial-activation path (skip it when `handle_plan_change` ran to avoid double-granting).

### e. `credit_transactions.type` allowed values

Confirm the CHECK constraint / enum accepts `'plan_change'`; if not, extend it in the same migration.

## 2. Scheduling UI (`src/routes/drafts.tsx`)

Backend already has `drafts.scheduled_at`, `schedule_status`, and the pg_cron/`/api/public/scheduler` publisher. UI-only changes.

- Split the modal's "Publish" control into **Publish now** + **Schedule** (shadcn `Button` group).
- **Schedule** reveals an inline picker (extract to `src/components/SchedulePicker.tsx` — likely >60 lines):
  - shadcn `Popover` + `Calendar` (`mode="single"`, `disabled={{ before: today }}`, `pointer-events-auto`).
  - Native `<input type="time">` beside it.
  - Default to tomorrow 09:00 local; disallow past datetimes with inline error.
  - Confirmation label: `Scheduled for {toLocaleString(...)}` before final `Schedule Post` button.
- On confirm: update the draft row directly via Supabase client — `scheduled_at = <ISO UTC>`, `schedule_status = 'scheduled'`, `published = false`. No new API endpoint needed; the pg_cron worker already picks it up.
- Toast "Post scheduled for {date}"; close modal; drafts list refreshes.
- **Drafts list item**: when `schedule_status = 'scheduled'`, swap platform icon for `Clock` (lucide) and show subtitle `Scheduled · {short date, time}`.
- **Cancel Schedule** action in the row menu and inside the modal (with `ConfirmDialog`) — clears `scheduled_at`, sets `schedule_status = null`.

## 3. Credit balance display

### a. `src/hooks/useCredits.ts` (new)

- Fetches the user's `user_credits` row.
- Subscribes via `supabase.channel(...).on('postgres_changes', { table: 'user_credits', filter: 'user_id=eq.<uid>' })` inside `useEffect`; cleanup on unmount.
- Missing row → treat as trial defaults (30 sub credits, 0 daily used, 0 top-ups).
- Also reads plan via existing subscription query (reuse `getMySubscription` server fn or a lightweight `useQuery`).
- Returns `{ subscriptionCredits, topupCredits, dailyCreditsUsed, dailyLimit, monthlyAllocation, totalRemaining, plan, isAdmin, isLoading, error }`.

### b. `src/components/SiteNav.tsx`

- Compact `Zap` icon indicator; button links to `/pricing`.
- Trial: `⚡ {5-used} / 5 today · {sub} / 30 this month`.
- Paid: `⚡ {total} credits remaining` (+  `+ {topup} top-up` muted when > 0).
- Admin: `⚡ Unlimited`.
- Threshold color via `text-muted-foreground` / `text-amber-500` / `text-destructive` at 30% / 10% of monthly allocation.
- Skeleton (shadcn `Skeleton`) while loading; hide silently on error (log to console).
- Show on both desktop nav and inside the mobile menu sheet.

### c. Upgrade banner in `src/routes/app.tsx` (and mirror in `drafts.tsx` generation surface if applicable)

- Compute banner state from `useCredits()`; render above the Generate button.
- Trial rules per spec (daily >=4 warn, >=5 block; monthly <=8 warn, <=0 block).
- Paid rule: `subscription_credits <= 20` low-credit warning.
- When "block" state, disable Generate button and show reason.
- Links route to `/pricing`.

## 4. Skeleton loaders (app-wide)

Introduce shadcn `Skeleton`-based placeholders (component already in the library) for:

- `SiteNav` credit indicator + avatar area.
- Drafts list (`/drafts`) while the initial query loads (rows of card skeletons).
- Workspace (`/app`) content pane on first mount.
- Settings tabs (profile, billing, team) while their queries resolve.
- Pricing page tier cards while subscription state loads.

## 5. Pricing page refresh (`src/routes/pricing.tsx`)

Rewrite tier cards to match `PLAN_LIMITS` / `TOPUP_PACKS` in `src/lib/plans.ts` (the source of truth used elsewhere):

- **Free**: 30 credits/mo, 5/day cap, 1 LinkedIn account, no scheduling, no voice mapping.
- **Studio**: $9/mo or $90/yr — 100 credits/mo, scheduling, voice mapping, top-ups.
- **Teams**: $29/mo or $290/yr — 350 credits/mo, 5 seats, 10 LinkedIn accounts, everything in Studio.
- Add monthly/annual toggle mirroring Settings → Billing.
- Add top-up pack section (50 / 150 / 500). Buttons hit `/api/polar/checkout` with the corresponding plan keys.
- Keep design consistent with current theme (dark-mode aware).

## 6. Docs

- `.lovable/plan.md`: replace outdated pricing/limits with the credit model, scheduling, teams, admin bypass, and the new credit-logic RPCs.
- `.lovable/structure.md`: add `src/hooks/useCredits.ts`, `src/components/SchedulePicker.tsx`, new RPCs, `/api/public/scheduler`, `drafts.scheduled_at` columns, and the credit tables.

## Technical details

- **Files created**: `supabase/migrations/<ts>_credit_logic_fixes.sql`, `src/hooks/useCredits.ts`, `src/components/SchedulePicker.tsx`.
- **Files modified**: `src/routes/api.generate.ts`, `src/routes/api.public.polar.webhook.ts`, `src/routes/drafts.tsx`, `src/routes/app.tsx`, `src/components/SiteNav.tsx`, `src/routes/pricing.tsx`, `src/routes/settings.tsx` (skeletons only), `.lovable/plan.md`, `.lovable/structure.md`.
- **Migration order**: single migration containing (1) `consume_credit` replacement (drop old signature `consume_credit(uuid, boolean)` first), (2) `refund_credit`, (3) `handle_plan_change`, (4) any `credit_transactions.type` enum/check widening for `plan_change`. All security definer; execute grants match existing pattern (service_role only for `refund_credit`/`handle_plan_change`; `consume_credit` keeps its current grants).
- **Realtime**: enable `user_credits` on `supabase_realtime` publication in the same migration (currently not enabled — needed for the hook's live updates).
- **Timezones**: schedule picker uses local `Date`, converted to UTC ISO for the DB; display uses `toLocaleString`.
- **No new deps**; uses existing shadcn Calendar/Popover/Skeleton and lucide `Clock`/`Zap` icons.

## Open item

The spec's Fix 2 pseudocode caps refunds at plan allocation using a `case` inside the update. My implementation follows that intent by branching in plpgsql (subscription bucket if under cap, otherwise top-up bucket). Confirm this matches expectations before I code it.  
  
Also fix all security issues  
  
Additional:  
Plan: Storage Subscription Limits

SocialSync already stores draft media in a Supabase Storage bucket with URLs saved as an array inside the `drafts` table. This plan adds per-tier storage quotas enforced at both the application layer (pre-upload check) and bucket level (RLS + file size policy), tracks cumulative usage in a `user_storage` table, cleans up bucket files on draft deletion, and surfaces storage usage in the UI.

---

## Storage Limits Per Tier


| Tier   | Storage Limit | Max File Size |
| ------ | ------------- | ------------- |
| Free   | 200 MB        | 10 MB         |
| Studio | 5 GB          | 25 MB         |
| Teams  | 20 GB         | 50 MB         |


Storage is **cumulative** — it does not reset monthly. It accumulates across all drafts until files are deleted.

---

## Stack Notes

- **Frontend**: `src/routes/drafts.tsx`, `src/routes/settings.tsx`, `src/hooks/useStorage.ts` (new)
- **Backend**: Supabase Storage bucket policies, Supabase RPCs, Supabase DB trigger on draft deletion
- **Database**: New `user_storage` table; new `media_bytes` column on `drafts`; three RPCs: `check_storage_quota`, `increment_storage`, `decrement_storage`
- **Third-party**: None — all handled inside Supabase

---

## Scope

- **In:**
  - `user_storage` table to track bytes used per user
  - `media_bytes` column on `drafts` to track bytes per draft
  - Pre-upload quota check before any file upload
  - Bucket RLS policies scoped to authenticated user's own folder
  - Per-file size enforcement at the application layer
  - Automatic storage decrement when a draft is deleted (DB trigger)
  - Storage usage display in `settings.tsx`
  - Storage indicator in `drafts.tsx` upload area
- **Out:**
  - Storage usage history timeline
  - Automatic cleanup of published draft media (deferred — keep files until draft is explicitly deleted)
  - Admin storage overview across all users

---

## Data Flow

### Upload flow

```
User selects file in drafts modal
→ drafts.tsx checks file size against plan limit (client-side, fast feedback)
→ calls check_storage_quota(user_id, file_bytes) RPC
→ [quota exceeded] → show inline error, block upload
→ [quota ok] → upload file to Supabase Storage at path: {user_id}/{draft_id}/{filename}
→ on upload success → append URL to draft's media array
→ call increment_storage(user_id, draft_id, file_bytes) RPC
→ update user_storage.bytes_used and drafts.media_bytes atomically

```

### Deletion flow (draft deleted)

```
User deletes draft
→ drafts.tsx calls Supabase to delete draft row
→ DB trigger fires on drafts DELETE
→ trigger calls decrement_storage(user_id, media_bytes)
→ deletes all files under {user_id}/{draft_id}/ from bucket
→ decrements user_storage.bytes_used by draft's media_bytes

```

### Media removal flow (file removed from draft, draft kept)

```
User removes one file from draft
→ drafts.tsx deletes file from bucket: {user_id}/{draft_id}/{filename}
→ calls decrement_storage(user_id, draft_id, file_bytes) RPC
→ decrements user_storage.bytes_used and drafts.media_bytes

```

---

## Schema

### New table — `user_storage`

```sql
create table public.user_storage (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  bytes_used  bigint not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.user_storage enable row level security;

create policy "user reads own storage"
  on public.user_storage for select
  using (auth.uid() = user_id);

-- No direct client writes — all mutations go through RPCs

```

### New column on `drafts`

```sql
alter table public.drafts
  add column media_bytes bigint not null default 0;

```

This stores the total bytes of all media attached to that draft. Updated atomically with `user_storage.bytes_used` on every upload or removal.

---

## Supabase Storage Bucket Policies

### Folder structure

All draft media lives under a user-scoped path:

```
{bucket_name}/{user_id}/{draft_id}/{filename}

```

### RLS policies on the storage bucket

```sql
-- Users can only upload to their own folder
create policy "user uploads own media"
  on storage.objects for insert
  with check (
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can only read their own media
create policy "user reads own media"
  on storage.objects for select
  using (
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can only delete their own media
create policy "user deletes own media"
  on storage.objects for delete
  using (
    auth.uid()::text = (storage.foldername(name))[1]
  );

```

---

## RPCs

### `check_storage_quota(p_user_id, p_file_bytes)`

Called before every upload. Returns whether the upload is allowed.

```sql
create or replace function check_storage_quota(
  p_user_id   uuid,
  p_file_bytes bigint
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_plan         text;
  v_limit_bytes  bigint;
  v_used_bytes   bigint;
  v_file_limit   bigint;
begin
  -- Derive plan from subscriptions
  select plan into v_plan
  from subscriptions
  where user_id = p_user_id
    and status = 'active'
  order by created_at desc
  limit 1;

  v_plan := coalesce(v_plan, 'free');

  -- Set quota and per-file limit from plan
  v_limit_bytes := case v_plan
    when 'free'   then 209715200   -- 200MB
    when 'studio' then 5368709120  -- 5GB
    when 'teams'  then 21474836480 -- 20GB
    else 209715200
  end;

  v_file_limit := case v_plan
    when 'free'   then 10485760   -- 10MB
    when 'studio' then 26214400   -- 25MB
    when 'teams'  then 52428800   -- 50MB
    else 10485760
  end;

  -- Check per-file size
  if p_file_bytes > v_file_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'file_too_large',
      'limit_bytes', v_file_limit
    );
  end if;

  -- Get current usage
  select coalesce(bytes_used, 0) into v_used_bytes
  from user_storage
  where user_id = p_user_id;

  -- Check total quota
  if (v_used_bytes + p_file_bytes) > v_limit_bytes then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'quota_exceeded',
      'used_bytes', v_used_bytes,
      'limit_bytes', v_limit_bytes
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'used_bytes', v_used_bytes,
    'limit_bytes', v_limit_bytes
  );
end;
$$;

```

### `increment_storage(p_user_id, p_draft_id, p_file_bytes)`

Called after a successful upload.

```sql
create or replace function increment_storage(
  p_user_id    uuid,
  p_draft_id   uuid,
  p_file_bytes bigint
)
returns void
language plpgsql
security definer
as $$
begin
  -- Upsert user_storage
  insert into user_storage (user_id, bytes_used, updated_at)
  values (p_user_id, p_file_bytes, now())
  on conflict (user_id) do update set
    bytes_used = user_storage.bytes_used + p_file_bytes,
    updated_at = now();

  -- Update draft's media_bytes
  update drafts
  set media_bytes = media_bytes + p_file_bytes
  where id = p_draft_id
    and user_id = p_user_id;
end;
$$;

```

### `decrement_storage(p_user_id, p_draft_id, p_file_bytes)`

Called on individual file removal. Also called by the draft deletion trigger.

```sql
create or replace function decrement_storage(
  p_user_id    uuid,
  p_draft_id   uuid,
  p_file_bytes bigint
)
returns void
language plpgsql
security definer
as $$
begin
  update user_storage
  set
    bytes_used = greatest(0, bytes_used - p_file_bytes),
    updated_at = now()
  where user_id = p_user_id;

  update drafts
  set media_bytes = greatest(0, media_bytes - p_file_bytes)
  where id = p_draft_id
    and user_id = p_user_id;
end;
$$;

```

### Draft deletion trigger

Fires automatically when a draft row is deleted. Deletes bucket files and decrements storage.

```sql
create or replace function handle_draft_deletion()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Decrement user_storage by the draft's total media bytes
  update user_storage
  set
    bytes_used = greatest(0, bytes_used - old.media_bytes),
    updated_at = now()
  where user_id = old.user_id;

  -- Note: bucket file deletion must happen at the application layer
  -- before deleting the draft row, since triggers cannot call
  -- Supabase Storage APIs directly. See api flow below.
  return old;
end;
$$;

create trigger on_draft_deleted
  before delete on drafts
  for each row
  execute function handle_draft_deletion();

```

> **Important**: Supabase Storage file deletion cannot happen inside a DB trigger. The application must delete bucket files **before** deleting the draft row. The trigger handles the `user_storage` decrement as a safety net for the bytes count.

---

## Application-Layer Upload Flow (`src/routes/drafts.tsx`)

```ts
async function handleFileUpload(file: File, draftId: string) {
  // 1. Client-side file size check (fast feedback before RPC)
  const { data: quota } = await supabase.rpc('check_storage_quota', {
    p_user_id: user.id,
    p_file_bytes: file.size,
  })

  if (!quota.allowed) {
    const msg = quota.reason === 'file_too_large'
      ? `File too large. Your plan allows up to ${formatBytes(quota.limit_bytes)} per file.`
      : `Storage full. You've used ${formatBytes(quota.used_bytes)} of ${formatBytes(quota.limit_bytes)}.`
    showToast(msg, 'error')
    return
  }

  // 2. Upload to bucket
  const path = `${user.id}/${draftId}/${file.name}`
  const { error } = await supabase.storage
    .from('draft-media')
    .upload(path, file)

  if (error) {
    showToast('Upload failed. Please try again.', 'error')
    return
  }

  // 3. Increment storage tracking
  await supabase.rpc('increment_storage', {
    p_user_id: user.id,
    p_draft_id: draftId,
    p_file_bytes: file.size,
  })

  // 4. Append URL to draft media array
  const { data: { publicUrl } } = supabase.storage
    .from('draft-media')
    .getPublicUrl(path)

  // update draft media_urls array in drafts table...
}

```

## Application-Layer Draft Deletion Flow

```ts
async function handleDraftDelete(draft: Draft) {
  // 1. Delete all bucket files first
  if (draft.media_urls?.length > 0) {
    const paths = draft.media_urls.map(url => extractPathFromUrl(url))
    await supabase.storage.from('draft-media').remove(paths)
  }

  // 2. Delete draft row — trigger handles user_storage decrement
  await supabase.from('drafts').delete().eq('id', draft.id)
}

```

---

## `lib/plans.ts` Update

Add storage limits alongside credit limits:

```ts
export const plans = {
  free: {
    credits: 30,
    dailyLimit: 5,
    topUpsAllowed: false,
    seats: 1,
    storageBytes: 209715200,    // 200MB
    maxFileSizeBytes: 10485760, // 10MB
  },
  studio: {
    credits: 100,
    dailyLimit: null,
    topUpsAllowed: true,
    seats: 1,
    storageBytes: 5368709120,   // 5GB
    maxFileSizeBytes: 26214400, // 25MB
  },
  teams: {
    credits: 350,
    dailyLimit: null,
    topUpsAllowed: true,
    seats: 5,
    storageBytes: 21474836480,  // 20GB
    maxFileSizeBytes: 52428800, // 50MB
  },
}

```

---

## UI — Storage Display

### `src/routes/settings.tsx`

Add a storage usage section showing a progress bar:

```
Storage
████████░░░░░░░░░░░░  87 MB of 200 MB used (43%)

```

Colour thresholds match the credit indicator:

- Below 70% used → default
- 70–90% used → amber
- Above 90% used → red

### `src/routes/drafts.tsx` — upload area

Show remaining storage inline near the upload button:

```
⬆ Attach media  ·  113 MB remaining

```

When quota is exceeded, replace with:

```
⚠ Storage full  ·  Upgrade to add more media →

```

### `src/hooks/useStorage.ts` (new)

```ts
export function useStorage() {
  // fetch user_storage row for auth.uid()
  // return { bytesUsed, bytesLimit, percentUsed, isNearLimit, isFull, isLoading }
}

```

Use in both `settings.tsx` and `drafts.tsx`.

---

## Files to Create / Modify


| File                                          | Action | Notes                                                                                   |
| --------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `supabase/migrations/XXXXXX_user_storage.sql` | Create | `user_storage` table, `media_bytes` column, all RPCs, deletion trigger, bucket policies |
| `src/hooks/useStorage.ts`                     | Create | Fetch and expose storage stats                                                          |
| `src/routes/drafts.tsx`                       | Modify | Pre-upload quota check, increment/decrement calls, deletion flow, storage indicator     |
| `src/routes/settings.tsx`                     | Modify | Storage usage progress bar                                                              |
| `src/lib/plans.ts`                            | Modify | Add `storageBytes` and `maxFileSizeBytes` per plan                                      |


---

## Action Items

- [ ] Write migration: `user_storage` table + RLS, `media_bytes` column on `drafts`, `check_storage_quota` RPC, `increment_storage` RPC, `decrement_storage` RPC, draft deletion trigger, bucket RLS policies
- [ ] Run migration in Supabase dashboard
- [ ] Update `src/lib/plans.ts` with storage limits
- [ ] Create `src/hooks/useStorage.ts`
- [ ] Update `drafts.tsx` upload handler — add quota check, increment call, per-file size check
- [ ] Update `drafts.tsx` delete handler — delete bucket files before deleting draft row
- [ ] Update `drafts.tsx` media removal — delete file from bucket, call `decrement_storage`
- [ ] Update `drafts.tsx` upload area — show remaining storage, show full warning
- [ ] Update `settings.tsx` — add storage usage progress bar
- [ ] Test upload: file under limit → succeeds, storage increments
- [ ] Test upload: file over per-file limit → blocked with correct message
- [ ] Test upload: quota exceeded → blocked with correct message
- [ ] Test draft deletion: bucket files deleted, `user_storage` decremented
- [ ] Test single file removal: bucket file deleted, bytes decremented correctly

---

## Security Checklist

- [ ] Bucket RLS scopes all operations to `{user_id}/*` — users cannot access other users' files
- [ ] `check_storage_quota` derives plan from `subscriptions` server-side — not trusted from client
- [ ] All storage RPCs use `security definer` — not dependent on user's RLS context
- [ ] File paths include `user_id` as the first segment — no path traversal possible
- [ ] `greatest(0, ...)` used in all decrements — `bytes_used` can never go negative

---

## Open Questions

- What is the existing Supabase Storage bucket name for draft media? The upload path and bucket policies need the exact bucket name.
- Are media URLs currently stored as a `text[]` array column on `drafts`, or as JSONB? This affects how the deletion flow extracts paths to clean up.  
  
Make the necessary changes.
  &nbsp;