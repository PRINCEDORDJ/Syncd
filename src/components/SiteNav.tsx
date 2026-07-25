import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Settings as SettingsIcon, LayoutGrid, FileText, Menu, Moon, Sun, BookOpen } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useTheme } from "@/lib/theme";
import { CreditIndicator } from "@/components/CreditIndicator";

import { Skeleton } from "@/components/ui/skeleton";

export function SiteNav() {
  const { user, loading, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
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
    return () => {
      cancelled = true;
    };
  }, [user]);

  const initials = (displayName || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 sm:px-6 md:px-8 h-14 w-full max-w-7xl mx-auto gap-3">
        <Link to={user ? "/app" : "/"} className="flex items-center gap-2 group">
          <BrandMark size={22} />
          <span className="font-semibold tracking-tight text-[15px] text-ink">Syncd</span>
        </Link>

        <div className="flex items-center gap-2">
          {loading ? (
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-28 rounded-md hidden sm:block" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          ) : user ? (
            <>
            <div className="hidden sm:flex">
              <CreditIndicator />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="hidden md:flex items-center gap-2 rounded-full p-0.5 hover:bg-subtle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                <Avatar className="h-8 w-8 border border-border">
                  {avatarUrl && (
                    <AvatarImage src={avatarUrl} alt={displayName ?? "Profile"} loading="lazy" />
                  )}
                  <AvatarFallback className="text-[11px] font-medium bg-subtle text-ink">
                    {initials || "U"}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-ink truncate">
                      {displayName || "Account"}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/app" className="cursor-pointer">
                    <LayoutGrid className="h-4 w-4" />
                    Workspace
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/drafts" className="cursor-pointer">
                    <FileText className="h-4 w-4" />
                    Posts
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/methodology" className="cursor-pointer">
                    <BookOpen className="h-4 w-4" />
                    Methodology
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <SettingsIcon className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleTheme();
                  }}
                  className="cursor-pointer"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setConfirmSignOut(true);
                  }}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-[13px] text-muted-foreground hover:text-ink transition-colors px-3 h-8 hidden sm:inline-flex items-center"
              >
                Sign in
              </Link>
              <Link
                to="/login"
                search={{ redirect: "/app" }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 transition-colors"
              >
                Get started
              </Link>
            </>
          )}

          {/* Mobile menu */}
          <DropdownMenu open={mobileOpen} onOpenChange={setMobileOpen}>
            <DropdownMenuTrigger
              className="md:hidden h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-subtle transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {!user && (
                <>
                  <DropdownMenuItem asChild onSelect={() => setMobileOpen(false)}>
                    <Link to="/methodology">Methodology</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild onSelect={() => setMobileOpen(false)}>
                    <Link to="/pricing">Pricing</Link>
                  </DropdownMenuItem>
                </>
              )}
              {user && (
                <>
                  <DropdownMenuItem asChild onSelect={() => setMobileOpen(false)}>
                    <Link to="/app">Workspace</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild onSelect={() => setMobileOpen(false)}>
                    <Link to="/drafts">Posts</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild onSelect={() => setMobileOpen(false)}>
                    <Link to="/methodology">Methodology</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild onSelect={() => setMobileOpen(false)}>
                    <Link to="/settings" className="cursor-pointer">
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleTheme();
                    }}
                    className="cursor-pointer"
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setMobileOpen(false);
                      setConfirmSignOut(true);
                    }}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
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
    </nav>
  );
}


