/**
 * Single source of truth for server-side Supabase credentials.
 *
 * The hosting platform injects its own `SUPABASE_*` variables pointing at the
 * managed project. When the app is pointed at a self-owned Supabase project,
 * those names cannot be overridden, so the self-owned values are provided as
 * `APP_SUPABASE_*` and take precedence here.
 */

function pick(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function getSupabaseUrl(): string {
  const url = pick("APP_SUPABASE_URL", "SUPABASE_URL");
  if (!url) throw new Error("Missing APP_SUPABASE_URL / SUPABASE_URL");
  return url;
}

export function getSupabasePublishableKey(): string {
  const key = pick(
    "APP_SUPABASE_PUBLISHABLE_KEY",
    "APP_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  );
  if (!key) throw new Error("Missing APP_SUPABASE_PUBLISHABLE_KEY / SUPABASE_PUBLISHABLE_KEY");
  return key;
}

export function getSupabaseServiceRoleKey(): string {
  const key = pick("APP_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing APP_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY");
  return key;
}
