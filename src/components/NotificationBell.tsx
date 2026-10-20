import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, type AppNotification } from "@/lib/notifications-context";
import { InviteNotificationCard } from "@/components/notifications/InviteNotificationCard";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function GenericNotificationItem({ notification }: { notification: AppNotification }) {
  const title =
    typeof notification.payload.title === "string"
      ? notification.payload.title
      : "You have a new notification";
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p
        className={cn("text-[13px] text-ink", notification.read_at ? "font-normal" : "font-medium")}
      >
        {title}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {formatTime(notification.created_at)}
      </p>
    </div>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, isLoading } = useNotifications();
  const [open, setOpen] = useState(false);

  const badge = unreadCount > 9 ? "9+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <Bell className="size-4 text-ink" />
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 h-4 items-center justify-center rounded-full bg-ink px-1 text-[9px] font-semibold leading-none text-surface">
            {badge}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-semibold text-ink">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-[11px] text-muted-foreground hover:text-ink transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {isLoading ? (
            <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
              You're all caught up.
            </p>
          ) : (
            <div className="space-y-1.5">
              {notifications.map((n) =>
                n.type === "workspace_invite" ? (
                  <InviteNotificationCard
                    key={n.id}
                    notification={n}
                    compact
                    onDone={() => setOpen(false)}
                  />
                ) : (
                  <GenericNotificationItem key={n.id} notification={n} />
                ),
              )}
            </div>
          )}
        </div>
        <div className="border-t border-border p-1.5">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-1.5 text-center text-[12px] text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
