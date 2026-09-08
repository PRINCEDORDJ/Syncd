import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/workspace/Sidebar";
import { WorkspaceContext, WorkspaceProvider } from "@/lib/workspace-context";

const SIDEBAR_COLLAPSED_KEY = "syncd:sidebar-collapsed";

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

interface SidebarDrawerApi {
  openDrawer: () => void;
}

const SidebarDrawerContext = createContext<SidebarDrawerApi | null>(null);

/** Access the shell's mobile drawer (e.g. hamburger buttons in page headers). */
export function useSidebarDrawer(): SidebarDrawerApi {
  const ctx = useContext(SidebarDrawerContext);
  if (!ctx) throw new Error("useSidebarDrawer must be used within <SidebarShell>");
  return ctx;
}

/** Hamburger button wired to the shell's mobile slide-over drawer. */
export function SidebarMenuButton({ className = "" }: { className?: string }) {
  const { openDrawer } = useSidebarDrawer();
  return (
    <button
      type="button"
      onClick={openDrawer}
      title="Open menu"
      aria-label="Open menu"
      className={`size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors shrink-0 ${className}`}
    >
      <Menu className="size-4" />
    </button>
  );
}

interface SidebarShellProps {
  children: ReactNode;
  /**
   * When set, renders a compact mobile top bar (hamburger + title) above the
   * content. Omit on routes that render their own mobile header (/app).
   */
  mobileTitle?: string;
}

/**
 * Persistent workspace sidebar shared across all authenticated routes
 * (/app, /drafts, /settings). Desktop (lg+): fixed sidebar + content column.
 * Mobile: full-width content with a slide-over drawer and an optional
 * compact top bar.
 *
 * The sidebar's DraftList requires workspace context. WorkspaceProvider lives
 * at the root so state persists across route changes; the fallback provider
 * here is only a safety net for usage outside it.
 */
export function SidebarShell({ children, mobileTitle }: SidebarShellProps) {
  const [collapsed, setCollapsed] = useState(() => readBool(SIDEBAR_COLLAPSED_KEY, false));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasWorkspace = useContext(WorkspaceContext) !== null;
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const toggleCollapse = () =>
    setCollapsed((v) => {
      persistBool(SIDEBAR_COLLAPSED_KEY, !v);
      return !v;
    });

  // Selecting a draft outside /app opens it in the workspace canvas.
  const handleSelectDraft = () => {
    setDrawerOpen(false);
    if (pathname !== "/app") void navigate({ to: "/app" });
  };

  const shell = (
    <SidebarDrawerContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
      <div className="h-dvh bg-background text-ink flex overflow-hidden">
        {/* Desktop sidebar (hidden on mobile) */}
        <div className="hidden lg:flex h-full min-h-0 shrink-0">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            onSelectDraft={handleSelectDraft}
          />
        </div>

        {/* Content column — children render once, shared by both breakpoints */}
        <div className="flex flex-col flex-1 min-w-0 h-full min-h-0">
          {mobileTitle && (
            <header className="lg:hidden h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-card/40">
              <SidebarMenuButton />
              <span className="text-[13px] font-medium text-ink truncate">{mobileTitle}</span>
            </header>
          )}
          <div className="flex-1 min-h-0 min-w-0">{children}</div>
        </div>

        {/* Mobile drawer (full-height slide-over) */}
        <div
          aria-hidden={!drawerOpen}
          onClick={() => setDrawerOpen(false)}
          className={`fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
            drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Workspace menu"
          aria-hidden={!drawerOpen}
          className={`fixed inset-y-0 left-0 z-50 w-60 max-w-[85vw] bg-sidebar border-r border-border transition-transform duration-300 lg:hidden ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-full overflow-y-auto">
            <Sidebar collapsed={false} onSelectDraft={() => setDrawerOpen(false)} />
          </div>
        </aside>
      </div>
    </SidebarDrawerContext.Provider>
  );

  return hasWorkspace ? shell : <WorkspaceProvider>{shell}</WorkspaceProvider>;
}
