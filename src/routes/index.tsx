import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { WorkspacePreview } from "@/components/WorkspacePreview";
import { useAuth } from "@/lib/auth";
import { Reveal } from "@/hooks/use-reveal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sparkles, Images, CalendarClock, Users, Coins, Linkedin } from "lucide-react";

const BASE_URL = process.env.APP_URL;

const stats = [
  { value: "30", label: "free credits / month" },
  { value: "4", label: "media formats" },
  { value: "~20s", label: "thought → ready draft" },
  { value: "5", label: "seats / workspace" },
];

const scheduleDays = [
  {
    day: "Mon",
    time: "08:30",
    line: "I nearly shipped a feature nobody asked for.",
    state: "published" as const,
  },
  { day: "Tue", time: null, line: null, state: "empty" as const },
  {
    day: "Wed",
    time: "07:45",
    line: "The best posts I've written started as voice notes.",
    state: "next" as const,
  },
  {
    day: "Thu",
    time: "12:00",
    line: "Hiring is a writing test in disguise.",
    state: "scheduled" as const,
  },
  {
    day: "Fri",
    time: "09:15",
    line: "Our team runs on pooled credits, not meetings.",
    state: "scheduled" as const,
  },
];

const faqs = [
  {
    q: "How do credits work?",
    a: "Every workspace gets 30 free credits every month — pooled across seats. A failed generation refunds automatically, and credits never expire. Top up any time from settings.",
  },
  {
    q: "Is connecting LinkedIn safe?",
    a: "Yes. Syncd uses official LinkedIn OAuth — we never see your password, just a scoped token that lets us publish on your behalf. Revoke it any time from your LinkedIn settings.",
  },
  {
    q: "Can I schedule posts with media?",
    a: "Absolutely. Attach up to 4 images, 1 video, or a PDF / Doc — uploaded once and published natively via LinkedIn's Assets API at your scheduled time.",
  },
  {
    q: "What happens to my formatting?",
    a: "It's preserved exactly. Line breaks, spacing, and media survive the trip from canvas to feed — no copy-paste, no formatting drift.",
  },
  {
    q: "Can my team share one workspace?",
    a: "Yes — up to 5 seats per workspace with pooled credits, shared draft and media libraries, and review-before-publish so nothing goes out half-baked.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. Start on the Free plan with 30 credits a month, no card required. Upgrade only when you outgrow it.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Syncd — AI LinkedIn posts, scheduling, done solo or as a team" },
      {
        name: "description",
        content:
          "Write, schedule & ship LinkedIn posts — solo or with your team. AI drafts in your voice, 30 free credits every month.",
      },
      {
        property: "og:title",
        content: "Syncd — AI LinkedIn posts, scheduling, done solo or as a team",
      },
      {
        property: "og:description",
        content:
          "AI drafts in your voice. Scheduling. Shared libraries. One-click LinkedIn publishing — solo or as a team.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${BASE_URL}/` },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Syncd — AI LinkedIn posts, scheduling, done solo or as a team",
      },
      {
        name: "twitter:description",
        content:
          "AI drafts in your voice. Scheduling. Shared libraries. One-click LinkedIn publishing — solo or as a team.",
      },
    ],
    links: [{ rel: "canonical", href: `${BASE_URL}/` }],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-dvh bg-background text-ink">
      <SiteNav />

      {/* Hero */}
      <header className="relative px-6 md:px-8 pt-20 md:pt-28 pb-20 overflow-x-clip">
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] -z-10" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full bg-ink/[0.04] blur-3xl [mask-image:radial-gradient(circle,black,transparent_70%)] -z-10 animate-glow-pulse" />

        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-7">
          <div className="inline-flex max-w-full items-center gap-2 h-7 px-3 rounded-full border border-border bg-card text-[12px] font-mono text-muted-foreground animate-fade-up">
            <span className="size-1.5 rounded-full bg-ink shrink-0" />
            <span className="truncate">
              v1.3
              <span className="hidden sm:inline">
                {" "}
                · Workspace-scoped credits &amp; team billing
              </span>
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-[-0.03em] font-semibold leading-[1.02] text-balance">
            <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
              <span className="block animate-line-up">Write, schedule &amp; ship</span>
            </span>
            <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
              <span className="block animate-line-up" style={{ animationDelay: "90ms" }}>
                LinkedIn posts. Solo or as a team.
              </span>
            </span>
          </h1>

          <p
            className="text-lg md:text-xl text-muted-foreground max-w-[56ch] text-pretty leading-relaxed animate-fade-up"
            style={{ animationDelay: "180ms" }}
          >
            Dump a half-formed thought. Syncd drafts it in your voice and attaches your media.
          </p>
          <p
            className="text-lg md:text-xl text-muted-foreground max-w-[56ch] text-pretty leading-relaxed animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            Publish now, or schedule — straight to LinkedIn.
          </p>

          <div
            className="flex flex-col sm:flex-row items-center gap-3 mt-2 animate-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            <Link
              to={user ? "/app" : "/login"}
              search={user ? undefined : { redirect: "/app" }}
              className="group inline-flex items-center gap-2 h-11 px-5 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 shadow-cta transition-all"
            >
              {user ? "Open workspace" : "Start drafting free"}
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              to="/methodology"
              className="inline-flex items-center gap-2 h-11 px-5 rounded-md border border-border text-ink text-[14px] font-medium hover:bg-subtle transition-colors"
            >
              How it works
            </Link>
          </div>

          <p
            className="text-[12px] font-mono text-muted-foreground mt-3 mx-auto max-w-[48ch] text-center leading-relaxed animate-fade-up"
            style={{ animationDelay: "360ms" }}
          >
            30 free credits every month · No credit card · Connect LinkedIn in 30 seconds
          </p>
          <p
            className="text-[12px] font-mono text-muted-foreground mx-auto max-w-[48ch] text-center leading-relaxed animate-fade-up"
            style={{ animationDelay: "420ms" }}
          >
            Official LinkedIn OAuth — we never see your password.
          </p>
        </div>
      </header>

      {/* Stats strip */}
      <section className="px-6 md:px-8 pb-24 max-w-6xl mx-auto">
        <Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border rounded-xl overflow-hidden">
            {stats.map((s) => (
              <div key={s.label} className="bg-card p-6 text-center">
                <div className="text-3xl font-semibold tracking-tight text-ink">{s.value}</div>
                <div className="text-[12px] font-mono text-muted-foreground mt-2">{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Preview */}
      <section className="px-6 md:px-8 pb-24 max-w-6xl mx-auto">
        <Reveal>
          <WorkspacePreview />
        </Reveal>
      </section>

      {/* Feature bento */}
      <section className="max-w-6xl mx-auto px-6 md:px-8 pb-24">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
              What&apos;s inside
            </p>
            <h2 className="text-3xl md:text-4xl tracking-[-0.02em] font-semibold leading-tight">
              Everything you need to ship on LinkedIn.
            </h2>
          </div>
        </Reveal>

        <Reveal stagger>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border rounded-xl overflow-hidden">
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
              body="Invite up to 5 seats. Share drafts, media, and schedules in a pooled credit workspace your whole team can edit."
            />
            <Bento
              icon={<Coins className="size-4" />}
              title="Credits, no surprises"
              body="Workspace-scoped credits. Failed generations refund automatically. Top up any time — credits never expire."
            />
            <Bento
              icon={<Linkedin className="size-4" />}
              title="Native publishing"
              body="Official LinkedIn OAuth. Line breaks, spacing, and media preserved exactly — one click from draft to feed."
            />
          </div>
        </Reveal>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 md:px-8 pb-24">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
              How it works
            </p>
            <h2 className="text-3xl md:text-4xl tracking-[-0.02em] font-semibold leading-tight">
              Three steps. No fluff.
            </h2>
          </div>
        </Reveal>

        <Reveal stagger>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border rounded-xl overflow-hidden">
            <FeatureCard
              n="01"
              title="Connect LinkedIn"
              body="Authorize Syncd once via official OAuth. We never see your password — just a scoped token to publish on your behalf."
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
        </Reveal>
      </section>

      {/* Scheduling visual */}
      <section className="max-w-6xl mx-auto px-6 md:px-8 pb-24">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
              Scheduling
            </p>
            <h2 className="text-3xl md:text-4xl tracking-[-0.02em] font-semibold leading-tight">
              Queue it. Forget it. It ships.
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed max-w-[52ch]">
              Pick a slot, attach your media, and walk away. A minute-accurate worker publishes for
              you — even while you sleep.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="relative border border-border rounded-xl bg-card p-6 md:p-8">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {scheduleDays.map((d) => (
                <div key={d.day} className="flex flex-col gap-2">
                  <div className="text-[11px] font-mono text-muted-foreground">{d.day}</div>
                  {d.line ? (
                    <div
                      className={`rounded-lg p-3 transition-colors ${
                        d.state === "next"
                          ? "border border-ink bg-background shadow-cta"
                          : "border border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                        {d.state === "next" && (
                          <span className="size-1.5 rounded-full bg-ink animate-pulse shrink-0" />
                        )}
                        {d.state === "published" && (
                          <span aria-hidden className="text-ink">
                            ✓
                          </span>
                        )}
                        {d.time}
                      </div>
                      <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
                        {d.line}
                      </p>
                    </div>
                  ) : (
                    <div className="border border-dashed border-border rounded-lg min-h-[72px]" />
                  )}
                </div>
              ))}
            </div>

            <div className="animate-toast-float absolute right-6 md:right-8 bottom-6 inline-flex items-center gap-2 h-9 px-4 rounded-md border border-border bg-background text-[12px] font-mono text-muted-foreground shadow-cta max-w-[calc(100%-3rem)]">
              <span aria-hidden className="text-ink">
                ✓
              </span>
              <span className="truncate">Published · Mon 08:30</span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Plans strip */}
      <section className="max-w-6xl mx-auto px-6 md:px-8 pb-24">
        <Reveal>
          <div className="mb-10 max-w-2xl flex items-start sm:items-end justify-between gap-6 flex-wrap">
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
        </Reveal>

        <Reveal stagger>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PlanCard
              name="Free"
              price="$0"
              highlights={[
                "30 credits / month",
                "5 credits / day cap",
                "200 MB media storage",
                "Solo workspace",
              ]}
            />
            <PlanCard
              name="Studio"
              price="$12"
              highlights={[
                "150 credits / month",
                "Voice profile",
                "Scheduling",
                "Priority generation",
                "5 GB media storage",
              ]}
              featured
            />
            <PlanCard
              name="Teams"
              price="$15 / seat"
              highlights={[
                "350 credits / seat, pooled",
                "20 GB media storage",
                "Shared draft library",
                "Review before publish",
              ]}
            />
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="max-w-6xl mx-auto px-6 md:px-8 pb-24">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
              FAQ
            </p>
            <h2 className="text-3xl md:text-4xl tracking-[-0.02em] font-semibold leading-tight">
              Questions, answered.
            </h2>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="max-w-3xl border border-border rounded-xl overflow-hidden bg-card">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((f) => (
                <AccordionItem
                  key={f.q}
                  value={f.q}
                  className="border-b last:border-b-0 border-border"
                >
                  <AccordionTrigger className="px-6 py-5 text-[14px] font-medium text-ink hover:no-underline hover:bg-subtle/40 transition-colors">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    <p className="text-[14px] text-muted-foreground leading-relaxed">{f.a}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 md:px-8 pb-24">
        <Reveal>
          <div className="border border-border rounded-xl p-8 sm:p-10 md:p-14 bg-subtle/40 text-center">
            <h2 className="text-3xl md:text-4xl tracking-[-0.02em] font-semibold leading-tight text-balance">
              Stop drafting in the LinkedIn composer.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-[48ch] mx-auto text-[15px]">
              Connect once. Generate in your voice with credits, schedule for later, and collaborate
              with your team — all in one canvas.
            </p>
            <Link
              to={user ? "/app" : "/login"}
              search={user ? undefined : { redirect: "/app" }}
              className="group inline-flex items-center gap-2 mt-7 h-11 px-5 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 shadow-cta transition-all"
            >
              {user ? "Open workspace" : "Get started"}
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}

function FeatureCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="group p-6 sm:p-8 flex flex-col gap-3 bg-card hover:bg-subtle/40 transition-all hover:-translate-y-0.5">
      <div className="text-[11px] font-mono text-muted-foreground transition-colors group-hover:text-ink">
        {n}
      </div>
      <h3 className="text-lg font-semibold text-ink tracking-tight">{title}</h3>
      <p className="text-[14px] text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function Bento({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="group p-6 sm:p-8 flex flex-col gap-3 bg-card hover:bg-subtle/40 transition-all hover:-translate-y-0.5">
      <div className="inline-flex items-center justify-center size-8 rounded-md border border-border bg-background text-ink transition-transform group-hover:scale-105">
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
      className={`border rounded-xl p-6 flex flex-col gap-5 bg-card transition-all hover:-translate-y-0.5 ${
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
    </div>
  );
}
