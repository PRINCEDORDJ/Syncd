import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether the user can create/edit/publish drafts inside a workspace.
 * Mirrors the has_workspace_edit_access() SQL helper used by drafts RLS,
 * so client affordances stay consistent with server-side enforcement.
 *
 * Optimistic default: true (non-viewers are the common case; viewers flip
 * to false after the quick lookup).
 */
export function useWorkspaceCanEdit(
  workspaceId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  const [canEdit, setCanEdit] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || !userId) {
      setCanEdit(true);
      return;
    }
    setCanEdit(true);
    (async () => {
      const { data } = await supabase.rpc("has_workspace_edit_access", {
        _workspace_id: workspaceId,
        _user_id: userId,
      });
      if (!cancelled) setCanEdit(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, userId]);

  return canEdit;
}
