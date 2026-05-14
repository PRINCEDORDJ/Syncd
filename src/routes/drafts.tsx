import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/SiteNav";
import {
  Trash2,
  X,
  Send,
  ImagePlus,
  FileText,
  Sheet,
  Presentation,
  File as FileIcon,
} from "lucide-react";
import {
  MAX_IMAGES,
  dataUrlByteSize,
  formatBytes,
  validateImageBatch,
} from "@/lib/image-validation";

type DraftAttachment = {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
};

function attachmentIcon(name: string, type: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return FileText;
  if (lower.endsWith(".csv") || lower.endsWith(".xls") || lower.endsWith(".xlsx"))
    return Sheet;
  if (lower.endsWith(".ppt") || lower.endsWith(".pptx")) return Presentation;
  if (lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".txt"))
    return FileText;
  if (type?.startsWith("text/")) return FileText;
  return FileIcon;
}

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
  attachments: DraftAttachment[];
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
  const [modalImages, setModalImages] = useState<string[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);
  const [savingImages, setSavingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dirty = useMemo(() => {
    if (!selected) return false;
    const a = selected.images ?? [];
    if (a.length !== modalImages.length) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== modalImages[i]) return true;
    return false;
  }, [selected, modalImages]);

  const modalTotalBytes = useMemo(
    () => modalImages.reduce((s, src) => s + dataUrlByteSize(src), 0),
    [modalImages],
  );

  useEffect(() => {
    setModalImages(selected?.images ?? []);
    setModalError(null);
  }, [selected?.id]);

  function closeModal() {
    setSelected(null);
    setModalImages([]);
    setModalError(null);
    setPublishMsg(null);
  }

  async function handleModalFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const existingBytes = modalImages.reduce((s, src) => s + dataUrlByteSize(src), 0);
    const { accepted, errors } = validateImageBatch(
      Array.from(files),
      modalImages.length,
      existingBytes,
    );
    setModalError(errors.length ? errors.join(" ") : null);
    if (!accepted.length) return;
    const dataUrls = await Promise.all(
      accepted.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          }),
      ),
    );
    setModalImages((prev) => [...prev, ...dataUrls].slice(0, MAX_IMAGES));
  }

  function removeModalImage(idx: number) {
    setModalImages((prev) => prev.filter((_, i) => i !== idx));
    setModalError(null);
  }

  async function saveModalImages() {
    if (!user || !selected || savingImages) return;
    setSavingImages(true);
    setModalError(null);
    try {
      const { error: err } = await supabase
        .from("drafts")
        .update({ images: modalImages })
        .eq("id", selected.id)
        .eq("user_id", user.id);
      if (err) {
        setModalError(err.message);
        return;
      }
      setRows((prev) =>
        prev
          ? prev.map((r) => (r.id === selected.id ? { ...r, images: modalImages } : r))
          : prev,
      );
      setSelected({ ...selected, images: modalImages });
    } finally {
      setSavingImages(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("drafts")
        .select(
          "id, title, content, tone, char_count, published, updated_at, images, attachments",
        )
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
            attachments: Array.isArray(r.attachments)
              ? (r.attachments as unknown as DraftAttachment[])
              : [],
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
      const imagesToSend = modalImages.length ? modalImages : row.images ?? [];
      const resp = await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: row.content, images: imagesToSend }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.success) {
        setPublishMsg(data.error ?? "Failed to publish.");
        return;
      }
      // Mark draft as published in DB and persist any pending image edits
      await supabase
        .from("drafts")
        .update({ published: true, images: imagesToSend })
        .eq("id", row.id)
        .eq("user_id", user.id);
      setRows((prev) =>
        prev
          ? prev.map((r) =>
              r.id === row.id ? { ...r, published: true, images: imagesToSend } : r,
            )
          : prev,
      );
      setSelected({ ...row, published: true, images: imagesToSend });
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
      <main className="flex-1 w-full max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <p className="text-[10px] sm:text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-2">
              Library
            </p>
            <h1 className="text-xl sm:text-2xl md:text-3xl tracking-[-0.02em] font-semibold leading-tight">
              Saved posts
            </h1>
          </div>
          <div className="flex items-center gap-1.5 -mx-3 px-3 overflow-x-auto sm:mx-0 sm:px-0 sm:overflow-visible">
            {(["all", "drafts", "published"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`h-7 px-2.5 rounded text-[12px] font-medium border transition-colors capitalize shrink-0 ${
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
                className="border border-border rounded-xl bg-card p-4 sm:p-5 hover:border-ink/30 transition-colors cursor-pointer"
                onClick={() => {
                  setSelected(r);
                  setPublishMsg(null);
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium text-ink text-[15px] truncate">
                      {r.title || "Untitled draft"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-muted-foreground flex-wrap">
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
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeModal}
        >
          <div
            className="bg-card border border-border rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
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
                onClick={closeModal}
                className="p-1.5 text-muted-foreground hover:text-ink transition-colors"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
              <p className="text-[14px] sm:text-[15px] text-ink leading-relaxed whitespace-pre-wrap">
                {selected.content}
              </p>
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                    Images
                  </p>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.12em]">
                    {modalImages.length} / {MAX_IMAGES}
                    {modalImages.length > 0 && ` · ${formatBytes(modalTotalBytes)}`}
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleModalFiles(e.target.files);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
                {modalImages.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {modalImages.map((src, i) => (
                      <div
                        key={i}
                        className="relative aspect-square rounded-md overflow-hidden border border-border bg-card group"
                      >
                        <img
                          src={src}
                          alt={`Attachment ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeModalImage(i)}
                          className="absolute top-1 right-1 size-5 rounded-full bg-ink/80 text-surface flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove image"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={modalImages.length >= MAX_IMAGES}
                  className="w-full h-9 rounded-md border border-dashed border-border text-[12px] font-medium text-muted-foreground hover:text-ink hover:border-ink/40 hover:bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <ImagePlus className="size-3.5" />
                  {modalImages.length === 0 ? "Add images to post" : "Add more"}
                </button>
                {modalError && (
                  <div className="px-3 py-2.5 rounded-md bg-destructive/5 border border-destructive/20 text-[13px] text-destructive">
                    {modalError}
                  </div>
                )}
              </div>
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

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-subtle/40">
              <button
                type="button"
                onClick={closeModal}
                className="h-9 px-4 rounded-md text-[13px] font-medium border border-border bg-card text-ink hover:bg-subtle transition-colors w-full sm:w-auto"
              >
                Close
              </button>
              {dirty && (
                <button
                  type="button"
                  onClick={saveModalImages}
                  disabled={savingImages}
                  className="h-9 px-4 rounded-md text-[13px] font-medium border border-border bg-card text-ink hover:bg-subtle transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                >
                  <span className="size-1.5 rounded-full bg-ink" />
                  {savingImages ? "Saving…" : "Save changes"}
                </button>
              )}
              {!selected.published && (
                <button
                  type="button"
                  onClick={() => publishDraft(selected)}
                  disabled={publishing}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-medium bg-ink text-surface hover:bg-ink/90 disabled:opacity-60 transition-colors w-full sm:w-auto"
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