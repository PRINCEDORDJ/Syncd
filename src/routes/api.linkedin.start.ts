import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader } from "@tanstack/react-start/server";

const REDIRECT_URI_PATH = "/api/linkedin/callback";

function getOrigin(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export const Route = createFileRoute("/api/linkedin/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        if (!clientId) {
          return new Response("LinkedIn is not configured.", { status: 500 });
        }

        // Authenticate the caller
        const authHeader =
          getRequestHeader("authorization") ?? getRequestHeader("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Not authenticated.", { status: 401 });
        }
        const accessToken = authHeader.slice(7);
        const { data: userData, error: userErr } =
          await supabaseAdmin.auth.getUser(accessToken);
        if (userErr || !userData.user) {
          return new Response("Not authenticated.", { status: 401 });
        }
        const userId = userData.user.id;

        // CSRF state
        const state = crypto.randomUUID();
        const url = new URL(request.url);
        const redirectTo = url.searchParams.get("redirect_to") ?? "/settings";

        // Cleanup old states + insert new
        await supabaseAdmin.rpc("cleanup_linkedin_oauth_states");
        const { error: insertErr } = await supabaseAdmin
          .from("linkedin_oauth_states")
          .insert({ state, user_id: userId, redirect_to: redirectTo });
        if (insertErr) {
          console.error("[linkedin/start] state insert failed", insertErr);
          return new Response("Failed to start OAuth flow.", { status: 500 });
        }

        const redirectUri = `${getOrigin(request)}${REDIRECT_URI_PATH}`;
        const authorizeUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("state", state);
        // openid+profile for member identity, w_member_social for posting
        authorizeUrl.searchParams.set("scope", "openid profile w_member_social email");

        throw redirect({ href: authorizeUrl.toString() });
      },
    },
  },
});
