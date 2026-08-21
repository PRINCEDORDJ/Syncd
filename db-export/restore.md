# Restoring Syncd into your own Supabase project

This bundle is a portable copy of the backend: the full schema plus a CSV of
every row in the `public` schema. It exists so your data is never locked into
one host — you can stand the database up in any Supabase project you control.

## What's in here

| File | What it is |
| --- | --- |
| `schema.sql` | Every migration concatenated in order — extensions, enums, tables, grants, RLS policies, functions, triggers, cron jobs. Run it top-to-bottom on an empty database and you land on the current production schema. |
| `data/<table>.csv` | All rows for that table, `CSV HEADER` format. |
| `restore.md` | This file. |

Regenerate the whole bundle any time with `./scripts/export-db.sh` (needs `psql`
and `PG*` env vars pointing at the source database).

## Step 1 — Create the target project

Create a new Supabase project. Note its project ref, database password, URL,
publishable (anon) key and service-role key.

## Step 2 — Load the schema

In the Supabase SQL editor, paste the contents of `schema.sql` and run it. Or
from a terminal:

```bash
psql "postgresql://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres" -f schema.sql
```

`schema.sql` replays the migration history in order, so later
`CREATE OR REPLACE FUNCTION` / `ALTER TABLE` statements win and the end state
matches production. It is not idempotent — run it once, on an empty database.

If a statement fails because an extension isn't enabled, enable it in
Database → Extensions and re-run from that point. `pg_cron` and `pg_net` are
required for the scheduled-publishing worker.

## Step 3 — Recreate auth users (before loading data)

`auth.users` is Supabase-managed and is **not** part of this export. Every app
table keys off `auth.users.id`, so the users must exist first, with the same
UUIDs, or the foreign keys / RLS policies won't line up.

Two options:

**A. Recreate with matching IDs (preserves all data links).** Use the Auth
Admin API with the service-role key. The user IDs you need are the distinct
`user_id` / `id` values in `data/profiles.csv`:

```bash
curl -X POST "https://<REF>.supabase.co/auth/v1/admin/users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"id":"<UUID from profiles.csv>","email":"user@example.com","email_confirm":true}'
```

Passwords cannot be exported. Users sign in with Google OAuth or a password
reset on first visit.

**B. Fresh start.** Have people re-sign-up, then skip or remap the CSVs.
Historical drafts and credits will not attach to the new accounts.

## Step 4 — Load the data

Load in this order so foreign keys resolve:

```
profiles
user_roles
teams
team_members
subscriptions
user_credits
credit_transactions
user_storage
linkedin_connections
linkedin_oauth_states
drafts
```

From `psql`, for each table:

```bash
\copy public.profiles FROM 'data/profiles.csv' WITH CSV HEADER
```

Or scripted:

```bash
for t in profiles user_roles teams team_members subscriptions user_credits \
         credit_transactions user_storage linkedin_connections \
         linkedin_oauth_states drafts; do
  psql "postgresql://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres" \
    -c "\copy public.$t FROM 'data/$t.csv' WITH CSV HEADER"
done
```

`jsonb` columns (draft `images`, `attachments`) round-trip through CSV with
standard quoting — no special handling needed.

Triggers that fire on insert (e.g. credit seeding, `updated_at` stamping) will
run during the load. If you need byte-exact timestamps, disable triggers for
the session with `SET session_replication_role = replica;` before the copies and
reset it afterwards.

## Step 5 — Storage objects

Only the database rows that *reference* uploaded files are exported. The files
themselves (profile avatars in the `avatars` bucket, and any post media) are not
in this bundle. To move them:

1. Create the same buckets in the target project with the same names and
   public/private setting.
2. Download the objects from the source project and re-upload them under the
   same paths, so the URLs stored in `profiles.avatar_url` and `drafts.images`
   still resolve.

If you skip this, the app still works — avatars and media just render broken
until re-uploaded.

## Step 6 — Re-provision secrets

None of these are in the export (they're credentials, not data). Set every one
in the target project before the app will fully function:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_STUDIO_PRODUCT_ID`, `POLAR_STUDIO_MONTHLY_ID`, `POLAR_STUDIO_ANNUAL_ID`
- `POLAR_TEAMS_PRODUCT_ID`, `POLAR_TEAMS_MONTHLY_ID`, `POLAR_TEAMS_ANNUAL_ID`
- `POLAR_TOPUP_50_ID`, `POLAR_TOPUP_150_ID`, `POLAR_TOPUP_500_ID`
- `LOVABLE_API_KEY` (or an equivalent AI provider key if you move off the gateway)

Also re-point, in the external services themselves:

- LinkedIn app → OAuth redirect URL for the new host
- Polar → webhook endpoint URL for the new host
- Supabase Auth → Google provider credentials, Site URL and redirect allow-list

## Step 7 — Point an app at it

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
`VITE_SUPABASE_PROJECT_ID` to the new project, plus the server-side
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

Note: the Lovable-hosted copy of this app stays wired to its own backend —
this bundle is for a self-hosted or separately deployed instance.

## Verification checklist

- [ ] Row counts match between `data/*.csv` and the restored tables
- [ ] `select * from public.user_roles` shows the admin grant
- [ ] Sign-in works and lands on the workspace
- [ ] A draft loads with its images and attachments
- [ ] `select * from cron.job` lists the scheduler job
- [ ] Credit balance shows the expected number, not zero
