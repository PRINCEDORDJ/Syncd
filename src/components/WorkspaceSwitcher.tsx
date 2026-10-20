import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Building2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/lib/workspace-context";
import { useAuth } from "@/lib/auth";
import { fetchAccessibleWorkspaces, type AccessibleWorkspace } from "@/lib/workspace-access";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspace();
  const [workspaces, setWorkspaces] = useState<AccessibleWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchAccessibleWorkspaces(user.id)
      .then((list) => {
        if (!cancelled) setWorkspaces(list);
      })
      .catch(() => {
        if (!cancelled) setWorkspaces([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeWorkspaceId]);

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  if (loading) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }

  // Single workspace — no need for a switcher
  if (workspaces.length <= 1 && !active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex max-w-40 items-center gap-1.5 rounded-md px-2 h-7 hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Switch workspace"
      >
        <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[12px] font-medium text-ink">
          {active?.name ?? "Workspace"}
        </span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal py-1">
          Workspaces
        </DropdownMenuLabel>
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => setActiveWorkspace(ws)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Building2 className="size-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate text-[13px]">{ws.name}</span>
            <span
              className={cn(
                "text-[10px] font-mono uppercase text-muted-foreground shrink-0",
                ws.is_direct_owner && "text-ink",
              )}
            >
              {ROLE_LABELS[ws.current_user_role ?? "member"] ?? "Member"}
            </span>
            {ws.id === activeWorkspaceId && <Check className="size-3.5 text-ink shrink-0" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/settings"
            search={{ tab: "workspaces" }}
            className="text-[12px] text-muted-foreground cursor-pointer"
          >
            Manage workspaces →
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
