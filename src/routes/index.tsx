import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { WorkspacePreview } from "@/components/WorkspacePreview";
import { useAuth } from "@/lib/auth";
import {
  Sparkles,
  Images,
  CalendarClock,
  Users,
  Coins,
  Linkedin,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SocialSync — AI LinkedIn posts, scheduling & team drafts" },
      {
        name: "description",
        content:
          "Voice-matched AI drafts, native scheduling, shared team libraries, and one-click LinkedIn publishing. 30 free credits every month.",
      },
      { property: "og:title", content: "SocialSync — AI LinkedIn posts, scheduling & team drafts" },
      {
        property: "og:description",
        content: "Voice-matched AI drafts, scheduling, team libraries, and one-click LinkedIn publishing.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sociosync.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "SocialSync — AI LinkedIn posts, scheduling & team drafts" },
      {
        name: "twitter:description",
        content: "Voice-matched AI drafts, scheduling, team libraries, and one-click LinkedIn publishing.",
      },
    ],
    links: [{ rel: "canonical", href: "https://sociosync.lovable.app/" }],
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
            v1.2 · Teams, scheduling & credit-based generation
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl tracking-[-0.03em] font-semibold leading-[1.02] text-balance">
            Write, schedule &amp; ship
            <br />
            LinkedIn posts as a team.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-[56ch] text-pretty leading-relaxed">
            Dump a half-formed thought. SocialSync drafts it in your voice, attaches your
            media, and publishes — now, or on a schedule — straight to LinkedIn.
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
            30 free credits every month · No credit card · Connect LinkedIn in 30 seconds
          </p>
        </div>
      </header>

      {/* Preview */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <WorkspacePreview />
      </section>

      {/* Feature bento */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="mb-12 max-w-2xl">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
            What&apos;s inside
          </p>
          <h2 className="text-3xl md:text-4xl tracking-[-0.02em] font-semibold leading-tight">
            Everything you need to ship on LinkedIn.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border border-border rounded-xl overflow-hidden divide-y sm:divide-y-0 sm:divide-x lg:divide-x divide-border [&>*:nth-child(-n+3)]:lg:border-b [&>*:nth-child(-n+3)]:lg:border-border">
          <Bento
            icon={<Sparkles className="size-4" />}
            title="Generate in your voice"
            body="Paste raw thoughts, pick a tone, and get a structured draft that sounds like you — not like AI."
          />
          <Bento
            icon={<Images className="size-4" />}
            title="Rich media posts"
            body="Attach up to 4 images, 1 video, or a PDF / Doc. Uploaded once, published natively via LinkedIn's Assets API."
          />
          <Bento
            icon={<CalendarClock className="size-4" />}
            title="Schedule anything"
            body="Pick a date and time. A minute-accurate worker publishes for you — no browser tab, no reminders."
          />
          <Bento
            icon={<Users className="size-4" />}
            title="Team workspaces"
            body="Invite up to 5 seats. Share drafts, media, and schedules across a single library your whole team can edit."
          />
          <Bento
            icon={<Coins className="size-4" />}
            title="Credits, no surprises"
            body="Monthly credits with a daily cap on Free. Failed generations refund automatically. Top up any time."
          />
          <Bento
            icon={<Linkedin className="size-4" />}
            title="Native publishing"
            body="Official LinkedIn OAuth. Line breaks, spacing, and media preserved exactly — one click from draft to feed."
          />
        </div>
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
            title="Publish or schedule"
            body="Refine on the canvas, then ship it now — or queue it for the perfect moment. Formatting is preserved exactly."
          />
        </div>
      </section>

      {/* Plans strip */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="mb-10 max-w-2xl flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
              Plans
            </p>
            <h2 className="text-3xl md:text-4xl tracking-[-0.02em] font-semibold leading-tight">
              Priced like a tool, not a tax.
            </h2>
          </div>
          <Link
            to="/pricing"
            className="text-[13px] font-mono text-muted-foreground hover:text-ink transition-colors"
          >
            See full pricing →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlanCard
            name="Free"
            price="$0"
            highlights={["30 credits / month", "5 credits / day cap", "200 MB media storage", "Solo workspace"]}
          />
          <PlanCard
            name="Studio"
            price="$12"
            highlights={["100 credits / month", "5 GB media storage", "Scheduling", "Priority generation"]}
            featured
          />
          <PlanCard
            name="Teams"
            price="$32"
            highlights={["350 credits / month", "20 GB media storage", "Up to 5 seats", "Shared draft library"]}
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
            Connect once. Generate with credits, schedule for later, and collaborate with your team — all in one canvas.
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

function Bento({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="p-8 flex flex-col gap-3 bg-card hover:bg-subtle/40 transition-colors">
      <div className="inline-flex items-center justify-center size-8 rounded-md border border-border bg-background text-ink">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ink tracking-tight mt-1">{title}</h3>
      <p className="text-[14px] text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function PlanCard({
  name,
  price,
  highlights,
  featured,
}: {
  name: string;
  price: string;
  highlights: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-6 flex flex-col gap-5 bg-card transition-colors ${
        featured ? "border-ink shadow-cta" : "border-border hover:bg-subtle/40"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-ink tracking-tight">{name}</h3>
        <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em]">
          {featured ? "Popular" : ""}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-semibold text-ink tracking-tight">{price}</span>
        <span className="text-[13px] text-muted-foreground">/ month</span>
      </div>
      <ul className="flex flex-col gap-2 text-[14px] text-muted-foreground">
        {highlights.map((h) => (
          <li key={h} className="flex items-start gap-2">
            <span className="mt-2 size-1 rounded-full bg-ink/60 shrink-0" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/pricing"
        className="mt-auto inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border text-ink text-[13px] font-medium hover:bg-subtle transition-colors self-start"
      >
        See full pricing →
      </Link>
    </div>
  );
}
