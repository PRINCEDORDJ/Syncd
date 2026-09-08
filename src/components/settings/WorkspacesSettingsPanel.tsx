import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  fetchAccessibleWorkspacesWithProjects,
  fetchWorkspaceMembers,
  fetchWorkspaceInvites,
  fetchWorkspaceTeamAccess,
  fetchProjectMembers,
  fetchProjectInvites,
  fetchProjectTeamAccess,
  fetchUserTeams,
  getUserPlanAndLimits,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  createProject,
  updateProject,
  deleteProject,
  inviteToWorkspace,
  grantTeamWorkspaceAccess,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  revokeWorkspaceTeamAccess,
  inviteToProject,
  grantTeamProjectAccess,
  removeProjectMember,
  revokeProjectInvite,
  revokeProjectTeamAccess,
  type AccessibleWorkspace,
  type WorkspaceMember,
  type WorkspaceInvite,
  type WorkspaceTeamAccess,
  type Project,
  type ProjectMember,
  type ProjectInvite,
  type ProjectTeamAccess,
  type WorkspaceRole,
  type ProjectAccessLevel,
  type TeamOption,
} from "@/lib/workspace-access";
import {
  FolderKanban,
  LayoutGrid,
  Plus,
  Users,
  Shield,
  Trash2,
  Edit2,
  Mail,
  Building,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Lock,
  ArrowUpRight,
} from "lucide-react";
import {
  PLAN_LIMITS,
  PLAN_LABELS,
  type PlanTier,
  type PlanLimits,
} from "@/lib/plans";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, ButtonPrimary, ButtonOutline, ButtonDanger, Badge, Eyebrow } from "./ui-primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function WorkspacesSettingsPanel() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<AccessibleWorkspace[] | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"projects" | "members" | "teams">("projects");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Plan info
  const [planTier, setPlanTier] = useState<PlanTier>("trial");
  const [planLimits, setPlanLimits] = useState<PlanLimits>(PLAN_LIMITS.trial);
  const [isAdmin, setIsAdmin] = useState(false);

  // Sub-data for selected workspace
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [teamAccess, setTeamAccess] = useState<WorkspaceTeamAccess[]>([]);
  const [userTeams, setUserTeams] = useState<TeamOption[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  // Modals state
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);

  const [editWsOpen, setEditWsOpen] = useState(false);
  const [editWsName, setEditWsName] = useState("");
  const [savingWs, setSavingWs] = useState(false);

  const [deleteWsConfirmOpen, setDeleteWsConfirmOpen] = useState(false);

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectStatus, setNewProjectStatus] = useState("active");
  const [creatingProject, setCreatingProject] = useState(false);

  // Invite to Workspace
  const [inviteWsEmail, setInviteWsEmail] = useState("");
  const [inviteWsRole, setInviteWsRole] = useState<WorkspaceRole>("member");
  const [invitingWs, setInvitingWs] = useState(false);

  // Grant Team Workspace Access
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamWsRole, setTeamWsRole] = useState<WorkspaceRole>("member");
  const [grantingTeamWs, setGrantingTeamWs] = useState(false);

  // Selected Project for Access Manager Dialog
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [projectInvites, setProjectInvites] = useState<ProjectInvite[]>([]);
  const [projectTeamAccessList, setProjectTeamAccessList] = useState<ProjectTeamAccess[]>([]);
  const [projSubLoading, setProjSubLoading] = useState(false);

  // Project Invite & Team Grant form
  const [inviteProjEmail, setInviteProjEmail] = useState("");
  const [inviteProjLevel, setInviteProjLevel] = useState<ProjectAccessLevel>("editor");
  const [invitingProj, setInvitingProj] = useState(false);
  const [projTeamId, setProjTeamId] = useState("");
  const [projTeamLevel, setProjTeamLevel] = useState<ProjectAccessLevel>("editor");
  const [grantingProjTeam, setGrantingProjTeam] = useState(false);

  // Project Edit & Delete
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editProjName, setEditProjName] = useState("");
  const [editProjStatus, setEditProjStatus] = useState("active");
  const [savingProject, setSavingProject] = useState(false);
  const [deleteProjectConfirmOpen, setDeleteProjectConfirmOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [wsList, teams, planData] = await Promise.all([
        fetchAccessibleWorkspacesWithProjects(user.id),
        fetchUserTeams(user.id),
        getUserPlanAndLimits(user.id),
      ]);
      setWorkspaces(wsList);
      setUserTeams(teams);
      setPlanTier(planData.plan);
      setPlanLimits(planData.limits);
      setIsAdmin(planData.isAdmin);

      if (wsList.length > 0) {
        setSelectedWorkspaceId((prev) => {
          if (prev && wsList.some((w) => w.id === prev)) return prev;
          return wsList[0].id;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace data.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Load sub-data whenever selected workspace changes
  const loadWorkspaceSubData = useCallback(async (wsId: string) => {
    setSubLoading(true);
    try {
      const [mems, invs, tAccess] = await Promise.all([
        fetchWorkspaceMembers(wsId),
        fetchWorkspaceInvites(wsId),
        fetchWorkspaceTeamAccess(wsId),
      ]);
      setMembers(mems);
      setInvites(invs);
      setTeamAccess(tAccess);
    } catch (err) {
      console.error(err);
    } finally {
      setSubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedWorkspaceId) {
      void loadWorkspaceSubData(selectedWorkspaceId);
    }
  }, [selectedWorkspaceId, loadWorkspaceSubData]);

  // Load project sub-data whenever project modal opens
  const loadProjectSubData = useCallback(async (projId: string) => {
    setProjSubLoading(true);
    try {
      const [pMems, pInvs, pTeams] = await Promise.all([
        fetchProjectMembers(projId),
        fetchProjectInvites(projId),
        fetchProjectTeamAccess(projId),
      ]);
      setProjectMembers(pMems);
      setProjectInvites(pInvs);
      setProjectTeamAccessList(pTeams);
    } catch (err) {
      console.error(err);
    } finally {
      setProjSubLoading(false);
    }
  }, []);

  const openProjectAccessModal = (project: Project) => {
    setSelectedProject(project);
    void loadProjectSubData(project.id);
  };

  const currentWorkspace = workspaces?.find((w) => w.id === selectedWorkspaceId) ?? null;
  const isManager =
    currentWorkspace?.is_direct_owner ||
    currentWorkspace?.current_user_role === "owner" ||
    currentWorkspace?.current_user_role === "admin";

  const ownedWorkspacesCount = workspaces?.filter((w) => w.owner_id === user?.id).length || 0;
  const projectsInCurrentWsCount = currentWorkspace?.projects.length || 0;

  const isAtWorkspaceLimit = !isAdmin && ownedWorkspacesCount >= planLimits.maxWorkspaces;
  const isAtProjectLimit = !isAdmin && projectsInCurrentWsCount >= planLimits.maxProjectsPerWorkspace;
  const canInviteWorkspaceMembers = isAdmin || planLimits.maxWorkspaceMembers > 1;
  const canGrantTeamWorkspace = isAdmin || planLimits.allowsTeamWorkspaceAccess;
  const canInviteProjectCollaborators = isAdmin || planLimits.allowsProjectAccessGrants;

  // Flash message helper
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Actions
  async function handleCreateWorkspace() {
    if (!user || !newWsName.trim()) return;
    setCreatingWs(true);
    setError(null);
    try {
      const ws = await createWorkspace(user.id, newWsName.trim());
      setNewWsName("");
      setCreateWsOpen(false);
      showSuccess(`Created workspace "${ws.name}"`);
      await loadData();
      setSelectedWorkspaceId(ws.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace.");
    } finally {
      setCreatingWs(false);
    }
  }

  async function handleUpdateWorkspace() {
    if (!selectedWorkspaceId || !editWsName.trim()) return;
    setSavingWs(true);
    setError(null);
    try {
      await updateWorkspace(selectedWorkspaceId, editWsName.trim());
      setEditWsOpen(false);
      showSuccess("Workspace updated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update workspace.");
    } finally {
      setSavingWs(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!selectedWorkspaceId) return;
    try {
      await deleteWorkspace(selectedWorkspaceId);
      setDeleteWsConfirmOpen(false);
      showSuccess("Workspace deleted.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workspace.");
    }
  }

  async function handleCreateProject() {
    if (!user || !selectedWorkspaceId || !newProjectName.trim()) return;
    setCreatingProject(true);
    setError(null);
    try {
      const p = await createProject(
        selectedWorkspaceId,
        user.id,
        newProjectName.trim(),
        newProjectStatus,
      );
      setNewProjectName("");
      setNewProjectStatus("active");
      setCreateProjectOpen(false);
      showSuccess(`Created project "${p.name}"`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setCreatingProject(false);
    }
  }

  async function handleUpdateProject() {
    if (!selectedProject || !editProjName.trim()) return;
    setSavingProject(true);
    setError(null);
    try {
      await updateProject(selectedProject.id, {
        name: editProjName.trim(),
        status: editProjStatus,
      });
      setEditProjectOpen(false);
      setSelectedProject((prev) => (prev ? { ...prev, name: editProjName.trim(), status: editProjStatus } : null));
      showSuccess("Project details updated.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project.");
    } finally {
      setSavingProject(false);
    }
  }

  async function handleDeleteProject() {
    if (!selectedProject) return;
    try {
      await deleteProject(selectedProject.id);
      setDeleteProjectConfirmOpen(false);
      setSelectedProject(null);
      showSuccess("Project removed.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
    }
  }

  async function handleInviteWorkspace() {
    if (!selectedWorkspaceId || !inviteWsEmail.trim()) return;
    setInvitingWs(true);
    setError(null);
    try {
      await inviteToWorkspace(selectedWorkspaceId, inviteWsEmail.trim(), inviteWsRole);
      setInviteWsEmail("");
      showSuccess(`Sent workspace invite to ${inviteWsEmail.trim()}`);
      if (selectedWorkspaceId) await loadWorkspaceSubData(selectedWorkspaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite to workspace.");
    } finally {
      setInvitingWs(false);
    }
  }

  async function handleGrantTeamWorkspace() {
    if (!selectedWorkspaceId || !selectedTeamId || !user) return;
    setGrantingTeamWs(true);
    setError(null);
    try {
      await grantTeamWorkspaceAccess(
        selectedWorkspaceId,
        selectedTeamId,
        teamWsRole,
        user.id,
      );
      setSelectedTeamId("");
      showSuccess("Team access granted to workspace.");
      if (selectedWorkspaceId) await loadWorkspaceSubData(selectedWorkspaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant team access.");
    } finally {
      setGrantingTeamWs(false);
    }
  }

  async function handleInviteProject() {
    if (!selectedProject || !inviteProjEmail.trim()) return;
    setInvitingProj(true);
    setError(null);
    try {
      await inviteToProject(selectedProject.id, inviteProjEmail.trim(), inviteProjLevel);
      setInviteProjEmail("");
      showSuccess(`Sent project invite to ${inviteProjEmail.trim()}`);
      await loadProjectSubData(selectedProject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite to project.");
    } finally {
      setInvitingProj(false);
    }
  }

  async function handleGrantTeamProject() {
    if (!selectedProject || !projTeamId || !user) return;
    setGrantingProjTeam(true);
    setError(null);
    try {
      await grantTeamProjectAccess(
        selectedProject.id,
        projTeamId,
        projTeamLevel,
        user.id,
      );
      setProjTeamId("");
      showSuccess("Team access granted to project.");
      await loadProjectSubData(selectedProject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant team project access.");
    } finally {
      setGrantingProjTeam(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-[13px] font-mono text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading workspace access…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan Tier & Capacity Meter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-subtle/30 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <span className="font-semibold text-ink">
            {PLAN_LABELS[planTier]} Plan {isAdmin && "(Admin Access)"}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground font-mono">
            Workspaces: <strong className="text-ink">{ownedWorkspacesCount}</strong>/
            {planLimits.maxWorkspaces >= 900 ? "∞" : planLimits.maxWorkspaces}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground font-mono">
            Projects/Workspace:{" "}
            <strong className="text-ink">{projectsInCurrentWsCount}</strong>/
            {planLimits.maxProjectsPerWorkspace >= 900 ? "∞" : planLimits.maxProjectsPerWorkspace}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground font-mono">
            Workspace Seats: <strong className="text-ink">{planLimits.teamSeats}</strong>
          </span>
        </div>

        {planTier !== "teams" && !isAdmin && (
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1 text-[11px] font-medium text-surface hover:bg-ink/90 transition shadow-2xs"
          >
            Upgrade Plan
            <Sparkles className="size-3" />
          </Link>
        )}
      </div>

      {/* Alert Banners */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Workspace Header & Selector */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Workspaces</Eyebrow>
          <ButtonPrimary
            onClick={() => {
              if (isAtWorkspaceLimit) {
                setError(
                  `You have reached the limit of ${planLimits.maxWorkspaces} workspace${planLimits.maxWorkspaces === 1 ? "" : "s"
                  } on the ${PLAN_LABELS[planTier]} plan. Upgrade to create more workspaces.`,
                );
              } else {
                setCreateWsOpen(true);
              }
            }}
          >
            <Plus className="size-4" />
            New workspace
          </ButtonPrimary>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-4 -mb-4 no-scrollbar">
          {workspaces?.map((ws) => (
            <Card
              key={ws.id}
              className={cn(
                "w-[220px] shrink-0 p-4 cursor-pointer relative border-l-2",
                selectedWorkspaceId === ws.id ? "border-l-cyan-400" : "border-l-transparent"
              )}
              onClick={() => setSelectedWorkspaceId(ws.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="size-8 rounded-full bg-subtle flex items-center justify-center font-semibold text-ink">
                  {ws.name[0].toUpperCase()}
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition">
                  {/* Kebab menu here */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 rounded hover:bg-subtle">
                        <span className="sr-only">Menu</span>
                        ⋯
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setEditWsName(ws.name);
                        setEditWsOpen(true);
                        setSelectedWorkspaceId(ws.id);
                      }}>Rename</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => {
                        setSelectedWorkspaceId(ws.id);
                        setDeleteWsConfirmOpen(true);
                      }}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <h4 className="font-semibold text-sm truncate">{ws.name}</h4>
              <p className="text-xs text-muted-foreground">{ws.projects.length} projects</p>
              {/* Stacked Avatars row */}
            </Card>
          ))}
          <Card className="w-[220px] shrink-0 p-4 border-dashed flex items-center justify-center cursor-pointer hover:border-ink/20" onClick={() => {
              if (isAtWorkspaceLimit) {
                setError(
                  `You have reached the limit of ${planLimits.maxWorkspaces} workspace${planLimits.maxWorkspaces === 1 ? "" : "s"
                  } on the ${PLAN_LABELS[planTier]} plan. Upgrade to create more workspaces.`,
                );
              } else {
                setCreateWsOpen(true);
              }
            }}>
            <Plus className="size-6 text-muted-foreground" />
          </Card>
        </div>
      </div>

      {/* Tab 1: Projects Under Workspace */}
      {currentWorkspace && activeTab === "projects" && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Projects</h3>
              <p className="text-[12px] text-muted-foreground">
                Projects are workspace-scoped containers. ({projectsInCurrentWsCount}/
                {planLimits.maxProjectsPerWorkspace >= 900 ? "∞" : planLimits.maxProjectsPerWorkspace} projects used)
              </p>
            </div>
            {isManager && (
              <button
                type="button"
                onClick={() => {
                  if (isAtProjectLimit) {
                    setError(
                      `This workspace has reached the limit of ${planLimits.maxProjectsPerWorkspace} projects on the ${PLAN_LABELS[planTier]} plan. Upgrade in Settings → Billing for higher limits.`,
                    );
                  } else {
                    setCreateProjectOpen(true);
                  }
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-medium text-surface hover:bg-ink/90"
              >
                <Plus className="size-3.5" />
                Add project
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentWorkspace.projects.length === 0 ? (
              <>
                <Card className="border-dashed border-border p-4 opacity-40 flex items-center gap-3">
                  <FolderKanban className="size-8 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-ink">Example project</div>
                    <div className="text-xs text-muted-foreground">0 posts · updated 0d ago</div>
                  </div>
                </Card>
                <Card className="border-dashed border-border p-4 opacity-40 flex items-center gap-3">
                  <FolderKanban className="size-8 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-ink">Example project</div>
                    <div className="text-xs text-muted-foreground">0 posts · updated 0d ago</div>
                  </div>
                </Card>
                <Card
                  className="border-dashed border-border p-4 flex items-center justify-center cursor-pointer hover:border-ink/20"
                  onClick={() => setCreateProjectOpen(true)}
                >
                  <Plus className="size-6 text-muted-foreground" />
                </Card>
              </>
            ) : (
              currentWorkspace.projects.map((project) => (
                <Card
                  key={project.id}
                  className="flex flex-col justify-between p-4 transition hover:border-ink/20 shadow-none"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderKanban className="size-4 text-muted-foreground shrink-0" />
                        <h4 className="text-sm font-semibold text-ink truncate">{project.name}</h4>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">0 posts · updated 0d ago</p>
                  </div>

                  <div className="mt-4 flex items-center justify-end">
                    {/* Avatar stack here */}
                  </div>
                </Card>
              ))
            )}
          </div>

        </div>
      )}

      {/* Tab 2: Workspace Members & Invites */}
      {currentWorkspace && activeTab === "members" && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-6">
          {!canInviteWorkspaceMembers ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-subtle/40 p-4">
              <div className="flex items-start gap-3">
                <Lock className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[14px] font-semibold text-ink">Workspace Team Sharing is a Teams Plan feature</h4>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Upgrade to the Teams plan to invite up to 5 collaborators with role-based permissions to this full workspace.
                  </p>
                </div>
              </div>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-ink text-surface text-[12px] font-medium hover:bg-ink/90 shrink-0"
              >
                Upgrade to Teams
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          ) : isManager && (
            /* Invite Form */
            <div className="rounded-xl border border-border bg-subtle/30 p-4">
              <h4 className="text-[13px] font-semibold text-ink mb-1">Invite member to full workspace</h4>
              <p className="text-[12px] text-muted-foreground mb-3">
                Workspace members can collaborate across all visible projects in this workspace ({members.length}/{planLimits.maxWorkspaceMembers} seats used).
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="email"
                  value={inviteWsEmail}
                  onChange={(e) => setInviteWsEmail(e.target.value)}
                  placeholder="collaborator@company.com"
                  className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
                />
                <select
                  value={inviteWsRole}
                  onChange={(e) => setInviteWsRole(e.target.value as WorkspaceRole)}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="button"
                  onClick={handleInviteWorkspace}
                  disabled={invitingWs || !inviteWsEmail.trim()}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink/90 disabled:opacity-50"
                >
                  {invitingWs ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                  Invite
                </button>
              </div>
            </div>
          )}

          {/* Members List */}
          <div>
            <h4 className="text-[14px] font-semibold text-ink mb-2">Active Members ({members.length})</h4>
            {subLoading ? (
              <div className="p-4 text-[13px] text-muted-foreground">Loading members…</div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {/* Workspace Owner row */}
                <div className="flex items-center justify-between p-3.5 text-[13px]">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-ink text-surface text-[12px] font-semibold">
                      O
                    </div>
                    <div>
                      <div className="font-medium text-ink">
                        {currentWorkspace.is_direct_owner ? `${user?.email} (You)` : `Workspace Owner`}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground">Owner ID: {currentWorkspace.owner_id.slice(0, 8)}</div>
                    </div>
                  </div>
                  <span className="rounded-full border border-border bg-subtle px-2 py-0.5 text-[11px] font-mono uppercase font-semibold text-ink">
                    Owner
                  </span>
                </div>

                {members
                  .filter((m) => m.user_id !== currentWorkspace.owner_id)
                  .map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3.5 text-[13px]">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-subtle text-ink text-[12px] font-medium">
                          {(m.display_name || "M")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-ink">
                            {m.display_name || `Member #${m.user_id.slice(0, 6)}`}
                            {m.user_id === user?.id && " (You)"}
                          </div>
                          <div className="text-[11px] font-mono text-muted-foreground">Status: {m.status}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full border border-border bg-subtle px-2 py-0.5 text-[11px] font-mono uppercase text-muted-foreground">
                          {m.role}
                        </span>
                        {isManager && m.user_id !== user?.id && (
                          <button
                            type="button"
                            onClick={async () => {
                              await removeWorkspaceMember(m.id);
                              if (selectedWorkspaceId) await loadWorkspaceSubData(selectedWorkspaceId);
                              showSuccess("Member removed.");
                            }}
                            className="text-[12px] text-destructive hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Pending Invites */}
          {invites.length > 0 && (
            <div>
              <h4 className="text-[14px] font-semibold text-ink mb-2">Pending Invites ({invites.length})</h4>
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-3.5 text-[13px]">
                    <div className="flex items-center gap-3">
                      <Mail className="size-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium text-ink">{inv.email}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">Role: {inv.role} · Status: {inv.status}</div>
                      </div>
                    </div>
                    {isManager && (
                      <button
                        type="button"
                        onClick={async () => {
                          await revokeWorkspaceInvite(inv.id);
                          if (selectedWorkspaceId) await loadWorkspaceSubData(selectedWorkspaceId);
                          showSuccess("Invite cancelled.");
                        }}
                        className="text-[12px] text-destructive hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Team Access to Workspace */}
      {currentWorkspace && activeTab === "teams" && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-6">
          {!canGrantTeamWorkspace ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-subtle/40 p-4">
              <div className="flex items-start gap-3">
                <Lock className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[14px] font-semibold text-ink">Team-Level Sharing is a Teams Plan feature</h4>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Upgrade to the Teams plan to grant entire teams full access to this workspace or specific projects.
                  </p>
                </div>
              </div>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-ink text-surface text-[12px] font-medium hover:bg-ink/90 shrink-0"
              >
                Upgrade to Teams
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          ) : isManager && (
            /* Grant Team Form */
            <div className="rounded-xl border border-border bg-subtle/30 p-4">
              <h4 className="text-[13px] font-semibold text-ink mb-1">Grant Team Workspace Access</h4>
              <p className="text-[12px] text-muted-foreground mb-3">
                Grant an entire team access to this workspace. All members in the team will inherit access.
              </p>
              {userTeams.length === 0 ? (
                <p className="text-[12px] text-muted-foreground italic">
                  You don't have any teams created yet. Create a team in Settings → Teams first to grant team access.
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
                  >
                    <option value="">Select a team…</option>
                    {userTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={teamWsRole}
                    onChange={(e) => setTeamWsRole(e.target.value as WorkspaceRole)}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
                  >
                    <option value="member">Member Access</option>
                    <option value="admin">Admin Access</option>
                    <option value="viewer">Viewer Access</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleGrantTeamWorkspace}
                    disabled={grantingTeamWs || !selectedTeamId}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink/90 disabled:opacity-50"
                  >
                    {grantingTeamWs ? <Loader2 className="size-3.5 animate-spin" /> : <Building className="size-3.5" />}
                    Grant access
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Teams Granted Access */}
          <div>
            <h4 className="text-[14px] font-semibold text-ink mb-2">Teams with Workspace Access ({teamAccess.length})</h4>
            {teamAccess.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-subtle/20 p-6 text-center text-[13px] text-muted-foreground">
                No external teams have been granted workspace access.
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {teamAccess.map((ta) => (
                  <div key={ta.id} className="flex items-center justify-between p-3.5 text-[13px]">
                    <div className="flex items-center gap-3">
                      <Building className="size-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium text-ink">{ta.team_name || "Team"}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">
                          Access level: {ta.access_level}
                        </div>
                      </div>
                    </div>
                    {isManager && (
                      <button
                        type="button"
                        onClick={async () => {
                          await revokeWorkspaceTeamAccess(ta.id);
                          if (selectedWorkspaceId) await loadWorkspaceSubData(selectedWorkspaceId);
                          showSuccess("Team access revoked.");
                        }}
                        className="text-[12px] text-destructive hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Project Access & Collaborators Dialog */}
      <Dialog open={!!selectedProject && !editProjectOpen} onOpenChange={(open) => !open && setSelectedProject(null)}>
        <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <FolderKanban className="size-5 text-ink" />
              <DialogTitle className="text-lg font-semibold text-ink">
                Project Access: {selectedProject?.name}
              </DialogTitle>
            </div>
            <DialogDescription className="text-[13px] text-muted-foreground">
              Narrow access to this specific project. Users or teams invited here will only be able to view and edit posts within this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-3">
            {/* Direct Project Invite Form */}
            {!canInviteProjectCollaborators ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-subtle/40 p-4">
                <div className="flex items-start gap-3">
                  <Lock className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-[13px] font-semibold text-ink">Scoped Project Invites require Studio or Teams</h5>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Upgrade to Studio or Teams to invite collaborators to specific projects without exposing your entire workspace.
                    </p>
                  </div>
                </div>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-1 h-7 px-3 rounded-md bg-ink text-surface text-[11px] font-medium hover:bg-ink/90 shrink-0"
                >
                  Upgrade
                  <ArrowUpRight className="size-3" />
                </Link>
              </div>
            ) : isManager && (
              <div className="rounded-xl border border-border bg-subtle/30 p-4">
                <h5 className="text-[13px] font-semibold text-ink mb-1">Invite User to this Project</h5>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="email"
                    value={inviteProjEmail}
                    onChange={(e) => setInviteProjEmail(e.target.value)}
                    placeholder="project.collaborator@company.com"
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
                  />
                  <select
                    value={inviteProjLevel}
                    onChange={(e) => setInviteProjLevel(e.target.value as ProjectAccessLevel)}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleInviteProject}
                    disabled={invitingProj || !inviteProjEmail.trim()}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink/90 disabled:opacity-50"
                  >
                    {invitingProj ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                    Invite
                  </button>
                </div>
              </div>
            )}

            {/* Grant Team to Project */}
            {canGrantTeamWorkspace && isManager && userTeams.length > 0 && (
              <div className="rounded-xl border border-border bg-subtle/30 p-4">
                <h5 className="text-[13px] font-semibold text-ink mb-1">Grant Team to this Project</h5>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={projTeamId}
                    onChange={(e) => setProjTeamId(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
                  >
                    <option value="">Select a team…</option>
                    {userTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={projTeamLevel}
                    onChange={(e) => setProjTeamLevel(e.target.value as ProjectAccessLevel)}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleGrantTeamProject}
                    disabled={grantingProjTeam || !projTeamId}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink/90 disabled:opacity-50"
                  >
                    {grantingProjTeam ? <Loader2 className="size-3.5 animate-spin" /> : <Building className="size-3.5" />}
                    Grant team
                  </button>
                </div>
              </div>
            )}

            {/* Project Members List */}
            <div>
              <h5 className="text-[13px] font-semibold text-ink mb-2">Direct Project Members ({projectMembers.length})</h5>
              {projSubLoading ? (
                <div className="p-3 text-[12px] text-muted-foreground">Loading direct members…</div>
              ) : projectMembers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
                  No direct project members. (Workspace-level members still inherit access).
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border bg-background">
                  {projectMembers.map((pm) => (
                    <div key={pm.id} className="flex items-center justify-between p-3 text-[13px]">
                      <div>
                        <div className="font-medium text-ink">
                          {pm.display_name || `User #${pm.user_id.slice(0, 6)}`}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground">Role: {pm.role} · Status: {pm.status}</div>
                      </div>
                      {isManager && pm.user_id !== user?.id && (
                        <button
                          type="button"
                          onClick={async () => {
                            await removeProjectMember(pm.id);
                            if (selectedProject) await loadProjectSubData(selectedProject.id);
                            showSuccess("Project member removed.");
                          }}
                          className="text-[12px] text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Project Team Access List */}
            {projectTeamAccessList.length > 0 && (
              <div>
                <h5 className="text-[13px] font-semibold text-ink mb-2">Teams with Project Access ({projectTeamAccessList.length})</h5>
                <div className="divide-y divide-border rounded-xl border border-border bg-background">
                  {projectTeamAccessList.map((pta) => (
                    <div key={pta.id} className="flex items-center justify-between p-3 text-[13px]">
                      <div className="flex items-center gap-2">
                        <Building className="size-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-ink">{pta.team_name}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">Level: {pta.access_level}</div>
                        </div>
                      </div>
                      {isManager && (
                        <button
                          type="button"
                          onClick={async () => {
                            await revokeProjectTeamAccess(pta.id);
                            if (selectedProject) await loadProjectSubData(selectedProject.id);
                            showSuccess("Team project access revoked.");
                          }}
                          className="text-[12px] text-destructive hover:underline"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Project Invites */}
            {projectInvites.length > 0 && (
              <div>
                <h5 className="text-[13px] font-semibold text-ink mb-2">Pending Project Invites ({projectInvites.length})</h5>
                <div className="divide-y divide-border rounded-xl border border-border bg-background">
                  {projectInvites.map((pi) => (
                    <div key={pi.id} className="flex items-center justify-between p-3 text-[13px]">
                      <div>
                        <div className="font-medium text-ink">{pi.email}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">Level: {pi.access_level} · Status: {pi.status}</div>
                      </div>
                      {isManager && (
                        <button
                          type="button"
                          onClick={async () => {
                            await revokeProjectInvite(pi.id);
                            if (selectedProject) await loadProjectSubData(selectedProject.id);
                            showSuccess("Project invite revoked.");
                          }}
                          className="text-[12px] text-destructive hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 border-t border-border pt-3">
            {isManager && selectedProject && (
              <button
                type="button"
                onClick={() => setDeleteProjectConfirmOpen(true)}
                className="mr-auto inline-flex items-center gap-1.5 text-[12px] text-destructive hover:underline"
              >
                <Trash2 className="size-3.5" />
                Delete project
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedProject(null)}
              className="rounded-lg border border-border px-4 py-1.5 text-[13px] font-medium text-ink hover:bg-subtle"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Create Workspace */}
      <Dialog open={createWsOpen} onOpenChange={setCreateWsOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Create New Workspace</DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              A workspace organizes your projects, shared drafts, and team memberships. ({ownedWorkspacesCount}/{planLimits.maxWorkspaces >= 900 ? "∞" : planLimits.maxWorkspaces} used on {PLAN_LABELS[planTier]} plan)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Workspace Name
              </span>
              <input
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="e.g. Growth Marketing"
                className="h-10 rounded-lg border border-border bg-background px-3 text-[14px] text-ink outline-none focus:border-ink"
              />
            </label>
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

      {/* Modal: Rename Workspace */}
      <Dialog open={editWsOpen} onOpenChange={setEditWsOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Rename Workspace</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <input
              value={editWsName}
              onChange={(e) => setEditWsName(e.target.value)}
              placeholder="Workspace name"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-ink outline-none focus:border-ink"
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditWsOpen(false)}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-ink hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpdateWorkspace}
              disabled={savingWs || !editWsName.trim()}
              className="h-9 px-4 rounded-lg bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50"
            >
              {savingWs ? "Saving…" : "Save changes"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Create Project */}
      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Create Project</DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              Add a new project inside {currentWorkspace?.name} ({projectsInCurrentWsCount}/{planLimits.maxProjectsPerWorkspace >= 900 ? "∞" : planLimits.maxProjectsPerWorkspace} used on {PLAN_LABELS[planTier]} plan).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Project Name
              </span>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. Q4 Executive Voice"
                className="h-10 rounded-lg border border-border bg-background px-3 text-[14px] text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Initial Status
              </span>
              <select
                value={newProjectStatus}
                onChange={(e) => setNewProjectStatus(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCreateProjectOpen(false)}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-ink hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateProject}
              disabled={creatingProject || !newProjectName.trim()}
              className="h-9 px-4 rounded-lg bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {creatingProject && <Loader2 className="size-3.5 animate-spin" />}
              Create project
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Edit Project */}
      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Project Name
              </span>
              <input
                value={editProjName}
                onChange={(e) => setEditProjName(e.target.value)}
                placeholder="Project name"
                className="h-10 rounded-lg border border-border bg-background px-3 text-[14px] text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </span>
              <select
                value={editProjStatus}
                onChange={(e) => setEditProjStatus(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-3 text-[13px] text-ink outline-none focus:border-ink"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditProjectOpen(false)}
              className="h-9 px-4 rounded-lg border border-border text-[13px] text-ink hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpdateProject}
              disabled={savingProject || !editProjName.trim()}
              className="h-9 px-4 rounded-lg bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50"
            >
              {savingProject ? "Saving…" : "Save changes"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Workspace Delete */}
      <ConfirmDialog
        open={deleteWsConfirmOpen}
        onOpenChange={setDeleteWsConfirmOpen}
        title="Delete workspace?"
        description="This will permanently delete this workspace and all associated project access records. Posts inside the workspace will no longer be accessible."
        confirmText="Delete workspace"
        variant="destructive"
        onConfirm={() => void handleDeleteWorkspace()}
      />

      {/* Confirm Project Delete */}
      <ConfirmDialog
        open={deleteProjectConfirmOpen}
        onOpenChange={setDeleteProjectConfirmOpen}
        title="Delete project?"
        description="This will permanently delete this project and direct access grants."
        confirmText="Delete project"
        variant="destructive"
        onConfirm={() => void handleDeleteProject()}
      />
    </div>
  );
}
