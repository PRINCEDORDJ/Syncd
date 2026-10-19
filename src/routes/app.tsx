import { createFileRoute } from "@tanstack/react-router";
import { useWorkspaceGate } from "@/lib/workspace-gate";
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
  const ready = useWorkspaceGate("/onboarding");

  if (!ready) {
    return <WorkspaceSkeleton />;
  }

  return <AppShell />;
}
