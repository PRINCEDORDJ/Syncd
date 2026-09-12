import { supabase } from "@/integrations/supabase/client";
import { PLAN_LIMITS, PLAN_LABELS, type PlanTier, type PlanLimits } from "@/lib/plans";
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
    supabase.from("subscriptions").select("plan").eq("user_id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ] as const);

  const isAdmin = !!rolesRes.data?.some((r) => r.role === "admin");
  const plan: PlanTier = (subRes.data?.plan as PlanTier) || "trial";
  const limits = isAdmin ? PLAN_LIMITS.teams : PLAN_LIMITS[plan];

  return { plan, limits, isAdmin };
}

/**
 * Fetches all accessible workspaces for a user, including direct ownership,
 * workspace membership, and workspace-level team access grants.
 */
export async function fetchUserWorkspaces(userId: string): Promise<Workspace[]> {
  const { data: viewData, error: viewErr } = await supabase
    .from("my_workspaces")
    .select("id, name, owner_id, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (!viewErr && viewData && viewData.length > 0) {
    return viewData.map((w) => ({
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
export async function createWorkspace(
  userId: string,
  name: string,
): Promise<Workspace> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required.");

  const { plan, limits, isAdmin } = await getUserPlanAndLimits(userId);

  const { count, error: countErr } = await supabase
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);

  if (countErr) throw countErr;

  if (!isAdmin && count !== null && count >= limits.maxWorkspaces) {
    throw new Error(
      `You have reached the limit of ${limits.maxWorkspaces} workspace${
        limits.maxWorkspaces === 1 ? "" : "s"
      } on the ${PLAN_LABELS[plan]} plan. Upgrade to ${
        plan === "trial" ? "Studio or Teams" : "Teams"
      } in Settings → Billing to create more workspaces.`,
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
export async function updateWorkspace(
  workspaceId: string,
  name: string,
): Promise<void> {
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

export async function inviteToWorkspace(
  workspaceId: string,
  email: string,
  role: WorkspaceRole = "member",
): Promise<WorkspaceInvite> {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();

  const ownerId = ws?.owner_id || "";
  const { plan, limits, isAdmin } = await getUserPlanAndLimits(ownerId);

  if (!isAdmin && limits.maxWorkspaceMembers <= 1) {
    throw new Error(
      `Inviting workspace collaborators requires the Teams plan. Upgrade in Settings → Billing to invite up to 5 team members with role controls.`,
    );
  }

  const { count: memCount } = await supabase
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  if (!isAdmin && memCount !== null && memCount >= limits.maxWorkspaceMembers) {
    throw new Error(
      `Workspace member limit reached (${limits.maxWorkspaceMembers} seats on the ${PLAN_LABELS[plan]} plan).`,
    );
  }

  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email: cleanEmail,
      role,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    role: data.role as WorkspaceRole,
    status: data.status as InviteStatus,
  };
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
  const { error } = await supabase.from("workspace_invites").delete().eq("id", inviteId);
  if (error) throw error;
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
