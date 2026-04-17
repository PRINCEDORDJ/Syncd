import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { WorkspacePreview } from "@/components/WorkspacePreview";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SocialSync — Your thoughts, structured for impact" },
      {
        name: "description",
        content:
          "SocialSync turns raw ideas into polished LinkedIn posts that sound exactly like you. Generate, edit, and publish in one click.",
      },
      { property: "og:title", content: "SocialSync — Your thoughts, structured for impact" },
      {
        property: "og:description",
        content:
          "AI-powered LinkedIn content generator with one-click publishing. Built for writers who value precision over volume.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-ink overflow-x-hidden">
      <SiteNav />

      {/* Hero */}
      <header className="pt-20 md:pt-28 pb-16 md:pb-20 px-6 flex flex-col items-center text-center max-w-4xl w-full mx-auto gap-8 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[color:var(--glow-start)]/15 blur-[120px] rounded-full -z-10 pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-md shadow-soft text-sm text-muted-foreground font-medium">
          <span className="size-1.5 rounded-full bg-[color:var(--glow-start)] animate-pulse" />
          Engine updated · Native voice mapping
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl tracking-tight text-balance font-light leading-[1.05]">
          Your thoughts, structured for{" "}
          <span className="font-medium text-transparent bg-clip-text bg-gradient-to-r from-glow-start to-glow-end font-serif italic">
            impact.
          </span>
        </h1>

        <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-[52ch] text-pretty font-light leading-relaxed">
          Slip out of blank-page anxiety. SocialSync shapes your raw ideas into polished,
          engaging LinkedIn narratives that sound exactly like you.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-8 mt-2">
          <Link
            to="/app"
            className="bg-ink text-surface px-8 py-4 rounded-2xl font-medium shadow-cta hover:shadow-[0_18px_36px_-8px_color-mix(in_oklab,var(--ink)_45%,transparent)] hover:-translate-y-0.5 transition-all flex items-center gap-3 text-lg group"
          >
            Connect LinkedIn
            <span className="text-surface/50 group-hover:text-surface group-hover:translate-x-0.5 transition-all">
              →
            </span>
          </Link>
          <Link
            to="/methodology"
            className="text-ink font-medium text-lg hover:text-[color:var(--glow-end)] transition-colors"
          >
            Explore the workspace
          </Link>
        </div>
      </header>

      {/* Workspace mockup */}
      <section className="px-6 pb-24 w-full max-w-6xl mx-auto">
        <WorkspacePreview />
      </section>

      {/* Feature trio */}
      <section className="max-w-6xl mx-auto w-full px-6 pb-24">
        <div className="mb-14 max-w-2xl">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl tracking-tight font-light leading-tight">
            Three steps from{" "}
            <span className="font-serif italic font-normal">half-formed thought</span> to
            published narrative.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            n="1"
            title="Unblock your mind"
            body="Dump a messy stream of consciousness, a quick voice note, or fragmented bullets. The engine isolates your core narrative arc — no perfect prompt required."
          />
          <FeatureCard
            n="2"
            title="Sculpt the delivery"
            body="Highlight any sentence on the glass canvas to dial up authority, soften the tone, or condense for punchiness. You stay editor-in-chief of your voice."
            highlighted
          />
          <FeatureCard
            n="3"
            title="Publish with intent"
            body="Push approved drafts to LinkedIn with formatting mathematically preserved. Line breaks and visual spacing stay exactly as you intended."
          />
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-4xl mx-auto w-full px-6 pb-24 text-center">
        <div className="relative rounded-3xl border border-border/70 bg-card p-12 md:p-16 overflow-hidden shadow-soft">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[260px] bg-[color:var(--glow-end)]/10 blur-[100px] rounded-full pointer-events-none" />
          <h2 className="text-3xl md:text-5xl tracking-tight font-light leading-tight text-balance">
            Stop drafting in the feed.{" "}
            <span className="font-serif italic">Start writing on glass.</span>
          </h2>
          <p className="text-muted-foreground mt-5 max-w-[48ch] mx-auto text-lg font-light">
            Connect your LinkedIn once. Publish your next post in under three minutes.
          </p>
          <Link
            to="/app"
            className="inline-flex items-center gap-3 mt-8 bg-ink text-surface px-8 py-4 rounded-2xl font-medium shadow-cta hover:-translate-y-0.5 transition-all"
          >
            Open the workspace
            <span>→</span>
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function FeatureCard({
  n,
  title,
  body,
  highlighted,
}: {
  n: string;
  title: string;
  body: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col gap-5 p-8 rounded-3xl bg-card shadow-soft border border-border/60 overflow-hidden ${
        highlighted ? "" : ""
      }`}
    >
      {highlighted && (
        <div className="absolute -top-12 -right-12 w-44 h-44 bg-[color:var(--glow-start)]/15 blur-3xl rounded-full pointer-events-none" />
      )}
      <div className="size-12 rounded-2xl bg-secondary border border-border/60 flex items-center justify-center text-[color:var(--glow-end)] font-serif italic text-2xl">
        {n}
      </div>
      <h3 className="text-xl font-medium text-ink tracking-tight">{title}</h3>
      <p className="text-muted-foreground leading-relaxed text-pretty font-light">{body}</p>
    </div>
  );
}
