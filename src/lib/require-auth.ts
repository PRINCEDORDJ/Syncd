import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Same contract as the generated `requireSupabaseAuth`, but resolves the
 * Supabase project from `APP_SUPABASE_*` first so tokens are validated against
 * the project the browser actually signed in to.
 */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getSupabasePublishableKey, getSupabaseUrl } = await import("./supabase-env.server");

  let url: string;
  let publishableKey: string;
  try {
    url = getSupabaseUrl();
    publishableKey = getSupabasePublishableKey();
  } catch (err) {
    throw new Response((err as Error).message, { status: 500 });
  }

  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response("Unauthorized: missing bearer token", { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Response("Unauthorized: empty bearer token", { status: 401 });

  const supabase = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Response("Unauthorized: invalid token", { status: 401 });
  }

  return next({
    context: {
      supabase,
      userId: data.user.id,
      user: data.user,
    },
  });
});
