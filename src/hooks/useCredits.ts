import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_LIMITS, type PlanTier } from "@/lib/plans";
import { getMySubscription } from "@/lib/subscription.functions";

export interface CreditsState {
  subscriptionCredits: number;
  topupCredits: number;
  dailyCreditsUsed: number;
  dailyLimit: number;
  monthlyAllocation: number;
  totalRemaining: number;
  plan: PlanTier;
  isAdmin: boolean;
  isLoading: boolean;
  error: Error | null;
}

const DEFAULT: CreditsState = {
  subscriptionCredits: 30,
  topupCredits: 0,
  dailyCreditsUsed: 0,
  dailyLimit: 5,
  monthlyAllocation: 30,
  totalRemaining: 30,
  plan: "trial",
  isAdmin: false,
  isLoading: true,
  error: null,
};

export function useCredits(): CreditsState {
  const { user } = useAuth();
  const [state, setState] = useState<CreditsState>(DEFAULT);

  useEffect(() => {
    if (!user) {
      setState({ ...DEFAULT, isLoading: false });
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const [creditsRes, sub] = await Promise.all([
          supabase
            .from("user_credits")
            .select("subscription_credits, topup_credits, daily_credits_used")
            .eq("user_id", user!.id)
            .maybeSingle(),
          getMySubscription().catch(() => null),
        ]);
        if (cancelled) return;
        if (creditsRes.error) throw creditsRes.error;
        const plan = (sub?.plan ?? "trial") as PlanTier;
        // Admin bypass — subscriptions RPC promotes admins to "teams"; treat
        // teams with no billing account as admin so unlimited displays correctly.
        const isAdmin = plan === "teams" && !sub?.has_billing_account;
        const limits = PLAN_LIMITS[plan];
        const row = creditsRes.data;
        const subscriptionCredits = row?.subscription_credits ?? limits.monthlyCredits;
        const topupCredits = row?.topup_credits ?? 0;
        const dailyCreditsUsed = row?.daily_credits_used ?? 0;
        setState({
          subscriptionCredits,
          topupCredits,
          dailyCreditsUsed,
          dailyLimit: limits.dailyCap,
          monthlyAllocation: limits.monthlyCredits,
          totalRemaining: subscriptionCredits + topupCredits,
          plan,
          isAdmin,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[useCredits] load failed", err);
        setState((s) => ({ ...s, isLoading: false, error: err as Error }));
      }
    }
    void load();

    const channel = supabase
      .channel(`user_credits:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_credits",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  return state;
}