import { createFileRoute } from "@tanstack/react-router";
import { Webhook } from "standardwebhooks";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import type { PlanTier } from "@/lib/plans";
import { PLAN_LIMITS } from "@/lib/plans";

const POLAR_API = "https://api.polar.sh/v1";

function planFromProductId(productId: string | undefined | null): PlanTier | null {
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
  return null;
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

function resolveEventId(event: PolarWebhookEvent) {
  return (
    event.id ??
    (event.data.id as string | undefined) ??
    (event.data.checkout_id as string | undefined) ??
    null
  );
}

function dbError(label: string, err: { message?: string } | null | undefined) {
  if (err) throw new Error(`[polar webhook] ${label} failed: ${err.message}`);
}

async function polarFetch<T>(path: string): Promise<T | null> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) {
    console.error("[polar webhook] POLAR_ACCESS_TOKEN missing for", path);
    return null;
  }
  const resp = await fetch(`${POLAR_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("[polar webhook] polar fetch failed", path, resp.status, text);
    return null;
  }
  return (await resp.json()) as T;
}

function metadataUserId(data: Record<string, unknown>) {
  const md = data.metadata as Record<string, unknown> | undefined;
  return md?.user_id?.toString() ?? null;
}

async function resolveUserId(data: Record<string, unknown>): Promise<string | null> {
  const fromMetadata = metadataUserId(data);
  if (fromMetadata) return fromMetadata;

  const external =
    (data.external_customer_id as string | undefined)?.toString() ??
    (data.customer as Record<string, unknown> | undefined)?.external_id?.toString() ??
    null;
  if (external) return external;

  const customerId =
    (data.customer_id as string | undefined)?.toString() ??
    (data.customer as Record<string, unknown> | undefined)?.id?.toString() ??
    null;
  if (customerId) {
    const { data: row } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("polar_customer_id", customerId)
      .limit(1);
    if (row?.[0]?.user_id) return row[0].user_id as string;
  }

  const checkoutId = (data.checkout_id as string | undefined)?.toString() ?? null;
  if (checkoutId) {
    const checkout = await polarFetch<Record<string, unknown>>(`/checkouts/${checkoutId}`);
    if (checkout) {
      const fromCheckout = metadataUserId(checkout);
      if (fromCheckout) return fromCheckout;
      const fromCkExternal = (checkout.external_customer_id as string | undefined)?.toString();
      if (fromCkExternal) return fromCkExternal;
    }
  }
  return null;
}

function parseSeatCount(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function nextEventIdempotencyKey(event: PolarWebhookEvent) {
  const eventId = resolveEventId(event);
  return eventId ?? `${event.type}:${JSON.stringify(event.data).slice(0, 180)}`;
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

        const dedupKey = await nextEventIdempotencyKey(event);
        if (!event.id) {
          console.warn("[polar webhook] event without top-level id", event.type);
        }

        try {
          const claimRes = await supabaseAdmin.rpc("claim_webhook_event", {
            _event_id: dedupKey,
            _type: event.type,
          });
          dbError("claim_webhook_event", claimRes.error);
          const claim = (claimRes.data as string | null) ?? "claimed";
          if (claim === "duplicate") {
            console.info("[polar webhook] duplicate delivery skipped", {
              type: event.type,
            });
            return new Response("ok", { status: 200 });
          }

          const result = await handleEvent(event);
          const completeRes = await supabaseAdmin.rpc("complete_webhook_event", {
            _event_id: dedupKey,
            _outcome: result.outcome,
            _reason: result.reason ?? null,
          });
          dbError("complete_webhook_event", completeRes.error);

          console.info("[polar webhook] delivery", {
            type: event.type,
            claim,
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

async function handleEvent(event: PolarWebhookEvent): Promise<PolarWebhookResult> {
  const { type, data } = event;
  const eventId = resolveEventId(event);

  if (
    type === "subscription.created" ||
    type === "subscription.active" ||
    type === "subscription.updated" ||
    type === "subscription.uncanceled" ||
    type === "subscription.past_due"
  ) {
    const userId = await resolveUserId(data);
    if (!userId) {
      return { eventId, outcome: "ignored", reason: "no_user_id", userId: null };
    }

    const productId = (data.product_id as string | undefined) ?? null;
    const mappedPlan: PlanTier | null = planFromProductId(productId);
    if (productId && mappedPlan === null) {
      console.error("[polar webhook] unmapped product id", { type, productId });
      return { eventId, outcome: "ignored", reason: "unmapped_product_id", userId };
    }
    const plan: PlanTier = mappedPlan ?? "trial";
    const status = mapStatus(data.status as string | undefined);
    const currentPeriodEnd = (data.current_period_end as string | undefined) ?? null;
    const customerId =
      (data.customer_id as string | undefined)?.toString() ??
      (data.customer as Record<string, unknown> | undefined)?.id?.toString() ??
      null;
    const subscriptionId = (data.id as string | undefined) ?? null;
    const cancelAtPeriodEnd = Boolean(data.cancel_at_period_end);
    const trialEnd = (data.trial_end as string | undefined) ?? null;
    const seats = parseSeatCount(data.seats);

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, current_period_end, status, seats")
      .eq("user_id", userId)
      .maybeSingle();
    dbError("subscriptions select", existingErr);

    const oldPlan = (existing?.plan as PlanTier | null) ?? "trial";
    const oldPeriodEnd = existing?.current_period_end as string | null;

    const upsertRes = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: userId,
        plan,
        status,
        polar_customer_id: customerId,
        polar_subscription_id: subscriptionId,
        polar_product_id: productId,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        ...(trialEnd ? { trial_end: trialEnd } : {}),
        ...(seats ? { seats } : {}),
      },
      { onConflict: "user_id" },
    );
    dbError("subscriptions upsert", upsertRes.error);

    if (plan !== oldPlan) {
      const rpcRes = await supabaseAdmin.rpc("handle_plan_change", {
        _user_id: userId,
        _new_plan: plan,
        _old_plan: oldPlan,
      });
      dbError("handle_plan_change", rpcRes.error);
    } else if ((status === "active" || status === "trialing") && plan !== "trial") {
      const isPeriodRenewal = Boolean(
        currentPeriodEnd &&
        oldPeriodEnd &&
        new Date(currentPeriodEnd).getTime() > new Date(oldPeriodEnd as string).getTime(),
      );
      const isInitialActivation = existing?.status !== "active" && status === "active";

      if (isPeriodRenewal || isInitialActivation) {
        const seatCount = seats ?? parseSeatCount(existing?.seats as number | undefined) ?? 1;
        const amount =
          plan === "teams"
            ? PLAN_LIMITS.teams.monthlyCredits * seatCount
            : PLAN_LIMITS[plan].monthlyCredits;
        const grantRes = await supabaseAdmin.rpc("grant_subscription_credits", {
          _user_id: userId,
          _amount: amount,
          _reason: `${plan} plan (${type})${plan === "teams" ? ` x ${seatCount} seats` : ""}`,
        });
        dbError("grant_subscription_credits", grantRes.error);
      }
    }
    return { eventId, outcome: "handled", userId };
  }

  if (type === "subscription.cycled") {
    const userId = await resolveUserId(data);
    if (!userId) {
      return { eventId, outcome: "ignored", reason: "no_user_id", userId: null };
    }
    const md = data.metadata as Record<string, unknown> | undefined;
    const subscriptionId = (md?.subscription_id as string | undefined) ?? null;
    const productId = (md?.product_id as string | undefined) ?? null;
    const mappedPlan = planFromProductId(productId);
    if (productId && mappedPlan === null) {
      console.error("[polar webhook] unmapped product id (cycled)", {
        productId,
      });
      return { eventId, outcome: "ignored", reason: "unmapped_product_id", userId };
    }
    const plan: PlanTier = mappedPlan ?? "trial";
    if (plan === "trial") {
      return { eventId, outcome: "ignored", reason: "trial_cycle", userId };
    }

    const sub = subscriptionId
      ? await polarFetch<Record<string, unknown>>(`/subscriptions/${subscriptionId}`)
      : null;
    const periodEnd = (sub?.current_period_end as string | undefined) ?? null;
    const fetchedSeats = parseSeatCount(sub?.seats);
    const customerId = (sub?.customer_id as string | undefined)?.toString() ?? null;

    const upsertRes = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: userId,
        plan,
        status: "active",
        polar_customer_id: customerId,
        polar_subscription_id: subscriptionId,
        polar_product_id: productId,
        current_period_end: periodEnd,
        ...(plan === "teams" && fetchedSeats ? { seats: fetchedSeats } : {}),
      },
      { onConflict: "user_id" },
    );
    dbError("subscriptions upsert (cycled)", upsertRes.error);

    let seatCount = 1;
    if (plan === "teams") {
      seatCount = fetchedSeats ?? (await readSeats(userId)) ?? 1;
    }
    const amount =
      plan === "teams"
        ? PLAN_LIMITS.teams.monthlyCredits * seatCount
        : PLAN_LIMITS[plan].monthlyCredits;
    const grantRes = await supabaseAdmin.rpc("grant_subscription_credits", {
      _user_id: userId,
      _amount: amount,
      _reason: `${plan} plan renewal${plan === "teams" ? ` x ${seatCount} seats` : ""}`,
    });
    dbError("grant_subscription_credits (cycled)", grantRes.error);
    return { eventId, outcome: "handled", userId };
  }

  if (type === "subscription.seats_updated") {
    const userId = await resolveUserId(data);
    if (!userId) {
      return { eventId, outcome: "ignored", reason: "no_user_id", userId: null };
    }
    const md = data.metadata as Record<string, unknown> | undefined;
    const subscriptionId = (md?.subscription_id as string | undefined) ?? null;
    const sub = subscriptionId
      ? await polarFetch<Record<string, unknown>>(`/subscriptions/${subscriptionId}`)
      : null;
    const seats = parseSeatCount(sub?.seats);
    if (!seats) {
      console.error("[polar webhook] seats_updated without seat count", {
        subscriptionId,
      });
      return { eventId, outcome: "ignored", reason: "no_seat_count", userId };
    }
    const rpcRes = await supabaseAdmin.rpc("apply_team_seat_change", {
      _user_id: userId,
      _seats: seats,
    });
    dbError("apply_team_seat_change", rpcRes.error);
    return { eventId, outcome: "handled", userId };
  }

  if (type === "order.paid") {
    const userId = await resolveUserId(data);
    if (!userId) {
      return { eventId, outcome: "ignored", reason: "no_user_id", userId: null };
    }
    const productId =
      (data.product_id as string | undefined) ??
      (data.product as Record<string, unknown> | undefined)?.id?.toString() ??
      null;
    const credits = topupCreditsFromProductId(productId);
    if (credits > 0) {
      const grantRes = await supabaseAdmin.rpc("grant_topup_credits", {
        _user_id: userId,
        _amount: credits,
      });
      dbError("grant_topup_credits", grantRes.error);
      return { eventId, outcome: "handled", userId };
    }
    return {
      eventId,
      outcome: "ignored",
      reason: productId ? "not_topup_product" : "no_product",
      userId,
    };
  }

  if (type === "subscription.canceled") {
    const userId = await resolveUserId(data);
    if (!userId) {
      return { eventId, outcome: "ignored", reason: "no_user_id", userId: null };
    }
    await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("user_id", userId);
    return { eventId, outcome: "handled", userId };
  }

  if (type === "subscription.revoked") {
    const userId = await resolveUserId(data);
    if (!userId) {
      return { eventId, outcome: "ignored", reason: "no_user_id", userId: null };
    }
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();
    const oldPlan = (existing?.plan as PlanTier | null) ?? "trial";
    const updRes = await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: "trial",
        status: "expired",
        cancel_at_period_end: false,
        current_period_end: null,
      })
      .eq("user_id", userId);
    dbError("subscriptions revoke update", updRes.error);
    if (oldPlan !== "trial") {
      const rpcRes = await supabaseAdmin.rpc("handle_plan_change", {
        _user_id: userId,
        _new_plan: "trial",
        _old_plan: oldPlan,
      });
      dbError("handle_plan_change (revoke)", rpcRes.error);
    }
    return { eventId, outcome: "handled", userId };
  }

  if (type === "checkout.updated" || type === "checkout.created") {
    const userId = await resolveUserId(data);
    if (!userId) {
      return { eventId, outcome: "ignored", reason: "no_user_id", userId: null };
    }
    const customerId =
      (data.customer_id as string | undefined)?.toString() ??
      (data.customer as Record<string, unknown> | undefined)?.id?.toString() ??
      null;
    if (customerId) {
      await supabaseAdmin
        .from("subscriptions")
        .update({ polar_customer_id: customerId })
        .eq("user_id", userId);
      return { eventId, outcome: "handled", userId };
    }
    return { eventId, outcome: "ignored", reason: "no_customer_id", userId };
  }

  return { eventId, outcome: "ignored", reason: "unhandled_event_type", userId: null };
}

async function readSeats(userId: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("seats")
    .eq("user_id", userId)
    .maybeSingle();
  return parseSeatCount(data?.seats as number | undefined);
}
