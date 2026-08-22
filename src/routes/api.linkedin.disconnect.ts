import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { getBearerToken } from "@/lib/request-auth.server";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/linkedin/disconnect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const accessToken = getBearerToken(request);
        if (!accessToken) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }
        const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
        if (error || !data.user) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }

        // Fetch the connection first to get the token for revocation
        const { data: conn } = await supabaseAdmin
          .from("linkedin_connections")
          .select("access_token")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (conn?.access_token) {
          const clientId = process.env.LINKEDIN_CLIENT_ID;
          const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

          if (clientId && clientSecret) {
            try {
              // Revoke token with LinkedIn (best effort)
              await fetch("https://www.linkedin.com/oauth/v2/revoke", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  client_id: clientId,
                  client_secret: clientSecret,
                  token: conn.access_token,
                }).toString(),
              });
            } catch (revokeErr) {
              console.error("[linkedin/disconnect] revocation failed", revokeErr);
              // We continue even if revocation fails to ensure local cleanup
            }
          }
        }

        const { error: delErr } = await supabaseAdmin
          .from("linkedin_connections")
          .delete()
          .eq("user_id", data.user.id);

        if (delErr) {
          return jsonResponse({ error: delErr.message }, 500);
        }
        return jsonResponse({ success: true });
      },
    },
  },
});
