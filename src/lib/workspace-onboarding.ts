import { supabase } from "@/integrations/supabase/client";

export type OnboardingStatus = "pending" | "complete" | "unknown";

export interface PostSignupContext {
  onboarding_status: OnboardingStatus;
  workspace_count: number;
}

export interface CreateWorkspaceOnboardingInput {
  workspaceName: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  owner_id: string;
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

export async function createWorkspaceOnboarding(
  userId: string,
  input: CreateWorkspaceOnboardingInput,
) {
  const workspaceName = input.workspaceName.trim();

  if (!workspaceName) {
    throw new Error("Workspace name is required.");
  }

  // Enforce single-workspace per account: reuse existing owned workspace if found
  const { data: existingWorkspace } = await supabase
    .from("workspaces")
    .select("id, name, owner_id, created_at, updated_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingWorkspace) {
    return {
      workspace: existingWorkspace as WorkspaceSummary,
    };
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

  return {
    workspace: workspace as WorkspaceSummary,
  };
}
