import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-24">
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="size-5 rounded-sm bg-ink flex items-center justify-center">
            <span className="text-surface text-[10px] font-bold tracking-tighter">S</span>
          </div>
          <span className="font-semibold tracking-tight text-ink text-[15px]">
            SocialSync
          </span>
          <span className="text-muted-foreground text-[13px] ml-3 font-mono">
            © {new Date().getFullYear()}
          </span>
        </div>
        <div className="flex items-center gap-6 text-[13px] text-muted-foreground">
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
