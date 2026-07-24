# Plan — SocioSync Platform

This document tracks the current architecture, implemented features, and remaining roadmap for SocioSync. Last updated 2026-07-24.

## Implemented

### 1. AI-Powered Workspace (`src/routes/app.tsx`)
- Raw-input generation with Lovable AI Gateway.
- Tone selection carousel with horizontal scroll and hidden scrollbar.
- Automatic draft title derivation from generated content (first sentence, ≤60 chars).
- Multi-image upload, video upload (1 video, ≤50 MB), and document attachments.
- Client-side validation: max 4 images, 5 MB per file, 15 MB total, standard formats.
- Real-time credit balance checks via `useCredits`; `CreditBanner` blocks generation when limits are reached.
- Auto-save drafts to `drafts` table with media URLs and `media_bytes`.

### 2. Drafts Library (`src/routes/drafts.tsx`)
- Centralized list of saved and published posts with search/filter.
- Preview modal with full title/content editing, live character counts, and media carousel.
- Inline scheduling via `SchedulePicker` (date + time) with status badges and cancel action.
- Publish now / schedule / cancel schedule controls.
- Delete action with `ConfirmDialog` for destructive confirmation.
- Storage-aware upload with quota checks and remaining-storage indicator.

### 3. Credits & Subscription System
- `user_credits` table tracks subscription credits, top-up credits, and daily usage.
- `credit_transactions` ledger for grants, usage, refunds, and plan changes.
- RPCs:
  - `consume_credit(_user_id)` — server-side plan derivation, daily cap, monthly reset.
  - `refund_credit(_user_id, _reason)` — restores credit on AI failure.
  - `handle_plan_change(_user_id, _new_plan, _old_plan)` — upgrade/downgrade accounting.
- Plan limits (`src/lib/plans.ts`):
  - **Trial**: 30 credits/mo, 5/day cap, 1 LinkedIn account, no scheduling/voice.
  - **Studio**: 100 credits/mo, scheduling, voice mapping, top-ups, 5 GB storage.
  - **Teams**: 350 credits/mo, 5 seats, 10 LinkedIn accounts, 20 GB storage.
- Admin bypass via `user_roles` + `has_role` for unlimited access.
- Real-time credit indicator (`CreditIndicator`) in `SiteNav` and mobile menu.

### 4. Storage Quotas
- `user_storage` table and `drafts.media_bytes` track cumulative usage.
- RPCs: `check_storage_quota`, `increment_storage`, `decrement_storage`, `sync_draft_storage`.
- Tier limits enforced at upload: Free 200 MB / 10 MB per file; Studio 5 GB / 25 MB; Teams 20 GB / 50 MB.
- Bucket files stored under `{user_id}/{draft_id}/{filename}` with RLS scoped to owner.
- `handle_draft_deletion` trigger decrements `user_storage` when a draft is deleted.
- Storage usage displayed in `settings.tsx` and drafts upload area.

### 5. Scheduling & Auto-Publishing
- `drafts.scheduled_at` + `schedule_status` columns.
- `SchedulePicker` component for local date/time selection converted to UTC ISO.
- Public scheduler worker (`/api/public/scheduler.ts`) invoked by `pg_cron` every minute.
- `publish_scheduled_post` RPC handles LinkedIn publishing at scheduled time.

### 6. Billing & Polar Integration
- Polar.sh checkout (`/api/polar/checkout.ts`), customer portal (`/api/polar/portal.ts`), and webhook (`/api/public/polar/webhook.ts`).
- Products: Studio monthly/annual, Teams monthly/annual, top-up packs (50 / 150 / 500 credits).
- Webhook updates `subscriptions`, credits, and storage on plan changes, renewals, cancellations, and top-ups.
- Pricing page (`/pricing`) with monthly/annual toggle and top-up section.
- Billing tab in settings shows current plan, status, and direct checkout actions.

### 7. Authentication & Account
- Supabase Auth with email + password and native Google OAuth (`signInWithOAuth`).
- Custom same-origin `redirect_uri` for Google on custom domains.
- Auth page (`/login`) branded with `BrandMark`.
- Tabbed settings (`/settings`):
  - Profile: avatar upload with preview/change, display name, voice dictation.
  - LinkedIn: connect/disconnect accounts, publish status.
  - Billing: current plan, storage usage, upgrade/purchase top-up actions.
  - Account: team invites (if Teams), preferences.
  - Danger: delete account with confirmation.
- Theme toggle (light/dark) in profile dropdown and mobile menu.

### 8. Security & RBAC
- `user_roles` table + `has_role` security definer helper.
- `EXECUTE` on `has_role` and `get_user_plan` restricted to `service_role` only.
- All destructive actions routed through `ConfirmDialog`.
- Storage bucket policies scoped to authenticated user's own folder.
- Plan derivation and quota checks performed server-side.
- Security memory maintained at `@security-memory`.

### 9. Navigation & UI
- Minimal navbar: logo + profile avatar with dropdown (settings, theme toggle, sign out).
- Mobile hamburger menu mirroring desktop dropdown.
- Global hidden-scrollbar styling while preserving scroll behavior.
- Responsive workspace, drafts, settings, and pricing layouts.
- Landing page with feature sections and CTA.
- Footer with legal links (Privacy, Terms).

## In Progress / Roadmap

1. **Skeleton Loaders** — Add shadcn `Skeleton` placeholders for nav credit/avatar, drafts list, workspace pane, settings tabs, and pricing cards.
2. **Team Workspace** — Finish team invites, shared drafts, and seat management in the Teams plan.
3. **Landing Page Refresh** — Continue redesign based on new credit/team positioning.
4. **Platform Expansion** — Extend publishing beyond LinkedIn (Twitter/X, Bluesky, etc.).
5. **Analytics** — Post-performance dashboard and credit usage reports.
6. **Documentation** — Keep `structure.md` and `plan.md` in sync with future iterations.

## Technical Details

- **Framework**: TanStack Start v1, React 19, Vite 7, Tailwind CSS v4.
- **Backend**: Supabase (Postgres + Auth + Storage + Realtime).
- **Payments**: Polar.sh via server routes and webhooks.
- **AI**: Lovable AI Gateway.
- **State**: TanStack Query, React Context (`CreditsProvider`), Supabase realtime channels.
- **Key Files**:
  - `src/lib/plans.ts` — source of truth for tier limits.
  - `src/lib/credits-context.tsx` — credit state provider.
  - `src/hooks/useStorage.ts` — storage usage hook.
  - `src/components/SchedulePicker.tsx` — scheduling UI.
  - `src/components/CreditIndicator.tsx` / `CreditBanner.tsx` — credit UX.
  - `src/routes/api.public.polar.webhook.ts` — billing event handling.
  - `src/routes/api.public.scheduler.ts` — scheduled publishing worker.

## Open Questions

- Which platform should be integrated after LinkedIn? (Twitter/X, Bluesky, Threads, etc.)
- Should free-tier storage be cumulative or reset monthly? Currently cumulative.
- Should failed scheduled posts retry or notify the user? Currently logs to webhook/scheduler logs.
