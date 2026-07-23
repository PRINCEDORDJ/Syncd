import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_LIMITS, type PlanTier } from "@/lib/plans";
import { getMySubscription } from "@/lib/subscription.functions";

export interface StorageState {
  bytesUsed: number;
  bytesLimit: number;
  maxFileSizeBytes: number;
  percentUsed: number;
  isNearLimit: boolean;
  isFull: boolean;
  plan: PlanTier;
  isLoading: boolean;
  error: Error | null;
}

const DEFAULT: StorageState = {
  bytesUsed: 0,
  bytesLimit: PLAN_LIMITS.trial.storageBytes,
  maxFileSizeBytes: PLAN_LIMITS.trial.maxFileSizeBytes,
  percentUsed: 0,
  isNearLimit: false,
  isFull: false,
  plan: "trial",
  isLoading: true,
  error: null,
};

export function useStorage(): StorageState {
  const { user } = useAuth();
  const [state, setState] = useState<StorageState>(DEFAULT);

  useEffect(() => {
    if (!user) {
      setState({ ...DEFAULT, isLoading: false });
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const [storageRes, sub] = await Promise.all([
          supabase
            .from("user_storage")
            .select("bytes_used")
            .eq("user_id", user!.id)
            .maybeSingle(),
          getMySubscription().catch(() => null),
        ]);
        if (cancelled) return;
        if (storageRes.error) throw storageRes.error;
        const plan = (sub?.plan ?? "trial") as PlanTier;
        const limits = PLAN_LIMITS[plan];
        const bytesUsed = storageRes.data?.bytes_used ?? 0;
        const pct = limits.storageBytes
          ? (bytesUsed / limits.storageBytes) * 100
          : 0;
        setState({
          bytesUsed,
          bytesLimit: limits.storageBytes,
          maxFileSizeBytes: limits.maxFileSizeBytes,
          percentUsed: pct,
          isNearLimit: pct >= 70,
          isFull: pct >= 100,
          plan,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[useStorage] load failed", err);
        setState((s) => ({ ...s, isLoading: false, error: err as Error }));
      }
    }
    void load();

    const channel = supabase
      .channel(`user_storage:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drafts",
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