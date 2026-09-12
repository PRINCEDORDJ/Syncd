import { useRef, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useWorkspace, TONES, type Tone } from "@/lib/workspace-context";
import {
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Sheet,
  Presentation,
  File as FileIcon,
  ImagePlus,
  Paperclip,
  CalendarClock,
  Trash2,
} from "lucide-react";
import { formatBytes, MAX_IMAGES, MAX_ATTACHMENTS } from "@/lib/image-validation";
import type { AttachmentItem } from "@/lib/image-validation";
import { supabase } from "@/integrations/supabase/client";
import { SchedulePicker } from "@/components/SchedulePicker";

function attachmentIcon(name: string, type: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return FileText;
  if (lower.endsWith(".csv") || lower.endsWith(".xls") || lower.endsWith(".xlsx")) return Sheet;
  if (lower.endsWith(".ppt") || lower.endsWith(".pptx")) return Presentation;
  if (lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".txt")) return FileText;
  if (type.startsWith("text/")) return FileText;
  return FileIcon;
}

export function Canvas() {
  const {
    draft,
    setDraft,
    title,
    setTitle,
    setTitleEdited,
    titleEdited,
    tone,
    setTone,
    images,
    removeImage,
    handleFiles,
    attachments,
    removeAttachment,
    handleAttachFiles,
    saving,
    generating,
    error,
    setError,
    setSuccess,
    success,
    charCount,
    wordCount,
    overLimit,
    linkedinConnected,
    publishing,
    publish,
    draftId,
  } = useWorkspace();
  
  const navigate = useNavigate();
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  async function handleDelete() {
    if (!draftId) return;
    await supabase.from("drafts").delete().eq("id", draftId);
    navigate({ to: "/drafts" });
  }

  async function handleSchedule(iso: string) {
    if (!draftId) return;
    setScheduling(true);
    const { error: err } = await supabase
        .from("drafts")
        .update({
          scheduled_at: iso,
          schedule_status: "pending",
        })
        .eq("id", draftId);
    if (err) setError(err.message);
    else setSuccess("Post scheduled successfully.");
    setScheduling(false);
    setShowScheduler(false);
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Keep carousel index valid
  useMemo(() => {
    if (carouselIndex >= images.length) setCarouselIndex(Math.max(0, images.length - 1));
  }, [images.length, carouselIndex]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Canvas toolbar: title + tone pills & media upload buttons (mobile header replaces this) */}
      <div className="hidden lg:flex lg:items-center lg:justify-between gap-3 px-5 py-3 border-b border-border shrink-0">
        {/* Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <p className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em] shrink-0">
            Canvas
          </p>
          <span className="text-muted-foreground/40 shrink-0">/</span>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
            placeholder="Untitled draft"
            className="text-[13px] font-medium text-ink bg-transparent border-0 focus:outline-none focus:ring-0 px-1 -mx-1 rounded hover:bg-card focus:bg-card transition-colors min-w-0 flex-1 max-w-[280px]"
            aria-label="Draft title"
          />
          {saving && (
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">Saving…</span>
          )}
        </div>

        {/* Right side: Media Uploads + Tone pills */}
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
          {/* Media upload triggers */}
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <input
              ref={attachInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.csv,.txt,.xls,.xlsx,.ppt,.pptx"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleAttachFiles(e.target.files);
                if (attachInputRef.current) attachInputRef.current.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES}
              title={images.length >= MAX_IMAGES ? "Image limit reached" : "Upload images"}
              aria-label="Upload images"
              className="h-6 px-2 inline-flex items-center gap-1.5 rounded text-[11px] font-medium border border-border bg-card text-ink hover:bg-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ImagePlus className="size-3 text-muted-foreground" />
              <span>Image</span>
              {images.length > 0 && (
                <span className="size-3.5 rounded-full bg-accent-cyan/20 text-accent-cyan text-[9px] font-mono flex items-center justify-center font-bold">
                  {images.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => attachInputRef.current?.click()}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              title={attachments.length >= MAX_ATTACHMENTS ? "Attachment limit reached" : "Attach file"}
              aria-label="Attach file"
              className="h-6 px-2 inline-flex items-center gap-1.5 rounded text-[11px] font-medium border border-border bg-card text-ink hover:bg-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Paperclip className="size-3 text-muted-foreground" />
              <span>File</span>
              {attachments.length > 0 && (
                <span className="size-3.5 rounded-full bg-accent-cyan/20 text-accent-cyan text-[9px] font-mono flex items-center justify-center font-bold">
                  {attachments.length}
                </span>
              )}
            </button>
          </div>

          <div className="h-4 w-px bg-border shrink-0" aria-hidden />

          {/* Tone pills */}
          <div className="flex items-center gap-1.5 shrink-0">
            {draftId && (
              <button
                 type="button"
                 onClick={() => setShowScheduler(!showScheduler)}
                 className="h-6 px-2 rounded text-[11px] font-medium border border-border bg-card text-ink hover:bg-subtle transition-colors"
              >
                 <CalendarClock className="size-3" />
              </button>
            )}
            {draftId && (
              <button
                 type="button"
                 onClick={handleDelete}
                 className="h-6 px-2 rounded text-[11px] font-medium border border-destructive/20 bg-card text-destructive hover:bg-destructive/5 transition-colors"
              >
                 <Trash2 className="size-3" />
              </button>
            )}
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.12em] shrink-0 ml-2">
              Tone
            </span>
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={`h-6 px-2 rounded text-[11px] font-medium border transition-colors shrink-0 ${
                  tone === t
                    ? "bg-ink text-surface border-ink"
                    : "bg-card text-ink border-border hover:bg-subtle"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main editable area */}
      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-0">
        {/* Word / char counter */}
        <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground tabular-nums mb-4 shrink-0">
          <span>{wordCount} words</span>
          <span className={overLimit ? "text-destructive font-semibold" : ""}>
            {charCount} / 3000
          </span>
          {saving && <span className="text-muted-foreground animate-pulse">Saving…</span>}
        </div>

        {/* Empty state prompt when canvas is blank */}
        {!draftId && !draft && !generating && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 ">
            <p className="text-[15px] text-muted-foreground/60 text-center max-w-md leading-relaxed">
              Dump a thought, a voice note transcript, or three messy bullets…
            </p>
            <p className="text-[12px] text-muted-foreground/40 text-center">
              Start typing below, or use the AI chat to generate a post.
            </p>
          </div>
        )}

        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSuccess(null);
          }}
          placeholder={
            generating ? "Generating…" : "Your post will appear here. Edit freely — it's yours."
          }
          className={`w-full resize-none bg-transparent text-ink text-[15px] leading-[1.7] focus:outline-none placeholder:text-muted-foreground/40 flex-1 min-h-[40vh] ${
            generating ? "animate-pulse" : ""
          }`}
        />

        {/* Streaming cursor when generating */}
        {generating && (
          <span className="inline-block w-0.5 h-[1.1em] bg-accent-cyan animate-cursor-blink align-text-bottom ml-0.5 rounded-full" />
        )}

        {/* Image carousel */}
        {images.length > 0 && (
          <div className="mt-5 relative group/carousel">
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
                    className="w-full h-auto max-h-[400px] object-contain"
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

        {/* File attachments */}
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
                  <span className="text-[13px] text-ink truncate flex-1 min-w-0" title={a.name}>
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

        {/* Error / success banners */}
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
      </div>

      {showScheduler && draftId && (
        <div className="px-5 py-4 border-t border-border bg-card">
           <SchedulePicker
             submitting={scheduling}
             onSchedule={handleSchedule}
           />
        </div>
      )}

      {/* Action bar */}
      <div className="shrink-0 px-5 py-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          <span className="px-2 py-0.5 rounded bg-subtle border border-border uppercase tracking-[0.1em]">
            {tone.split(" ")[0]}
          </span>
          {overLimit && <span className="text-destructive font-semibold">Over LinkedIn limit</span>}
        </div>

        <div className="flex items-center gap-2">
          {draftId && (
            <button
               type="button"
               onClick={() => setShowScheduler(!showScheduler)}
               className="h-8 px-3 rounded-md text-[13px] font-medium text-ink border border-border hover:bg-subtle transition-colors"
            >
               <CalendarClock className="size-4" />
            </button>
          )}
          {draftId && (
             <button
                type="button"
                onClick={handleDelete}
                className="h-8 px-3 rounded-md text-[13px] font-medium text-destructive border border-destructive/20 hover:bg-destructive/5 transition-colors"
             >
                <Trash2 className="size-4" />
             </button>
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(draft)}
            disabled={!draft}
            className="h-8 px-3 rounded-md text-[13px] font-medium text-ink border border-border hover:bg-subtle transition-colors disabled:opacity-50"
          >
            Copy
          </button>
          {linkedinConnected ? (
            <button
              type="button"
              onClick={() => void publish()}
              disabled={!draft.trim() || overLimit || publishing}
              className="h-8 px-4 rounded-md text-[13px] font-medium bg-ink text-surface hover:bg-ink/90 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
            >
              {publishing ? "Publishing…" : "Publish"}
              <span aria-hidden className="text-surface/60">
                ↗
              </span>
            </button>
          ) : (
            <Link
              to="/settings"
              search={{
                linkedin_connected: undefined,
                linkedin_error: undefined,
                billing: undefined,
              }}
              className="h-8 px-4 rounded-md text-[13px] font-medium bg-ink text-surface hover:bg-ink/90 inline-flex items-center gap-1.5"
            >
              Connect LinkedIn
              <span aria-hidden className="text-surface/60">
                →
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
