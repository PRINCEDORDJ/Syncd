import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/SiteNav";
import { Trash2, X, Send } from "lucide-react";

export const Route = createFileRoute("/drafts")({
  head: () => ({
    meta: [
      { title: "Saved posts — SocialSync" },
      { name: "description", content: "Your drafts and published LinkedIn posts." },
    ],
  }),
  component: DraftsGate,
});

type DraftRow = {
  id: string;
  title: string;
  content: string;
  tone: string;
  char_count: number;
  published: boolean;
  updated_at: string;
  images: string[];
};

function DraftsGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: "/drafts" } });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-dvh bg-background text-ink flex items-center justify-center">
        <span className="text-[13px] font-mono text-muted-foreground">Loading…</span>
      </div>
    );
  }

  return <DraftsList />;
}

function DraftsList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "drafts">("all");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DraftRow | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("drafts")
        .select("id, title, content, tone, char_count, published, updated_at, images")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows(
          (data ?? []).map((r) => ({
            ...r,
            images: Array.isArray(r.images) ? (r.images as string[]) : [],
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function remove(id: string) {
    if (!user) return;
    if (!confirm("Delete this post? This cannot be undone.")) return;
    const { error: err } = await supabase
      .from("drafts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
  }

  async function publishDraft(row: DraftRow) {
    if (!user || publishing) return;
    setPublishing(true);
    setPublishMsg(null);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Session expired — please sign in again.");
        return;
      }
      const resp = await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: row.content, images: row.images ?? [] }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.success) {
        setPublishMsg(data.error ?? "Failed to publish.");
        return;
      }
      // Mark draft as published in DB
      await supabase
        .from("drafts")
        .update({ published: true })
        .eq("id", row.id)
        .eq("user_id", user.id);
      setRows((prev) =>
        prev ? prev.map((r) => (r.id === row.id ? { ...r, published: true } : r)) : prev,
      );
      setSelected({ ...row, published: true });
      setPublishMsg("Published to LinkedIn successfully.");
    } finally {
      setPublishing(false);
    }
  }

  const filtered =
    rows?.filter((r) =>
      filter === "all" ? true : filter === "published" ? r.published : !r.published,
    ) ?? null;

  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <SiteNav />
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-2">
              Library
            </p>
            <h1 className="text-2xl md:text-3xl tracking-[-0.02em] font-semibold leading-tight">
              Saved posts
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {(["all", "drafts", "published"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`h-7 px-2.5 rounded text-[12px] font-medium border transition-colors capitalize ${
                  filter === f
                    ? "bg-ink text-surface border-ink"
                    : "bg-card text-ink border-border hover:bg-subtle"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-md bg-destructive/5 border border-destructive/20 text-[13px] text-destructive">
            {error}
          </div>
        )}

        {filtered === null ? (
          <p className="text-[13px] font-mono text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-10 text-center">
            <p className="text-[14px] text-muted-foreground mb-4">
              No posts yet. Generate your first draft in the workspace.
            </p>
            <Link
              to="/app"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90"
            >
              Open workspace →
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="border border-border rounded-xl bg-card p-5 hover:border-ink/30 transition-colors cursor-pointer"
                onClick={() => {
                  setSelected(r);
                  setPublishMsg(null);
                }}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium text-ink text-[15px] truncate">
                      {r.title || "Untitled draft"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-muted-foreground">
                      <span
                        className={`px-1.5 py-0.5 rounded border ${
                          r.published
                            ? "bg-ink text-surface border-ink"
                            : "bg-subtle border-border"
                        }`}
                      >
                        {r.published ? "Published" : "Draft"}
                      </span>
                      <span>{r.tone.split(" ")[0]}</span>
                      <span>·</span>
                      <span>{r.char_count} ch</span>
                      <span>·</span>
                      <span>{new Date(r.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(r.id);
                    }}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <p className="text-[14px] text-ink/80 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                  {r.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-border">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-ink text-[16px] truncate">
                  {selected.title || "Untitled draft"}
                </h2>
                <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-muted-foreground flex-wrap">
                  <span
                    className={`px-1.5 py-0.5 rounded border ${
                      selected.published
                        ? "bg-ink text-surface border-ink"
                        : "bg-subtle border-border"
                    }`}
                  >
                    {selected.published ? "Published" : "Draft"}
                  </span>
                  <span>{selected.tone}</span>
                  <span>·</span>
                  <span>{selected.char_count} ch</span>
                  <span>·</span>
                  <span>{new Date(selected.updated_at).toLocaleString()}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1.5 text-muted-foreground hover:text-ink transition-colors"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
              <p className="text-[14px] sm:text-[15px] text-ink leading-relaxed whitespace-pre-wrap">
                {selected.content}
              </p>
            </div>

            {publishMsg && (
              <div
                className={`mx-5 sm:mx-6 mb-3 px-3 py-2.5 rounded-md text-[13px] border ${
                  publishMsg.includes("success")
                    ? "bg-subtle border-border text-ink"
                    : "bg-destructive/5 border-destructive/20 text-destructive"
                }`}
              >
                {publishMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-4 border-t border-border bg-subtle/40">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="h-9 px-4 rounded-md text-[13px] font-medium border border-border bg-card text-ink hover:bg-subtle transition-colors"
              >
                Close
              </button>
              {!selected.published && (
                <button
                  type="button"
                  onClick={() => publishDraft(selected)}
                  disabled={publishing}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-medium bg-ink text-surface hover:bg-ink/90 disabled:opacity-60 transition-colors"
                >
                  <Send className="size-3.5" />
                  {publishing ? "Publishing…" : "Publish to LinkedIn"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}