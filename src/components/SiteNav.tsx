import { Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";

export function SiteNav() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 md:px-8 h-14 w-full max-w-7xl mx-auto">
        <Link to="/" className="flex items-center gap-2 group">
          <BrandMark size={22} />
          <span className="font-semibold tracking-tight text-[15px] text-ink">
            SocialSync
          </span>
        </Link>

        <div className="hidden sm:flex items-center gap-1">
          <NavLink to="/methodology" current={pathname}>
            Methodology
          </NavLink>
          <NavLink to="/pricing" current={pathname}>
            Pricing
          </NavLink>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <NavLink to="/drafts" current={pathname}>
                Posts
              </NavLink>
              <NavLink to="/settings" current={pathname}>
                Settings
              </NavLink>
              <Link
                to="/app"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 transition-colors"
              >
                Workspace
                <span aria-hidden className="text-surface/60">
                  →
                </span>
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="text-[13px] text-muted-foreground hover:text-ink transition-colors px-2 h-8"
                aria-label="Sign out"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-[13px] text-muted-foreground hover:text-ink transition-colors px-3 h-8 inline-flex items-center"
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
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  to,
  current,
  children,
}: {
  to: "/methodology" | "/pricing" | "/settings" | "/app" | "/drafts";
  current: string;
  children: React.ReactNode;
}) {
  const active = current === to;
  return (
    <Link
      to={to}
      className={`text-[13px] px-3 h-8 inline-flex items-center rounded-md transition-colors ${
        active
          ? "text-ink bg-subtle"
          : "text-muted-foreground hover:text-ink hover:bg-subtle"
      }`}
    >
      {children}
    </Link>
  );
}
