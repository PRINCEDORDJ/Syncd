import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader } from "@tanstack/react-start/server";

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
        const authHeader =
          getRequestHeader("authorization") ?? getRequestHeader("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }
        const accessToken = authHeader.slice(7);
        const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
        if (error || !data.user) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }
        const userId = data.user.id;

        let body: { connection_id?: string } = {};
        try {
          body = (await request.json()) as { connection_id?: string };
        } catch {
          // empty body is fine
        }

        const connectionId = body.connection_id;

        // Build query — disconnect specific connection or all for this user
        let query = supabaseAdmin
          .from("linkedin_connections")
          .select("id, access_token")
          .eq("user_id", userId);

        if (connectionId) {
          query = query.eq("id", connectionId);
        }

        const { data: conns, error: fetchErr } = await query;
        if (fetchErr) {
          return jsonResponse({ error: fetchErr.message }, 500);
        }
        if (!conns || conns.length === 0) {
          return jsonResponse({ error: "No matching connection found." }, 404);
        }

        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

        // Best-effort revoke each token with LinkedIn
        for (const conn of conns) {
          if (conn.access_token && clientId && clientSecret) {
            try {
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
            }
          }
        }

        // Delete the connection(s)
        let deleteQuery = supabaseAdmin
          .from("linkedin_connections")
          .delete()
          .eq("user_id", userId);

        if (connectionId) {
          deleteQuery = deleteQuery.eq("id", connectionId);
        }

        const { error: delErr } = await deleteQuery;
        if (delErr) {
          return jsonResponse({ error: delErr.message }, 500);
        }

        return jsonResponse({ success: true, disconnected: conns.length });
      },
    },
  },
});
