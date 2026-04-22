import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader } from "@tanstack/react-start/server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/polar/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const user = userData.user;

        let body: { plan?: unknown } = {};
        try {
          body = (await request.json()) as { plan?: unknown };
        } catch {
          return json({ error: "Invalid JSON body." }, 400);
        }

        const plan = body.plan;
        let productId: string | undefined;
        if (plan === "studio") {
          productId = process.env.POLAR_STUDIO_PRODUCT_ID;
        } else if (plan === "teams") {
          productId = process.env.POLAR_TEAMS_PRODUCT_ID;
        } else {
          return json({ error: "Invalid plan." }, 400);
        }
        if (!productId) {
          return json({ error: `Product for plan "${plan}" is not configured.` }, 500);
        }

        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;

        const resp = await fetch("https://api.polar.sh/v1/checkouts/", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${POLAR_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            products: [productId],
            success_url: `${origin}/settings?billing=success&checkout_id={CHECKOUT_ID}`,
            external_customer_id: user.id,
            customer_email: user.email,
            metadata: { user_id: user.id, plan },
          }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          console.error("[polar/checkout] error", resp.status, text);
          return json({ error: "Failed to start checkout." }, 502);
        }

        const checkout = (await resp.json()) as { url?: string };
        if (!checkout.url) {
          return json({ error: "Checkout URL missing." }, 502);
        }
        return json({ url: checkout.url });
      },
    },
  },
});