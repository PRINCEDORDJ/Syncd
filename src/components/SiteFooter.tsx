import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/BrandMark";

export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-24">
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <BrandMark size={22} />
          <span className="font-semibold tracking-tight text-ink text-[15px]">
            SocialSync
          </span>
          <span className="text-muted-foreground text-[13px] ml-3 font-mono">
            © {new Date().getFullYear()}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
          <Link to="/methodology" className="hover:text-ink transition-colors">
            Methodology
          </Link>
          <Link to="/pricing" className="hover:text-ink transition-colors">
            Pricing
          </Link>
          <Link to="/privacy" className="hover:text-ink transition-colors">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-ink transition-colors">
            Terms
          </Link>
          <a href="mailto:hello@socialsync.app" className="hover:text-ink transition-colors">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
