import { useState, useRef, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { ChatInputBar } from "@/components/workspace/ChatInputBar";
import { CreditBanner } from "@/components/CreditBanner";
import { Markdown } from "@/components/ui/markdown";
import { Sparkles, PanelRightClose, Wand2 } from "lucide-react";

interface AiChatPanelProps {
  onToggleCollapse?: () => void;
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

export function AiChatPanel({ onToggleCollapse }: AiChatPanelProps) {
  const { messages, sendMessage, generating, aiMode } = useWorkspace();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const suggestions = aiMode === "assistant" ? ASSISTANT_SUGGESTIONS : POST_GENERATOR_SUGGESTIONS;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating]);

  const handleSend = () => {
    if (!input.trim() || generating) return;
    const text = input;
    setInput("");
    void sendMessage(text);
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
                  onClick={() => setInput(s)}
                  className="w-full text-left text-[11px] text-muted-foreground hover:text-ink bg-card hover:bg-subtle border border-border/80 px-2.5 py-1.5 rounded-lg transition-colors truncate"
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
                <div key={m.id} className="flex flex-col items-end">
                  <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-ink text-surface text-[13px] leading-relaxed shadow-soft">
                    {m.content}
                  </div>
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

      {/* Input bar (desktop sidechat only — mobile uses the pinned bar) */}
      <div className="hidden lg:flex flex-col gap-2 p-3 bg-card/60 border-t border-border shrink-0">
        <CreditBanner />
        <ChatInputBar variant="full" value={input} onChange={setInput} onSend={handleSend} />
      </div>
    </div>
  );
}
