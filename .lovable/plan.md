## Scope

Four changes: (1) replace pricing with the credit-based model from the uploaded doc, (2) add Teams collaboration (invite by email, roles owner/editor/viewer, shared drafts), (3) add post scheduling with pg_cron auto-publish, (4) refresh the landing page to reflect all of the above.

## 1. Credit-based pricing

**New Polar products (you'll need to give me the IDs after I create them via MCP):**
- Studio Monthly $9, Studio Annual $90
- Teams Monthly $29, Teams Annual $290
- Top-up 50 credits ($4), 150 credits ($10), 500 credits ($25) — one-time

**Schema (migration):**
- `user_credits` — one row per user: `subscription_credits`, `topup_credits`, `daily_credits_used`, `last_daily_reset`, `last_monthly_reset`
- `credit_transactions` — append-only ledger
- Trigger on new signup inserts a `user_credits` row with 30 free credits
- RPCs: `consume_credit(_user_id, _is_free)` (atomic, handles daily/monthly reset + gate order from spec) and `grant_subscription_credits(_user_id, _amount, _reason)` and `grant_topup_credits(_user_id, _amount)`
- Monthly reset for paid tiers handled inside `consume_credit` when `last_monthly_reset` is in a prior month

**Code:**
- `src/lib/plans.ts` → rewrite to `{ free, studio, teams }` with `credits`, `dailyLimit`, `topUpsAllowed`, `seats` + `topUpPacks` array
- `src/routes/api.generate.ts` → call `consume_credit` before AI request; return 402 with `{ reason: 'daily_limit_reached' | 'no_credits' }`
- `src/routes/api.polar.checkout.ts` → accept `{ plan: 'studio_monthly' | 'studio_annual' | 'teams_monthly' | 'teams_annual' | 'topup_50' | 'topup_150' | 'topup_500' }`, look up correct product ID
- `src/routes/api.public.polar.webhook.ts` → on `subscription.active`/`subscription.renewed` call `grant_subscription_credits`; on `order.paid` for a top-up product call `grant_topup_credits`
- `src/lib/subscription.functions.ts` → return credit balance + daily used instead of drafts count
- `src/routes/settings.tsx` Billing tab → show credit balance, monthly allocation, top-up packs (Studio/Teams only), monthly/annual toggle
- `src/routes/app.tsx` → banner at 2/3 monthly usage (Free), warning at daily cap, block modal at 0 credits, low-credit warning (Studio) at 20 remaining
- `src/routes/pricing.tsx` → rewrite tiers, monthly/annual toggle, credit amounts

**Polar secrets:** replace `POLAR_STUDIO_PRODUCT_ID` / `POLAR_TEAMS_PRODUCT_ID` with 7 new IDs (`POLAR_STUDIO_MONTHLY_ID`, `POLAR_STUDIO_ANNUAL_ID`, `POLAR_TEAMS_MONTHLY_ID`, `POLAR_TEAMS_ANNUAL_ID`, `POLAR_TOPUP_50_ID`, `POLAR_TOPUP_150_ID`, `POLAR_TOPUP_500_ID`).

## 2. Teams collaboration

**Schema:**
- `teams` — `id`, `owner_id`, `name`
- `team_members` — `team_id`, `user_id` (nullable until accepted), `email`, `role` (`owner`/`editor`/`viewer`), `invited_at`, `accepted_at`
- Add `team_id` (nullable) to `drafts`
- `has_team_role(_team_id, _role[])` security-definer helper for RLS
- New RLS on `drafts`: owner or any team member can SELECT; owner/editor can UPDATE/INSERT; viewer read-only; delete = owner only
- Cap `team_members` count per team at plan `seats` (5 for Teams) via trigger

**Server functions (`src/lib/teams.functions.ts`):**
- `getMyTeam` — returns team + members with roles
- `inviteMember({ email, role })` — owner-only; inserts pending row; sends invite email via Lovable transactional email
- `acceptInvite({ token })` — links `user_id` to pending row when signed-in user's email matches
- `updateMemberRole`, `removeMember` — owner-only
- Automatic team creation on first Teams-plan activation in Polar webhook

**UI:**
- `src/routes/settings.tsx` → new "Team" tab (visible only when plan = teams): member list with role dropdowns, invite form, remove buttons — all destructive actions use `ConfirmDialog`
- `src/routes/app.tsx` & `src/routes/drafts.tsx` → team-owned drafts display owner avatar/name; viewers see read-only mode (Publish disabled, editing disabled)
- `src/routes/accept-invite.tsx` new route → handles invite links, redirects to `/auth` if not signed in, then attaches user to team

## 3. Scheduling

**Schema:**
- Add to `drafts`: `scheduled_at timestamptz`, `schedule_status text` (`draft` / `scheduled` / `publishing` / `published` / `failed`), `schedule_error text`

**Endpoint:**
- `src/routes/api.public.scheduler.tsx` (`/api/public/scheduler`) — cron endpoint; auth via `apikey` header (anon key); locks due rows with `FOR UPDATE SKIP LOCKED`, sets status `publishing`, calls existing LinkedIn publish logic (extracted into a shared helper `src/lib/linkedin-publish.server.ts`), updates status + `published_at` or `schedule_error`
- pg_cron job runs every minute (added via `supabase--insert` after route is deployed)

**UI:**
- `src/routes/app.tsx` → new "Schedule" button next to Publish; opens date/time picker; on save sets `scheduled_at` + `schedule_status='scheduled'`
- `src/routes/drafts.tsx` → new "Scheduled" filter tab alongside Drafts / Published; scheduled cards show countdown + "Reschedule" / "Cancel schedule" actions in the modal
- All destructive schedule actions gated by `ConfirmDialog`

## 4. Landing page refresh (`src/routes/index.tsx`)

- Update hero copy: mention team collaboration + scheduling
- New badge: "Now with scheduling + team workspaces"
- Feature cards restructured: connect → generate → **schedule** → publish
- New "Built for teams" section (avatars, role list, shared drafts screenshot)
- Rewrite pricing preview section: 3 tiers with credit amounts + "See top-up packs" link to `/pricing`
- Update meta description

## Technical notes

- Use `supabaseAdmin` in webhook + cron; use `requireSupabaseAuth` for team/credit reads from the app
- Existing admin bypass (`has_role(_user_id, 'admin')` → teams tier) is preserved: admin gets unlimited credits by short-circuiting `consume_credit`
- All new tables get GRANTs + RLS in the same migration
- Sequence: I'll create Polar products via MCP first, then the migration, then the code changes, then the pg_cron insert
