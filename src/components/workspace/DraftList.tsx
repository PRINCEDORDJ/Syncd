import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtime";
import { useWorkspace } from "@/lib/workspace-context";
import { FileText, Plus, Clock } from "lucide-react";
import type { AttachmentItem } from "@/lib/image-validation";

interface DraftRow {
  id: string;
  title: string;
  content: string;
  tone: string;
  updated_at: string;
  images: string[];
  attachments: AttachmentItem[];
  raw_input: string;
}

interface DraftListProps {
  collapsed?: boolean;
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

export function DraftList({ collapsed = false, onSelect }: DraftListProps) {
  const { user } = useAuth();
  const { draftId, loadDraft, newDraft } = useWorkspace();
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDrafts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("drafts")
      .select("id, title, content, tone, updated_at, images, attachments, raw_input")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(10);
    const rows = (data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      tone: r.tone,
      updated_at: r.updated_at,
      images: (r.images as string[] | null) ?? [],
      attachments: (r.attachments as AttachmentItem[] | null) ?? [],
      raw_input: (r.raw_input as string | null) ?? "",
    }));
    setDrafts(rows);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  // Keep the latest fetch callback in a ref so identity changes don't resubscribe
  const fetchDraftsRef = useRef(fetchDrafts);
  fetchDraftsRef.current = fetchDrafts;

  // Realtime subscription to update list on draft saves.
  // Uses a unique channel topic: reusing `draft-list-${userId}` races with the
  // async removeChannel() cleanup (StrictMode double-mount / dep changes) and
  // throws "cannot add postgres_changes callbacks ... after subscribe()".
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const ch = createUniqueChannel(`draft-list-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drafts", filter: `user_id=eq.${userId}` },
        () => void fetchDraftsRef.current(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => {
          newDraft();
          onSelect?.();
        }}
        title="New draft"
        aria-label="New draft"
        className="w-full flex items-center justify-center h-8 rounded-lg text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
      >
        <Plus className="size-4" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 min-h-0">
      {/* Header row */}
      <div className="flex items-center justify-between px-2 mb-1">
        <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em]">
          Drafts
        </span>
        <button
          type="button"
          onClick={() => {
            newDraft();
            onSelect?.();
          }}
          title="New draft"
          aria-label="New draft"
          className="h-5 w-5 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
        >
          <Plus className="size-3" />
        </button>
      </div>

      {loading && (
        <div className="space-y-1 px-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 rounded-md bg-subtle animate-pulse" />
          ))}
        </div>
      )}

      {!loading && drafts.length === 0 && (
        <p className="px-2 text-[12px] text-muted-foreground italic">No drafts yet.</p>
      )}

      {drafts.map((d) => {
        const isActive = d.id === draftId;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              loadDraft({
                id: d.id,
                content: d.content,
                title: d.title,
                tone: d.tone,
                images: d.images ?? [],
                attachments: (d.attachments as AttachmentItem[]) ?? [],
                raw_input: d.raw_input ?? "",
              });
              onSelect?.();
            }}
            className={`w-full flex items-start gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors group ${
              isActive
                ? "bg-subtle text-ink"
                : "text-muted-foreground hover:bg-subtle/60 hover:text-ink"
            }`}
          >
            <FileText
              className={`size-3.5 mt-0.5 shrink-0 transition-colors ${isActive ? "text-accent-cyan" : "text-muted-foreground group-hover:text-ink"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium leading-tight truncate">
                {d.title || "Untitled draft"}
              </p>
              <p className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground mt-0.5">
                <Clock className="size-2.5" />
                {relativeTime(d.updated_at)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
