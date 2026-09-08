import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchUserWorkspaces, type Workspace } from "@/lib/workspace-access";
import { ChevronDown, Check, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";

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

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
}

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState<Workspace | null>(() => readStoredWorkspace());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchUserWorkspaces(user.id).then((list) => {
      if (cancelled) return;
      setWorkspaces(list);
      // Keep a still-valid stored selection; otherwise fall back to the first.
      setActive((prev) => {
        const next = (prev && list.some((w) => w.id === prev.id) ? prev : list[0]) ?? null;
        if (next) persistActiveWorkspace(next);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const selectWorkspace = (ws: Workspace) => {
    setActive(ws);
    persistActiveWorkspace(ws);
  };

  const label = active?.name ?? "Workspace";

  const triggerClass = collapsed
    ? "w-full h-8 flex items-center justify-center rounded-lg hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
    : "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring group";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger title={label} aria-label="Switch workspace" className={triggerClass}>
        <div className="flex items-center justify-center size-5 rounded bg-ink/8 shrink-0">
          <Building2 className="size-3 text-muted-foreground" />
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-[12px] font-medium text-ink truncate min-w-0">
              {label}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" sideOffset={6} className="w-52">
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.length === 0 ? (
          <div className="px-2 py-1.5 text-[12px] text-muted-foreground italic">
            No workspaces yet.
          </div>
        ) : (
          workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => selectWorkspace(ws)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Building2 className="size-3.5 text-muted-foreground" />
              <span className="flex-1 truncate text-[13px]">{ws.name}</span>
              {ws.id === active?.id && <Check className="size-3.5 text-ink shrink-0" />}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/settings"
            search={{
              linkedin_connected: undefined,
              linkedin_error: undefined,
              billing: undefined,
            }}
            className="text-[12px] text-muted-foreground cursor-pointer"
          >
            Manage workspaces →
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
