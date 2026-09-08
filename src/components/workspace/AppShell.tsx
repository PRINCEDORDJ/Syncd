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
import { ChevronDown, Check, PanelRightOpen } from "lucide-react";

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
  const { title, setTitle, setTitleEdited, tone, setTone, messages, sendMessage } = useWorkspace();

  const [chatCollapsed, setChatCollapsed] = useState(() => readBool(CHAT_COLLAPSED_KEY, false));

  // Mobile-only state
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("canvas");
  const [mobileInput, setMobileInput] = useState("");
  const mobileSendTabRef = useRef<WorkspaceTab>("canvas");
  const prevMsgCountRef = useRef(0);

  useEffect(() => {
    persistBool(CHAT_COLLAPSED_KEY, chatCollapsed);
  }, [chatCollapsed]);

  // Mobile: auto-switch to the Chat tab only for conversational assistant
  // replies. Canvas-update summaries (generate / refine) keep you on Canvas.
  useEffect(() => {
    const count = messages.length;
    if (count > prevMsgCountRef.current && count > 0) {
      const last = messages[count - 1];
      if (
        last &&
        last.role === "assistant" &&
        !last.isCanvasUpdate &&
        mobileSendTabRef.current === "canvas"
      ) {
        setActiveTab("chat");
      }
    }
    prevMsgCountRef.current = count;
  }, [messages]);

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
        <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-card/40">
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
            className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-ink focus:outline-none focus:bg-card focus:rounded px-1"
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="h-8 inline-flex items-center gap-1 px-2 rounded-md text-[11px] font-medium text-ink border border-border bg-subtle/40 hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
              aria-label="Change tone"
            >
              {tone.split(" ")[0]}
              <ChevronDown className="size-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-52">
              <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
                Tone
              </DropdownMenuLabel>
              {TONES.map((t: Tone) => (
                <DropdownMenuItem
                  key={t}
                  onClick={() => setTone(t)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  {t === tone && <Check className="size-3.5 text-ink shrink-0" />}
                  <span className="flex-1 truncate text-[13px]">{t}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
