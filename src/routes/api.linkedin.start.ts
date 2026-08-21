import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getBearerToken } from "@/lib/request-auth.server";

const REDIRECT_URI_PATH = "/api/linkedin/callback";

function getOrigin(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/linkedin/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        if (!clientId) {
          return jsonResponse({ error: "LinkedIn is not configured." }, 500);
        }

        const accessToken = getBearerToken(request);
        if (!accessToken) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }
        const { data: userData, error: userErr } =
          await supabaseAdmin.auth.getUser(accessToken);
        if (userErr || !userData.user) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }
        const userId = userData.user.id;

        let body: { redirect_to?: unknown } = {};
        try {
          body = (await request.json()) as { redirect_to?: unknown };
        } catch {
          // empty body is fine
        }
        const rawRedirect =
          typeof body.redirect_to === "string" ? body.redirect_to : "/settings";
        // Only allow safe relative paths (no protocol, no host, no protocol-relative URLs).
        const redirectTo = /^\/[a-zA-Z0-9/_-]*$/.test(rawRedirect)
          ? rawRedirect
          : "/settings";

        // CSRF state
        const state = crypto.randomUUID();

        await supabaseAdmin.rpc("cleanup_linkedin_oauth_states");
        const { error: insertErr } = await supabaseAdmin
          .from("linkedin_oauth_states")
          .insert({ state, user_id: userId, redirect_to: redirectTo });
        if (insertErr) {
          console.error("[linkedin/start] state insert failed", insertErr);
          return jsonResponse({ error: "Failed to start OAuth flow." }, 500);
        }

        const redirectUri = `${getOrigin(request)}${REDIRECT_URI_PATH}`;
        const authorizeUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("scope", "openid profile w_member_social email");

        return jsonResponse({ url: authorizeUrl.toString() });
      },
    },
  },
});
