import { supabase } from "@/integrations/supabase/client";
import { PLAN_LIMITS, PLAN_LABELS, type PlanTier, type PlanLimits } from "@/lib/plans";

export type WorkspaceRole = "owner" | "admin" | "member";
export type ProjectAccessLevel = "owner" | "admin" | "editor" | "viewer";
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

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  access_type?: "workspace_wide" | "direct_grant" | "team_grant" | "owner";
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectAccessLevel;
  access_level?: ProjectAccessLevel;
  status: GrantStatus;
  created_at: string;
  email?: string | null;
  display_name?: string | null;
}

export interface ProjectInvite {
  id: string;
  project_id: string;
  email: string | null;
  access_level: ProjectAccessLevel;
  status: InviteStatus;
  expires_at: string | null;
  created_at: string;
  invited_by?: string | null;
  team_id?: string | null;
  updated_at?: string;
}

export interface ProjectTeamAccess {
  id: string;
  project_id: string;
  team_id: string;
  access_level: ProjectAccessLevel;
  granted_by?: string | null;
  invited_by?: string | null;
  status?: GrantStatus;
  created_at: string;
  team_name?: string;
}

export interface AccessibleWorkspace extends Workspace {
  current_user_role?: WorkspaceRole | null;
  is_direct_owner: boolean;
  projects: Project[];
}

export interface TeamOption {
  id: string;
  name: string;
  owner_id: string;
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
  // Try querying my_workspaces view (enforcing security definer access checks)
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

  // 1. Direct workspace memberships & ownership
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active");

  const memberWorkspaceIds = memberRows?.map((m) => m.workspace_id) ?? [];

  // 2. Fetch owned workspaces
  const { data: ownedWorkspaces } = await supabase
    .from("workspaces")
    .select("*")
    .eq("owner_id", userId);

  // 3. If user belongs to teams, fetch workspace_team_access
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
 * Fetches projects for a given workspace that are accessible by the user.
 */
export async function fetchWorkspaceProjects(
  workspaceId: string,
  userId: string,
): Promise<Project[]> {
  // Try querying my_projects view
  const { data: viewProjects, error: viewErr } = await supabase
    .from("my_projects")
    .select("id, workspace_id, name, status, created_by, created_at, updated_at, access_source")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (!viewErr && viewProjects && viewProjects.length > 0) {
    return viewProjects.map((p) => ({
      id: p.id ?? "",
      workspace_id: p.workspace_id ?? workspaceId,
      name: p.name ?? "",
      status: p.status ?? "active",
      created_by: p.created_by ?? userId,
      created_at: p.created_at ?? new Date().toISOString(),
      updated_at: p.updated_at ?? new Date().toISOString(),
      access_type:
        p.access_source === "workspace_member"
          ? (p.created_by === userId ? "owner" : "workspace_wide")
          : p.access_source === "workspace_team"
            ? "team_grant"
            : p.access_source === "project_team"
              ? "team_grant"
              : p.created_by === userId
                ? "owner"
                : "direct_grant",
    }));
  }

  // Check user's workspace role
  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();

  const isOwner = ws?.owner_id === userId;

  const { data: wsMember } = await supabase
    .from("workspace_members")
    .select("role, status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  const hasFullWorkspaceAccess =
    isOwner ||
    wsMember?.role === "owner" ||
    wsMember?.role === "admin" ||
    wsMember?.role === "member";

  // Fetch all projects in workspace
  const { data: allProjects, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (projErr) throw projErr;
  if (!allProjects || allProjects.length === 0) return [];

  if (hasFullWorkspaceAccess) {
    return allProjects.map((p) => ({
      ...p,
      access_type: isOwner || p.created_by === userId ? "owner" : "workspace_wide",
    }));
  }

  // Otherwise, filter by explicit direct project grants or team grants
  const projectIds = allProjects.map((p) => p.id);

  // Direct project members
  const { data: directMembers } = await supabase
    .from("project_members")
    .select("project_id, access_level")
    .in("project_id", projectIds)
    .eq("user_id", userId)
    .eq("status", "active");

  const directMap = new Map((directMembers ?? []).map((m) => [m.project_id, m.access_level]));

  // Team grants
  const { data: userTeams } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);

  const teamIds = userTeams?.map((t) => t.team_id) ?? [];
  const teamGrantSet = new Set<string>();

  if (teamIds.length > 0) {
    const { data: teamGrants } = await supabase
      .from("project_team_access")
      .select("project_id")
      .in("project_id", projectIds)
      .in("team_id", teamIds);

    teamGrants?.forEach((tg) => teamGrantSet.add(tg.project_id));
  }

  // Filter projects
  const accessible = allProjects.filter(
    (p) =>
      p.created_by === userId ||
      directMap.has(p.id) ||
      teamGrantSet.has(p.id),
  );

  return accessible.map((p) => {
    let access_type: Project["access_type"] = "direct_grant";
    if (p.created_by === userId) {
      access_type = "owner";
    } else if (teamGrantSet.has(p.id) && !directMap.has(p.id)) {
      access_type = "team_grant";
    }
    return { ...p, access_type };
  });
}

/**
 * High-level loader: Returns all workspaces with their accessible projects
 */
export async function fetchAccessibleWorkspacesWithProjects(
  userId: string,
): Promise<AccessibleWorkspace[]> {
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

      const projects = await fetchWorkspaceProjects(ws.id, userId);

      return {
        ...ws,
        is_direct_owner,
        current_user_role,
        projects,
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

  // Check owned workspace count
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
 * Creates a project inside a workspace and adds the creator as owner.
 * Enforces plan limits on maxProjectsPerWorkspace.
 */
export async function createProject(
  workspaceId: string,
  userId: string,
  name: string,
  status = "active",
): Promise<Project> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required.");

  // Check workspace owner plan
  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();

  const ownerId = ws?.owner_id || userId;
  const { plan, limits, isAdmin } = await getUserPlanAndLimits(ownerId);

  const { count, error: countErr } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  if (countErr) throw countErr;

  if (!isAdmin && count !== null && count >= limits.maxProjectsPerWorkspace) {
    throw new Error(
      `This workspace has reached the limit of ${limits.maxProjectsPerWorkspace} projects on the ${
        PLAN_LABELS[plan]
      } plan. Upgrade to ${
        plan === "trial" ? "Studio or Teams" : "Teams"
      } in Settings → Billing for higher limits.`,
    );
  }

  const { data: project, error: pErr } = await supabase
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name: trimmed,
      status,
      created_by: userId,
    })
    .select()
    .single();

  if (pErr) throw pErr;

  const { error: memErr } = await supabase.from("project_members").insert({
    project_id: project.id,
    user_id: userId,
    access_level: "owner",
    status: "active",
  });

  if (memErr) throw memErr;
  return project;
}

/**
 * Updates project details (name, status).
 */
export async function updateProject(
  projectId: string,
  updates: { name?: string; status?: string },
): Promise<void> {
  const payload: { updated_at: string; name?: string; status?: string } = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) throw new Error("Project name cannot be empty.");
    payload.name = trimmed;
  }
  if (updates.status !== undefined) {
    payload.status = updates.status;
  }

  const { error } = await supabase
    .from("projects")
    .update(payload)
    .eq("id", projectId);

  if (error) throw error;
}

/**
 * Deletes a project.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
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

  // Check workspace owner plan limits
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
 * Project membership, invites & team grants
 */
export async function fetchProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("id, project_id, user_id, access_level, status, created_at")
    .eq("project_id", projectId);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const userIds = data.map((d) => d.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p.display_name]) ?? []);

  return data.map((m) => ({
    ...m,
    role: m.access_level as ProjectAccessLevel,
    access_level: m.access_level as ProjectAccessLevel,
    status: m.status as GrantStatus,
    display_name: profileMap.get(m.user_id) ?? null,
  }));
}

export async function fetchProjectInvites(projectId: string): Promise<ProjectInvite[]> {
  const { data, error } = await supabase
    .from("project_invites")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((i) => ({
    ...i,
    access_level: i.access_level as ProjectAccessLevel,
    status: i.status as InviteStatus,
  }));
}

export async function fetchProjectTeamAccess(projectId: string): Promise<ProjectTeamAccess[]> {
  const { data, error } = await supabase
    .from("project_team_access")
    .select("*")
    .eq("project_id", projectId);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const teamIds = data.map((d) => d.team_id);
  const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
  const teamMap = new Map(teams?.map((t) => [t.id, t.name]) ?? []);

  return data.map((d) => ({
    ...d,
    access_level: d.access_level as ProjectAccessLevel,
    granted_by: d.invited_by ?? null,
    invited_by: d.invited_by ?? null,
    status: d.status as GrantStatus,
    team_name: teamMap.get(d.team_id) ?? "Team",
  }));
}

export async function inviteToProject(
  projectId: string,
  email: string,
  accessLevel: ProjectAccessLevel = "editor",
): Promise<ProjectInvite> {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  // Check project owner plan limits
  const { data: proj } = await supabase
    .from("projects")
    .select("workspace_id, created_by")
    .eq("id", projectId)
    .single();

  const { limits, isAdmin } = await getUserPlanAndLimits(proj?.created_by || "");

  if (!isAdmin && !limits.allowsProjectAccessGrants) {
    throw new Error(
      `Scoped project collaborator invites are available on Studio and Teams plans. Upgrade in Settings → Billing to unlock.`,
    );
  }

  const { data, error } = await supabase
    .from("project_invites")
    .insert({
      project_id: projectId,
      email: cleanEmail,
      access_level: accessLevel,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    access_level: data.access_level as ProjectAccessLevel,
    status: data.status as InviteStatus,
  };
}

export async function grantTeamProjectAccess(
  projectId: string,
  teamId: string,
  accessLevel: ProjectAccessLevel = "editor",
  grantedBy?: string,
): Promise<ProjectTeamAccess> {
  const { data: proj } = await supabase
    .from("projects")
    .select("workspace_id, created_by")
    .eq("id", projectId)
    .single();

  const { limits, isAdmin } = await getUserPlanAndLimits(proj?.created_by || grantedBy || "");

  if (!isAdmin && !limits.allowsTeamWorkspaceAccess) {
    throw new Error(
      `Team project sharing requires the Teams plan. Upgrade in Settings → Billing to grant team access.`,
    );
  }

  const { data, error } = await supabase
    .from("project_team_access")
    .insert({
      project_id: projectId,
      team_id: teamId,
      access_level: accessLevel,
      invited_by: grantedBy || null,
      status: "active",
    })
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    access_level: data.access_level as ProjectAccessLevel,
    granted_by: data.invited_by ?? null,
    invited_by: data.invited_by ?? null,
    status: data.status as GrantStatus,
  };
}

export async function removeProjectMember(memberId: string): Promise<void> {
  const { error } = await supabase.from("project_members").delete().eq("id", memberId);
  if (error) throw error;
}

export async function revokeProjectInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from("project_invites").delete().eq("id", inviteId);
  if (error) throw error;
}

export async function revokeProjectTeamAccess(accessId: string): Promise<void> {
  const { error } = await supabase.from("project_team_access").delete().eq("id", accessId);
  if (error) throw error;
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
