export function WorkspacePreview() {
  return (
    <div className="relative">
      {/* Soft desk shadow */}
      <div className="absolute inset-x-6 -bottom-2 h-12 bg-ink/5 rounded-[40px] blur-2xl -z-10" />

      <div className="bg-card rounded-3xl p-2.5 shadow-glass border border-border/60 ring-1 ring-ink/[0.02]">
        {/* App Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/60">
          <div className="flex items-center gap-3 text-sm">
            <div className="w-6 h-6 rounded bg-secondary flex items-center justify-center text-muted-foreground font-serif italic">
              S
            </div>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-ink">Drafting: Leadership Culture</span>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              Tone
            </span>
            <div className="px-3 py-1.5 bg-secondary rounded-lg text-sm text-ink border border-border/60 shadow-sm">
              Authoritative & Warm
            </div>
          </div>
        </div>

        {/* App Body */}
        <div className="grid grid-cols-12 gap-px bg-border/60 rounded-b-2xl overflow-hidden">
          {/* Left Panel: Input */}
          <div className="col-span-12 md:col-span-4 bg-secondary p-7 flex flex-col gap-6">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-widest">
                Raw Material
              </label>
              <div className="p-5 bg-card rounded-xl text-sm text-muted-foreground border border-border/60 leading-relaxed h-40 shadow-sm">
                I was thinking about how most performance reviews are just backward-looking. It
                feels like an audit. We need to focus on future trajectory…
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-3">
              <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                <div className="h-full w-2/3 bg-gradient-to-r from-glow-start to-glow-end rounded-full" />
              </div>
              <p className="text-xs font-medium text-muted-foreground text-center">
                Structuring narrative arc…
              </p>
            </div>
          </div>

          {/* Right Panel: Output Canvas */}
          <div className="col-span-12 md:col-span-8 bg-card p-8 md:p-14 relative flex justify-center">
            <div className="w-full max-w-[50ch] space-y-7">
              <div className="group relative">
                <div className="absolute -left-12 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-[color:var(--glow-end)] uppercase tracking-widest hidden md:block">
                  Hook
                </div>
                <p className="text-2xl font-medium leading-snug text-ink">
                  Performance reviews are broken. We spend 90% of our time looking backward,
                  instead of charting the path forward.
                </p>
              </div>

              <div className="space-y-5 text-muted-foreground text-lg leading-relaxed font-light">
                <p>
                  For years, I dreaded the annual review cycle. It felt like an interrogation
                  rather than a development tool.
                </p>
                <p>
                  Then we made a single shift: We replaced the traditional “Review” with a
                  “Trajectory Alignment.”
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-secondary border border-[color:var(--glow-start)]/25 shadow-[inset_0_2px_10px_color-mix(in_oklab,var(--glow-start)_8%,transparent)]">
                <p className="text-lg font-medium text-ink">
                  The result? Attrition dropped by{" "}
                  <span className="tabular-nums">14%</span>, and internal promotions doubled in{" "}
                  <span className="tabular-nums">18</span> months.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
