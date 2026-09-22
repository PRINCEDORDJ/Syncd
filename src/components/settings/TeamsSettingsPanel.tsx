import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "./ui-primitives";
import type { PlanTier } from "@/lib/plans";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Loader2, Pencil, UserPlus, X } from "lucide-react";

interface Team {
  id: string;
  name: string;
  owner_id: string;
}

type TeamRole = "owner" | "editor" | "viewer";

interface TeamMember {
  id: string;
  email: string;
  role: TeamRole;
  accepted_at: string | null;
  user_id: string | null;
}

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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [memberTeams, setMemberTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<TeamRole, "owner">>("editor");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    let cancelled = false;
    try {
      const { data: ownedTeams, error: ownedError } = await supabase
        .from("teams")
        .select("id, name, owner_id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (ownedError) throw ownedError;

      const ownedTeam = ownedTeams?.[0] ?? null;
      if (cancelled) return;
      setTeam(ownedTeam);
      setTeamName(ownedTeam?.name ?? "");
      setTeamMembers([]);
      setMemberTeams([]);

      if (ownedTeam) {
        const { data: members, error: membersError } = await supabase
          .from("team_members")
          .select("id, email, role, accepted_at, user_id")
          .eq("team_id", ownedTeam.id)
          .order("invited_at", { ascending: true });
        if (membersError) throw membersError;
        if (!cancelled) setTeamMembers((members ?? []) as TeamMember[]);
      } else {
        const { data: memberships, error: membershipsError } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", user.id)
          .not("accepted_at", "is", null);
        if (membershipsError) throw membershipsError;

        const teamIds = Array.from(new Set((memberships ?? []).map((row) => row.team_id)));
        if (teamIds.length > 0) {
          const { data: teams, error: teamsError } = await supabase
            .from("teams")
            .select("id, name, owner_id")
            .in("id", teamIds);
          if (teamsError) throw teamsError;
          if (!cancelled) setMemberTeams(teams ?? []);
        }
      }
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Failed to load team settings.");
      }
    } finally {
      if (!cancelled) setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  function clearStatus() {
    setError(null);
    setNotice(null);
  }

  function getActionError(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("Team seat limit reached")) {
      return "Your team has reached its 5-seat limit.";
    }
    if (message.includes("Teams plan")) {
      return "Inviting members requires the Teams plan.";
    }
    if (message.includes("duplicate key")) {
      return "That email has already been invited to this team.";
    }
    return message || fallback;
  }

  async function createTeam() {
    if (!isAdmin && effectivePlan !== "teams") {
      setError("Creating teams and inviting members requires the Teams plan.");
      return;
    }
    clearStatus();
    setCreating(true);
    try {
      const { error: createError } = await supabase
        .from("teams")
        .insert({ owner_id: user.id, name: "My team" });
      if (createError) throw createError;
      setNotice("Team created.");
      await loadTeam();
    } catch (err) {
      setError(getActionError(err, "Failed to create team."));
    } finally {
      setCreating(false);
    }
  }

  async function saveTeamName() {
    if (!team) return;
    const name = teamName.trim();
    if (!name) {
      setError("Team name cannot be empty.");
      return;
    }
    clearStatus();
    setSavingName(true);
    try {
      const { error: updateError } = await supabase
        .from("teams")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", team.id);
      if (updateError) throw updateError;
      setTeam((current) => (current ? { ...current, name } : current));
      setNotice("Team name updated.");
    } catch (err) {
      setError(getActionError(err, "Failed to update team name."));
    } finally {
      setSavingName(false);
    }
  }

  async function inviteMember() {
    if (!team) return;
    if (!isAdmin && effectivePlan !== "teams") {
      setError("Inviting team members requires the Teams plan.");
      return;
    }
    const email = inviteEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (email === user.email?.toLowerCase()) {
      setError("You already own this team.");
      return;
    }
    if (teamMembers.length >= 4) {
      setError("Your team has reached its 5-seat limit, including you.");
      return;
    }

    clearStatus();
    setInviting(true);
    try {
      const { error: inviteError } = await supabase
        .from("team_members")
        .insert({ team_id: team.id, email, role: inviteRole });
      if (inviteError) throw inviteError;
      setInviteEmail("");
      setInviteRole("editor");
      setNotice(`Invited ${email}. They can join when they sign in.`);
      await loadTeam();
    } catch (err) {
      setError(getActionError(err, "Failed to invite team member."));
    } finally {
      setInviting(false);
    }
  }

  async function updateMemberRole(member: TeamMember, role: Exclude<TeamRole, "owner">) {
    if (!team) return;
    clearStatus();
    setUpdatingMemberId(member.id);
    try {
      const { error: updateError } = await supabase
        .from("team_members")
        .update({ role })
        .eq("id", member.id)
        .eq("team_id", team.id);
      if (updateError) throw updateError;
      setTeamMembers((current) =>
        current.map((item) => (item.id === member.id ? { ...item, role } : item)),
      );
      setNotice(`${member.email}'s role was updated.`);
    } catch (err) {
      setError(getActionError(err, "Failed to update member role."));
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function removeMember(member: TeamMember) {
    if (!team) return;
    clearStatus();
    setRemovingMemberId(member.id);
    try {
      const { error: removeError } = await supabase
        .from("team_members")
        .delete()
        .eq("id", member.id)
        .eq("team_id", team.id);
      if (removeError) throw removeError;
      setTeamMembers((current) => current.filter((item) => item.id !== member.id));
      setNotice(`${member.email} was removed from the team.`);
    } catch (err) {
      setError(getActionError(err, "Failed to remove team member."));
    } finally {
      setRemovingMemberId(null);
      setRemoveTarget(null);
    }
  }

  if (loading) {
    return (
      <Section
        title="Teams"
        subtitle="Manage teammates who can collaborate across shared workspaces."
      >
        <div className="flex items-center gap-2 py-4 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading teams…
        </div>
      </Section>
    );
  }

  const canManage = !!team && team.owner_id === user.id;
  const seatsUsed = team ? teamMembers.length + 1 : 0;
  const planLocked = !isAdmin && effectivePlan !== "teams";

  return (
    <>
      <Section
        title="Teams"
        subtitle="Manage teammates who can collaborate across shared workspaces."
      >
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="size-4" />
            </button>
          </div>
        )}
        {notice && (
          <div className="rounded-md border border-border bg-subtle px-3 py-2.5 text-[13px] text-ink">
            {notice}
          </div>
        )}

        {planLocked && !team ? (
          <div className="flex flex-col gap-3 rounded-md border border-border bg-subtle/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[14px] font-medium text-ink">Teams plan required</div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                Upgrade to create a team and invite up to 5 collaborators.
              </div>
            </div>
            <Link
              to="/pricing"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink/90"
            >
              Upgrade to Teams
            </Link>
          </div>
        ) : !team ? (
          <div className="flex flex-col gap-3 rounded-md border border-border bg-subtle/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[14px] font-medium text-ink">No team yet</div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                Create a team to invite collaborators and share workspace access.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void createTeam()}
              disabled={creating}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink/90 disabled:opacity-50"
            >
              {creating && <Loader2 className="size-3.5 animate-spin" />}
              Create team
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-md border border-border bg-subtle/40 p-4 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
                  Team name
                </span>
                <input
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  disabled={!canManage || savingName}
                  className="h-10 rounded-md border border-border bg-card px-3 text-[14px] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/20 disabled:opacity-60"
                  maxLength={80}
                />
              </label>
              {canManage && (
                <button
                  type="button"
                  onClick={() => void saveTeamName()}
                  disabled={savingName || teamName.trim() === team.name}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-4 text-[13px] font-medium text-ink hover:bg-subtle disabled:opacity-50"
                >
                  {savingName ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Pencil className="size-3.5" />
                  )}
                  Save name
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
              <span>{canManage ? "You own this team." : "You are a member of this team."}</span>
              {canManage && (
                <span className="font-mono">
                  Seats: <strong className="text-ink">{seatsUsed}/5</strong>
                </span>
              )}
            </div>

            {canManage && planLocked ? (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-subtle/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[14px] font-medium text-ink">
                    Upgrade to invite teammates
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    Your existing team is still available, but new invitations require the Teams
                    plan.
                  </div>
                </div>
                <Link
                  to="/pricing"
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink/90"
                >
                  Upgrade to Teams
                </Link>
              </div>
            ) : canManage ? (
              <div className="rounded-md border border-border bg-card p-4">
                <div className="mb-3 flex items-start gap-2">
                  <UserPlus className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <h3 className="text-[14px] font-medium text-ink">Invite a teammate</h3>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Team members can be granted access to workspaces from the Workspaces tab.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void inviteMember();
                    }}
                    placeholder="teammate@company.com"
                    className="h-10 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-[14px] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/20"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.target.value as Exclude<TeamRole, "owner">)
                    }
                    className="h-10 rounded-md border border-border bg-card px-3 text-[13px] text-ink outline-none focus:border-ink"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void inviteMember()}
                    disabled={inviting || !inviteEmail.trim() || seatsUsed >= 5}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink/90 disabled:opacity-50"
                  >
                    {inviting && <Loader2 className="size-3.5 animate-spin" />}
                    Invite
                  </button>
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[14px] font-medium text-ink">Members</h3>
                <span className="text-[12px] text-muted-foreground">{seatsUsed}/5 seats</span>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border bg-card">
                <li className="flex items-center justify-between gap-3 px-3 py-3 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{user.email}</div>
                    <div className="text-[11px] font-mono uppercase text-muted-foreground">
                      Owner
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-subtle px-2 py-0.5 text-[11px] font-mono uppercase text-muted-foreground">
                    Owner
                  </span>
                </li>
                {teamMembers.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-3 px-3 py-3 text-[13px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{member.email}</div>
                      <div className="text-[11px] font-mono uppercase text-muted-foreground">
                        {member.accepted_at ? "Active" : "Invited"}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <select
                        value={member.role === "owner" ? "editor" : member.role}
                        onChange={(event) =>
                          void updateMemberRole(
                            member,
                            event.target.value as Exclude<TeamRole, "owner">,
                          )
                        }
                        disabled={updatingMemberId === member.id || removingMemberId === member.id}
                        aria-label={`Role for ${member.email}`}
                        className="h-8 rounded-md border border-border bg-card px-2 text-[12px] text-ink outline-none focus:border-ink disabled:opacity-50"
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(member)}
                        disabled={removingMemberId === member.id}
                        className="text-[12px] text-destructive hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
                {teamMembers.length === 0 && (
                  <li className="px-3 py-5 text-center text-[13px] text-muted-foreground">
                    No teammates have been invited yet.
                  </li>
                )}
              </ul>
            </div>
          </>
        )}

        {!team && memberTeams.length > 0 && (
          <div className="rounded-md border border-border bg-subtle/40 p-4">
            <h3 className="text-[14px] font-medium text-ink">Teams you belong to</h3>
            <ul className="mt-3 space-y-2">
              {memberTeams.map((memberTeam) => (
                <li key={memberTeam.id} className="flex items-center justify-between text-[13px]">
                  <span className="text-ink">{memberTeam.name}</span>
                  <span className="text-[11px] font-mono uppercase text-muted-foreground">
                    Member
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open && !removingMemberId) setRemoveTarget(null);
        }}
        title="Remove team member?"
        description={
          removeTarget
            ? `${removeTarget.email} will lose access granted through this team.`
            : "This member will lose access granted through this team."
        }
        confirmText="Remove member"
        variant="destructive"
        onConfirm={() => {
          if (removeTarget) void removeMember(removeTarget);
        }}
      />
    </>
  );
}
