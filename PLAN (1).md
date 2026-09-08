# Workspace + Project Access

## Summary
Add a workspace layer above teams and put projects underneath it, so access can be granted at the workspace level or narrowed to specific projects the team was invited to. The core rule is: a user can only see projects they belong to through an active workspace membership or an explicit project grant.

## Key Changes
- Introduce a `workspaces` model as the parent container for shared content.
- Add `projects` as workspace-scoped records, each tied to exactly one workspace.
- Expand membership from “team can access everything” to “team can access only the invited workspace or invited project(s).”
- Add a project-access table so invites can grant:
  - full workspace access, or
  - access to one or more specific projects inside that workspace.
- Keep role checks separate from access checks:
  - roles decide who can manage the workspace/project
  - access grants decide what content is visible
- Add frontend flows for:
  - creating a workspace
  - creating a project inside a workspace
  - inviting a team/user to a workspace or project
  - showing only the projects the current member can access

## SQL Shape
- `workspaces`
  - `id`, `name`, `owner_id`, `created_at`, `updated_at`
- `workspace_members`
  - `workspace_id`, `user_id`, `role`, `status`, `created_at`
- `projects`
  - `id`, `workspace_id`, `name`, `status`, `created_by`, `created_at`, `updated_at`
- `project_access`
  - `project_id`, `user_id` or `team_id`, `access_level`, `granted_by`, `created_at`
- `workspace_invites`
  - `workspace_id`, `email`, `role`, `scope_type`, `status`, `expires_at`
- Optional if you want invite-to-project directly:
  - `project_invites`
  - `project_id`, `email`, `access_level`, `status`, `expires_at`

Core query patterns:
- Fetch a user’s accessible workspaces by joining `workspace_members`.
- Fetch accessible projects by joining:
  - `projects.workspace_id -> workspace_members.workspace_id`, and
  - `project_access` for direct grants.
- Insert workspace/project records only when the creator has the right role in that workspace.
- Enforce row-level security so project visibility is blocked unless the membership or access grant exists.

Example access logic:
- a project is visible if the user is an active member of its workspace
- and either:
  - the workspace grants full access, or
  - the project has an explicit access row for that user/team

## Test Plan
- Verify workspace creation, membership, and invite acceptance.
- Verify project creation under the correct workspace.
- Verify users can only list projects they were granted access to.
- Verify a team invited to one project cannot see sibling projects in the same workspace.
- Verify managers/admins can grant and revoke project access.
- Verify expired or revoked invites cannot be used.

## Assumptions
- “Team” is the collaboration group, while “workspace” is the container that holds projects.
- The first version should support either workspace-wide access or project-specific access, but not complex nested subteams.
- If the existing schema already has org/team tables, we should map this model onto them instead of introducing parallel concepts.
