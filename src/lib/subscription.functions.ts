import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/require-auth";
import { PLAN_LIMITS, type PlanTier } from "@/lib/plans";

export interface SubscriptionSummary {
  plan: PlanTier;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_billing_account: boolean;
  drafts_used: number;
  drafts_limit: number | null;
}

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionSummary> => {
    const { userId } = context;

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "plan, status, trial_end, current_period_end, cancel_at_period_end, polar_customer_id",
      )
      .eq("user_id", userId)
      .maybeSingle();

    const { data: planRow } = await supabaseAdmin.rpc("get_user_plan", {
      _user_id: userId,
    });
    const plan: PlanTier = (planRow as PlanTier | null) ?? "trial";

    // Count drafts created in the current period (or trial)
    const periodStart =
      plan === "trial"
        ? // trial: count from account creation
          new Date(0).toISOString()
        : sub?.current_period_end
          ? new Date(
              new Date(sub.current_period_end).getTime() - 30 * 24 * 60 * 60 * 1000,
            ).toISOString()
          : new Date(0).toISOString();

    const { count } = await supabaseAdmin
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", periodStart);

    return {
      plan,
      status: sub?.status ?? "trialing",
      trial_end: sub?.trial_end ?? null,
      current_period_end: sub?.current_period_end ?? null,
      cancel_at_period_end: sub?.cancel_at_period_end ?? false,
      has_billing_account: Boolean(sub?.polar_customer_id),
      drafts_used: count ?? 0,
      drafts_limit: PLAN_LIMITS[plan].monthlyCredits,
    };
  });