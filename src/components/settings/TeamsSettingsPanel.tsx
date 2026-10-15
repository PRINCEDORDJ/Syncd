import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Section, Badge } from "./ui-primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PLAN_LIMITS, type PlanTier } from "@/lib/plans";
import {
  fetchUserTeams,
  fetchUserTeamMemberships,
  fetchWorkspaceTeamAccess,
  grantTeamWorkspaceAccess,
  revokeWorkspaceTeamAccess,
  leaveTeam,
  type TeamMembership,
  type TeamMemberRole,
  type WorkspaceRole,
  type WorkspaceTeamAccess,
} from "@/lib/workspace-access";
import {
  Loader2,
  Pencil,
  Copy,
  Plus,
  Building2,
  LogOut,
  Link2,
  Check,
} from "lucide-react";

interface Team {
  id: string;
  name: string;
  owner_id: string;
}

interface TeamMemberRow {
  id: string;
  email: string;
  role: TeamMemberRole;
  accepted_at: string | null;
  user_id: string | null;
  invite_token: string | null;
  expires_at: string;
}

interface OwnedWorkspace {
  id: string;
  name: string;
}

type GrantRow = WorkspaceTeamAccess & { workspace_name: string };

const MEMBER_SEAT_CAP = 5;

const inputCls =
  "h-9 px-3 rounded-md border border-border bg-card text-[13px] text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink transition-all";
const selectCls =
  "h-9 rounded-md border border-border bg-card px-2.5 text-[13px] text-ink focus:outline-none focus:border-ink transition-colors";

export function TeamsSettingsPanel({
  user,
  effectivePlan,
  isAdmin,
}: {
  user: User;
  effectivePlan: PlanTier;
  isAdmin: boolean;
}) {
  const [team, setTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [ownedWorkspaces, setOwnedWorkspaces] = useState<OwnedWorkspace[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  // Rename
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamMemberRole>("editor");
  const [inviting, setInviting] = useState(false);

  // Linked workspaces
  const [grantWsId, setGrantWsId] = useState("");
  const [grantRole, setGrantRole] = useState<WorkspaceRole>("member");
  const [granting, setGranting] = useState(false);

  // Confirm dialogs
  const [deleteTeamOpen, setDeleteTeamOpen] = useState(false);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [revokeInviteId, setRevokeInviteId] = useState<string | null>(null);
  const [leaveMembershipId, setLeaveMembershipId] = useState<string | null>(null);

  const canManageTeams = isAdmin || effectivePlan === "teams";
  const canLinkWorkspaces = isAdmin || PLAN_LIMITS[effectivePlan].allowsTeamWorkspaceAccess;

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrMsg(null);
    try {
      const [ownedTeams, teamMemberships, wsRes] = await Promise.all([
        fetchUserTeams(user.id),
        fetchUserTeamMemberships(user.id),
        supabase
          .from("workspaces")
          .select("id, name")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true }),
      ]);

      const owned = (wsRes.data ?? []) as OwnedWorkspace[];
      setOwnedWorkspaces(owned);
      setMemberships(teamMemberships);

      const t = ownedTeams[0] ?? null;
      setTeam(t);

      let rows: TeamMemberRow[] = [];
      let teamGrants: GrantRow[] = [];

      if (t) {
        const [memRes, grantRes] = await Promise.all([
          supabase
            .from("team_members")
            .select("id, email, role, accepted_at, user_id, invite_token, expires_at")
            .eq("team_id", t.id)
            .order("invited_at", { ascending: true }),
          supabase
            .from("workspace_team_access")
            .select("id, workspace_id, team_id, role, status, created_at")
            .eq("team_id", t.id),
        ]);
        rows = (memRes.data ?? []) as TeamMemberRow[];

        const grantRows = (grantRes.data ?? []) as WorkspaceTeamAccess[];
        const wsNameMap = new Map(owned.map((w) => [w.id, w.name]));
        if (grantRows.length > 0) {
          const missingWsIds = grantRows
            .map((g) => g.workspace_id)
            .filter((id) => !wsNameMap.has(id));
          if (missingWsIds.length > 0) {
            const { data: extraWs } = await supabase
              .from("workspaces")
              .select("id, name")
              .in("id", missingWsIds);
            for (const w of (extraWs ?? []) as OwnedWorkspace[]) {
              wsNameMap.set(w.id, w.name);
            }
          }
        }
        teamGrants = grantRows.map((g) => ({
          ...g,
          access_level: g.role as WorkspaceRole,
          role: g.role as WorkspaceRole,
          status: g.status,
          workspace_name: wsNameMap.get(g.workspace_id) ?? "Workspace",
        }));
      }

      setTeamMembers(rows);
      setGrants(teamGrants);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to load team.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const accepted = teamMembers.filter((m) => m.accepted_at);
  const pending = teamMembers.filter((m) => !m.accepted_at);
  const seatsUsed = teamMembers.length + 1;
  const linkedWorkspaceIds = new Set(grants.map((g) => g.workspace_id));
  const grantableWorkspaces = ownedWorkspaces.filter((w) => !linkedWorkspaceIds.has(w.id));

  function inviteLinkFor(token: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/invite?token=${token}`;
  }

  async function copyInviteLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLinkFor(token));
      showSuccess("Invite link copied — send it to them.");
    } catch {
      setErrMsg("Could not copy the link. Select and copy it manually.");
    }
  }

  async function createTeam() {
    if (!canManageTeams) {
      setErrMsg("Creating a team requires the Teams plan.");
      return;
    }
    setCreating(true);
    setErrMsg(null);
    const { data, error } = await supabase
      .from("teams")
      .insert({ owner_id: user.id, name: newTeamName.trim() || "My team" })
      .select("id, name, owner_id")
      .single();
    setCreating(false);
    if (error) {
      setErrMsg(error.message);
      return;
    }
    setNewTeamName("");
    showSuccess(`Team "${data.name}" created.`);
    await load();
  }

  async function renameTeam() {
    if (!team) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setSavingName(true);
    setErrMsg(null);
    const { error } = await supabase
      .from("teams")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", team.id);
    setSavingName(false);
    if (error) {
      setErrMsg(error.message);
      return;
    }
    setRenaming(false);
    showSuccess("Team renamed.");
    await load();
  }

  async function deleteTeam() {
    if (!team) return;
    setErrMsg(null);
    const { error } = await supabase.from("teams").delete().eq("id", team.id);
    setDeleteTeamOpen(false);
    if (error) {
      setErrMsg(error.message);
      return;
    }
    showSuccess("Team deleted.");
    await load();
  }

  async function inviteMember() {
    if (!team) return;
    if (!canManageTeams) {
      setErrMsg("Inviting team members requires the Teams plan.");
      return;
    }
    const email = inviteEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErrMsg("Enter a valid email address.");
      return;
    }
    if (teamMembers.some((m) => m.email.toLowerCase() === email)) {
      setErrMsg("That email is already on this team.");
      return;
    }
    setInviting(true);
    setErrMsg(null);
    const { data, error } = await supabase
      .from("team_members")
      .insert({ team_id: team.id, email, role: inviteRole })
      .select("id, email, role, accepted_at, user_id, invite_token, expires_at")
      .single();
    setInviting(false);
    if (error) {
      setErrMsg(error.message);
      return;
    }
    setInviteEmail("");
    setInviteRole("editor");
    setTeamMembers((prev) => [...prev, data as TeamMemberRow]);
    showSuccess(`Invite ready for ${email} — copy the link below.`);
  }

  async function changeRole(memberId: string, role: TeamMemberRole) {
    setErrMsg(null);
    const { error } = await supabase
      .from("team_members")
      .update({ role })
      .eq("id", memberId);
    if (error) {
      setErrMsg(error.message);
      return;
    }
    setTeamMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    showSuccess(`Role updated to ${role}.`);
  }

  async function removeMemberById() {
    if (!removeMemberId) return;
    setErrMsg(null);
    const { error } = await supabase.from("team_members").delete().eq("id", removeMemberId);
    setRemoveMemberId(null);
    if (error) {
      setErrMsg(error.message);
      return;
    }
    setTeamMembers((prev) => prev.filter((m) => m.id !== removeMemberId));
    showSuccess("Member removed.");
  }

  async function revokeInviteById() {
    if (!revokeInviteId) return;
    setErrMsg(null);
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("id", revokeInviteId);
    const id = revokeInviteId;
    setRevokeInviteId(null);
    if (error) {
      setErrMsg(error.message);
      return;
    }
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
    showSuccess("Invite revoked.");
  }

  async function leaveSelectedTeam() {
    if (!leaveMembershipId) return;
    setErrMsg(null);
    try {
      await leaveTeam(leaveMembershipId);
      setLeaveMembershipId(null);
      showSuccess("You left the team.");
      await load();
    } catch (err) {
      setLeaveMembershipId(null);
      setErrMsg(err instanceof Error ? err.message : "Failed to leave the team.");
    }
  }

  async function grantLink() {
    if (!team || !grantWsId) return;
    setGranting(true);
    setErrMsg(null);
    try {
      await grantTeamWorkspaceAccess(grantWsId, team.id, grantRole, user.id);
      setGrantWsId("");
      setGrantRole("member");
      showSuccess("Workspace linked — members will see it in their switcher.");
      await load();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to link workspace.");
    } finally {
      setGranting(false);
    }
  }

  async function revokeGrant(accessId: string) {
    setErrMsg(null);
    try {
      await revokeWorkspaceTeamAccess(accessId);
      showSuccess("Workspace link removed.");
      await load();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to remove link.");
    }
  }

  if (loading) {
    return (
      <Section title="Team" subtitle="Invite teammates, set roles, and link your workspace.">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-4">
          <Loader2 className="size-4 animate-spin" />
          Loading teams…
        </div>
      </Section>
    );
  }

  return (
    <div>
      {errMsg && (
        <div className="mb-4 text-[13px] text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2.5">
          {errMsg}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 text-[13px] text-ink bg-subtle border border-border rounded-md px-3 py-2.5 flex items-center gap-2">
          <Check className="size-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Plan gate / create */}
      {!team ? (
        <Section title="Team" subtitle="Invite teammates, set roles, and share a draft library.">
          {!canManageTeams ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-border rounded-md bg-subtle/40">
              <div>
                <div className="text-[14px] font-medium text-ink">Teams plan required</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  Creating a team and inviting collaborators requires the Teams plan.
                </div>
              </div>
              <Link
                to="/settings"
                search={{ tab: "billing" }}
                className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium inline-flex items-center justify-center hover:bg-ink/90 shrink-0"
              >
                Upgrade to Teams
              </Link>
            </div>
          ) : (
            <div className="p-4 border border-border rounded-md bg-subtle/40 flex flex-col gap-3">
              <div>
                <div className="text-[14px] font-medium text-ink">No team yet</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  One team per account, up to 5 seats (you + up to 4 members). Link it to your
                  workspace so members share drafts, credits, and storage.
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Team name (e.g. Acme Marketing)"
                  maxLength={60}
                  className={`h-10 flex-1 ${inputCls}`}
                />
                <button
                  type="button"
                  onClick={createTeam}
                  disabled={creating}
                  className="h-10 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Create team
                </button>
              </div>
            </div>
          )}
        </Section>
      ) : (
        <>
          {/* Team header + members */}
          <Section
            title="Team"
            subtitle={`${seatsUsed} of ${MEMBER_SEAT_CAP} seats used (you + members; pending invites hold a seat).`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              {renaming ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void renameTeam();
                      if (e.key === "Escape") setRenaming(false);
                    }}
                    maxLength={60}
                    autoFocus
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={renameTeam}
                    disabled={savingName || !nameDraft.trim()}
                    className="h-9 px-3 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50"
                  >
                    {savingName ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenaming(false)}
                    className="text-[13px] text-muted-foreground hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 min-w-0">
                  <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-ink truncate">
                    {team.name}
                  </h3>
                  <button
                    type="button"
                    aria-label="Rename team"
                    onClick={() => {
                      setNameDraft(team.name);
                      setRenaming(true);
                    }}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                    {seatsUsed}/{MEMBER_SEAT_CAP} seats
                  </Badge>
                </div>
              )}
              <button
                type="button"
                onClick={() => setDeleteTeamOpen(true)}
                className="text-[12px] text-destructive hover:underline"
              >
                Delete team
              </button>
            </div>

            {/* Invite form */}
            <div className="rounded-md border border-border bg-subtle/30 p-3">
              <div className="text-[12px] font-medium text-ink mb-2">Invite a teammate</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void inviteMember();
                  }}
                  placeholder="teammate@company.com"
                  className={`h-9 flex-1 ${inputCls}`}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as TeamMemberRole)}
                  className={selectCls}
                  aria-label="Invite role"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer (read-only)</option>
                </select>
                <button
                  type="button"
                  onClick={inviteMember}
                  disabled={inviting || !inviteEmail.trim() || seatsUsed >= MEMBER_SEAT_CAP}
                  className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50"
                >
                  {inviting ? "Creating…" : "Invite"}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Invites are one-time links valid for 30 days — send the link yourself (Slack,
                email, etc.).
              </p>
              {seatsUsed >= MEMBER_SEAT_CAP && (
                <p className="text-[11px] text-destructive mt-1.5">
                  Seat limit reached — remove a member or revoke an invite to invite someone else.
                </p>
              )}
            </div>

            {/* Members */}
            <div>
              <div className="text-[12px] font-medium text-ink mb-1.5">Members</div>
              <ul className="divide-y divide-border border border-border rounded-md bg-card">
                <li className="px-3 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                  <span className="font-medium text-ink truncate">{user.email}</span>
                  <span className="text-[11px] font-mono uppercase text-muted-foreground shrink-0">
                    Owner
                  </span>
                </li>
                {accepted.map((m) => (
                  <li key={m.id} className="px-3 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-ink truncate min-w-0">{m.email}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value as TeamMemberRole)}
                        disabled={m.user_id === user.id}
                        className={selectCls}
                        aria-label={`Role for ${m.email}`}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setRemoveMemberId(m.id)}
                        className="text-[12px] text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
                {pending.length > 0 && (
                  <li className="px-3 pt-3 pb-1 text-[11px] font-mono uppercase text-muted-foreground">
                    Pending invites
                  </li>
                )}
                {pending.map((m) => (
                  <li key={m.id} className="px-3 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                    <div className="min-w-0">
                      <span className="text-ink truncate block">{m.email}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {m.role} · expires {new Date(m.expires_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {m.invite_token && (
                        <button
                          type="button"
                          onClick={() => copyInviteLink(m.invite_token!)}
                          className="inline-flex items-center gap-1 text-[12px] text-ink hover:underline"
                        >
                          <Copy className="size-3.5" />
                          Copy link
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setRevokeInviteId(m.id)}
                        className="text-[12px] text-destructive hover:underline"
                      >
                        Revoke
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          {/* Linked workspaces */}
          <Section
            title="Linked workspaces"
            subtitle="Accepted members see linked workspaces in their switcher — shared drafts, credits, and storage."
          >
            {grants.length > 0 && (
              <ul className="divide-y divide-border border border-border rounded-md bg-card">
                {grants.map((g) => (
                  <li key={g.id} className="px-3 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Building2 className="size-4 text-muted-foreground shrink-0" />
                      <span className="text-ink truncate">{g.workspace_name}</span>
                      <span className="text-[11px] font-mono uppercase text-muted-foreground shrink-0">
                        {g.role}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => revokeGrant(g.id)}
                      className="text-[12px] text-destructive hover:underline shrink-0"
                    >
                      Unlink
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!canLinkWorkspaces ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-border rounded-md bg-subtle/40">
                <div className="text-[12px] text-muted-foreground">
                  Linking a team to a workspace is a Teams plan feature.
                </div>
                <Link
                  to="/settings"
                  search={{ tab: "billing" }}
                  className="h-8 px-3.5 rounded-md bg-ink text-surface text-[12px] font-medium inline-flex items-center justify-center hover:bg-ink/90 shrink-0"
                >
                  Upgrade to Teams
                </Link>
              </div>
            ) : grantableWorkspaces.length > 0 ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={grantWsId}
                  onChange={(e) => setGrantWsId(e.target.value)}
                  className={`flex-1 ${selectCls}`}
                  aria-label="Workspace to link"
                >
                  <option value="">Select a workspace…</option>
                  {grantableWorkspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <select
                  value={grantRole}
                  onChange={(e) => setGrantRole(e.target.value as WorkspaceRole)}
                  className={selectCls}
                  aria-label="Workspace role for team"
                >
                  <option value="member">Member access</option>
                  <option value="admin">Admin access</option>
                </select>
                <button
                  type="button"
                  onClick={grantLink}
                  disabled={granting || !grantWsId}
                  className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {granting ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                  Link
                </button>
              </div>
            ) : (
              grants.length === 0 && (
                <p className="text-[12px] text-muted-foreground italic">
                  No workspace available to link yet.
                </p>
              )
            )}
          </Section>
        </>
      )}

      {/* Your teams (member side) */}
      {memberships.length > 0 && (
        <Section
          title="Your teams"
          subtitle="Teams you've joined as a member."
        >
          <ul className="divide-y divide-border border border-border rounded-md bg-card">
            {memberships.map((m) => (
              <li key={m.id} className="px-3 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-ink font-medium truncate">{m.team_name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono uppercase">
                    {m.role}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setLeaveMembershipId(m.id)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-destructive hover:underline shrink-0"
                >
                  <LogOut className="size-3.5" />
                  Leave
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ConfirmDialog
        open={deleteTeamOpen}
        onOpenChange={setDeleteTeamOpen}
        title="Delete this team?"
        description="Members, pending invites, and workspace links will be removed. Shared workspace drafts and credits stay with the workspace."
        confirmText="Delete team"
        variant="destructive"
        onConfirm={deleteTeam}
      />
      <ConfirmDialog
        open={removeMemberId !== null}
        onOpenChange={(open) => !open && setRemoveMemberId(null)}
        title="Remove member?"
        description="They'll lose access to this team's linked workspaces immediately. They keep their own workspace."
        confirmText="Remove"
        variant="destructive"
        onConfirm={removeMemberById}
      />
      <ConfirmDialog
        open={revokeInviteId !== null}
        onOpenChange={(open) => !open && setRevokeInviteId(null)}
        title="Revoke invite?"
        description="The invite link will stop working immediately."
        confirmText="Revoke"
        variant="destructive"
        onConfirm={revokeInviteById}
      />
      <ConfirmDialog
        open={leaveMembershipId !== null}
        onOpenChange={(open) => !open && setLeaveMembershipId(null)}
        title="Leave this team?"
        description="You'll lose access to workspaces shared with this team. You can be invited again later."
        confirmText="Leave team"
        variant="destructive"
        onConfirm={leaveSelectedTeam}
      />
    </div>
  );
}
