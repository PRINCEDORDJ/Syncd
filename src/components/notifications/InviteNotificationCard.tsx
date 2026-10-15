import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, X, Building2, Loader2 } from "lucide-react";
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
  type WorkspaceInviteActionResult,
} from "@/lib/workspace-access";
import { useNotifications, type AppNotification } from "@/lib/notifications-context";
import { useWorkspace } from "@/lib/workspace-context";
import type { Workspace } from "@/lib/workspace-access";

interface InviteNotificationCardProps {
  notification: AppNotification;
  onDone?: () => void;
  compact?: boolean;
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" ? v : null;
}

/**
 * Renders a workspace_invite notification with Accept / Decline.
 * After Accept: toast, switch to the new workspace, invoke onDone (e.g. close dropdown).
 */
export function InviteNotificationCard({
  notification,
  onDone,
  compact = false,
}: InviteNotificationCardProps) {
  const { markRead } = useNotifications();
  const { setActiveWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [gone, setGone] = useState(false);

  const inviteId = payloadString(notification.payload, "invite_id");
  const workspaceName = payloadString(notification.payload, "workspace_name") ?? "a workspace";
  const invitedByName = payloadString(notification.payload, "invited_by_name") ?? "Someone";
  const isRead = !!notification.read_at;

  if (gone || !inviteId) return null;

  async function handleAccept() {
    setBusy("accept");
    try {
      const result: WorkspaceInviteActionResult = await acceptWorkspaceInvite(inviteId!);
      await markRead(notification.id);
      toast.success(`Joined ${result.workspace_name ?? workspaceName}`);
      if (result.workspace_id) {
        setActiveWorkspace({
          id: result.workspace_id,
          name: result.workspace_name ?? workspaceName,
          owner_id: "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } satisfies Workspace);
      }
      setGone(true);
      onDone?.();
      void navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept the invite.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDecline() {
    setBusy("decline");
    try {
      await declineWorkspaceInvite(inviteId!);
      await markRead(notification.id);
      setGone(true);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not decline the invite.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={`rounded-xl border border-border bg-background p-3 ${compact ? "" : "sm:p-4"}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle">
          <Building2 className="size-4 text-ink" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] text-ink ${isRead ? "font-normal" : "font-medium"}`}>
            <span className="font-semibold">{invitedByName}</span> invited you to join{" "}
            <span className="font-semibold">{workspaceName}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {new Date(notification.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAccept()}
              disabled={busy !== null}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-ink px-2.5 text-[12px] font-medium text-surface hover:bg-ink/90 disabled:opacity-50"
            >
              {busy === "accept" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              Accept
            </button>
            <button
              type="button"
              onClick={() => void handleDecline()}
              disabled={busy !== null}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] font-medium text-muted-foreground hover:text-ink disabled:opacity-50"
            >
              {busy === "decline" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <X className="size-3" />
              )}
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
