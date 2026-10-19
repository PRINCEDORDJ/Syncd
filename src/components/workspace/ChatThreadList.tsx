import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtime";
import { useWorkspace } from "@/lib/workspace-context";
import { MessageSquare, Plus, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface ChatThreadRow {
  thread_id: string;
  draft_id: string | null;
  title: string;
  last_message_preview: string;
  last_message_at: string;
}

interface ChatThreadListProps {
  limit?: number;
  /** Render the "Chats" section header (with a New Chat button). */
  showHeader?: boolean;
  /** Called after opening a thread (e.g. close the sidebar drawer). */
  onSelect?: () => void;
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Browsable history of the user's chat threads in the active workspace,
 * newest first. Personal-only (chat_threads RLS is per-user).
 */
export function ChatThreadList({ limit = 10, showHeader = true, onSelect }: ChatThreadListProps) {
  const { user } = useAuth();
  const { activeWorkspaceId, threadId, openThread, newChat } = useWorkspace();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [threads, setThreads] = useState<ChatThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    if (!user || !activeWorkspaceId) {
      setThreads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("chat_threads")
      .select("thread_id, draft_id, title, last_message_preview, last_message_at")
      .eq("workspace_id", activeWorkspaceId)
      .order("last_message_at", { ascending: false })
      .limit(limit);
    setThreads((data ?? []) as ChatThreadRow[]);
    setLoading(false);
  }, [user, activeWorkspaceId, limit]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  // Keep the latest fetch callback in a ref so identity changes don't resubscribe
  const fetchRef = useRef(fetchThreads);
  fetchRef.current = fetchThreads;

  // Realtime subscription scoped to the active workspace
  useEffect(() => {
    if (!activeWorkspaceId) return;
    const ch = createUniqueChannel(`chat-threads-${activeWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_threads",
          filter: `workspace_id=eq.${activeWorkspaceId}`,
        },
        () => void fetchRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeWorkspaceId]);

  const handleOpen = (thread: ChatThreadRow) => {
    void openThread(thread);
    onSelect?.();
    if (pathname !== "/app") void navigate({ to: "/app" });
  };

  const handleNewChat = () => {
    newChat();
    onSelect?.();
    if (pathname !== "/app") void navigate({ to: "/app" });
  };

  const handleDeleteThread = async (thread: ChatThreadRow) => {
    // Optimistically drop the row; the chat_threads DELETE event also keeps
    // every other open client in sync via the realtime subscription.
    setThreads((prev) => prev.filter((t) => t.thread_id !== thread.thread_id));
    const { error } = await supabase
      .from("chat_threads")
      .delete()
      .eq("thread_id", thread.thread_id);
    if (error) {
      console.error("[chat-threads] delete failed", error);
      toast.error("Could not delete this chat. Please try again.");
      void fetchThreads();
      return;
    }
    // chat_messages rows cascade via chat_messages_thread_id_fkey.
    if (thread.thread_id === threadId) {
      newChat();
      if (pathname !== "/app") void navigate({ to: "/app" });
    }
  };

  return (
    <div className="flex flex-col gap-0.5 min-h-0">
      {showHeader && (
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em]">
            Chats
          </span>
          <button
            type="button"
            onClick={handleNewChat}
            title="New chat"
            aria-label="New chat"
            className="h-5 w-5 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
          >
            <Plus className="size-3" />
          </button>
        </div>
      )}

      {loading && showHeader && (
        <div className="space-y-1 px-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 rounded-md bg-subtle animate-pulse" />
          ))}
        </div>
      )}

      {!loading && threads.length === 0 && (
        <p className="px-2 text-[12px] text-muted-foreground italic">
          {showHeader ? "No chats yet." : "No previous chats yet."}
        </p>
      )}

      {threads.map((t) => {
        const isActive = t.thread_id === threadId;
        return (
          <div
            key={t.thread_id}
            className={`w-full flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg transition-colors group/row ${
              isActive
                ? "bg-subtle text-ink"
                : "text-muted-foreground hover:bg-subtle/60 hover:text-ink"
            }`}
          >
            <button
              type="button"
              onClick={() => handleOpen(t)}
              className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
              title={t.title}
            >
              <MessageSquare
                className={`size-3.5 mt-0.5 shrink-0 transition-colors ${isActive ? "text-accent-cyan" : "text-muted-foreground group-hover/row:text-ink"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-tight truncate">{t.title}</p>
                <p className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground mt-0.5">
                  <Clock className="size-2.5" />
                  {relativeTime(t.last_message_at)}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteThread(t)}
              aria-label={`Delete chat ${t.title}`}
              title="Delete chat"
              className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
