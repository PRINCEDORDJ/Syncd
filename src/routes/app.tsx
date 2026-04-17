import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
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
  component: WorkspaceGate,
});

function WorkspaceGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: "/app" } });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-dvh bg-background text-ink flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-[color:var(--glow-start)] animate-pulse" />
          <span className="text-sm font-light">Opening your workspace…</span>
        </div>
      </div>
    );
  }

  return <Workspace />;
}

const TONES = ["Authoritative & Warm", "Conversational", "Contrarian", "Storytelling"] as const;
type Tone = (typeof TONES)[number];

function Workspace() {
  const { user } = useAuth();
  const [tone, setTone] = useState<Tone>("Authoritative & Warm");
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const charCount = draft.length;
  const overLimit = charCount > 3000;
  const wordCount = useMemo(
    () => draft.trim().split(/\s+/).filter(Boolean).length,
    [draft],
  );

  async function generate() {
    if (!input.trim() || generating) return;
    setError(null);
    setPublished(false);
    setGenerating(true);
    setDraft("");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, tone }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const data = await resp.json().catch(() => null);
        throw new Error(data?.error ?? "Generation failed.");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        textBuffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, nl);
          textBuffer = textBuffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const content: string | undefined = parsed.choices?.[0]?.delta?.content;
            if (content) setDraft((prev) => prev + content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const json = raw.slice(6).trim();
          if (json === "[DONE]") continue;
          try {
            const parsed = JSON.parse(json);
            const content: string | undefined = parsed.choices?.[0]?.delta?.content;
            if (content) setDraft((prev) => prev + content);
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  function publish() {
    if (overLimit || !draft.trim()) return;
    setPublished(true);
    setTimeout(() => setPublished(false), 5000);
  }

  const greeting =
    user?.user_metadata?.display_name ??
    user?.email?.split("@")[0] ??
    "writer";

  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <SiteNav />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              Workspace
            </p>
            <h1 className="text-3xl md:text-4xl tracking-tight font-light leading-tight">
              Welcome back, <span className="font-serif italic">{greeting}</span>.
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

        <div className="bg-card rounded-3xl p-2 shadow-glass border border-border/60 ring-1 ring-ink/[0.02]">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-border/60">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-7 h-7 rounded bg-secondary flex items-center justify-center text-muted-foreground font-serif italic">
                S
              </div>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-ink">Untitled draft</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                      ? "bg-ink text-white border-ink"
                      : "bg-card text-ink border-border hover:border-ink/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-px bg-border/60 rounded-b-2xl overflow-hidden">
            <section className="md:col-span-4 bg-card p-6 flex flex-col gap-5 min-h-[60vh]">
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
                className="flex-1 resize-none p-4 bg-secondary/40 rounded-xl text-sm text-ink border border-border leading-relaxed focus:outline-none focus:ring-2 focus:ring-[color:var(--glow-end)]/40 focus:border-[color:var(--glow-end)]/50 transition-all min-h-[200px]"
              />

              <button
                type="button"
                onClick={generate}
                disabled={generating || !input.trim()}
                className="w-full py-3.5 rounded-xl bg-ink text-white font-medium shadow-cta hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
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

              {error && (
                <div className="text-sm text-[color:var(--glow-end)] bg-[color:var(--glow-end)]/8 border border-[color:var(--glow-end)]/25 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground text-center font-light">
                Powered by Lovable AI · Gemini 3 Flash
              </p>
            </section>

            <section className="md:col-span-8 bg-card p-6 md:p-10 flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  Canvas
                </p>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground tabular-nums">
                  <span>{wordCount} words</span>
                  <span
                    className={
                      overLimit
                        ? "text-[color:var(--glow-end)] font-medium"
                        : "text-muted-foreground"
                    }
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
                  <span className="px-2 py-1 rounded bg-secondary border border-border font-mono uppercase tracking-wider">
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
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-ink border border-border hover:border-ink/30 transition-colors disabled:opacity-50"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={publish}
                    disabled={!draft.trim() || overLimit}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-glow-start to-glow-end text-white shadow-cta hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-2"
                  >
                    Publish to LinkedIn
                    <span>→</span>
                  </button>
                </div>
              </div>

              {published && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-secondary/60 border border-[color:var(--glow-start)]/30 text-sm text-ink flex items-center gap-3">
                  <span className="size-1.5 rounded-full bg-[color:var(--glow-end)]" />
                  LinkedIn isn't connected yet — your draft is safely yours. We'll wire
                  publishing next.
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
