import { Link, useLocation } from "@tanstack/react-router";
import { BrandMark } from "@/components/BrandMark";
import { DraftList } from "@/components/workspace/DraftList";
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutGrid,
  FileText,
  Settings as SettingsIcon,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  /** Omit to hide the collapse toggle (e.g. full-width mobile drawer). */
  onToggleCollapse?: () => void;
  /** Called when a draft is selected — lets the mobile drawer close itself. */
  onSelectDraft?: () => void;
}

const SETTINGS_SEARCH = {
  linkedin_connected: undefined,
  linkedin_error: undefined,
  billing: undefined,
};

interface NavLink {
  to: "/app" | "/drafts" | "/settings";
  label: string;
  icon: typeof LayoutGrid;
  search?: typeof SETTINGS_SEARCH | undefined;
}

const NAV_LINKS: NavLink[] = [
  { to: "/app", label: "Workspace", icon: LayoutGrid },
  { to: "/drafts", label: "Posts / Drafts", icon: FileText },
  { to: "/settings", label: "Settings", icon: SettingsIcon, search: SETTINGS_SEARCH },
];

export function Sidebar({ collapsed, onToggleCollapse, onSelectDraft }: SidebarProps) {
  const { pathname } = useLocation();

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-60"
      } h-full shrink-0 min-w-0 bg-sidebar text-ink border-r border-border flex flex-col`}
    >
      {/* Header: brand + collapse toggle */}
      <header
        className={`h-12 shrink-0 border-b border-border flex items-center gap-1.5 ${
          collapsed ? "px-2 justify-between" : "px-2.5 justify-between"
        }`}
      >
        <Link to="/app" title="Syncd" className="flex items-center gap-2 min-w-0 shrink-0">
          <BrandMark size={18} />
          {!collapsed && (
            <span className="font-semibold tracking-tight text-[14px] text-ink truncate">
              Syncd
            </span>
          )}
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors shrink-0"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-3.5" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        )}
      </header>

      {/* Nav links */}
      <nav
        className={`shrink-0 flex flex-col gap-0.5 py-1.5 ${collapsed ? "items-center px-1" : "px-2"}`}
      >
        {!collapsed && (
          <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em] px-2">
            Workspace
          </span>
        )}
        {NAV_LINKS.map((l) => {
          const active = pathname === l.to;
          const Icon = l.icon;
          if (collapsed) {
            return (
              <Link
                key={l.to}
                to={l.to}
                search={l.search}
                title={l.label}
                aria-label={l.label}
                className={`size-9 inline-flex items-center justify-center rounded-lg transition-colors ${
                  active
                    ? "bg-accent-cyan/10 text-accent-cyan"
                    : "text-muted-foreground hover:text-ink hover:bg-subtle"
                }`}
              >
                <Icon className="size-4" />
              </Link>
            );
          }
          return (
            <Link
              key={l.to}
              to={l.to}
              search={l.search}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${
                active
                  ? "bg-accent-cyan/10 text-ink"
                  : "text-muted-foreground hover:bg-subtle/60 hover:text-ink"
              }`}
            >
              <Icon
                className={`size-4 shrink-0 ${active ? "text-accent-cyan" : "text-muted-foreground"}`}
              />
              <span className="flex-1 text-left text-[13px] font-medium truncate">{l.label}</span>
              {active && (
                <span className="size-1.5 rounded-full bg-accent-cyan shrink-0" aria-hidden />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Draft list (scrollable) */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto ${collapsed ? "py-1 px-1.5" : "py-3 px-2 border-t border-border"}`}
      >
        <DraftList collapsed={collapsed} onSelect={onSelectDraft} />
      </div>

      {/* Footer: workspace switcher */}
      <footer className={`shrink-0 border-t border-border py-1.5 ${collapsed ? "px-0.5" : "px-2"}`}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </footer>
    </aside>
  );
}
