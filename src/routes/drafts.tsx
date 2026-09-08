import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { SidebarShell } from "@/components/workspace/SidebarShell";
import {
  Trash2,
  Clock,
  FileText,
  File,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import {
  formatBytes,
  dataUrlByteSize,
  validateImageBatch,
  validateAttachmentBatch,
  MAX_IMAGES,
  MAX_ATTACHMENTS,
} from "@/lib/image-validation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type DraftAttachment = {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
};

function attachmentIcon(name: string, type: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return FileText;
  return File;
}
// Note: Keeping simpler for now and focusing on navigation

export const Route = createFileRoute("/drafts")({
  head: () => ({
    meta: [
      { title: "Saved posts — Syncd" },
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
  scheduled_at: string | null;
  schedule_status: string | null;
};

import { DraftsSkeleton, DraftItemSkeleton } from "@/components/skeletons/DraftsSkeleton";

function DraftsGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: "/drafts" } });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <DraftsSkeleton />;
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
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [modalImages, setModalImages] = useState<string[]>([]);
  const [modalAttachments, setModalAttachments] = useState<DraftAttachment[]>([]);
  const [modalTitle, setModalTitle] = useState("");
  const [modalContent, setModalContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileAttachInputRef = useRef<HTMLInputElement | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { loadDraft } = useWorkspace();
  const navigate = useNavigate();

  function openDraft(r: DraftRow) {
    loadDraft({
      id: r.id,
      content: r.content,
      title: r.title,
      tone: r.tone,
      images: r.images,
      attachments: r.attachments.map((a) => ({
        name: a.name,
        size: a.size,
        type: a.type,
        dataUrl: a.dataUrl || "",
      })),
      raw_input: "",
    });
    navigate({ to: "/app" });
  }

  const dirty = useMemo(() => {
    if (!selected) return false;
    if ((selected.title ?? "") !== modalTitle) return true;
    if ((selected.content ?? "") !== modalContent) return true;
    const a = selected.images ?? [];
    if (a.length !== modalImages.length) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== modalImages[i]) return true;
    
    const b = selected.attachments ?? [];
    if (b.length !== modalAttachments.length) return true;
    for (let i = 0; i < b.length; i++) {
      if (b[i].name !== modalAttachments[i].name) return true;
      if (b[i].size !== modalAttachments[i].size) return true;
      if (b[i].dataUrl !== modalAttachments[i].dataUrl) return true;
    }
    
    return false;
  }, [selected, modalImages, modalAttachments, modalTitle, modalContent]);

  const modalTotalBytes = useMemo(
    () => modalImages.reduce((s, src) => s + dataUrlByteSize(src), 0),
    [modalImages],
  );

  useEffect(() => {
    setModalImages(selected?.images ?? []);
    setModalAttachments(selected?.attachments ?? []);
    setModalTitle(selected?.title ?? "");
    setModalContent(selected?.content ?? "");
    setEditing(false);
    setModalError(null);
  }, [selected?.id]);

  function closeModal() {
    setSelected(null);
    setModalImages([]);
    setModalAttachments([]);
    setModalTitle("");
    setModalContent("");
    setEditing(false);
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
        (f: File) =>
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

  async function handleModalAttachments(files: FileList | null) {
    if (!files || !files.length) return;
    const { accepted, errors } = validateAttachmentBatch(
      Array.from(files),
      modalAttachments.length,
    );
    setModalError(errors.length ? errors.join(" ") : null);
    if (!accepted.length) return;
    const items = await Promise.all(
      accepted.map(
        (f: File) =>
          new Promise<DraftAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                name: f.name,
                size: f.size,
                type: f.type || "application/octet-stream",
                dataUrl: String(reader.result),
              });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          }),
      ),
    );
    setModalAttachments((prev) => [...prev, ...items].slice(0, MAX_ATTACHMENTS));
  }

  function removeModalAttachment(idx: number) {
    setModalAttachments((prev) => prev.filter((_, i) => i !== idx));
    setModalError(null);
  }

  async function saveModalChanges() {
    if (!user || !selected || saving) return;
    setSaving(true);
    setModalError(null);
    try {
      const nextTitle = modalTitle.trim();
      const nextContent = modalContent;
      const nextCharCount = nextContent.length;
      const { error: err } = await supabase
        .from("drafts")
        .update({
          title: nextTitle,
          content: nextContent,
          char_count: nextCharCount,
          images: modalImages,
          attachments: modalAttachments as any,
        })
        .eq("id", selected.id)
        .eq("user_id", user.id);
      if (err) {
        setModalError(err.message);
        return;
      }
      setRows((prev) =>
        prev
          ? prev.map((r) =>
              r.id === selected.id
                ? {
                    ...r,
                    title: nextTitle,
                    content: nextContent,
                    char_count: nextCharCount,
                    images: modalImages,
                    attachments: modalAttachments,
                  }
                : r,
            )
          : prev,
      );
      setSelected({
        ...selected,
        title: nextTitle,
        content: nextContent,
        char_count: nextCharCount,
        images: modalImages,
        attachments: modalAttachments,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("drafts")
        .select(
          "id, title, content, tone, char_count, published, updated_at, images, attachments, scheduled_at, schedule_status",
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
            scheduled_at: (r as { scheduled_at?: string | null }).scheduled_at ?? null,
            schedule_status:
              (r as { schedule_status?: string | null }).schedule_status ?? null,
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
    setDeleteId(id);
  }

  async function handleConfirmDelete() {
    if (!user || !deleteId) return;
    const id = deleteId;
    setDeleteId(null);
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
    if (selected?.id === id) closeModal();
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
      const contentToSend = modalContent || row.content;
      const resp = await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: contentToSend,
          images: imagesToSend,
          attachments: modalAttachments.length ? modalAttachments : row.attachments,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        code?: string;
      };
      if (!resp.ok || !data.success) {
        if (data.code === "LINKEDIN_TOKEN_EXPIRED") {
          setPublishMsg("LinkedIn connection expired. Please reconnect in Settings.");
        } else {
          setPublishMsg(data.error ?? "Failed to publish.");
        }
        return;
      }
      // Mark draft as published in DB and persist any pending image edits
      const attachmentsToSend = modalAttachments.length ? modalAttachments : row.attachments;
      const titleToSend = modalTitle || row.title;
      await supabase
        .from("drafts")
        .update({
          published: true,
          title: titleToSend,
          content: contentToSend,
          char_count: contentToSend.length,
          images: imagesToSend,
          attachments: attachmentsToSend as any,
        })
        .eq("id", row.id)
        .eq("user_id", user.id);
      setRows((prev) =>
        prev
          ? prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    published: true,
                    title: titleToSend,
                    content: contentToSend,
                    char_count: contentToSend.length,
                    images: imagesToSend,
                    attachments: attachmentsToSend,
                  }
                : r,
            )
          : prev,
      );
      setSelected({
        ...row,
        published: true,
        title: titleToSend,
        content: contentToSend,
        char_count: contentToSend.length,
        images: imagesToSend,
        attachments: attachmentsToSend,
      });
      setPublishMsg("Published to LinkedIn successfully.");
    } finally {
      setPublishing(false);
    }
  }

  async function scheduleDraft(row: DraftRow, iso: string) {
    if (!user) return;
    setScheduling(true);
    setPublishMsg(null);
    try {
      const { error: err } = await supabase
        .from("drafts")
        .update({
          scheduled_at: iso,
          schedule_status: "pending",
          title: modalTitle.trim() || row.title,
          content: modalContent,
          char_count: modalContent.length,
          images: modalImages,
          attachments: modalAttachments as unknown as never,
        })
        .eq("id", row.id)
        .eq("user_id", user.id);
      if (err) {
        setPublishMsg(err.message);
        return;
      }
      setRows((prev) =>
        prev
          ? prev.map((r) =>
              r.id === row.id
                ? { ...r, scheduled_at: iso, schedule_status: "pending" }
                : r,
            )
          : prev,
      );
      setShowScheduler(false);
      closeModal();
    } finally {
      setScheduling(false);
    }
  }

  async function cancelSchedule(row: DraftRow) {
    if (!user) return;
    const { error: err } = await supabase
      .from("drafts")
      .update({ scheduled_at: null, schedule_status: "draft" })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (err) {
      setPublishMsg(err.message);
      return;
    }
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.id === row.id
              ? { ...r, scheduled_at: null, schedule_status: "draft" }
              : r,
          )
        : prev,
    );
    if (selected?.id === row.id) {
      setSelected({ ...row, scheduled_at: null, schedule_status: "draft" });
    }
  }

  const filtered =
    rows?.filter((r) =>
      filter === "all" ? true : filter === "published" ? r.published : !r.published,
    ) ?? null;

  return (
    <SidebarShell mobileTitle="Posts / Drafts">
      <div className="h-full min-h-0 w-full overflow-y-auto">
      <main className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
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
          <ul className="space-y-3">
            <DraftItemSkeleton />
            <DraftItemSkeleton />
            <DraftItemSkeleton />
          </ul>
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
                onClick={() => openDraft(r)}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium text-ink text-[15px] truncate">
                      {r.title || "Untitled draft"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-muted-foreground flex-wrap">
                      {r.scheduled_at && r.schedule_status === "pending" ? (
                        <span className="px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          Scheduled
                        </span>
                      ) : (
                        <span
                        className={`px-1.5 py-0.5 rounded border ${
                          r.published
                            ? "bg-ink text-surface border-ink"
                            : "bg-subtle border-border"
                        }`}
                      >
                        {r.published ? "Published" : "Draft"}
                        </span>
                      )}
                      <span>{r.tone.split(" ")[0]}</span>
                      <span>·</span>
                      <span>{r.char_count} ch</span>
                      <span>·</span>
                      <span>
                        {r.scheduled_at && r.schedule_status === "pending"
                          ? new Date(r.scheduled_at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : new Date(r.updated_at).toLocaleDateString()}
                      </span>
                      {r.scheduled_at && r.schedule_status === "pending" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void cancelSchedule(r);
                          }}
                          className="underline hover:text-ink"
                        >
                          Cancel
                        </button>
                      )}
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
                {r.images.length > 0 && (
                  <div className={`mb-3 ${r.images.length === 1 ? "" : "flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1"}`}>
                    {r.images.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`Thumb ${i + 1}`}
                        className={`rounded-lg border border-border object-cover shrink-0 ${
                          r.images.length === 1
                            ? "w-full aspect-video max-h-[240px]"
                            : "h-24 w-auto aspect-square sm:h-32"
                        }`}
                      />
                    ))}
                  </div>
                )}
                {r.attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {r.attachments.map((a, i) => {
                      const Icon = attachmentIcon(a.name, a.type);
                      return (
                        <div
                          key={i}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-subtle text-[11px] font-mono text-ink max-w-[200px]"
                          title={a.name}
                        >
                          <Icon className="size-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{a.name}</span>
                          <span className="text-muted-foreground tabular-nums shrink-0">
                            {formatBytes(a.size)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-[14px] text-ink/80 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                  {r.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete post?"
        description="This will permanently remove this draft from your library. This action cannot be undone."
        onConfirm={handleConfirmDelete}
        confirmText="Delete post"
        variant="destructive"
      />
      </div>
    </SidebarShell>
  );
}

