# Fix "Not authenticated" after moving to your own Supabase project

## What's actually happening

The app is now talking to **two different Supabase projects at once**:

- **The browser** signs you in against your new project (`fvwoqldf…`), taken from the `VITE_SUPABASE_*` values in `.env`.
- **The server** (API routes, server functions) still validates tokens against the old Lovable Cloud project (`gsmxzlep…`), because the hosting runtime injects its own `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` environment variables, and those override what's in `.env`.

So you log in fine, the browser attaches a valid token, the server asks the *old* project "who is this token?", the old project says "nobody" — and every action returns `Not authenticated.`

Verified: at runtime the server's `SUPABASE_URL` resolves to the old Cloud project ref, while `.env`'s `VITE_SUPABASE_URL` points at your new one. The 401 message matches the `authenticate()` helper in the LinkedIn API routes, which calls the service-role client built from those server variables.

Second, smaller issue: there is **no `src/start.ts`**, so the client-side bearer-token middleware is never registered. Any server function using `requireSupabaseAuth` (e.g. subscription lookups) will 401 even once the project refs match, because no `Authorization` header is sent.

## The fix

The `SUPABASE_*` names are reserved by the platform and can't be overwritten, so the server side needs to read *your* project's credentials from differently-named secrets.

1. **Add three new secrets** holding your own project's values:
   - `APP_SUPABASE_URL`
   - `APP_SUPABASE_PUBLISHABLE_KEY` (anon key)
   - `APP_SUPABASE_SERVICE_ROLE_KEY`

2. **Add `src/lib/supabase-env.server.ts`** — a tiny helper that returns `APP_SUPABASE_*` when set and falls back to the platform `SUPABASE_*` otherwise. Single source of truth for server credentials.

3. **Add `src/lib/supabase-admin.server.ts`** — a service-role client built from that helper, replacing the auto-generated `@/integrations/supabase/client.server` (which is generated and locked to the platform variables). Update the imports in:
   - `src/routes/api.linkedin.publish.ts`
   - `src/routes/api.linkedin.start.ts`
   - `src/routes/api.linkedin.callback.ts`
   - `src/routes/api.linkedin.disconnect.ts`
   - `src/routes/api.generate.ts`
   - `src/routes/api.polar.checkout.ts`, `api.polar.portal.ts`, `api.public.polar.webhook.ts`, `api.public.scheduler.ts`
   (exact list confirmed while implementing)

4. **Add `src/lib/require-auth.server.ts`** — a replacement for the generated `requireSupabaseAuth` middleware that validates the bearer token against the same helper, and point `src/lib/subscription.functions.ts` at it.

5. **Create `src/start.ts`** registering `attachSupabaseAuth` as a global `functionMiddleware`, so server functions actually receive the token.

6. **Scheduler shared secret**: `api.public.scheduler.ts` currently authenticates callers by comparing against `SUPABASE_PUBLISHABLE_KEY`. It moves to the same helper so the cron job in your new project matches.

## Also worth checking in your new project

These aren't code and I can't do them for you:

- **Google OAuth provider** must be re-enabled in the new project's Auth settings, with Site URL and redirect allow-list pointing at your app's domains.
- **The `avatars` storage bucket** must exist with the same name/visibility.
- **JWT signing keys**: if the new project uses the newer asymmetric keys, token validation still works through `getUser()`, which is what the code above uses.
- **Existing browser sessions** carry a token from the old project. `src/lib/auth.tsx` already detects and clears those, but a hard refresh after the change is the fastest way to confirm.

## Verification

After the change: sign out, sign in fresh, then generate a post, save a draft, and open Settings → Billing. All three hit different server paths (server function, API route with service role, subscription middleware) — if all three succeed, both projects are aligned.
