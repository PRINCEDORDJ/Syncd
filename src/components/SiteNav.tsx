import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export function SiteNav() {
  const { user, signOut } = useAuth();

  return (
    <nav className="flex items-center justify-between px-6 md:px-8 py-6 w-full max-w-7xl mx-auto">
      <Link to="/" className="flex items-center gap-2.5 group">
        <div className="size-2.5 rounded-full bg-gradient-to-br from-glow-start to-glow-end shadow-[0_0_10px_color-mix(in_oklab,var(--glow-start)_50%,transparent)] transition-transform group-hover:scale-110" />
        <span className="font-medium tracking-tight text-xl text-ink">SocialSync</span>
      </Link>
      <div className="flex items-center gap-7 text-sm font-medium">
        <Link
          to="/methodology"
          className="text-muted-foreground hover:text-ink transition-colors hidden sm:inline"
        >
          Methodology
        </Link>
        <Link
          to="/pricing"
          className="text-muted-foreground hover:text-ink transition-colors hidden sm:inline"
        >
          Pricing
        </Link>
        {user ? (
          <>
            <Link
              to="/app"
              className="text-ink hover:text-[color:var(--glow-end)] transition-colors"
            >
              Workspace
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-muted-foreground hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="text-ink hover:text-[color:var(--glow-end)] transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
