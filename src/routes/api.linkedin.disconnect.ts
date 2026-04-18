import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/linkedin/disconnect")({
  server: {
    handlers: {
      POST: async () => {
        const authHeader =
          getRequestHeader("authorization") ?? getRequestHeader("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Not authenticated." }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const accessToken = authHeader.slice(7);
        const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
        if (error || !data.user) {
          return new Response(JSON.stringify({ error: "Not authenticated." }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { error: delErr } = await supabaseAdmin
          .from("linkedin_connections")
          .delete()
          .eq("user_id", data.user.id);
        if (delErr) {
          return new Response(JSON.stringify({ error: delErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
