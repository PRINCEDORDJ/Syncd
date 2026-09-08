import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { AppShell } from "@/components/workspace/AppShell";
import { WorkspaceSkeleton } from "@/components/skeletons/WorkspaceSkeleton";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Workspace — Syncd" },
      {
        name: "description",
        content: "Draft, refine, and publish your next LinkedIn post.",
      },
    ],
  }),
  component: WorkspaceGate,
});

function WorkspaceGate() {
  const { user, loading, onboarding } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: "/onboarding" } });
      return;
    }
    if (!loading && user && onboarding?.onboarding_status === "pending") {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [user, loading, onboarding?.onboarding_status, navigate]);

  if (loading || !user) {
    return <WorkspaceSkeleton />;
  }

  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  );
}
