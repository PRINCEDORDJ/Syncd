import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/SiteNav";
import { BrandMark } from "@/components/BrandMark";
import { ImagePlus, X } from "lucide-react";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Workspace — SocialSync" },
      {
        name: "description",
        content: "Draft, refine, and publish your next LinkedIn post.",
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
        <span className="text-[13px] font-mono text-muted-foreground">Loading…</span>
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
  const [images, setImages] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [linkedinConnected, setLinkedinConnected] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const MAX_IMAGES = 4;

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${MAX_IMAGES} images.`);
      return;
    }
    const accepted: File[] = [];
    for (const f of Array.from(files).slice(0, remaining)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 5 * 1024 * 1024) {
        setError(`"${f.name}" is over 5MB.`);
        continue;
      }
      accepted.push(f);
    }
    const dataUrls = await Promise.all(
      accepted.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          }),
      ),
    );
    setImages((prev) => [...prev, ...dataUrls].slice(0, MAX_IMAGES));
    setError(null);
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  const charCount = draft.length;
  const overLimit = charCount > 3000;
  const wordCount = useMemo(
    () => draft.trim().split(/\s+/).filter(Boolean).length,
    [draft],
  );

  // Check LinkedIn connection status
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("linkedin_connections")
        .select("user_id, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const valid = !!data && new Date(data.expires_at).getTime() > Date.now();
      setLinkedinConnected(valid);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function generate() {
    if (!input.trim() || generating) return;
    setError(null);
    setSuccess(null);
    setGenerating(true);
    setDraft("");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ input, tone, images }),
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
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  async function publish() {
    if (overLimit || !draft.trim() || publishing) return;
    setPublishing(true);
    setError(null);
    setSuccess(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setPublishing(false);
      setError("Session expired — please sign in again.");
      return;
    }

    const resp = await fetch("/api/linkedin/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: draft }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
    };
    setPublishing(false);
    if (resp.ok && data.success) {
      setSuccess("Published to LinkedIn successfully.");
      // Save to drafts table as published
      if (user) {
        await supabase.from("drafts").insert({
          user_id: user.id,
          content: draft,
          raw_input: input,
          tone,
          char_count: draft.length,
          published: true,
          title: draft.slice(0, 60),
        });
      }
    } else {
      setError(data.error ?? "Failed to publish.");
    }
  }

  const greeting =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <SiteNav />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-2">
              Workspace
            </p>
            <h1 className="text-2xl md:text-3xl tracking-[-0.02em] font-semibold leading-tight">
              Welcome back, {greeting}.
            </h1>
          </div>
          <div className="flex items-center gap-3 text-[12px] font-mono">
            {linkedinConnected === null ? (
              <span className="text-muted-foreground">Checking LinkedIn…</span>
            ) : linkedinConnected ? (
              <span className="inline-flex items-center gap-1.5 text-ink">
                <span className="size-1.5 rounded-full bg-ink" />
                LinkedIn connected
              </span>
            ) : (
              <Link
                to="/settings"
                search={{ linkedin_connected: undefined }}
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-ink"
              >
                <span className="size-1.5 rounded-full bg-muted-foreground" />
                LinkedIn not connected · connect →
              </Link>
            )}
          </div>
        </div>

        {/* Workspace card */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 h-12 border-b border-border bg-subtle/40">
            <div className="flex items-center gap-2 text-[13px]">
              <BrandMark size={20} />
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-ink">Untitled draft</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.12em] mr-2">
                Tone
              </span>
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`h-7 px-2.5 rounded text-[12px] font-medium border transition-colors ${
                    tone === t
                      ? "bg-ink text-surface border-ink"
                      : "bg-card text-ink border-border hover:bg-subtle"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="grid grid-cols-1 md:grid-cols-12">
            {/* Input */}
            <section className="md:col-span-4 border-b md:border-b-0 md:border-r border-border p-5 flex flex-col gap-4 min-h-[60vh] bg-subtle/20">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="raw"
                  className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em]"
                >
                  Raw input
                </label>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {input.length} ch
                </span>
              </div>
              <textarea
                id="raw"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Dump a thought, a voice note transcript, or three messy bullets…"
                className="flex-1 resize-none p-3 bg-card rounded-md text-[14px] text-ink border border-border leading-relaxed focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink min-h-[200px]"
              />

              <button
                type="button"
                onClick={generate}
                disabled={generating || !input.trim()}
                className="h-10 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {generating
                  ? "Generating…"
                  : draft
                    ? "Regenerate"
                    : "Generate draft"}
              </button>

              <p className="text-[11px] font-mono text-muted-foreground text-center">
                Powered by Lovable AI
              </p>
            </section>

            {/* Canvas */}
            <section className="md:col-span-8 p-6 md:p-8 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                  Canvas
                </p>
                <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground tabular-nums">
                  <span>{wordCount} words</span>
                  <span className={overLimit ? "text-destructive font-semibold" : ""}>
                    {charCount} / 3000
                  </span>
                </div>
              </div>

              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSuccess(null);
                }}
                placeholder="Your generated post will appear here. Edit anything — it's yours."
                className="flex-1 w-full resize-none bg-transparent text-ink text-[16px] leading-relaxed focus:outline-none placeholder:text-muted-foreground/60 min-h-[40vh]"
              />

              {/* Image attachments — appear with the generated draft */}
              {draft && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                      Images
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {images.length} / {MAX_IMAGES}
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleFiles(e.target.files);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  />
                  {images.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {images.map((src, i) => (
                        <div
                          key={i}
                          className="relative aspect-square rounded-md overflow-hidden border border-border bg-card group"
                        >
                          <img
                            src={src}
                            alt={`Attachment ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            className="absolute top-1 right-1 size-5 rounded-full bg-ink/80 text-surface flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remove image"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={images.length >= MAX_IMAGES}
                    className="w-full h-9 rounded-md border border-dashed border-border text-[12px] font-medium text-muted-foreground hover:text-ink hover:border-ink/40 hover:bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <ImagePlus className="size-3.5" />
                    {images.length === 0 ? "Add images to post" : "Add more"}
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-4 px-3 py-2.5 rounded-md bg-destructive/5 border border-destructive/20 text-[13px] text-destructive">
                  {error}
                </div>
              )}
              {success && (
                <div className="mt-4 px-3 py-2.5 rounded-md bg-subtle border border-border text-[13px] text-ink flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-ink" />
                  {success}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-5 mt-5 border-t border-border">
                <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                  <span className="px-2 py-0.5 rounded bg-subtle border border-border uppercase tracking-[0.1em]">
                    {tone.split(" ")[0]}
                  </span>
                  {overLimit && (
                    <span className="text-destructive font-semibold">
                      Over LinkedIn limit
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(draft)}
                    disabled={!draft}
                    className="h-9 px-3 rounded-md text-[13px] font-medium text-ink border border-border hover:bg-subtle transition-colors disabled:opacity-50"
                  >
                    Copy
                  </button>
                  {linkedinConnected ? (
                    <button
                      type="button"
                      onClick={publish}
                      disabled={!draft.trim() || overLimit || publishing}
                      className="h-9 px-4 rounded-md text-[13px] font-medium bg-ink text-surface hover:bg-ink/90 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
                    >
                      {publishing ? "Publishing…" : "Publish to LinkedIn"}
                      <span aria-hidden className="text-surface/60">→</span>
                    </button>
                  ) : (
                    <Link
                      to="/settings"
                      className="h-9 px-4 rounded-md text-[13px] font-medium bg-ink text-surface hover:bg-ink/90 inline-flex items-center gap-1.5"
                    >
                      Connect LinkedIn
                      <span aria-hidden className="text-surface/60">→</span>
                    </Link>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
