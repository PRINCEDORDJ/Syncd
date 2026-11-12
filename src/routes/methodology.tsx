import { createFileRoute, Link } from "@tanstack/react-router";
import { SidebarShell } from "@/components/workspace/SidebarShell";
import { Reveal } from "@/hooks/use-reveal";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — Syncd" },
      {
        name: "description",
        content:
          "Voice mapping, structural calibration, and direct publishing — the principles behind Syncd.",
      },
      { property: "og:title", content: "Methodology — Syncd" },
      {
        property: "og:description",
        content: "How Syncd turns raw thoughts into LinkedIn-native posts.",
      },
    ],
  }),
  component: MethodologyPage,
});

const sections = [
  {
    n: "01",
    title: "Voice mapping",
    body: "In settings you map your voice — point of view, rhythm, banned words, the themes you own. Paste a few of your real posts and Syncd calibrates the map for you; every draft is then threaded through it, so output reads like you on a focused day.",
  },
  {
    n: "02",
    title: "Structural calibration",
    body: "LinkedIn rewards a specific shape: sharp hook, personal admission, reframing, quiet payoff. Every draft is built against this scaffold, then loosened back to feel human.",
  },
  {
    n: "03",
    title: "Editor-in-chief",
    body: "Generated text is a first draft, never a final one. Edit freely on the canvas. The system proposes — you decide what ships.",
  },
  {
    n: "04",
    title: "Direct dispatch",
    body: "Approved drafts post to LinkedIn through the official UGC API with line breaks and spacing preserved exactly. No copy-paste, no formatting drift.",
  },
];

function MethodologyPage() {
  return (
    <SidebarShell mobileTitle="Methodology">
      <div className="h-full min-h-0 w-full overflow-y-auto">
        <main className="max-w-3xl mx-auto px-6 py-6 sm:py-10">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-4 animate-fade-up">
            Methodology
          </p>
          <h1
            className="text-4xl md:text-5xl tracking-[-0.02em] font-semibold leading-[1.05] text-balance animate-fade-up"
            style={{ animationDelay: "90ms" }}
          >
            A small set of opinionated defaults.
          </h1>
          <p
            className="mt-5 text-[17px] text-muted-foreground max-w-[58ch] leading-relaxed animate-fade-up"
            style={{ animationDelay: "180ms" }}
          >
            Syncd is not a generic writing assistant. It is a narrow tool tuned for one surface and
            one outcome: a LinkedIn post that earns attention without sounding synthetic.
          </p>

          {/* Before / after */}
          <Reveal className="mt-12">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="border border-border rounded-xl bg-card p-5">
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
                  Input
                </p>
                <p className="text-[13px] font-mono text-muted-foreground leading-relaxed">
                  &ldquo;idk maybe post about the launch?? notes: beta went well, 40 teams, people
                  keep saying &lsquo;finally&rsquo; — also nervous??&rdquo;
                </p>
              </div>
              <div aria-hidden className="text-muted-foreground text-center rotate-90 sm:rotate-0">
                ↓
              </div>
              <div className="border border-ink rounded-xl bg-background p-5 shadow-cta">
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
                  Draft
                </p>
                <p className="text-[14px] text-ink leading-relaxed">
                  40 teams said &ldquo;finally&rdquo; last month.
                  <br />
                  <br />
                  Not because we invented something new — because we removed something old: the
                  copy-paste ritual.
                </p>
              </div>
            </div>
            <p className="mt-3 text-[12px] font-mono text-muted-foreground text-center">
              voice map + structural scaffold in between
            </p>
          </Reveal>

          <Reveal className="mt-14" stagger>
            <div className="border-t border-border">
              {sections.map((s) => (
                <article
                  key={s.n}
                  className="group grid grid-cols-[auto_1fr] gap-6 md:gap-10 py-8 border-b border-border"
                >
                  <div className="font-mono text-[13px] text-muted-foreground pt-1.5 transition-all group-hover:text-ink group-hover:translate-x-1">
                    {s.n}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-ink">{s.title}</h2>
                    <p className="mt-2 text-[15px] text-muted-foreground leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </Reveal>

          <p className="mt-12 text-[15px] text-muted-foreground">
            That&apos;s the whole philosophy.
          </p>

          <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              to="/app"
              className="group inline-flex items-center gap-2 h-10 px-4 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 transition-colors"
            >
              Try it now
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <Link
              to="/pricing"
              className="text-[14px] text-muted-foreground hover:text-ink transition-colors"
            >
              See pricing →
            </Link>
            <Link
              to="/settings"
              className="text-[14px] text-muted-foreground hover:text-ink transition-colors"
            >
              Open your voice map →
            </Link>
          </div>
        </main>
      </div>
    </SidebarShell>
  );
}
