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

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
}

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState<Workspace | null>(null);

  useEffect(() => {
    if (!user) return;
    void fetchUserWorkspaces(user.id).then((list) => {
      setWorkspaces(list);
      if (list.length > 0 && !active) setActive(list[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (collapsed) {
    return (
      <div
        title={active?.name ?? "Workspace"}
        className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-subtle transition-colors"
      >
        <Building2 className="size-4 text-muted-foreground" />
      </div>
    );
  }

  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring group">
        <div className="flex items-center justify-center size-5 rounded bg-ink/8 shrink-0">
          <Building2 className="size-3 text-muted-foreground" />
        </div>
        <span className="flex-1 text-left text-[12px] font-medium text-ink truncate min-w-0">
          {active.name}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={4} className="w-52">
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => setActive(ws)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Building2 className="size-3.5 text-muted-foreground" />
            <span className="flex-1 truncate text-[13px]">{ws.name}</span>
            {ws.id === active.id && <Check className="size-3.5 text-ink shrink-0" />}
          </DropdownMenuItem>
        ))}
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
