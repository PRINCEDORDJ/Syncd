import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { NavigateFn } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Section, Field } from "./ui-primitives";

export function DangerSettingsPanel({
  user,
  signOut,
  navigate,
}: {
  user: User;
  signOut: () => Promise<void>;
  navigate: NavigateFn;
}) {
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  async function deleteAccount() {
    if (confirmDelete !== "DELETE") return;
    setDeleting(true);
    // Best-effort cleanup of user-owned rows; auth user removal requires admin —
    // we sign out and the data stays orphaned-but-protected by RLS.
    await supabase.from("drafts").delete().eq("user_id", user.id);
    await supabase.from("linkedin_connections").delete().eq("user_id", user.id);
    await supabase.from("profiles").delete().eq("user_id", user.id);
    await signOut();
    navigate({ to: "/" });
  }

  return (
    <>
      <Section
        title="Danger zone"
        subtitle="Permanent actions. Type DELETE to confirm."
        tone="danger"
      >
        <Field label="Confirm">
          <input
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            placeholder="DELETE"
            className="h-10 w-full px-3 rounded-md border border-destructive/30 bg-card text-[14px] focus:outline-none focus:ring-2 focus:ring-destructive/30"
          />
        </Field>
        <button
          type="button"
          onClick={() => setConfirmWipe(true)}
          disabled={deleting || confirmDelete !== "DELETE"}
          className="h-9 px-4 rounded-md bg-destructive text-destructive-foreground text-[13px] font-medium hover:bg-destructive/90 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete all my data"}
        </button>
        <p className="text-[12px] text-muted-foreground">
          Removes drafts, profile, and LinkedIn token. Your auth account stays — contact support
          to fully erase it.
        </p>
      </Section>

      <ConfirmDialog
        open={confirmWipe}
        onOpenChange={setConfirmWipe}
        title="Delete all your data?"
        description="This permanently removes your drafts, profile, and LinkedIn connection. This cannot be undone."
        confirmText="Delete everything"
        variant="destructive"
        onConfirm={() => {
          setConfirmWipe(false);
          void deleteAccount();
        }}
      />
    </>
  );
}
