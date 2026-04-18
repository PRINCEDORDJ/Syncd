import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { WorkspacePreview } from "@/components/WorkspacePreview";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SocialSync — LinkedIn posts that sound like you" },
      {
        name: "description",
        content:
          "Turn raw thoughts into polished LinkedIn posts and publish in one click. Modern, opinionated, fast.",
      },
      { property: "og:title", content: "SocialSync — LinkedIn posts that sound like you" },
      {
        property: "og:description",
        content: "AI-powered LinkedIn drafts with one-click publishing.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-dvh bg-background text-ink">
      <SiteNav />

      {/* Hero */}
      <header className="relative px-6 pt-20 md:pt-28 pb-20">
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] -z-10" />

        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-7">
          <div className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-border bg-card text-[12px] font-mono text-muted-foreground">
            <span className="size-1.5 rounded-full bg-ink" />
            v1.0 · Now with native LinkedIn publishing
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl tracking-[-0.03em] font-semibold leading-[1.02] text-balance">
            LinkedIn posts that
            <br />
            sound like you wrote them.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-[56ch] text-pretty leading-relaxed">
            Dump a half-formed thought. SocialSync turns it into a polished post in your
            voice — then publishes it directly to LinkedIn.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
            <Link
              to={user ? "/app" : "/login"}
              search={user ? undefined : { redirect: "/app" }}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 shadow-cta transition-all"
            >
              {user ? "Open workspace" : "Start drafting free"}
              <span aria-hidden>→</span>
            </Link>
            <Link
              to="/methodology"
              className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-border text-ink text-[14px] font-medium hover:bg-subtle transition-colors"
            >
              How it works
            </Link>
          </div>

          <p className="text-[12px] font-mono text-muted-foreground mt-3">
            No credit card · Connect LinkedIn in 30 seconds
          </p>
        </div>
      </header>

      {/* Preview */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <WorkspacePreview />
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="mb-12 max-w-2xl">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl tracking-[-0.02em] font-semibold leading-tight">
            Three steps. No fluff.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 border border-border rounded-xl overflow-hidden divide-y md:divide-y-0 md:divide-x divide-border">
          <FeatureCard
            n="01"
            title="Connect LinkedIn"
            body="Authorize SocialSync once via official OAuth. We never see your password — just a scoped token to publish on your behalf."
          />
          <FeatureCard
            n="02"
            title="Generate from raw input"
            body="Paste a thought, a transcript, or three messy bullets. Pick a tone. The AI structures a draft you actually want to ship."
          />
          <FeatureCard
            n="03"
            title="Edit and publish"
            body="Refine on the canvas, then publish to LinkedIn in one click. Line breaks and spacing are preserved exactly."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="border border-border rounded-xl p-10 md:p-14 bg-subtle/40 text-center">
          <h2 className="text-3xl md:text-4xl tracking-[-0.02em] font-semibold leading-tight text-balance">
            Stop drafting in the LinkedIn composer.
          </h2>
          <p className="text-muted-foreground mt-4 max-w-[48ch] mx-auto text-[15px]">
            Connect your account once. Publish your next post in under three minutes.
          </p>
          <Link
            to={user ? "/app" : "/login"}
            search={user ? undefined : { redirect: "/app" }}
            className="inline-flex items-center gap-2 mt-7 h-11 px-5 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 shadow-cta transition-all"
          >
            {user ? "Open workspace" : "Get started"}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function FeatureCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="p-8 flex flex-col gap-3 bg-card hover:bg-subtle/40 transition-colors">
      <div className="text-[11px] font-mono text-muted-foreground">{n}</div>
      <h3 className="text-lg font-semibold text-ink tracking-tight">{title}</h3>
      <p className="text-[14px] text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
