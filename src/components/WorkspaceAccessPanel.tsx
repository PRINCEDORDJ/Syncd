import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  fetchAccessibleWorkspacesWithProjects,
  getUserPlanAndLimits,
  createWorkspace,
  createProject,
  type AccessibleWorkspace,
} from "@/lib/workspace-access";
import {
  PLAN_LIMITS,
  PLAN_LABELS,
  type PlanTier,
  type PlanLimits,
} from "@/lib/plans";
import {
  FolderKanban,
  LayoutGrid,
  Sparkles,
  Plus,
  Loader2,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function WorkspaceAccessPanel() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<AccessibleWorkspace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Plan Tier
  const [planTier, setPlanTier] = useState<PlanTier>("trial");
  const [planLimits, setPlanLimits] = useState<PlanLimits>(PLAN_LIMITS.trial);
  const [isAdmin, setIsAdmin] = useState(false);

  // Quick action modals
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);

  const [createProjOpen, setCreateProjOpen] = useState(false);
  const [selectedWsIdForProj, setSelectedWsIdForProj] = useState<string>("");
  const [newProjName, setNewProjName] = useState("");
  const [creatingProj, setCreatingProj] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [list, planData] = await Promise.all([
        fetchAccessibleWorkspacesWithProjects(user.id),
        getUserPlanAndLimits(user.id),
      ]);
      setWorkspaces(list);
      setPlanTier(planData.plan);
      setPlanLimits(planData.limits);
      setIsAdmin(planData.isAdmin);

      if (list.length > 0) {
        setSelectedWsIdForProj(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace access.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const ownedWorkspacesCount = workspaces?.filter((w) => w.owner_id === user?.id).length || 0;
  const isAtWorkspaceLimit = !isAdmin && ownedWorkspacesCount >= planLimits.maxWorkspaces;

  async function handleCreateWorkspace() {
    if (!user || !newWsName.trim()) return;
    setCreatingWs(true);
    setError(null);
    try {
      await createWorkspace(user.id, newWsName.trim());
      setNewWsName("");
      setCreateWsOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace.");
    } finally {
      setCreatingWs(false);
    }
  }

  async function handleCreateProject() {
    if (!user || !selectedWsIdForProj || !newProjName.trim()) return;
    setCreatingProj(true);
    setError(null);
    try {
      await createProject(selectedWsIdForProj, user.id, newProjName.trim(), "active");
      setNewProjName("");
      setCreateProjOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setCreatingProj(false);
    }
  }

  return (
    <section className="border border-border rounded-2xl bg-card overflow-hidden mb-5 sm:mb-7 shadow-soft">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-border bg-subtle/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg border border-border bg-background">
            <LayoutGrid className="size-3.5 text-ink" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Organization & Access
              </p>
              <span className="rounded-full border border-border bg-background px-2 py-0.2 text-[9px] font-mono uppercase text-muted-foreground">
                {PLAN_LABELS[planTier]} Plan
              </span>
            </div>
            <h2 className="text-[15px] font-semibold text-ink">Workspaces & Scoped Projects</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (isAtWorkspaceLimit) {
                setError(
                  `You have reached the limit of ${planLimits.maxWorkspaces} workspace${
                    planLimits.maxWorkspaces === 1 ? "" : "s"
                  } on the ${PLAN_LABELS[planTier]} plan. Upgrade in Settings → Billing to add more.`,
                );
              } else {
                setCreateWsOpen(true);
              }
            }}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-ink hover:text-muted-foreground transition px-2.5 py-1 rounded-md hover:bg-subtle"
          >
            <Plus className="size-3.5" />
            New Workspace
          </button>
          <Link
            to="/settings"
            search={{ linkedin_connected: undefined, linkedin_error: undefined, billing: undefined }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-subtle transition shadow-2xs"
          >
            Manage Permissions
            <Sparkles className="size-3.5 text-muted-foreground" />
          </Link>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-[13px] font-mono text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading accessible workspaces and projects…
          </div>
        ) : !workspaces || workspaces.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-subtle/30 p-6 text-center">
            <LayoutGrid className="mx-auto size-7 text-muted-foreground opacity-50" />
            <p className="mt-2 text-[14px] font-medium text-ink">No workspace access yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground max-w-sm mx-auto">
              Create a workspace or accept an invite to access projects and shared drafts.
            </p>
            <button
              type="button"
              onClick={() => setCreateWsOpen(true)}
              className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-medium text-surface hover:bg-ink/90"
            >
              <Plus className="size-3.5" />
              Create workspace
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {workspaces.map((workspace) => {
              const currentProjCount = workspace.projects.length;
              const isAtProjCap = !isAdmin && currentProjCount >= planLimits.maxProjectsPerWorkspace;

              return (
                <article
                  key={workspace.id}
                  className="flex flex-col justify-between rounded-xl border border-border bg-background p-4 sm:p-5 transition hover:border-ink/20"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <LayoutGrid className="size-4 text-muted-foreground shrink-0" />
                          <h3 className="text-[15px] font-semibold text-ink truncate">
                            {workspace.name}
                          </h3>
                        </div>
                        <p className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                          Role: {workspace.current_user_role || "member"} · {workspace.projects.length}/
                          {planLimits.maxProjectsPerWorkspace >= 900 ? "∞" : planLimits.maxProjectsPerWorkspace} projects
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (isAtProjCap) {
                            setError(
                              `This workspace has reached the limit of ${planLimits.maxProjectsPerWorkspace} projects on the ${PLAN_LABELS[planTier]} plan. Upgrade in Settings → Billing for higher limits.`,
                            );
                          } else {
                            setSelectedWsIdForProj(workspace.id);
                            setCreateProjOpen(true);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-ink hover:bg-subtle shrink-0"
                        title="Add project to this workspace"
                      >
                        <Plus className="size-3" />
                        Project
                      </button>
                    </div>

                    {/* Scoped Projects list */}
                    <div className="mt-4 space-y-2">
                      {workspace.projects.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
                          No projects created yet in this workspace.
                        </div>
                      ) : (
                        workspace.projects.map((project) => (
                          <div
                            key={project.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-subtle/30 px-3 py-2 text-[13px]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FolderKanban className="size-3.5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium text-ink truncate text-[13px]">
                                  {project.name}
                                </p>
                                <p className="text-[10px] font-mono text-muted-foreground">
                                  Status: {project.status}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                                {project.access_type === "owner"
                                  ? "Owner"
                                  : project.access_type === "workspace_wide"
                                  ? "Workspace Access"
                                  : project.access_type === "team_grant"
                                  ? "Team Grant"
                                  : "Project Grant"}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Workspace #{workspace.id.slice(0, 8)}</span>
                    <Link
                      to="/settings"
                      search={{ linkedin_connected: undefined, linkedin_error: undefined, billing: undefined }}
                      className="inline-flex items-center gap-1 text-ink hover:underline font-medium"
                    >
                      Manage
                      <ChevronRight className="size-3" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Create Workspace Modal */}
      <Dialog open={createWsOpen} onOpenChange={setCreateWsOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">New Workspace</DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              Create a workspace container to manage projects, teams, and member grants ({ownedWorkspacesCount}/{planLimits.maxWorkspaces >= 900 ? "∞" : planLimits.maxWorkspaces} used on {PLAN_LABELS[planTier]} plan).
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <input
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="Workspace name (e.g. Brand Marketing)"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-ink outline-none focus:border-ink"
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCreateWsOpen(false)}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-ink hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateWorkspace}
              disabled={creatingWs || !newWsName.trim()}
              className="h-9 px-4 rounded-lg bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {creatingWs && <Loader2 className="size-3.5 animate-spin" />}
              Create workspace
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Project Modal */}
      <Dialog open={createProjOpen} onOpenChange={setCreateProjOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Add New Project</DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              Add a scoped project under your selected workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            {workspaces && workspaces.length > 1 && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                  Workspace
                </span>
                <select
                  value={selectedWsIdForProj}
                  onChange={(e) => setSelectedWsIdForProj(e.target.value)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Project Name
              </span>
              <input
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                placeholder="e.g. Q4 Executive Voice"
                className="h-10 rounded-lg border border-border bg-background px-3 text-[14px] text-ink outline-none focus:border-ink"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCreateProjOpen(false)}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-ink hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateProject}
              disabled={creatingProj || !newProjName.trim()}
              className="h-9 px-4 rounded-lg bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {creatingProj && <Loader2 className="size-3.5 animate-spin" />}
              Create project
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
