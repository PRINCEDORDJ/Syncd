import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtime";

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const PAGE_SIZE = 20;

const NotificationsContext = createContext<NotificationsState | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("id, user_id, type, payload, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    setNotifications((data ?? []) as AppNotification[]);
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // One shared realtime channel for the whole app (same pattern as CreditsProvider).
  useEffect(() => {
    if (!user?.id) return;

    const channel = createUniqueChannel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<AppNotification>) => {
          if (payload.eventType === "INSERT" && payload.new) {
            setNotifications((prev) => {
              if (prev.some((n) => n.id === payload.new!.id)) return prev;
              return [payload.new, ...prev].slice(0, PAGE_SIZE);
            });
          } else if (payload.eventType === "UPDATE" && payload.new) {
            setNotifications((prev) =>
              prev.map((n) => (n.id === payload.new!.id ? (payload.new as AppNotification) : n)),
            );
          } else if (payload.eventType === "DELETE" && payload.old?.id) {
            setNotifications((prev) => prev.filter((n) => n.id !== payload.old!.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markRead = useCallback(
    async (id: string) => {
      if (!user) return;
      const nowIso = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: nowIso } : n)),
      );
      await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("id", id)
        .eq("user_id", user.id)
        .is("read_at", null);
    },
    [user?.id],
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })));
    await supabase
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("user_id", user.id)
      .is("read_at", null);
  }, [user?.id]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications],
  );

  const value = useMemo<NotificationsState>(
    () => ({ notifications, unreadCount, isLoading, markRead, markAllRead, refresh }),
    [notifications, unreadCount, isLoading, markRead, markAllRead, refresh],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsState {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
