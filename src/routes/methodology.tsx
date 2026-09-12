import { createFileRoute, Link } from "@tanstack/react-router";
import { SidebarShell } from "@/components/workspace/SidebarShell";

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
    body: "Save voice notes in your settings — habits, hedge words, examples you keep returning to. The engine threads them into every draft so output reads like you on a focused day.",
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
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-4">
            Methodology
          </p>
          <h1 className="text-4xl md:text-5xl tracking-[-0.02em] font-semibold leading-[1.05] text-balance">
            A small set of opinionated defaults.
          </h1>
          <p className="mt-5 text-[17px] text-muted-foreground max-w-[58ch] leading-relaxed">
            Syncd is not a generic writing assistant. It is a narrow tool tuned for one
            surface and one outcome: a LinkedIn post that earns attention without sounding
            synthetic.
          </p>

          <div className="mt-14 border-t border-border">
            {sections.map((s) => (
              <article
                key={s.n}
                className="grid grid-cols-[auto_1fr] gap-6 md:gap-10 py-8 border-b border-border"
              >
                <div className="font-mono text-[13px] text-muted-foreground pt-1.5">
                  {s.n}
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-ink">
                    {s.title}
                  </h2>
                  <p className="mt-2 text-[15px] text-muted-foreground leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-12 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 transition-colors"
            >
              Try it now
              <span aria-hidden>→</span>
            </Link>
            <Link
              to="/pricing"
              className="text-[14px] text-muted-foreground hover:text-ink transition-colors"
            >
              See pricing →
            </Link>
          </div>
        </main>
      </div>
    </SidebarShell>
  );
}
