import { useState, useRef, useEffect } from "react";
import { useWorkspace, type ChatMessage } from "@/lib/workspace-context";
import { ChatInputBar } from "@/components/workspace/ChatInputBar";
import { ChatThreadList } from "@/components/workspace/ChatThreadList";
import { CreditBanner } from "@/components/CreditBanner";
import { Markdown } from "@/components/ui/markdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sparkles,
  PanelRightClose,
  Wand2,
  Plus,
  History,
  FileText,
  Image as ImageIcon,
  Loader2,
  Download,
  X,
} from "lucide-react";
import { formatBytes } from "@/lib/image-validation";
import type { ChatMessageAttachment } from "@/lib/attachments";

interface AiChatPanelProps {
  onToggleCollapse?: () => void;
  /** Controlled input value — mobile shares the pinned bottom bar's state so
   *  suggestion taps land in the input the user can actually see. */
  input?: string;
  onInputChange?: (value: string) => void;
  /** Called after a suggestion is picked — e.g. focus the pinned mobile input. */
  onRequestInputFocus?: () => void;
}

const POST_GENERATOR_SUGGESTIONS = [
  "Announce our new product feature launch",
  "3 counterintuitive lessons learned this year",
  "Why most teams get remote culture wrong",
];

const ASSISTANT_SUGGESTIONS = [
  "How do I hook readers in the first line?",
  "Brainstorm 5 post ideas about remote work",
  "What's the best posting schedule on LinkedIn?",
];

export function AiChatPanel({
  onToggleCollapse,
  input: externalInput,
  onInputChange,
  onRequestInputFocus,
}: AiChatPanelProps) {
  const {
    messages,
    sendMessage,
    generating,
    aiMode,
    error,
    newChat,
    pendingAttachments,
    attachmentsPreparing,
    getAttachmentDataUrl,
  } = useWorkspace();
  const [internalInput, setInternalInput] = useState("");
  const input = externalInput ?? internalInput;
  const setInput = onInputChange ?? setInternalInput;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState<string | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const suggestions = aiMode === "assistant" ? ASSISTANT_SUGGESTIONS : POST_GENERATOR_SUGGESTIONS;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating]);

  const handleSend = () => {
    if (generating || attachmentsPreparing) return;
    if (!input.trim() && pendingAttachments.length === 0) return;
    const text = input;
    setInput("");
    void sendMessage(text);
  };

  const triggerDownload = (name: string, dataUrl: string) => {
    // Convert to a Blob first: large data URLs can exceed browser URL limits.
    const comma = dataUrl.indexOf(",");
    const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
    const meta = /^data:([^;,]+)?(;base64)?/i.exec(header);
    const mimeType = meta?.[1] || "application/octet-stream";
    const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;

    let blob: Blob;
    if (meta?.[2]) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type: mimeType });
    } else {
      blob = new Blob([decodeURIComponent(payload)], { type: mimeType });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /**
   * Opens/downloads an attachment. Live messages carry the bytes; messages
   * restored from the database fetch them lazily by message + attachment id.
   */
  const openAttachment = async (message: ChatMessage, attachment: ChatMessageAttachment) => {
    setAttachmentNotice(null);
    if (attachment.dataUrl) {
      if (attachment.kind === "image") {
        setImagePreview({ url: attachment.dataUrl, name: attachment.name });
      } else {
        triggerDownload(attachment.name, attachment.dataUrl);
      }
      return;
    }
    if (!attachment.id) {
      setAttachmentNotice("This attachment was saved before file storage was added.");
      return;
    }

    const key = `${message.id}:${attachment.id}`;
    setAttachmentBusy(key);
    try {
      const dataUrl = await getAttachmentDataUrl(message.id, attachment.id);
      if (!dataUrl) {
        setAttachmentNotice(`Could not load "${attachment.name}".`);
        return;
      }
      if (attachment.kind === "image") {
        setImagePreview({ url: dataUrl, name: attachment.name });
      } else {
        triggerDownload(attachment.name, dataUrl);
      }
    } finally {
      setAttachmentBusy(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-subtle/30 border-l border-border">
      {/* Header (desktop sidechat only — mobile uses the app header) */}
      <div className="hidden lg:flex items-center justify-between px-4 h-12 border-b border-border shrink-0 bg-card/50">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-accent-cyan" />
          <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em]">
            AI Sidechat
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Chat history"
                aria-label="Chat history"
                className="p-1 rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
              >
                <History className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={4} className="w-72 max-h-80 overflow-y-auto">
              <div className="px-1">
                <ChatThreadList showHeader={false} onSelect={() => setHistoryOpen(false)} />
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={() => newChat()}
            title="New chat"
            aria-label="New chat"
            className="p-1 rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
          >
            <Plus className="size-4" />
          </button>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse sidechat"
              aria-label="Collapse sidechat"
              className="p-1 rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
            >
              <PanelRightClose className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center p-4">
            <div className="size-9 rounded-xl bg-card border border-border flex items-center justify-center mb-3 shadow-soft">
              <Wand2 className="size-4 text-accent-cyan" />
            </div>
            <p className="text-[13px] font-medium text-ink mb-1">
              {aiMode === "assistant" ? "Ask me anything" : "Start your post"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[240px] mb-4">
              {aiMode === "assistant"
                ? "Ask questions, brainstorm ideas, or get writing advice — your canvas stays untouched."
                : "Dump raw thoughts, bullets, or notes below to stream a LinkedIn draft directly to the Canvas."}
            </p>
            <div className="w-full space-y-1.5 text-left">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 px-1">
                Suggestions
              </span>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setInput(s);
                    onRequestInputFocus?.();
                  }}
                  className="w-full text-left text-[11px] text-muted-foreground hover:text-ink bg-card hover:bg-subtle border border-border/80 px-2.5 py-2 rounded-lg transition-colors truncate min-h-[32px]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex flex-col items-end gap-1">
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="flex max-w-[88%] flex-wrap justify-end gap-1.5">
                      {m.attachments.map((a, i) => {
                        const key = a.id ? `${m.id}:${a.id}` : `${m.id}:${i}`;
                        const busy = attachmentBusy === key;
                        if (a.kind === "image" && a.preview) {
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => void openAttachment(m, a)}
                              title={`Open ${a.name}`}
                              aria-label={`Open ${a.name}`}
                              className="relative overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
                            >
                              <img src={a.preview} alt={a.name} className="size-16 object-cover" />
                              {busy && (
                                <span className="absolute inset-0 grid place-items-center bg-ink/50">
                                  <Loader2 className="size-4 animate-spin text-surface" />
                                </span>
                              )}
                            </button>
                          );
                        }
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => void openAttachment(m, a)}
                            disabled={busy}
                            title={a.kind === "image" ? `Open ${a.name}` : `Download ${a.name}`}
                            aria-label={
                              a.kind === "image" ? `Open ${a.name}` : `Download ${a.name}`
                            }
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-left transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan disabled:opacity-60"
                          >
                            {busy ? (
                              <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
                            ) : a.kind === "image" ? (
                              <ImageIcon className="size-3 shrink-0 text-muted-foreground" />
                            ) : (
                              <FileText className="size-3 shrink-0 text-muted-foreground" />
                            )}
                            <span
                              className="max-w-[140px] truncate text-[10px] text-ink"
                              title={a.name}
                            >
                              {a.name}
                            </span>
                            <span className="text-[9px] tabular-nums text-muted-foreground">
                              {formatBytes(a.size)}
                            </span>
                            {!busy && (
                              <Download className="size-3 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {m.content && (
                    <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-ink text-surface text-[13px] leading-relaxed shadow-soft">
                      {m.content}
                    </div>
                  )}
                </div>
              );
            }

            if (m.isCanvasUpdate) {
              return (
                <div key={m.id} className="flex items-center gap-2 px-1 py-1">
                  <span className="size-1.5 rounded-full bg-accent-cyan shrink-0" />
                  <span className="text-[11px] font-mono text-muted-foreground truncate">
                    {m.content}
                  </span>
                </div>
              );
            }

            return (
              <div key={m.id} className="flex flex-col items-start">
                <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-card border border-border shadow-soft">
                  <Markdown>{m.content}</Markdown>
                  {m.canvasEdited && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/60">
                      <span className="size-1.5 rounded-full bg-accent-cyan shrink-0" />
                      <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-accent-cyan/90">
                        Canvas updated
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {generating && (
          <div className="flex items-center gap-2 px-1 py-2">
            <span className="size-2 rounded-full bg-accent-cyan animate-ping shrink-0" />
            <span className="text-[11px] font-mono text-muted-foreground animate-pulse">
              {aiMode === "assistant" ? "Thinking…" : "Working on canvas…"}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {attachmentNotice && (
        <div className="px-4 pb-1 text-[10px] leading-relaxed text-destructive" role="status">
          {attachmentNotice}
        </div>
      )}

      {/* Input bar (desktop sidechat only — mobile uses the pinned bar) */}
      <div className="hidden lg:flex flex-col gap-2 p-3 bg-card/60 border-t border-border shrink-0">
        {error && (
          <div
            className="px-3 py-2 rounded-md bg-destructive/5 border border-destructive/30 text-[12px] leading-relaxed text-destructive"
            role="status"
          >
            {error}
          </div>
        )}
        <CreditBanner />
        <ChatInputBar variant="full" value={input} onChange={setInput} onSend={handleSend} />
      </div>

      {imagePreview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={imagePreview.name}
          onClick={() => setImagePreview(null)}
        >
          <button
            type="button"
            onClick={() => setImagePreview(null)}
            aria-label="Close image preview"
            className="absolute right-4 top-4 rounded-full bg-surface/10 p-2 text-surface transition-colors hover:bg-surface/20"
          >
            <X className="size-5" />
          </button>
          <img
            src={imagePreview.url}
            alt={imagePreview.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              triggerDownload(imagePreview.name, imagePreview.url);
            }}
            className="absolute bottom-4 inline-flex items-center gap-1.5 rounded-full bg-surface/10 px-3 py-2 text-[11px] text-surface transition-colors hover:bg-surface/20"
          >
            <Download className="size-3.5" />
            Download
          </button>
        </div>
      )}
    </div>
  );
}
