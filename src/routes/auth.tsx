import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth, syncUserProfileMetadata } from "@/lib/auth";
import { resolvePostAuthDestination } from "@/lib/workspace-onboarding";
import { BrandMark } from "@/components/BrandMark";

import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Signing you - Syncd" },
      { name: "description", content: "Completing sign-in to Syncd." },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const { user, loading, onboarding } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user) {
      // Wait for the onboarding summary before resolving the destination;
      // an unloaded context would read as "zero workspaces".
      if (!onboarding) return;
      void syncUserProfileMetadata(user);
      const dest = resolvePostAuthDestination(
        onboarding.onboarding_status,
        onboarding.workspace_count,
        redirect,
      );
      navigate({ to: dest, replace: true });
      return;
    }
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [
    user,
    loading,
    onboarding,
    onboarding?.onboarding_status,
    onboarding?.workspace_count,
    navigate,
    redirect,
  ]);

  useEffect(() => {
    if (timedOut && !user) {
      navigate({ to: "/login", search: { redirect: "/onboarding" } });
    }
  }, [timedOut, user, navigate]);

  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col items-center justify-center gap-4 px-6">
      <BrandMark size={28} />
      <Skeleton className="h-1.5 w-32 rounded-full" />
      <p className="text-[13px] font-mono text-muted-foreground">
        {timedOut ? "Redirecting" : "Signing you - Syncd"}
      </p>
    </div>
  );
}
