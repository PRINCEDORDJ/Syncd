import { useEffect, useRef, useState } from "react";

type Phase = "generating" | "building" | "ready" | "reset";

/* Loop timing (ms) — one cycle ≈ 7s */
const GENERATE_MS = 1500;
const BUILD_STEP_MS = 480;
const BUILD_LAST_MS = 700;
const READY_HOLD_MS = 3000;
const RESET_MS = 600;
const PARAGRAPH_COUNT = 4;

const RAW_INPUT =
  'Sat through a two-hour review today where the manager literally read back the goals from last quarter and asked "any questions?" My teammate quit on the spot. We need to stop treating these as compliance checklists and actually talk about where people want to go next.';

const PARAS: Array<{ cls: string; text: string }> = [
  {
    cls: "text-xl font-medium leading-snug text-ink",
    text: 'I sat through a two-hour review today where my manager read back last quarter\'s goals and asked "any questions?" — my teammate quit on the spot.',
  },
  {
    cls: "text-[15px] text-muted-foreground leading-relaxed",
    text: "We keep treating performance reviews like compliance checklists. Fill out the form, check the boxes, move on. Nobody walks away with a clearer picture of where they're headed.",
  },
  {
    cls: "text-[15px] text-muted-foreground leading-relaxed",
    text: "What if we flipped it? Instead of grading the past, spend that time mapping where each person actually wants to go next — skills to build, problems worth owning, the kind of work that makes Friday feel like Tuesday.",
  },
];

const QUOTE =
  "The companies getting this right aren't doing bigger reviews. They're having shorter, more frequent conversations about trajectory — not just performance.";

function Cursor() {
  return (
    <span
      aria-hidden
      className="inline-block w-[3px] h-[1em] bg-ink/80 animate-cursor-blink align-[-0.15em] ml-0.5"
    />
  );
}

/**
 * Static-by-default product mockup. When scrolled into view (and unless
 * prefers-reduced-motion), it loops a "generation" simulation:
 * skeleton + shimmer → paragraphs build in → draft ready → fade → repeat.
 */
export function WorkspacePreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [built, setBuilt] = useState(PARAGRAPH_COUNT);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setLive(entries.some((e) => e.isIntersecting)),
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    (async () => {
      while (!cancelled) {
        setPhase("generating");
        setBuilt(0);
        await sleep(GENERATE_MS);
        if (cancelled) return;

        setPhase("building");
        for (let i = 1; i <= PARAGRAPH_COUNT; i++) {
          setBuilt(i);
          await sleep(i === PARAGRAPH_COUNT ? BUILD_LAST_MS : BUILD_STEP_MS);
          if (cancelled) return;
        }

        setPhase("ready");
        await sleep(READY_HOLD_MS);
        if (cancelled) return;

        setPhase("reset");
        await sleep(RESET_MS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [live]);

  const hidden = phase === "generating" || phase === "reset";
  const showCursor = (i: number) => phase === "building" && built === i + 1;

  return (
    <div ref={ref} className="relative">
      <div className="absolute inset-x-12 -bottom-1 h-12 bg-ink/[0.04] rounded-3xl blur-2xl -z-10" />

      <div className="bg-card rounded-xl border border-border shadow-pop overflow-hidden">
        {/* App chrome */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-subtle/60">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex gap-1.5 shrink-0">
              <div className="size-2.5 rounded-full bg-border" />
              <div className="size-2.5 rounded-full bg-border" />
              <div className="size-2.5 rounded-full bg-border" />
            </div>
            <div className="ml-3 text-[11px] font-mono text-muted-foreground truncate">
              syncd.app/app
            </div>
          </div>
          <div className="hidden sm:block text-[11px] font-mono text-muted-foreground shrink-0">
            Tone: authoritative · warm
          </div>
        </div>

        <div className="grid grid-cols-12">
          {/* Left: input */}
          <div className="col-span-12 md:col-span-4 border-b md:border-b-0 md:border-r border-border p-5 flex flex-col gap-4 bg-subtle/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                Raw input
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">142 ch</span>
            </div>
            <div className="p-4 bg-card rounded-md border border-border text-[13px] text-muted-foreground leading-relaxed h-44 overflow-hidden">
              {RAW_INPUT}
            </div>
            <button className="h-9 rounded-md bg-ink text-surface text-[13px] font-medium pointer-events-none flex items-center justify-center gap-2">
              {phase === "generating" ? (
                <>
                  Generating
                  <span className="inline-flex gap-0.5">
                    <span className="size-1 rounded-full bg-surface/70 animate-pulse" />
                    <span className="size-1 rounded-full bg-surface/70 animate-pulse [animation-delay:150ms]" />
                    <span className="size-1 rounded-full bg-surface/70 animate-pulse [animation-delay:300ms]" />
                  </span>
                </>
              ) : (
                "Generate draft"
              )}
            </button>
          </div>

          {/* Right: canvas */}
          <div className="col-span-12 md:col-span-8 p-5 sm:p-7 md:p-10 relative overflow-hidden">
            {/* Skeleton + shimmer while generating */}
            {phase === "generating" && (
              <>
                <div className="absolute inset-0 p-5 sm:p-7 md:p-10 pointer-events-none animate-fade-up">
                  <div className="space-y-4">
                    <div className="h-7 w-11/12 rounded bg-border/70 animate-pulse" />
                    <div className="h-4 w-full rounded bg-border/60 animate-pulse [animation-delay:120ms]" />
                    <div className="h-4 w-10/12 rounded bg-border/60 animate-pulse [animation-delay:240ms]" />
                    <div className="h-4 w-full rounded bg-border/60 animate-pulse [animation-delay:360ms]" />
                    <div className="h-4 w-8/12 rounded bg-border/60 animate-pulse [animation-delay:480ms]" />
                    <div className="h-16 w-full rounded bg-border/50 animate-pulse [animation-delay:600ms]" />
                  </div>
                </div>
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-ink/[0.05] to-transparent animate-shimmer" />
                </div>
              </>
            )}

            {/* Draft content — all blocks stay mounted (fixed layout); the
                loop reveals them by opacity so nothing ever shifts. */}
            <div
              className={`transition-opacity duration-500 ${hidden ? "opacity-0" : "opacity-100"}`}
            >
              <div className="flex items-center justify-between mb-5 gap-3">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                  Canvas
                </span>
                <span className="text-[10px] font-mono text-muted-foreground text-right">
                  {phase === "ready" ? "286 words · 1,742 / 3,000" : "drafting…"}
                </span>
              </div>

              <div className="space-y-4">
                {PARAS.map((p, i) => (
                  <p
                    key={i}
                    className={`${p.cls} transition-opacity duration-500 ${
                      built > i ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {p.text}
                    {showCursor(i) && <Cursor />}
                  </p>
                ))}
                <div
                  className={`border-l-2 border-ink pl-4 py-1 transition-opacity duration-500 ${
                    built >= PARAGRAPH_COUNT ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <p className="text-[15px] font-medium text-ink">
                    {QUOTE}
                    {showCursor(PARAGRAPH_COUNT - 1) && built === PARAGRAPH_COUNT && <Cursor />}
                  </p>
                </div>
              </div>

              <div className="mt-7 pt-5 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <span
                  className={`text-[11px] font-mono uppercase transition-colors ${
                    phase === "ready" ? "text-ink" : "text-muted-foreground"
                  }`}
                >
                  {phase === "ready" ? "✓ Draft ready · voice match" : "Tone · authoritative"}
                </span>
                <div
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-ink text-surface text-[13px] font-medium shrink-0 transition-opacity duration-300 ${
                    phase === "ready" ? "opacity-100" : "opacity-40"
                  }`}
                >
                  Publish to LinkedIn
                  <span aria-hidden className="text-surface/60">
                    →
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
