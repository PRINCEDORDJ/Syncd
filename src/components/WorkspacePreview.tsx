export function WorkspacePreview() {
  return (
    <div className="relative">
      <div className="absolute inset-x-12 -bottom-1 h-12 bg-ink/[0.04] rounded-3xl blur-2xl -z-10" />

      <div className="bg-card rounded-xl border border-border shadow-pop overflow-hidden">
        {/* App chrome */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-subtle/60">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="size-2.5 rounded-full bg-border" />
              <div className="size-2.5 rounded-full bg-border" />
              <div className="size-2.5 rounded-full bg-border" />
            </div>
            <div className="ml-3 text-[11px] font-mono text-muted-foreground">
              syncd.app/app
            </div>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            Tone: authoritative · warm
          </div>
        </div>

        <div className="grid grid-cols-12">
          {/* Left: input */}
          <div className="col-span-12 md:col-span-4 border-r border-border p-5 flex flex-col gap-4 bg-subtle/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                Raw input
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">142 ch</span>
            </div>
            <div className="p-4 bg-card rounded-md border border-border text-[13px] text-muted-foreground leading-relaxed h-44">
              Sat through a two-hour review today where the manager literally
              read back the goals from last quarter and asked "any questions?"
              My teammate quit on the spot. We need to stop treating these as
              compliance checklists and actually talk about where people want to
              go next.
            </div>
            <button className="h-9 rounded-md bg-ink text-surface text-[13px] font-medium pointer-events-none">
              Generate draft
            </button>
          </div>

          {/* Right: canvas */}
          <div className="col-span-12 md:col-span-8 p-7 md:p-10">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                Canvas
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                286 words · 1,742 / 3,000
              </span>
            </div>

            <div className="space-y-4">
              <p className="text-xl font-medium leading-snug text-ink">
                I sat through a two-hour review today where my manager read back
                last quarter's goals and asked "any questions?" — my teammate
                quit on the spot.
              </p>
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                We keep treating performance reviews like compliance checklists.
                Fill out the form, check the boxes, move on. Nobody walks away
                with a clearer picture of where they're headed.
              </p>
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                What if we flipped it? Instead of grading the past, spend that
                time mapping where each person actually wants to go next — skills
                to build, problems worth owning, the kind of work that makes
                Friday feel like Tuesday.
              </p>
              <div className="border-l-2 border-ink pl-4 py-1">
                <p className="text-[15px] font-medium text-ink">
                  The companies getting this right aren't doing bigger reviews.
                  They're having shorter, more frequent conversations about
                  trajectory — not just performance.
                </p>
              </div>
            </div>

            <div className="mt-7 pt-5 border-t border-border flex items-center justify-between">
              <span className="text-[11px] font-mono text-muted-foreground uppercase">
                Tone · authoritative
              </span>
              <div className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-ink text-surface text-[13px] font-medium">
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
  );
}
