import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PLAN_LIMITS, type PlanTier } from "@/lib/plans";
import { getMySubscription } from "@/lib/subscription.functions";
import { createUniqueChannel } from "@/lib/realtime";
import { useWorkspace } from "@/lib/workspace-context";

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

export function useStorage(overrideWorkspaceId?: string): StorageState {
  const { user } = useAuth();
  let contextWsId: string | null = null;
  try {
    const wsCtx = useWorkspace();
    contextWsId = wsCtx.activeWorkspaceId;
  } catch {
    contextWsId = null;
  }
  const activeWorkspaceId = overrideWorkspaceId ?? contextWsId;
  const [state, setState] = useState<StorageState>(DEFAULT);

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

        const [storageRes, sub, planRes] = await Promise.all([
          supabase
            .from("user_storage")
            .select("bytes_used")
            .eq("workspace_id", wsId)
            .maybeSingle(),
          getMySubscription().catch(() => null),
          supabase.rpc("get_workspace_plan", { p_workspace_id: wsId }),
        ]);
        if (cancelled) return;
        if (storageRes.error) throw storageRes.error;

        const isAdmin = sub?.isAdmin ?? false;
        const plan = isAdmin
          ? "teams"
          : ((planRes.data as PlanTier | null) ?? sub?.plan ?? "trial");
        const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.trial;
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

    if (!activeWorkspaceId) return;

    const channel = createUniqueChannel(`workspace_storage:${activeWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_storage",
          filter: `workspace_id=eq.${activeWorkspaceId}`,
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
  }, [user?.id, activeWorkspaceId]);

  return state;
}