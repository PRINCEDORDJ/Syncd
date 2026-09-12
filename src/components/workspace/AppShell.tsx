import { useEffect, useRef, useState } from "react";
import { useWorkspace, TONES, type Tone } from "@/lib/workspace-context";
import { SidebarShell, SidebarMenuButton } from "@/components/workspace/SidebarShell";
import { Canvas } from "@/components/workspace/Canvas";
import { AiChatPanel } from "@/components/workspace/AiChatPanel";
import { ChatInputBar } from "@/components/workspace/ChatInputBar";
import { MobileTabs, type WorkspaceTab } from "@/components/workspace/MobileTabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check, PanelRightOpen, ImagePlus, Paperclip } from "lucide-react";
import { MAX_IMAGES, MAX_ATTACHMENTS } from "@/lib/image-validation";

const CHAT_COLLAPSED_KEY = "syncd:chat-collapsed";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function persistBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // storage unavailable — non-fatal
  }
}

/**
 * Top-level workspace shell: Sidebar | Canvas | AI Sidechat on desktop (lg+),
 * drawer + swipeable tabs + pinned input on mobile. Manages panel collapse
 * state (persisted to localStorage) and the mobile canvas→chat auto-switch.
 */
export function AppShell() {
  const {
    title,
    setTitle,
    setTitleEdited,
    tone,
    setTone,
    messages,
    sendMessage,
    images,
    attachments,
    handleFiles,
    handleAttachFiles,
    aiMode,
  } = useWorkspace();

  const [chatCollapsed, setChatCollapsed] = useState(() => readBool(CHAT_COLLAPSED_KEY, false));

  // Mobile-only state
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("canvas");
  const [mobileInput, setMobileInput] = useState("");
  const mobileSendTabRef = useRef<WorkspaceTab>("canvas");
  const prevMsgCountRef = useRef(0);
  const mobileImageInputRef = useRef<HTMLInputElement | null>(null);
  const mobileAttachInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    persistBool(CHAT_COLLAPSED_KEY, chatCollapsed);
  }, [chatCollapsed]);

  // Mobile: auto-switch to the Chat tab for conversational assistant replies
  // and always in assistant mode (canvas is never updated). Canvas-update
  // summaries (generate / refine) in post-generator mode keep you on Canvas.
  useEffect(() => {
    const count = messages.length;
    if (count > prevMsgCountRef.current && count > 0) {
      const last = messages[count - 1];
      if (last && last.role === "assistant" && mobileSendTabRef.current === "canvas") {
        // In assistant mode, always switch to chat since canvas is untouched.
        // In post-generator mode, only switch for conversational replies (not canvas updates).
        if (aiMode === "assistant" || !last.isCanvasUpdate) {
          setActiveTab("chat");
        }
      }
    }
    prevMsgCountRef.current = count;
  }, [messages, aiMode]);

  const handleMobileSend = () => {
    if (!mobileInput.trim()) return;
    mobileSendTabRef.current = activeTab;
    const text = mobileInput;
    setMobileInput("");
    void sendMessage(text);
  };

  return (
    <SidebarShell>
      {/* ── Desktop: Canvas | AI Sidechat (sidebar rendered by SidebarShell) ── */}
      <div className="hidden lg:flex h-full min-h-0 w-full">
        <div className="flex-1 min-w-0 min-h-0">
          <Canvas />
        </div>

        {chatCollapsed ? (
          <button
            type="button"
            onClick={() => setChatCollapsed(false)}
            title="Open AI sidechat"
            aria-label="Open AI sidechat"
            className="w-11 self-stretch shrink-0 border-l border-border flex items-center justify-center text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : (
          <div className="w-[380px] shrink-0 min-h-0 border-l border-border">
            <AiChatPanel onToggleCollapse={() => setChatCollapsed(true)} />
          </div>
        )}
      </div>

      {/* ── Mobile: header + tabs + pinned input ────────────────────────────── */}
      <div className="flex lg:hidden flex-col h-full min-h-0 w-full">
        {/* Compact header */}
        <header className="h-12 shrink-0 flex items-center gap-1.5 px-2.5 border-b border-border bg-card/40">
          <SidebarMenuButton />

          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
            placeholder="Untitled draft"
            aria-label="Draft title"
            className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-ink focus:outline-none focus:bg-card focus:rounded px-1 truncate"
          />

          <input
            ref={mobileImageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              if (mobileImageInputRef.current) mobileImageInputRef.current.value = "";
            }}
          />
          <input
            ref={mobileAttachInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.csv,.txt,.xls,.xlsx,.ppt,.pptx"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleAttachFiles(e.target.files);
              if (mobileAttachInputRef.current) mobileAttachInputRef.current.value = "";
            }}
          />

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => mobileImageInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES}
              title={images.length >= MAX_IMAGES ? "Image limit reached" : "Upload images"}
              aria-label="Upload images"
              className="relative size-7 inline-flex items-center justify-center rounded-md border border-border bg-subtle/40 hover:bg-subtle text-ink transition-colors disabled:opacity-40"
            >
              <ImagePlus className="size-3.5" />
              {images.length > 0 && (
                <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-accent-cyan text-surface text-[9px] font-mono font-bold flex items-center justify-center">
                  {images.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => mobileAttachInputRef.current?.click()}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              title={attachments.length >= MAX_ATTACHMENTS ? "Attachment limit reached" : "Attach file"}
              aria-label="Attach file"
              className="relative size-7 inline-flex items-center justify-center rounded-md border border-border bg-subtle/40 hover:bg-subtle text-ink transition-colors disabled:opacity-40"
            >
              <Paperclip className="size-3.5" />
              {attachments.length > 0 && (
                <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-accent-cyan text-surface text-[9px] font-mono font-bold flex items-center justify-center">
                  {attachments.length}
                </span>
              )}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger
                className="h-7 inline-flex items-center gap-1 px-2 rounded-md text-[11px] font-medium text-ink border border-border bg-subtle/40 hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Change tone"
              >
                <span className="truncate max-w-[70px]">{tone.split(" ")[0]}</span>
                <ChevronDown className="size-3 text-muted-foreground shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="w-52">
                <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
                  Tone
                </DropdownMenuLabel>
                {TONES.map((t: Tone) => (
                  <DropdownMenuItem
                    key={t}
                    onClick={() => setTone(t)}
                    className="flex items-center justify-between text-[13px] cursor-pointer"
                  >
                    <span>{t}</span>
                    {tone === t && <Check className="size-3.5 text-ink shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <MobileTabs
          active={activeTab}
          onChange={setActiveTab}
          canvas={<Canvas />}
          chat={<AiChatPanel />}
        />

        {/* Pinned bottom input, shared between both tabs */}
        <div className="shrink-0 border-t border-border bg-card/50">
          <ChatInputBar
            variant="compact"
            value={mobileInput}
            onChange={setMobileInput}
            onSend={handleMobileSend}
          />
        </div>
      </div>
    </SidebarShell>
  );
}
