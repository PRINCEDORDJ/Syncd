import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — SocialSync" },
      {
        name: "description",
        content:
          "How SocialSync turns raw ideas into LinkedIn-native narratives: voice mapping, structural calibration, frictionless dispatch.",
      },
      { property: "og:title", content: "Methodology — SocialSync" },
      {
        property: "og:description",
        content:
          "Voice mapping, structural calibration, frictionless dispatch — the principles behind SocialSync.",
      },
    ],
  }),
  component: MethodologyPage,
});

const sections = [
  {
    n: "01",
    title: "Voice mapping",
    body: "Before the first generation, we calibrate against a small corpus of your past writing — five to ten posts is enough. The engine learns your sentence rhythm, hedge words, and recurring metaphors so output reads like you on a focused day.",
  },
  {
    n: "02",
    title: "Structural calibration",
    body: "LinkedIn rewards a specific shape: a sharp hook, a personal admission, a reframing, and a quiet payoff. Every draft is constructed against this scaffold, then loosened back to feel human.",
  },
  {
    n: "03",
    title: "Editor-in-chief",
    body: "Generated text is a first draft, never a final one. Highlight any sentence to soften, sharpen, condense, or rewrite. The system proposes — you decide.",
  },
  {
    n: "04",
    title: "Frictionless dispatch",
    body: "Approved drafts are sent directly to LinkedIn through their official API. Line breaks and spacing are preserved exactly. No copy-paste, no formatting drift.",
  },
];

function MethodologyPage() {
  return (
    <div className="min-h-dvh bg-background text-ink">
      <SiteNav />

      <main className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-16">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-5">
          Methodology
        </p>
        <h1 className="text-4xl md:text-6xl tracking-tight font-light leading-[1.1] text-balance">
          A small set of <span className="font-serif italic">opinionated</span> defaults.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-[55ch] font-light leading-relaxed">
          SocialSync is not a generic writing assistant. It is a narrow tool, tuned for one
          surface and one outcome: a LinkedIn post that earns attention without sounding
          synthetic.
        </p>

        <div className="mt-16 space-y-12">
          {sections.map((s) => (
            <article
              key={s.n}
              className="grid grid-cols-[auto_1fr] gap-6 md:gap-10 pb-12 border-b border-border/60 last:border-b-0"
            >
              <div className="font-serif italic text-3xl text-[color:var(--glow-end)] leading-none pt-1">
                {s.n}
              </div>
              <div>
                <h2 className="text-2xl font-medium tracking-tight text-ink">{s.title}</h2>
                <p className="mt-3 text-muted-foreground leading-relaxed font-light text-lg">
                  {s.body}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-16 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Link
            to="/app"
            className="bg-ink text-surface px-7 py-3.5 rounded-2xl font-medium shadow-cta hover:-translate-y-0.5 transition-all inline-flex items-center gap-3"
          >
            Try it now
            <span>→</span>
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-ink transition-colors">
            See pricing →
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
