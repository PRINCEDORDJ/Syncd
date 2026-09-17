import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_LIMITS, type PlanTier } from "@/lib/plans";
import { getMySubscription } from "@/lib/subscription.functions";
import { createUniqueChannel } from "@/lib/realtime";
import { useWorkspace } from "@/lib/workspace-context";

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

const CreditsContext = createContext<CreditsState | undefined>(undefined);

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [state, setState] = useState<CreditsState>(DEFAULT);

  useEffect(() => {
    if (!user) {
      setState({ ...DEFAULT, isLoading: false });
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        let wsId = activeWorkspaceId;
        if (!wsId) {
          const { data: memberWs } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", user!.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          wsId = memberWs?.workspace_id ?? null;
        }

        if (!wsId) {
          if (cancelled) return;
          setState((s) => ({ ...s, isLoading: false }));
          return;
        }

        const [creditsRes, sub, planRes] = await Promise.all([
          supabase
            .from("user_credits")
            .select("subscription_credits, topup_credits, daily_credits_used, last_daily_reset")
            .eq("workspace_id", wsId)
            .maybeSingle(),
          getMySubscription().catch(() => null),
          supabase.rpc("get_workspace_plan", { p_workspace_id: wsId }),
        ]);

        if (cancelled) return;
        if (creditsRes.error) throw creditsRes.error;

        const isAdmin = sub?.isAdmin ?? false;
        const plan = isAdmin
          ? "teams"
          : ((planRes.data as PlanTier | null) ?? sub?.plan ?? "trial");
        const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.trial;
        const row = creditsRes.data;
        const todayUtc = new Date().toISOString().slice(0, 10);
        const isSameDay = !row?.last_daily_reset || row.last_daily_reset === todayUtc;
        const subscriptionCredits = row?.subscription_credits ?? limits.monthlyCredits;
        const topupCredits = row?.topup_credits ?? 0;
        const dailyCreditsUsed = isSameDay ? (row?.daily_credits_used ?? 0) : 0;

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

    if (!activeWorkspaceId) return;

    const channel = createUniqueChannel(`workspace_credits:${activeWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_credits",
          filter: `workspace_id=eq.${activeWorkspaceId}`,
        },
        (payload) => {
          const row = payload.new as {
            subscription_credits?: number;
            topup_credits?: number;
            daily_credits_used?: number;
            last_daily_reset?: string;
          } | null;
          if (!row) return;
          const todayUtc = new Date().toISOString().slice(0, 10);
          const isSameDay = !row.last_daily_reset || row.last_daily_reset === todayUtc;
          setState((s) => ({
            ...s,
            subscriptionCredits: row.subscription_credits ?? s.subscriptionCredits,
            topupCredits: row.topup_credits ?? s.topupCredits,
            dailyCreditsUsed: isSameDay
              ? (row.daily_credits_used ?? s.dailyCreditsUsed)
              : 0,
            totalRemaining:
              (row.subscription_credits ?? s.subscriptionCredits) +
              (row.topup_credits ?? s.topupCredits),
          }));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id, activeWorkspaceId]);

  return <CreditsContext.Provider value={state}>{children}</CreditsContext.Provider>;
}

export function useCredits(): CreditsState {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits must be used within CreditsProvider");
  return ctx;
}