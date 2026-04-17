import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteNav } from "@/components/SiteNav";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Workspace — SocialSync" },
      {
        name: "description",
        content: "Draft, refine, and publish your next LinkedIn post in the SocialSync workspace.",
      },
    ],
  }),
  component: WorkspacePage,
});

const TONES = ["Authoritative & Warm", "Conversational", "Contrarian", "Storytelling"] as const;
type Tone = (typeof TONES)[number];

const SAMPLES: Record<Tone, string> = {
  "Authoritative & Warm": `Performance reviews are broken. We spend 90% of our time looking backward, instead of charting the path forward.

For years, I dreaded the annual review cycle. It felt like an interrogation rather than a development tool.

Then we made a single shift: we replaced "Review" with "Trajectory Alignment."

The result? Attrition dropped 14%, and internal promotions doubled in 18 months.

What's one ritual on your team that no one questions, but everyone quietly resents?`,
  Conversational: `Quick thought on performance reviews — I think we've been doing them wrong for years.

Most of the conversation is backward looking. "Here's what you did." Cool, but I already know what I did. What I actually want to talk about is where I'm headed.

We swapped ours out for what we call a Trajectory Alignment. Same cadence, totally different energy. Attrition is down 14%, internal promotions doubled.

Worth trying.`,
  Contrarian: `Unpopular opinion: annual performance reviews are corporate theater.

They make HR feel productive, give managers cover for decisions they already made, and tell employees something they could have learned from a 1:1 six months earlier.

We killed ours. Replaced it with a quarterly Trajectory Alignment focused entirely on the next 12 months. Attrition: down 14%. Internal promotions: doubled.

The review wasn't sacred. The conversation was.`,
  Storytelling: `My first performance review as a manager, I spent three weeks preparing.

Spreadsheets. Self-assessments. A neatly printed packet. I walked in feeling like a lawyer about to deliver a verdict.

She quit two weeks later.

Not because of the rating — because of what the ritual signaled. We were spending an entire afternoon talking about a year that was already gone, and zero minutes about the year ahead.

That's when we built what we now call a Trajectory Alignment. Same cadence, but flipped: 80% future, 20% past. Attrition dropped 14%. Internal promotions doubled.

The review wasn't broken. The direction was.`,
};

const PLACEHOLDER_INPUT = `I was thinking about how most performance reviews are just backward-looking. It feels like an audit. We need to focus on future trajectory. We changed this at my company and it made a huge difference — attrition down 14%, internal promotions doubled in 18 months.`;

function WorkspacePage() {
  const [tone, setTone] = useState<Tone>("Authoritative & Warm");
  const [input, setInput] = useState(PLACEHOLDER_INPUT);
  const [draft, setDraft] = useState(SAMPLES["Authoritative & Warm"]);
  const [generating, setGenerating] = useState(false);
  const [published, setPublished] = useState(false);

  const charCount = draft.length;
  const overLimit = charCount > 3000;

  const wordCount = useMemo(
    () => draft.trim().split(/\s+/).filter(Boolean).length,
    [draft],
  );

  function generate() {
    if (!input.trim()) return;
    setGenerating(true);
    setPublished(false);
    // Simulated streaming generation
    const target = SAMPLES[tone];
    setDraft("");
    let i = 0;
    const tick = () => {
      i = Math.min(target.length, i + Math.max(2, Math.floor(target.length / 60)));
      setDraft(target.slice(0, i));
      if (i < target.length) {
        setTimeout(tick, 25);
      } else {
        setGenerating(false);
      }
    };
    setTimeout(tick, 200);
  }

  function publish() {
    if (overLimit || !draft.trim()) return;
    setPublished(true);
    setTimeout(() => setPublished(false), 4000);
  }

  return (
    <div className="min-h-dvh bg-surface text-ink flex flex-col">
      <SiteNav />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        {/* Workspace heading */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              Workspace · Demo mode
            </p>
            <h1 className="text-3xl md:text-4xl tracking-tight font-light leading-tight">
              Draft your next <span className="font-serif italic">LinkedIn</span> post.
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="size-1.5 rounded-full bg-[color:var(--glow-start)] animate-pulse" />
            LinkedIn not connected ·{" "}
            <Link to="/methodology" className="text-ink hover:text-[color:var(--glow-end)]">
              Learn more
            </Link>
          </div>
        </div>

        {/* Glass desk */}
        <div className="bg-card rounded-3xl p-2 shadow-glass border border-border/60 ring-1 ring-ink/[0.02]">
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-border/60">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-7 h-7 rounded bg-secondary flex items-center justify-center text-muted-foreground font-serif italic">
                S
              </div>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-ink">Untitled draft</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mr-2">
                Tone
              </span>
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    tone === t
                      ? "bg-ink text-surface border-ink"
                      : "bg-surface text-ink border-border/60 hover:border-ink/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-px bg-border/60 rounded-b-2xl overflow-hidden">
            {/* Left: input */}
            <section className="md:col-span-4 bg-surface p-6 flex flex-col gap-5 min-h-[60vh]">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="raw"
                  className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest"
                >
                  Raw material
                </label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {input.length} chars
                </span>
              </div>
              <textarea
                id="raw"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Dump a thought, a voice note transcript, or three messy bullets…"
                className="flex-1 resize-none p-4 bg-card rounded-xl text-sm text-ink border border-border/60 leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--glow-end)]/40 focus:border-[color:var(--glow-end)]/50 transition-all min-h-[200px]"
              />

              <button
                type="button"
                onClick={generate}
                disabled={generating || !input.trim()}
                className="w-full py-3.5 rounded-xl bg-ink text-surface font-medium shadow-cta hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <span className="size-1.5 rounded-full bg-[color:var(--glow-start)] animate-pulse" />
                    Structuring narrative…
                  </>
                ) : draft ? (
                  "Regenerate"
                ) : (
                  "Generate draft"
                )}
              </button>

              <p className="text-[11px] text-muted-foreground text-center font-light">
                Demo mode — no API calls. Connect Cloud to enable real generation.
              </p>
            </section>

            {/* Right: canvas */}
            <section className="md:col-span-8 bg-card p-6 md:p-10 flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Canvas
                </p>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground tabular-nums">
                  <span>{wordCount} words</span>
                  <span
                    className={`${
                      overLimit
                        ? "text-[color:var(--glow-end)] font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    {charCount} / 3000
                  </span>
                </div>
              </div>

              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setPublished(false);
                }}
                placeholder="Your generated post will appear here. Edit anything — it's yours."
                className="flex-1 w-full resize-none bg-transparent text-ink text-lg leading-relaxed font-light focus:outline-none placeholder:text-muted-foreground/60 min-h-[40vh]"
              />

              <div className="flex flex-wrap items-center justify-between gap-4 pt-6 mt-6 border-t border-border/60">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="px-2 py-1 rounded bg-surface border border-border/60 font-mono uppercase tracking-wider">
                    Tone · {tone.split(" ")[0]}
                  </span>
                  {overLimit && (
                    <span className="text-[color:var(--glow-end)] font-medium">
                      Over the 3,000 character LinkedIn limit
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(draft)}
                    disabled={!draft}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-ink border border-border/60 hover:border-ink/30 transition-colors disabled:opacity-50"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={publish}
                    disabled={!draft.trim() || overLimit}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-glow-start to-glow-end text-surface shadow-cta hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-2"
                  >
                    Publish to LinkedIn
                    <span>→</span>
                  </button>
                </div>
              </div>

              {published && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-surface border border-[color:var(--glow-start)]/30 text-sm text-ink flex items-center gap-3">
                  <span className="size-1.5 rounded-full bg-[color:var(--glow-end)]" />
                  Demo only — connect LinkedIn to publish for real. Your draft is safely yours.
                </div>
              )}
            </section>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground font-light">
          ← Back to{" "}
          <Link to="/" className="text-ink hover:text-[color:var(--glow-end)]">
            home
          </Link>
        </p>
      </main>
    </div>
  );
}
