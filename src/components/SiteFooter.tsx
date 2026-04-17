import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-border/70 mt-24">
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="size-2.5 rounded-full bg-gradient-to-br from-glow-start to-glow-end" />
          <span className="font-medium tracking-tight text-ink">SocialSync</span>
          <span className="text-muted-foreground text-sm ml-3">
            © {new Date().getFullYear()} — Built for the patient writer.
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link to="/methodology" className="hover:text-ink transition-colors">
            Methodology
          </Link>
          <Link to="/pricing" className="hover:text-ink transition-colors">
            Pricing
          </Link>
          <a href="mailto:hello@socialsync.app" className="hover:text-ink transition-colors">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
