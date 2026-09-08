import { Link, useLocation } from "@tanstack/react-router";
import { BrandMark } from "@/components/BrandMark";
import { DraftList } from "@/components/workspace/DraftList";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserWorkspaces, type Workspace } from "@/lib/workspace-access";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutGrid,
  FileText,
  Settings as SettingsIcon,
  Sun,
  Moon,
  LogOut,
  Building2,
  Check,
  ChevronsUpDown,
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
  to: "/app" | "/drafts";
  label: string;
  icon: typeof LayoutGrid;
}

const NAV_LINKS: NavLink[] = [
  { to: "/app", label: "Workspace", icon: LayoutGrid },
  { to: "/drafts", label: "Posts / Drafts", icon: FileText },
];

const ACTIVE_WORKSPACE_KEY = "syncd:active-workspace";

function readStoredWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    return raw ? (JSON.parse(raw) as Workspace) : null;
  } catch {
    return null;
  }
}

function persistActiveWorkspace(ws: Workspace) {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(ws));
  } catch {
    // storage unavailable — non-fatal
  }
}

export function Sidebar({ collapsed, onToggleCollapse, onSelectDraft }: SidebarProps) {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWs, setActiveWs] = useState<Workspace | null>(() => readStoredWorkspace());
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    if (!user) {
      setAvatarUrl(null);
      setDisplayName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("avatar_url, display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setAvatarUrl(data?.avatar_url ?? null);
        setDisplayName(data?.display_name ?? null);
      });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchUserWorkspaces(user.id).then((list) => {
      if (cancelled) return;
      setWorkspaces(list);
      setActiveWs((prev) => {
        const next = (prev && list.some((w) => w.id === prev.id) ? prev : list[0]) ?? null;
        if (next) persistActiveWorkspace(next);
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [user]);

  const selectWorkspace = (ws: Workspace) => {
    setActiveWs(ws);
    persistActiveWorkspace(ws);
  };

  const initials = (displayName || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

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
                title={l.label}
                aria-label={l.label}
                className={`size-9 inline-flex items-center justify-center rounded-lg transition-colors ${
                  active
                    ? "bg-accent-cyan/10 text-white"
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

      {/* Footer: user profile card → popup menu */}
      <footer className={`shrink-0 border-t border-border py-1.5 ${collapsed ? "px-1" : "px-2"}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <button
                type="button"
                title={displayName || user?.email || "Account"}
                aria-label="Account menu"
                className="w-full h-9 flex items-center justify-center rounded-lg hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar className="size-6 border border-border shrink-0">
                  {avatarUrl && (
                    <AvatarImage src={avatarUrl} alt={displayName ?? "Profile"} loading="lazy" />
                  )}
                  <AvatarFallback className="text-[9px] font-semibold bg-ink/10 text-ink">
                    {initials || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            ) : (
              <button
                type="button"
                aria-label="Account menu"
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring group"
              >
                <Avatar className="size-6 border border-border shrink-0">
                  {avatarUrl && (
                    <AvatarImage src={avatarUrl} alt={displayName ?? "Profile"} loading="lazy" />
                  )}
                  <AvatarFallback className="text-[9px] font-semibold bg-ink/10 text-ink">
                    {initials || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1 text-left">
                  <span className="text-[12px] font-semibold text-ink truncate leading-tight">
                    {displayName || "Account"}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate leading-tight">
                    {user?.email}
                  </span>
                </div>
                <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align={collapsed ? "end" : "start"}
            side="top"
            sideOffset={6}
            className="w-56"
          >
            {/* Identity header */}
            <DropdownMenuLabel className="font-normal pb-2">
              <div className="flex items-center gap-2.5">
                <Avatar className="size-8 border border-border shrink-0">
                  {avatarUrl && (
                    <AvatarImage src={avatarUrl} alt={displayName ?? "Profile"} loading="lazy" />
                  )}
                  <AvatarFallback className="text-[11px] font-semibold bg-ink/10 text-ink">
                    {initials || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-semibold text-ink truncate">
                    {displayName || "Account"}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate">{user?.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {/* Workspace switcher section */}
            <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal py-1">
              Workspaces
            </DropdownMenuLabel>

            {workspaces.length === 0 ? (
              <div className="px-2 py-1 text-[12px] text-muted-foreground italic">
                No workspaces yet.
              </div>
            ) : (
              workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => selectWorkspace(ws)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate text-[13px]">{ws.name}</span>
                  {ws.id === activeWs?.id && <Check className="size-3.5 text-ink shrink-0" />}
                </DropdownMenuItem>
              ))
            )}

            <DropdownMenuItem asChild>
              <Link
                to="/settings"
                search={SETTINGS_SEARCH}
                className="text-[12px] text-muted-foreground cursor-pointer"
              >
                Manage workspaces →
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Settings */}
            <DropdownMenuItem asChild>
              <Link
                to="/settings"
                search={SETTINGS_SEARCH}
                className="cursor-pointer flex items-center gap-2"
              >
                <SettingsIcon className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>

            {/* Theme toggle */}
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toggleTheme();
              }}
              className="cursor-pointer"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Sign out */}
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setConfirmSignOut(true);
              }}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </footer>

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out?"
        description="You'll need to sign in again to access your workspace, drafts, and settings."
        confirmText="Sign out"
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut();
        }}
      />
    </aside>
  );
}
