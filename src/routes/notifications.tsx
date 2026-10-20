import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useNotifications, type AppNotification } from "@/lib/notifications-context";
import { InviteNotificationCard } from "@/components/notifications/InviteNotificationCard";
import { SidebarShell } from "@/components/workspace/SidebarShell";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Syncd" },
      { name: "description", content: "Your Syncd notifications." },
    ],
  }),
  component: NotificationsGate,
});

function NotificationsGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      void navigate({ to: "/login", search: { redirect: "/notifications" } });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-[13px] text-muted-foreground">Loading…</div>
      </div>
    );
  }
  return <NotificationsPage />;
}

function timeGroup(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const t = date.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

function GenericNotificationRow({ notification }: { notification: AppNotification }) {
  const title =
    typeof notification.payload.title === "string" ? notification.payload.title : "Notification";
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className={`text-[13px] text-ink ${notification.read_at ? "font-normal" : "font-medium"}`}>
        {title}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {new Date(notification.created_at).toLocaleString()}
      </p>
    </div>
  );
}

function NotificationsPage() {
  const { notifications, unreadCount, markAllRead, isLoading, refresh } = useNotifications();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Group by day, newest first (provider already returns newest first)
  const groups: { label: string; items: AppNotification[] }[] = [];
  for (const n of notifications) {
    const label = timeGroup(n.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <SidebarShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">Notifications</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                : "You're all caught up."}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[12px] font-medium text-muted-foreground hover:text-ink transition-colors"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13px] text-muted-foreground">
            Loading notifications…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-subtle">
              <Bell className="size-5 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-medium text-ink">You're all caught up.</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Invites and updates will show up here.
            </p>
            <Link
              to="/app"
              className="mt-5 inline-flex h-8 items-center rounded-md bg-ink px-3.5 text-[12px] font-medium text-surface hover:bg-ink/90 transition-colors"
            >
              Open workspace
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <h2 className="mb-2 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {group.label}
                </h2>
                <div className="space-y-2">
                  {group.items.map((n) =>
                    n.type === "workspace_invite" ? (
                      <InviteNotificationCard key={n.id} notification={n} />
                    ) : (
                      <GenericNotificationRow key={n.id} notification={n} />
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SidebarShell>
  );
}
