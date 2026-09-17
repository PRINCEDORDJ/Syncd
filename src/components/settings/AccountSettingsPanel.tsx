import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Section, Field } from "./ui-primitives";

export function AccountSettingsPanel({
  user,
  signOut,
}: {
  user: User;
  signOut: () => Promise<void>;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  async function changePassword() {
    setSavingPassword(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPwMsg(`Failed: ${error.message}`);
    } else {
      setPwMsg("Password updated.");
      setNewPassword("");
    }
  }

  return (
    <>
      <Section title="Account" subtitle="Email, password, and session.">
        <Field label="Email">
          <input
            value={user.email ?? ""}
            readOnly
            className="h-10 w-full px-3 rounded-md border border-border bg-subtle text-[14px] text-muted-foreground"
          />
        </Field>
        <Field label="New password" hint="At least 6 characters.">
          <div className="flex gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 flex-1 px-3 rounded-md border border-border bg-card text-[14px] focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink"
            />
            <button
              type="button"
              onClick={changePassword}
              disabled={savingPassword || newPassword.length < 6}
              className="h-10 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-60"
            >
              {savingPassword ? "Updating…" : "Update"}
            </button>
          </div>
        </Field>
        {pwMsg && <p className="text-[13px] text-muted-foreground">{pwMsg}</p>}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="h-9 px-4 rounded-md border border-border text-[13px] text-ink hover:bg-subtle"
          >
            Sign out
          </button>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out?"
        description="You'll need to sign in again to access your workspace, drafts, and settings."
        confirmText="Sign out"
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut();
        }}
      />
    </>
  );
}
