import { supabase } from "@/integrations/supabase/client";
import { PLAN_LIMITS, type PlanTier, type PlanLimits } from "@/lib/plans";
import type { AttachmentItem } from "@/lib/image-validation";

export type WorkspaceRole = "owner" | "admin" | "member";
export type GrantStatus = "active" | "inactive" | "revoked";
export type InviteStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: GrantStatus;
  created_at: string;
  email?: string | null;
  display_name?: string | null;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string | null;
  role: WorkspaceRole;
  status: InviteStatus;
  expires_at: string | null;
  created_at: string;
  invited_by?: string | null;
  team_id?: string | null;
  updated_at?: string;
}

export interface WorkspaceTeamAccess {
  id: string;
  workspace_id: string;
  team_id: string;
  access_level: WorkspaceRole;
  role?: WorkspaceRole;
  granted_by?: string | null;
  invited_by?: string | null;
  status?: GrantStatus;
  created_at: string;
  team_name?: string;
}

export interface AccessibleWorkspace extends Workspace {
  current_user_role?: WorkspaceRole | null;
  is_direct_owner: boolean;
}

export interface TeamOption {
  id: string;
  name: string;
  owner_id: string;
}

export interface DraftRow {
  id: string;
  title: string;
  content: string;
  tone: string;
  updated_at: string;
  images: string[];
  attachments: AttachmentItem[];
  raw_input: string;
  workspace_id: string;
}

/**
 * Returns the effective plan tier and limits for a user.
 */
export async function getUserPlanAndLimits(userId: string): Promise<{
  plan: PlanTier;
  limits: PlanLimits;
  isAdmin: boolean;
}> {
  const [subRes, rolesRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, trial_end")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ] as const);

  const isAdmin = !!rolesRes.data?.some((r) => r.role === "admin");
  const sub = subRes.data;

  let effectivePlan: PlanTier = "trial";
  if (isAdmin) {
    effectivePlan = "teams";
  } else if (sub) {
    const isStatusActive =
      sub.status === "active" ||
      (sub.status === "trialing" && (!sub.trial_end || new Date(sub.trial_end) > new Date()));
    const notExpired = !sub.current_period_end || new Date(sub.current_period_end) > new Date();
    if (isStatusActive && notExpired) {
      effectivePlan = (sub.plan as PlanTier) || "trial";
    }
  }

  const limits = isAdmin ? PLAN_LIMITS.teams : PLAN_LIMITS[effectivePlan];
  return { plan: effectivePlan, limits, isAdmin };
}

/**
 * Fetches all accessible workspaces for a user, including direct ownership,
 * workspace membership, and workspace-level team access grants.
 */
export async function fetchUserWorkspaces(userId: string): Promise<Workspace[]> {
  const { data: viewData, error: viewErr } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("my_workspaces" as any)
    .select("id, name, owner_id, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (!viewErr && viewData && viewData.length > 0) {
    return (
      viewData as unknown as {
        id: string;
        name: string;
        owner_id: string;
        created_at: string;
        updated_at: string;
      }[]
    ).map((w) => ({
      id: w.id ?? "",
      name: w.name ?? "",
      owner_id: w.owner_id ?? userId,
      created_at: w.created_at ?? new Date().toISOString(),
      updated_at: w.updated_at ?? new Date().toISOString(),
    }));
  }

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active");

  const memberWorkspaceIds = memberRows?.map((m) => m.workspace_id) ?? [];

  const { data: ownedWorkspaces } = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_id", userId);

  const { data: userTeams } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);

  const teamIds = userTeams?.map((t) => t.team_id) ?? [];
  let teamWorkspaceIds: string[] = [];

  if (teamIds.length > 0) {
    const { data: teamAccessRows } = await supabase
      .from("workspace_team_access")
      .select("workspace_id")
      .in("team_id", teamIds);
    teamWorkspaceIds = teamAccessRows?.map((t) => t.workspace_id) ?? [];
  }

  const allWorkspaceIds = Array.from(
    new Set([
      ...memberWorkspaceIds,
      ...(ownedWorkspaces?.map((w) => w.id) ?? []),
      ...teamWorkspaceIds,
    ]),
  );

  if (allWorkspaceIds.length === 0) {
    return ownedWorkspaces ?? [];
  }

  const { data: workspaces, error: wsErr } = await supabase
    .from("workspaces")
    .select("*")
    .in("id", allWorkspaceIds)
    .order("created_at", { ascending: false });

  if (wsErr) throw wsErr;
  return workspaces ?? [];
}

/**
 * Cheap existence check: does the user own a workspace or hold an active
 * direct membership in one? Used as a fallback when the onboarding summary
 * (get_post_signup_context) is unavailable. Note it does not cover team-grant
 * access; callers use this only when the authoritative count is unknown.
 */
export async function hasAnyWorkspaceAccess(userId: string): Promise<boolean> {
  const [owned, membership] = await Promise.all([
    supabase.from("workspaces").select("id").eq("owner_id", userId).limit(1),
    supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1),
  ]);

  return Boolean(owned.data?.length || membership.data?.length);
}

/**
 * High-level loader: Returns all workspaces with the current user's role info.
 */
export async function fetchAccessibleWorkspaces(userId: string): Promise<AccessibleWorkspace[]> {
  const workspaces = await fetchUserWorkspaces(userId);
  if (workspaces.length === 0) return [];

  const results: AccessibleWorkspace[] = await Promise.all(
    workspaces.map(async (ws) => {
      const is_direct_owner = ws.owner_id === userId;
      let current_user_role: WorkspaceRole | null = is_direct_owner ? "owner" : null;

      if (!current_user_role) {
        const { data: mem } = await supabase
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", ws.id)
          .eq("user_id", userId)
          .maybeSingle();
        current_user_role = (mem?.role as WorkspaceRole) ?? null;
      }

      return {
        ...ws,
        is_direct_owner,
        current_user_role,
      };
    }),
  );

  return results;
}

/**
 * Creates a new workspace and registers the creator as owner.
 * Enforces plan limits on maxWorkspaces.
 */
export async function createWorkspace(userId: string, name: string): Promise<Workspace> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required.");

  const { plan, limits, isAdmin } = await getUserPlanAndLimits(userId);

  const { count, error: countErr } = await supabase
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);

  if (countErr) throw countErr;

  if (!isAdmin && count !== null && count >= 1) {
    throw new Error(
      "Each account includes one dedicated workspace. To collaborate with teammates, invite them into your workspace under Teams.",
    );
  }

  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .insert({
      name: trimmed,
      owner_id: userId,
    })
    .select()
    .single();

  if (wsErr) throw wsErr;

  const { error: memErr } = await supabase.from("workspace_members").insert({
    workspace_id: ws.id,
    user_id: userId,
    role: "owner",
    status: "active",
  });

  if (memErr) throw memErr;
  return ws;
}

/**
 * Updates a workspace name.
 */
export async function updateWorkspace(workspaceId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name cannot be empty.");

  const { error } = await supabase
    .from("workspaces")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);

  if (error) throw error;
}

/**
 * Deletes a workspace and cascaded references.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId);
  if (error) throw error;
}

/**
 * Workspace membership & invites
 */
export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, status, created_at")
    .eq("workspace_id", workspaceId);

  if (error) throw error;
  if (!data) return [];

  const userIds = data.map((d) => d.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p.display_name]) ?? []);

  return data.map((m) => ({
    ...m,
    role: m.role as WorkspaceRole,
    status: m.status as GrantStatus,
    display_name: profileMap.get(m.user_id) ?? null,
  }));
}

export async function fetchWorkspaceInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  const { data, error } = await supabase
    .from("workspace_invites")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((i) => ({
    ...i,
    role: i.role as WorkspaceRole,
    status: i.status as InviteStatus,
  }));
}

export async function fetchWorkspaceTeamAccess(
  workspaceId: string,
): Promise<WorkspaceTeamAccess[]> {
  const { data, error } = await supabase
    .from("workspace_team_access")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const teamIds = data.map((d) => d.team_id);
  const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
  const teamMap = new Map(teams?.map((t) => [t.id, t.name]) ?? []);

  return data.map((d) => ({
    ...d,
    access_level: d.role as WorkspaceRole,
    role: d.role as WorkspaceRole,
    granted_by: d.invited_by ?? null,
    invited_by: d.invited_by ?? null,
    status: d.status as GrantStatus,
    team_name: teamMap.get(d.team_id) ?? "Team",
  }));
}

/**
 * Sends a workspace invite via the server API route (which calls the
 * `create_workspace_invite` RPC and sends the email when the invitee has no
 * account). The response is identical either way.
 */
export async function inviteToWorkspace(
  workspaceId: string,
  email: string,
  role: Exclude<WorkspaceRole, "owner"> = "member",
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not authenticated.");

  const res = await fetch("/api/workspace/invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ workspace_id: workspaceId, email: cleanEmail, role }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    success?: boolean;
  };
  if (!res.ok || !payload.success) {
    throw new Error(payload.error || "Failed to send the invite.");
  }
}

export async function grantTeamWorkspaceAccess(
  workspaceId: string,
  teamId: string,
  accessLevel: WorkspaceRole = "member",
  grantedBy?: string,
): Promise<WorkspaceTeamAccess> {
  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();

  const ownerId = ws?.owner_id || grantedBy || "";
  const { limits, isAdmin } = await getUserPlanAndLimits(ownerId);

  if (!isAdmin && !limits.allowsTeamWorkspaceAccess) {
    throw new Error(
      `Team-level workspace sharing is a Teams plan feature. Upgrade in Settings → Billing to connect your team.`,
    );
  }

  const { data, error } = await supabase
    .from("workspace_team_access")
    .insert({
      workspace_id: workspaceId,
      team_id: teamId,
      role: accessLevel,
      invited_by: grantedBy || null,
      status: "active",
    })
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    access_level: data.role as WorkspaceRole,
    role: data.role as WorkspaceRole,
    granted_by: data.invited_by ?? null,
    invited_by: data.invited_by ?? null,
    status: data.status as GrantStatus,
  };
}

export async function removeWorkspaceMember(memberId: string): Promise<void> {
  const { error } = await supabase.from("workspace_members").delete().eq("id", memberId);
  if (error) throw error;
}

export async function revokeWorkspaceInvite(inviteId: string): Promise<void> {
  const { data, error } = await supabase.rpc("revoke_workspace_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw error;
  if (data && (data as { success?: boolean }).success === false) {
    throw new Error("Could not revoke the invite.");
  }
}

export interface WorkspaceInviteActionResult {
  success: boolean;
  reason?: string;
  workspace_id?: string;
  workspace_name?: string;
  role?: WorkspaceRole;
}

const INVITE_REASON_MESSAGES: Record<string, string> = {
  invite_not_found: "This invite no longer exists.",
  invite_not_pending: "This invite has already been handled.",
  invite_expired: "This invite has expired. Ask for a new one.",
  email_mismatch:
    "This invite was sent to a different email address. Switch accounts to accept it.",
  email_not_verified: "Please verify your email address first.",
  seat_limit_reached: "This workspace is already full.",
  not_authenticated: "Not authenticated.",
};

function inviteErrorMessage(reason?: string): string {
  return (reason && INVITE_REASON_MESSAGES[reason]) || "Something went wrong. Try again.";
}

/**
 * Accepts a workspace invite for the signed-in user. The RPC also sets
 * `profiles.active_workspace_id` to the new workspace.
 */
export async function acceptWorkspaceInvite(
  inviteId: string,
): Promise<WorkspaceInviteActionResult> {
  const { data, error } = await supabase.rpc("accept_workspace_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as unknown as WorkspaceInviteActionResult;
  if (!result.success) throw new Error(inviteErrorMessage(result.reason));
  return result;
}

/** Declines a workspace invite for the signed-in user. */
export async function declineWorkspaceInvite(inviteId: string): Promise<void> {
  const { data, error } = await supabase.rpc("decline_workspace_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw new Error(error.message);
  if (data && (data as { success?: boolean }).success === false) {
    throw new Error(inviteErrorMessage((data as { reason?: string }).reason));
  }
}

/**
 * Links pending invites addressed to the signed-in user's verified email to
 * their account and creates the in-app notification rows. Safe to call on
 * every sign-in — idempotent.
 */
export async function linkPendingInvites(): Promise<number> {
  const { data, error } = await supabase.rpc("link_pending_invites");
  if (error) throw new Error(error.message);
  return (data as { linked?: number } | null)?.linked ?? 0;
}

/** Persists the active workspace choice server-side (profiles.active_workspace_id). */
export async function setActiveWorkspaceServer(workspaceId: string): Promise<void> {
  const { data, error } = await supabase.rpc("set_active_workspace", {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
  if (data && (data as { success?: boolean }).success === false) {
    throw new Error("Could not switch workspace.");
  }
}

export async function revokeWorkspaceTeamAccess(accessId: string): Promise<void> {
  const { error } = await supabase.from("workspace_team_access").delete().eq("id", accessId);
  if (error) throw error;
}

/**
 * Fetches drafts scoped to a specific workspace for the given user.
 */
export async function fetchWorkspaceDrafts(
  workspaceId: string,
  userId: string,
): Promise<DraftRow[]> {
  const { data } = await supabase
    .from("drafts")
    .select("id, title, content, tone, updated_at, images, attachments, raw_input, workspace_id")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(10);

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    tone: r.tone,
    updated_at: r.updated_at,
    images: (r.images as string[] | null) ?? [],
    attachments: (r.attachments as unknown as AttachmentItem[] | null) ?? [],
    raw_input: (r.raw_input as string | null) ?? "",
    workspace_id: r.workspace_id ?? workspaceId,
  }));
}

/**
 * Fetches teams available for the user to grant access to
 */
export async function fetchUserTeams(userId: string): Promise<TeamOption[]> {
  const { data: ownedTeams } = await supabase
    .from("teams")
    .select("id, name, owner_id")
    .eq("owner_id", userId);

  return (ownedTeams ?? []).map((t) => ({
    id: t.id,
    name: t.name ?? "My team",
    owner_id: t.owner_id,
  }));
}

export type TeamMemberRole = "editor" | "viewer";

export interface TeamMembership {
  id: string;
  team_id: string;
  role: TeamMemberRole;
  accepted_at: string | null;
  team_name: string;
}

/**
 * Teams the user belongs to as an accepted member (not owned teams).
 */
export async function fetchUserTeamMemberships(userId: string): Promise<TeamMembership[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("id, team_id, role, accepted_at, teams(name)")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    team_id: row.team_id,
    role: row.role as TeamMemberRole,
    accepted_at: row.accepted_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    team_name: ((row as any).teams?.name as string) ?? "Team",
  }));
}

export interface TeamInvitePreview {
  found: boolean;
  team_id?: string;
  team_name?: string;
  email?: string;
  role?: TeamMemberRole;
  email_matches?: boolean;
  accepted?: boolean;
  expired?: boolean;
}

/**
 * Reads an invite preview by one-time token (requires sign-in; email must match).
 */
export async function getTeamInvite(token: string): Promise<TeamInvitePreview> {
  const { data, error } = await supabase.rpc("get_team_invite", { p_token: token });
  if (error) throw new Error(error.message);
  return (data ?? { found: false }) as unknown as TeamInvitePreview;
}

/**
 * Accepts a team invite for the signed-in user (must match invite email).
 */
export async function acceptTeamInvite(token: string): Promise<void> {
  const { error } = await supabase.rpc("accept_team_invite", { p_token: token });
  if (error) throw new Error(error.message);
}

/**
 * Leaves a team the user was accepted into (deletes own team_members row).
 */
export async function leaveTeam(membershipId: string): Promise<void> {
  const { error } = await supabase.from("team_members").delete().eq("id", membershipId);
  if (error) throw error;
}
