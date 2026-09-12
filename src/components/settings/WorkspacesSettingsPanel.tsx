import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  fetchAccessibleWorkspaces,
  fetchWorkspaceMembers,
  fetchWorkspaceInvites,
  fetchWorkspaceTeamAccess,
  fetchUserTeams,
  getUserPlanAndLimits,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  inviteToWorkspace,
  grantTeamWorkspaceAccess,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  revokeWorkspaceTeamAccess,
  type AccessibleWorkspace,
  type WorkspaceMember,
  type WorkspaceInvite,
  type WorkspaceTeamAccess,
  type WorkspaceRole,
  type TeamOption,
} from "@/lib/workspace-access";
import {
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
  EllipsisVertical
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
  const [activeTab, setActiveTab] = useState<"members" | "teams">("members");
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

  // Invite to Workspace
  const [inviteWsEmail, setInviteWsEmail] = useState("");
  const [inviteWsRole, setInviteWsRole] = useState<WorkspaceRole>("member");
  const [invitingWs, setInvitingWs] = useState(false);

  // Grant Team Workspace Access
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamWsRole, setTeamWsRole] = useState<WorkspaceRole>("member");
  const [grantingTeamWs, setGrantingTeamWs] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [wsList, teams, planData] = await Promise.all([
        fetchAccessibleWorkspaces(user.id),
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

  const currentWorkspace = workspaces?.find((w) => w.id === selectedWorkspaceId) ?? null;
  const isManager =
    currentWorkspace?.is_direct_owner ||
    currentWorkspace?.current_user_role === "owner" ||
    currentWorkspace?.current_user_role === "admin";

  const ownedWorkspacesCount = workspaces?.filter((w) => w.owner_id === user?.id).length || 0;

  const isAtWorkspaceLimit = !isAdmin && ownedWorkspacesCount >= planLimits.maxWorkspaces;
  const canInviteWorkspaceMembers = isAdmin || planLimits.maxWorkspaceMembers > 1;
  const canGrantTeamWorkspace = isAdmin || planLimits.allowsTeamWorkspaceAccess;

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
                "w-[220px] shrink-0 p-4 cursor-pointer relative border-l-2 group",
                selectedWorkspaceId === ws.id ? "border-l-cyan-400" : "border-l-transparent"
              )}
              onClick={() => setSelectedWorkspaceId(ws.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="size-8 rounded-full bg-subtle flex items-center justify-center font-semibold text-ink">
                  {ws.name[0].toUpperCase()}
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="p-1 rounded hover:bg-subtle" onClick={(e) => e.stopPropagation()}>
                        <EllipsisVertical className="size-4 text-muted-foreground" />
                        <span className="sr-only">Actions</span>
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
              <p className="text-xs text-muted-foreground">
                {ws.is_direct_owner ? "Owner" : ws.current_user_role ?? "Member"}
              </p>
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

      {/* Tab content: Members & Teams */}
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
            <div className="rounded-xl border border-border bg-subtle/30 p-4">
              <h4 className="text-[13px] font-semibold text-ink mb-1">Invite member to full workspace</h4>
              <p className="text-[12px] text-muted-foreground mb-3">
                Workspace members can collaborate across all drafts in this workspace ({members.length}/{planLimits.maxWorkspaceMembers} seats used).
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

          <div>
            <h4 className="text-[14px] font-semibold text-ink mb-2">Active Members ({members.length})</h4>
            {subLoading ? (
              <div className="p-4 text-[13px] text-muted-foreground">Loading members…</div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
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

      {currentWorkspace && activeTab === "teams" && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-6">
          {!canGrantTeamWorkspace ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-subtle/40 p-4">
              <div className="flex items-start gap-3">
                <Lock className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[14px] font-semibold text-ink">Team-Level Sharing is a Teams Plan feature</h4>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Upgrade to the Teams plan to grant entire teams full access to this workspace.
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

      {/* Create Workspace Modal */}
      <Dialog open={createWsOpen} onOpenChange={setCreateWsOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Create workspace</DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              Add a new workspace for your team.
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            placeholder="Workspace name"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-ink outline-none focus:border-ink"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && newWsName.trim()) {
                void handleCreateWorkspace();
              }
            }}
          />
          <DialogFooter>
            <ButtonOutline onClick={() => setCreateWsOpen(false)}>Cancel</ButtonOutline>
            <ButtonPrimary onClick={() => void handleCreateWorkspace()} disabled={creatingWs || !newWsName.trim()}>
              {creatingWs && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              Create
            </ButtonPrimary>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Workspace Modal */}
      <Dialog open={editWsOpen} onOpenChange={setEditWsOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Rename workspace</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={editWsName}
            onChange={(e) => setEditWsName(e.target.value)}
            placeholder="Workspace name"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-ink outline-none focus:border-ink"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && editWsName.trim()) {
                void handleUpdateWorkspace();
              }
            }}
          />
          <DialogFooter>
            <ButtonOutline onClick={() => setEditWsOpen(false)}>Cancel</ButtonOutline>
            <ButtonPrimary onClick={() => void handleUpdateWorkspace()} disabled={savingWs || !editWsName.trim()}>
              {savingWs && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              Save
            </ButtonPrimary>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Confirmation */}
      <ConfirmDialog
        open={deleteWsConfirmOpen}
        onOpenChange={setDeleteWsConfirmOpen}
        title="Delete workspace?"
        description="This will permanently delete this workspace and all its drafts. This action cannot be undone."
        confirmText="Delete workspace"
        onConfirm={() => void handleDeleteWorkspace()}
      />
    </div>
  );
}
