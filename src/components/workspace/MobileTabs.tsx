import { useRef, type ReactNode } from "react";
import { PenLine, MessagesSquare } from "lucide-react";

export type WorkspaceTab = "canvas" | "chat";

interface MobileTabsProps {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  canvas: ReactNode;
  chat: ReactNode;
}

/**
 * Mobile-only Canvas / Chat switcher. Tappable tabs plus horizontal swipe
 * gestures on the content area. Desktop layouts never render this component.
 */
export function MobileTabs({ active, onChange, canvas, chat }: MobileTabsProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Horizontal swipe past the threshold (and dominant over vertical scroll)
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
    onChange(dx < 0 ? "chat" : "canvas");
  }

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      {/* Tab buttons */}
      <div
        className="shrink-0 flex items-center border-b border-border bg-card/40"
        role="tablist"
        aria-label="Workspace tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={active === "canvas"}
          onClick={() => onChange("canvas")}
          className={`flex-1 h-10 inline-flex items-center justify-center gap-1.5 transition-colors ${
            active === "canvas"
              ? "text-ink font-medium border-b-2 border-ink"
              : "text-muted-foreground border-b-2 border-transparent hover:text-ink"
          }`}
        >
          <PenLine className={`size-3.5 ${active === "canvas" ? "text-accent-cyan" : ""}`} />
          Canvas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "chat"}
          onClick={() => onChange("chat")}
          className={`flex-1 h-10 inline-flex items-center justify-center gap-1.5 transition-colors ${
            active === "chat"
              ? "text-ink font-medium border-b-2 border-ink"
              : "text-muted-foreground border-b-2 border-transparent hover:text-ink"
          }`}
        >
          <MessagesSquare className={`size-3.5 ${active === "chat" ? "text-accent-cyan" : ""}`} />
          Chat
        </button>
      </div>

      {/* Swipeable content */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {active === "canvas" ? canvas : chat}
      </div>
    </div>
  );
}
