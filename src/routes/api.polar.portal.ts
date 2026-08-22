import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { getRequestHeader } from "@tanstack/react-start/server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/polar/portal")({
  server: {
    handlers: {
      POST: async ({ request: _request }) => {
        const POLAR_ACCESS_TOKEN = process.env.POLAR_ACCESS_TOKEN;
        if (!POLAR_ACCESS_TOKEN) {
          return json({ error: "Billing is not configured." }, 500);
        }

        const authHeader =
          getRequestHeader("authorization") ?? getRequestHeader("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return json({ error: "Not authenticated." }, 401);
        }
        const token = authHeader.slice(7);
        const { data: userData, error: userErr } =
          await supabaseAdmin.auth.getUser(token);
        if (userErr || !userData.user) {
          return json({ error: "Not authenticated." }, 401);
        }

        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("polar_customer_id")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (!sub?.polar_customer_id) {
          return json({ error: "No billing account yet — subscribe first." }, 400);
        }

        const resp = await fetch("https://api.polar.sh/v1/customer-sessions/", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ customer_id: sub.polar_customer_id }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          console.error("[polar/portal] error", resp.status, text);
          return json({ error: "Failed to open billing portal." }, 502);
        }

        const session = (await resp.json()) as { customer_portal_url?: string };
        if (!session.customer_portal_url) {
          return json({ error: "Portal URL missing." }, 502);
        }
        return json({ url: session.customer_portal_url });
      },
    },
  },
});