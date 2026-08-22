import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./supabase-env.server";

function createSupabaseAdminClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

/**
 * Service-role Supabase client (bypasses RLS). Server-only.
 * Resolves credentials via supabase-env.server so a self-owned project's
 * `APP_SUPABASE_*` values win over the platform-injected ones.
 */
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
