import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/SiteNav";
import { BrandMark } from "@/components/BrandMark";
import type { Json } from "@/integrations/supabase/types";
import {
  ImagePlus,
  Paperclip,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Sheet,
  Presentation,
  File as FileIcon,
  Film,
} from "lucide-react";
import {
  MAX_IMAGES,
  MAX_ATTACHMENTS,
  dataUrlByteSize,
  formatBytes,
  validateImageBatch,
  validateAttachmentBatch,
  validateVideoBatch,
  MAX_VIDEOS,
  type AttachmentItem,
} from "@/lib/image-validation";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Workspace — SocialSync" },
      {
        name: "description",
        content: "Draft, refine, and publish your next LinkedIn post.",
      },
    ],
  }),
  component: WorkspaceGate,
});

function WorkspaceGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: "/app" } });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-dvh bg-background text-ink flex items-center justify-center">
        <span className="text-[13px] font-mono text-muted-foreground">Loading…</span>
      </div>
    );
  }

  return <Workspace />;
}

const TONES = ["Authoritative & Warm", "Conversational", "Contrarian", "Storytelling"] as const;
type Tone = (typeof TONES)[number];

function deriveTitle(content: string): string {
  const cleaned = content
    // strip markdown emphasis / headings / list markers
    .replace(/[#*_`>~]+/g, " ")
    // strip emojis & pictographs
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Untitled draft";
  // Prefer first sentence; fall back to first line
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  let title = firstSentence.trim();
  const MAX = 60;
  if (title.length > MAX) {
    const slice = title.slice(0, MAX);
    const lastSpace = slice.lastIndexOf(" ");
    title = (lastSpace > 30 ? slice.slice(0, lastSpace) : slice).trim() + "…";
  }
  // Strip trailing punctuation for a cleaner title
  title = title.replace(/[.,;:!?\-–—]+$/g, "").trim();
  return title || "Untitled draft";
}

function Workspace() {
  const { user } = useAuth();
  const [tone, setTone] = useState<Tone>("Authoritative & Warm");
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("Untitled draft");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [titleEdited, setTitleEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [linkedinConnected, setLinkedinConnected] = useState<boolean | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileAttachInputRef = useRef<HTMLInputElement | null>(null);
  const fileVideoInputRef = useRef<HTMLInputElement | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const existingBytes = images.reduce((sum, src) => sum + dataUrlByteSize(src), 0);
    const { accepted, errors } = validateImageBatch(
      Array.from(files),
      images.length,
      existingBytes,
    );
    if (errors.length) {
      setError(errors.join(" "));
    } else {
      setError(null);
    }
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
    setImages((prev) => [...prev, ...dataUrls].slice(0, MAX_IMAGES));
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleAttachFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const { accepted, errors } = validateAttachmentBatch(
      Array.from(files),
      attachments.length,
    );
    if (errors.length) setError(errors.join(" "));
    else setError(null);
    if (!accepted.length) return;
    const items = await Promise.all(
      accepted.map(
        (f) =>
          new Promise<AttachmentItem>((resolve, reject) => {
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
    setAttachments((prev) => [...prev, ...items].slice(0, MAX_ATTACHMENTS));
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleVideoFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const { accepted, errors } = validateVideoBatch(Array.from(files), videos.length);
    if (errors.length) setError(errors.join(" "));
    else setError(null);
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
    setVideos((prev) => [...prev, ...dataUrls].slice(0, MAX_VIDEOS));
  }

  function removeVideo(idx: number) {
    setVideos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveDraft(asPublished = false): Promise<string | null> {
    if (!user || !draft.trim()) return null;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        content: draft,
        raw_input: input,
        tone,
        char_count: draft.length,
        title: title.trim() || "Untitled draft",
        images,
        attachments: attachments as unknown as Json,
        videos: videos as unknown as Json,
        media_bytes:
          images.reduce((s, u) => s + dataUrlByteSize(u), 0) +
          videos.reduce((s, u) => s + dataUrlByteSize(u), 0) +
          attachments.reduce(
            (s, a) => s + dataUrlByteSize(a.data as unknown as string),
            0,
          ),
        ...(asPublished ? { published: true } : {}),
      };
      if (draftId) {
        const { error: upErr } = await supabase
          .from("drafts")
          .update(payload)
          .eq("id", draftId)
          .eq("user_id", user.id);
        if (upErr) throw upErr;
        return draftId;
      } else {
        const { data, error: insErr } = await supabase
          .from("drafts")
          .insert(payload)
          .select("id")
          .single();
        if (insErr) throw insErr;
        if (data?.id) setDraftId(data.id);
        return data?.id ?? null;
      }
    } catch (e) {
      console.error("saveDraft failed", e);
      return null;
    } finally {
      setSaving(false);
    }
  }

  const charCount = draft.length;
  const overLimit = charCount > 3000;
  const wordCount = useMemo(
    () => draft.trim().split(/\s+/).filter(Boolean).length,
    [draft],
  );

  // Check LinkedIn connection status
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("linkedin_connections")
        .select("user_id, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const valid = !!data && new Date(data.expires_at).getTime() > Date.now();
      setLinkedinConnected(valid);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Debounced auto-save when draft or title changes (only after generation begins)
  useEffect(() => {
    if (!user || !draft.trim() || generating) return;
    const t = setTimeout(() => {
      saveDraft(false);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, title, images, attachments, videos, user, generating]);

  async function generate() {
    if (!input.trim() || generating) return;
    setError(null);
    setSuccess(null);
    setGenerating(true);
    setDraft("");
    setDraftId(null);
    setTitle("Untitled draft");
    setTitleEdited(false);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ input, tone, images }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const data = await resp.json().catch(() => null);
        throw new Error(data?.error ?? "Generation failed.");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        textBuffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, nl);
          textBuffer = textBuffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const content: string | undefined = parsed.choices?.[0]?.delta?.content;
            if (content) setDraft((prev) => prev + content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  // Auto-derive a clean title from the generated content once streaming ends
  useEffect(() => {
    if (generating) return;
    if (titleEdited) return;
    if (!draft.trim()) return;
    const suggested = deriveTitle(draft);
    if (suggested && suggested !== title) setTitle(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating, draft, titleEdited]);

  async function publish() {
    if (overLimit || !draft.trim() || publishing) return;
    setPublishing(true);
    setError(null);
    setSuccess(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setPublishing(false);
      setError("Session expired — please sign in again.");
      return;
    }

    const resp = await fetch("/api/linkedin/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: draft, images }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
    };
    setPublishing(false);
    if (resp.ok && data.success) {
      setSuccess("Published to LinkedIn successfully.");
      // Mark saved draft as published
      if (user) {
        await saveDraft(true);
      }
    } else {
      setError(data.error ?? "Failed to publish.");
    }
  }

  // Keep carousel index in valid range as images change
  useEffect(() => {
    if (carouselIndex >= images.length) setCarouselIndex(Math.max(0, images.length - 1));
  }, [images.length, carouselIndex]);

  const greeting =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "there";

  function attachmentIcon(name: string, type: string) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".pdf")) return FileText;
    if (lower.endsWith(".csv") || lower.endsWith(".xls") || lower.endsWith(".xlsx"))
      return Sheet;
    if (lower.endsWith(".ppt") || lower.endsWith(".pptx")) return Presentation;
    if (lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".txt"))
      return FileText;
    if (type.startsWith("text/")) return FileText;
    return FileIcon;
  }

  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <SiteNav />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 sm:mb-6">
          <div>
            <p className="text-[10px] sm:text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-1.5 sm:mb-2">
              Workspace
            </p>
            <h1 className="text-xl sm:text-2xl md:text-3xl tracking-[-0.02em] font-semibold leading-tight">
              Welcome back, {greeting}.
            </h1>
          </div>
          <div className="flex items-center gap-3 text-[12px] font-mono">
            {linkedinConnected === null ? (
              <span className="text-muted-foreground">Checking LinkedIn…</span>
            ) : linkedinConnected ? (
              <span className="inline-flex items-center gap-1.5 text-ink">
                <span className="size-1.5 rounded-full bg-ink" />
                LinkedIn connected
              </span>
            ) : (
              <Link
                to="/settings"
                search={{ linkedin_connected: undefined, linkedin_error: undefined, billing: undefined }}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-ink"
              >
                <span className="size-1.5 rounded-full bg-muted-foreground" />
                LinkedIn not connected · connect →
              </Link>
            )}
          </div>
        </div>

        {/* Workspace card */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 px-3 sm:px-5 py-2.5 sm:py-0 sm:h-12 border-b border-border bg-subtle/40">
            <div className="flex items-center gap-2 text-[13px] min-w-0">
              <BrandMark size={20} />
              <span className="text-muted-foreground">/</span>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleEdited(true);
                }}
                placeholder="Untitled draft"
                className="font-medium text-ink bg-transparent border-0 focus:outline-none focus:ring-0 px-1 -mx-1 rounded hover:bg-card focus:bg-card transition-colors min-w-0 flex-1 sm:flex-none sm:max-w-[260px]"
                aria-label="Draft title"
              />
              {saving && (
                <span className="text-[11px] font-mono text-muted-foreground ml-1 shrink-0">
                  Saving…
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.12em] mr-1 sm:mr-2 shrink-0">
                Tone
              </span>
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`h-7 px-2.5 rounded text-[12px] font-medium border transition-colors shrink-0 ${
                    tone === t
                      ? "bg-ink text-surface border-ink"
                      : "bg-card text-ink border-border hover:bg-subtle"
                  }`}
                >
                  {t}
                </button>
              ))}
              <span className="w-px h-5 bg-border mx-1 shrink-0" aria-hidden />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <input
                ref={fileAttachInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.csv,.txt,.xls,.xlsx,.ppt,.pptx"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleAttachFiles(e.target.files);
                  if (fileAttachInputRef.current) fileAttachInputRef.current.value = "";
                }}
              />
              <input
                ref={fileVideoInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                  handleVideoFiles(e.target.files);
                  if (fileVideoInputRef.current) fileVideoInputRef.current.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= MAX_IMAGES}
                title="Add image"
                aria-label="Add image"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-card text-ink hover:bg-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <ImagePlus className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fileAttachInputRef.current?.click()}
                disabled={attachments.length >= MAX_ATTACHMENTS}
                title="Add file"
                aria-label="Add file"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-card text-ink hover:bg-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Paperclip className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fileVideoInputRef.current?.click()}
                disabled={videos.length >= MAX_VIDEOS}
                title="Add video"
                aria-label="Add video"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-card text-ink hover:bg-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Film className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="grid grid-cols-1 md:grid-cols-12">
            {/* Input */}
            <section className="md:col-span-4 border-b md:border-b-0 md:border-r border-border p-4 sm:p-5 flex flex-col gap-4 min-h-[40vh] md:min-h-[60vh] bg-subtle/20">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="raw"
                  className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em]"
                >
                  Raw input
                </label>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {input.length} ch
                </span>
              </div>
              <textarea
                id="raw"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Dump a thought, a voice note transcript, or three messy bullets…"
                className="flex-1 resize-none p-3 bg-card rounded-md text-[14px] text-ink border border-border leading-relaxed focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink min-h-[200px]"
              />

              <button
                type="button"
                onClick={generate}
                disabled={generating || !input.trim()}
                className="h-10 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {generating
                  ? "Generating…"
                  : draft
                    ? "Regenerate"
                    : "Generate draft"}
              </button>
            </section>

            {/* Canvas */}
            <section className="md:col-span-8 p-4 sm:p-6 md:p-8 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                  Canvas
                </p>
                <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground tabular-nums">
                  <span>{wordCount} words</span>
                  <span className={overLimit ? "text-destructive font-semibold" : ""}>
                    {charCount} / 3000
                  </span>
                </div>
              </div>

              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSuccess(null);
                }}
                placeholder="Your generated post will appear here. Edit anything — it's yours."
                className="w-full resize-none bg-transparent text-ink text-[16px] leading-relaxed focus:outline-none placeholder:text-muted-foreground/60 min-h-[40vh]"
              />

              {/* Reddit-style image carousel — full width, horizontal scroll */}
              {images.length > 0 && (
                <div className="mt-4 relative group/carousel">
                  <div
                    ref={carouselRef}
                    className="flex overflow-x-auto snap-x snap-mandatory rounded-lg border border-border bg-subtle/40 no-scrollbar"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      const idx = Math.round(el.scrollLeft / el.clientWidth);
                      if (idx !== carouselIndex) setCarouselIndex(idx);
                    }}
                  >
                    {images.map((src, i) => (
                      <div
                        key={i}
                        className="relative w-full shrink-0 snap-center flex items-center justify-center bg-ink/5"
                      >
                        <img
                          src={src}
                          alt={`Attachment ${i + 1}`}
                          className="w-full h-auto max-h-[480px] object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute top-2 right-2 size-7 rounded-full bg-ink/80 text-surface hover:bg-ink flex items-center justify-center transition-colors"
                          aria-label="Remove image"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Previous image"
                        onClick={() => {
                          const el = carouselRef.current;
                          if (!el) return;
                          el.scrollTo({
                            left: Math.max(0, (carouselIndex - 1) * el.clientWidth),
                            behavior: "smooth",
                          });
                        }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-ink/70 text-surface hover:bg-ink flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Next image"
                        onClick={() => {
                          const el = carouselRef.current;
                          if (!el) return;
                          el.scrollTo({
                            left: Math.min(
                              (images.length - 1) * el.clientWidth,
                              (carouselIndex + 1) * el.clientWidth,
                            ),
                            behavior: "smooth",
                          });
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-ink/70 text-surface hover:bg-ink flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-ink/70 text-surface text-[11px] font-mono tabular-nums">
                        {carouselIndex + 1} / {images.length}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* File attachments — pill list */}
              {attachments.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {attachments.map((a, i) => {
                    const Icon = attachmentIcon(a.name, a.type);
                    return (
                      <div
                        key={`${a.name}-${i}`}
                        className="group/attach flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-muted/40 hover:bg-muted transition-colors"
                      >
                        <Icon className="size-4 text-muted-foreground shrink-0" />
                        <span
                          className="text-[13px] text-ink truncate flex-1 min-w-0"
                          title={a.name}
                        >
                          {a.name}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground tabular-nums shrink-0">
                          {formatBytes(a.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover/attach:opacity-100 shrink-0"
                          aria-label={`Remove ${a.name}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Videos */}
              {videos.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {videos.map((src, i) => (
                    <div
                      key={`video-${i}`}
                      className="relative group/vid rounded-md overflow-hidden border border-border bg-black"
                    >
                      <video
                        src={src}
                        controls
                        playsInline
                        className="w-full max-h-[360px] object-contain bg-black"
                      />
                      <button
                        type="button"
                        onClick={() => removeVideo(i)}
                        className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover/vid:opacity-100 transition-opacity"
                        aria-label="Remove video"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="mt-4 px-3 py-2.5 rounded-md bg-destructive/5 border border-destructive/20 text-[13px] text-destructive">
                  {error}
                </div>
              )}
              {success && (
                <div className="mt-4 px-3 py-2.5 rounded-md bg-subtle border border-border text-[13px] text-ink flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-ink" />
                  {success}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 sm:gap-4 pt-5 mt-5 border-t border-border">
                <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                  <span className="px-2 py-0.5 rounded bg-subtle border border-border uppercase tracking-[0.1em]">
                    {tone.split(" ")[0]}
                  </span>
                  {overLimit && (
                    <span className="text-destructive font-semibold">
                      Over LinkedIn limit
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(draft)}
                    disabled={!draft}
                    className="h-9 px-3 rounded-md text-[13px] font-medium text-ink border border-border hover:bg-subtle transition-colors disabled:opacity-50 flex-1 sm:flex-none"
                  >
                    Copy
                  </button>
                  {linkedinConnected ? (
                    <button
                      type="button"
                      onClick={publish}
                      disabled={!draft.trim() || overLimit || publishing}
                      className="h-9 px-4 rounded-md text-[13px] font-medium bg-ink text-surface hover:bg-ink/90 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                    >
                      {publishing ? "Publishing…" : "Publish to LinkedIn"}
                      <span aria-hidden className="text-surface/60">→</span>
                    </button>
                  ) : (
                    <Link
                      to="/settings"
                      search={{ linkedin_connected: undefined, linkedin_error: undefined, billing: undefined }}
                      className="h-9 px-4 rounded-md text-[13px] font-medium bg-ink text-surface hover:bg-ink/90 inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                    >
                      Connect LinkedIn
                      <span aria-hidden className="text-surface/60">→</span>
                    </Link>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
