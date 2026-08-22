import { createFileRoute } from "@tanstack/react-router";
import { Webhook } from "standardwebhooks";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import type { PlanTier } from "@/lib/plans";
import { PLAN_LIMITS } from "@/lib/plans";

function planFromProductId(productId: string | undefined | null): PlanTier {
  if (!productId) return "trial";
  if (
    productId === process.env.POLAR_TEAMS_MONTHLY_ID ||
    productId === process.env.POLAR_TEAMS_ANNUAL_ID ||
    productId === process.env.POLAR_TEAMS_PRODUCT_ID
  )
    return "teams";
  if (
    productId === process.env.POLAR_STUDIO_MONTHLY_ID ||
    productId === process.env.POLAR_STUDIO_ANNUAL_ID ||
    productId === process.env.POLAR_STUDIO_PRODUCT_ID
  )
    return "studio";
  return "trial";
}

function topupCreditsFromProductId(productId: string | null | undefined): number {
  if (!productId) return 0;
  if (productId === process.env.POLAR_TOPUP_50_ID) return 50;
  if (productId === process.env.POLAR_TOPUP_150_ID) return 150;
  if (productId === process.env.POLAR_TOPUP_500_ID) return 500;
  return 0;
}

type SubStatus = "active" | "canceled" | "past_due" | "expired" | "trialing";

type PolarWebhookEvent = {
  id?: string;
  type: string;
  data: Record<string, unknown>;
};

type PolarWebhookResult = {
  eventId: string | null;
  outcome: "handled" | "ignored";
  reason?: string;
  userId: string | null;
};

function mapStatus(status: string | undefined): SubStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return "past_due";
    default:
      return "expired";
  }
}

function polarWebhookSecret(secret: string) {
  const trimmed = secret.trim();
  if (trimmed.startsWith("whsec_")) return trimmed;
  return Buffer.from(trimmed, "utf-8").toString("base64");
}

export const Route = createFileRoute("/api/public/polar/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.POLAR_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Webhook not configured", { status: 500 });
        }

        const rawBody = await request.text();
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          headers[key] = value;
        });

        const wh = new Webhook(polarWebhookSecret(secret));

        let event: PolarWebhookEvent;
        try {
          event = wh.verify(rawBody, headers) as PolarWebhookEvent;
        } catch (err) {
          console.error("[polar webhook] signature verification failed", err);
          return new Response("Invalid signature", { status: 401 });
        }

        try {
          const result = await handleEvent(event);
          console.info("[polar webhook] delivery", {
            type: event.type,
            eventId: result.eventId,
            userId: result.userId,
            outcome: result.outcome,
            reason: result.reason,
          });
        } catch (err) {
          console.error("[polar webhook] handler error", {
            type: event.type,
            eventId: resolveEventId(event),
            err,
          });
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

function resolveEventId(event: PolarWebhookEvent) {
  return (
    event.id ??
    (event.data.id as string | undefined) ??
    (event.data.checkout_id as string | undefined) ??
    null
  );
}

async function handleEvent(event: PolarWebhookEvent): Promise<PolarWebhookResult> {
  const { type, data } = event;
  const eventId = resolveEventId(event);

  // Resolve user_id from external_customer_id (set when checkout was created).
  // Most subscription/order events expose customer with external_id.
  const userId =
    (data.metadata as Record<string, unknown> | undefined)?.user_id?.toString() ??
    (data.customer as Record<string, unknown> | undefined)?.external_id?.toString() ??
    (data as Record<string, unknown>).external_customer_id?.toString() ??
    null;

  if (!userId) {
    return { eventId, outcome: "ignored", reason: "no_user_id", userId };
  }

  if (
    type === "subscription.created" ||
    type === "subscription.active" ||
    type === "subscription.updated" ||
    type === "subscription.uncanceled" ||
    type === "subscription.past_due"
  ) {
    const productId = (data.product_id as string | undefined) ?? null;
    const plan = planFromProductId(productId);
    const status = mapStatus(data.status as string | undefined);
    const currentPeriodEnd = (data.current_period_end as string | undefined) ?? null;
    const customerId =
      (data.customer_id as string | undefined) ??
      (data.customer as Record<string, unknown> | undefined)?.id?.toString() ??
      null;
    const subscriptionId = (data.id as string | undefined) ?? null;
    const cancelAtPeriodEnd = Boolean(data.cancel_at_period_end);

    // Detect plan changes so we can apply grants/caps atomically.
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();
    const oldPlan = (existing?.plan as PlanTier | null) ?? "trial";

    await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: userId,
        plan,
        status,
        polar_customer_id: customerId,
        polar_subscription_id: subscriptionId,
        polar_product_id: productId,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
      },
      { onConflict: "user_id" },
    );

    // On plan change: apply upgrade grant or downgrade cap in one RPC.
    if (plan !== oldPlan) {
      await supabaseAdmin.rpc("handle_plan_change", {
        _user_id: userId,
        _new_plan: plan,
        _old_plan: oldPlan,
      });
    } else if ((status === "active" || status === "trialing") && plan !== "trial") {
      // Same plan, active renewal: refresh monthly allocation.
      const amount = PLAN_LIMITS[plan].monthlyCredits;
      await supabaseAdmin.rpc("grant_subscription_credits", {
        _user_id: userId,
        _amount: amount,
        _reason: `${plan} plan (${type})`,
      });
    }
    return { eventId, outcome: "handled", userId };
  }

  if (type === "order.paid" || type === "order.created") {
    // One-time top-up purchase. Subscription products may also emit order events.
    const productId =
      (data.product_id as string | undefined) ??
      (data.product as Record<string, unknown> | undefined)?.id?.toString() ??
      null;
    const credits = topupCreditsFromProductId(productId);
    if (credits > 0) {
      await supabaseAdmin.rpc("grant_topup_credits", {
        _user_id: userId,
        _amount: credits,
      });
    }
    return {
      eventId,
      outcome: credits > 0 ? "handled" : "ignored",
      reason: credits > 0 ? undefined : "not_topup_product",
      userId,
    };
  }

  if (type === "subscription.canceled") {
    await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: true,
      })
      .eq("user_id", userId);
    return { eventId, outcome: "handled", userId };
  }

  if (type === "subscription.revoked") {
    await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: "trial",
        status: "expired",
        cancel_at_period_end: false,
        current_period_end: null,
      })
      .eq("user_id", userId);
    return { eventId, outcome: "handled", userId };
  }

  if (type === "checkout.updated" || type === "checkout.created") {
    // Capture customer id early so portal works even before subscription event lands.
    const customerId =
      (data.customer_id as string | undefined) ??
      (data.customer as Record<string, unknown> | undefined)?.id?.toString() ??
      null;
    if (customerId) {
      await supabaseAdmin
        .from("subscriptions")
        .update({ polar_customer_id: customerId })
        .eq("user_id", userId);
    }
    return {
      eventId,
      outcome: customerId ? "handled" : "ignored",
      reason: customerId ? undefined : "no_customer_id",
      userId,
    };
  }

  return { eventId, outcome: "ignored", reason: "unhandled_event_type", userId };
}
