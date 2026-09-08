import { supabase } from "@/integrations/supabase/client";

export type OnboardingStatus = "pending" | "complete" | "unknown";

export interface PostSignupContext {
  onboarding_status: OnboardingStatus;
  workspace_count: number;
  project_count: number;
}

export interface CreateWorkspaceOnboardingInput {
  workspaceName: string;
  projectName: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummary {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function loadPostSignupContext() {
  const { data, error } = await supabase.rpc("get_post_signup_context");
  if (error) throw error;
  return (data ?? null) as PostSignupContext | null;
}

export async function completeUserOnboarding() {
  const { error } = await supabase.rpc("complete_user_onboarding");
  if (error) throw error;
}

export async function createWorkspaceWithStarterProject(
  userId: string,
  input: CreateWorkspaceOnboardingInput,
) {
  const workspaceName = input.workspaceName.trim();
  const projectName = input.projectName.trim();

  if (!workspaceName) {
    throw new Error("Workspace name is required.");
  }
  if (!projectName) {
    throw new Error("Project name is required.");
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({
      name: workspaceName,
      owner_id: userId,
    })
    .select("id, name, owner_id, created_at, updated_at")
    .single();

  if (workspaceError) throw workspaceError;

  const { error: memberError } = await supabase.from("workspace_members").insert({
    workspace_id: workspace.id,
    user_id: userId,
    role: "owner",
    status: "active",
  });

  if (memberError) throw memberError;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      workspace_id: workspace.id,
      name: projectName,
      status: "active",
      created_by: userId,
    })
    .select("id, workspace_id, name, status, created_by, created_at, updated_at")
    .single();

  if (projectError) throw projectError;

  const { error: projectMemberError } = await supabase.from("project_members").insert({
    project_id: project.id,
    user_id: userId,
    role: "owner",
    status: "active",
  });

  if (projectMemberError) throw projectMemberError;

  return {
    workspace: workspace as WorkspaceSummary,
    project: project as ProjectSummary,
  };
}
