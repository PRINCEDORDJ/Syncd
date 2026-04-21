import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/SiteNav";
import { Trash2 } from "lucide-react";

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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("drafts")
        .select("id, title, content, tone, char_count, published, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows(data ?? []);
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
                className="border border-border rounded-xl bg-card p-5 hover:border-ink/30 transition-colors"
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
                    onClick={() => remove(r.id)}
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
    </div>
  );
}