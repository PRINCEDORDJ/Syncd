import { useRef } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { ImagePlus, Paperclip, ArrowUp, Square, MessageSquareText, PenLine } from "lucide-react";
import { MAX_IMAGES, MAX_ATTACHMENTS } from "@/lib/image-validation";
import { useIsGenerationBlocked } from "@/components/CreditBanner";

interface ChatInputBarProps {
  /** Compact = pinned mobile bottom bar; full = inline desktop sidechat */
  variant?: "compact" | "full";
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}

export function ChatInputBar({ variant = "full", value, onChange, onSend }: ChatInputBarProps) {
  const { generating, images, attachments, handleFiles, handleAttachFiles, messages, aiMode, setAiMode } =
    useWorkspace();
  const isBlocked = useIsGenerationBlocked();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);

  const isFirstTurn = messages.length === 0;
  const placeholder =
    aiMode === "assistant"
      ? "Ask anything about writing, strategy, or LinkedIn…"
      : isFirstTurn
        ? "Dump a thought, a voice note transcript, or three messy bullets…"
        : "Refine the draft — make it punchier, cut paragraph 2…";

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!generating && value.trim() && !isBlocked) onSend();
    }
  }

  const canSend = !generating && !!value.trim() && !isBlocked;

  return (
    <div
      className={`flex flex-col gap-0 border border-border rounded-xl bg-card transition-shadow focus-within:shadow-[0_0_0_1px_var(--color-accent-cyan)] ${
        variant === "compact" ? "mx-3 mb-3" : ""
      }`}
    >
      {/* Hidden file inputs */}
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

      {/* Textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={variant === "compact" ? 2 : 3}
        className="resize-none bg-transparent text-[13px] text-ink leading-relaxed px-3.5 pt-3 pb-1 focus:outline-none placeholder:text-muted-foreground/50 min-h-[64px] max-h-[160px]"
        aria-label="Message Syncd"
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={images.length >= MAX_IMAGES}
            title="Add image"
            aria-label="Add image"
            className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-ink hover:bg-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ImagePlus className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => attachInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS}
            title="Attach file"
            aria-label="Attach file"
            className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-ink hover:bg-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Paperclip className="size-3.5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center bg-subtle rounded-lg p-0.5 border border-border/50">
          <button
            type="button"
            onClick={() => setAiMode("assistant")}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              aiMode === "assistant"
                ? "bg-ink text-surface shadow-sm"
                : "text-muted-foreground hover:text-ink"
            }`}
            title="Assistant — chat without updating canvas"
          >
            <MessageSquareText className="size-2.5" />
            Ask
          </button>
          <button
            type="button"
            onClick={() => setAiMode("post-generator")}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              aiMode === "post-generator"
                ? "bg-ink text-surface shadow-sm"
                : "text-muted-foreground hover:text-ink"
            }`}
            title="Post Generator — generate and refine posts on canvas"
          >
            <PenLine className="size-2.5" />
            Post
          </button>
        </div>

        <button
          type="button"
          onClick={generating ? () => {} : onSend}
          disabled={!canSend && !generating}
          aria-label={generating ? "Stop generation" : "Send message"}
          className={`h-7 w-7 inline-flex items-center justify-center rounded-lg transition-colors ${
            generating
              ? "bg-accent-cyan/20 text-accent-cyan"
              : canSend
                ? "bg-ink text-surface hover:bg-ink/90"
                : "bg-subtle text-muted-foreground cursor-not-allowed"
          }`}
        >
          {generating ? (
            <Square className="size-3 fill-current" />
          ) : (
            <ArrowUp className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
