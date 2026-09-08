import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  MAX_IMAGES,
  MAX_ATTACHMENTS,
  dataUrlByteSize,
  validateImageBatch,
  validateAttachmentBatch,
  type AttachmentItem,
} from "@/lib/image-validation";

export const TONES = [
  "Authoritative & Warm",
  "Conversational",
  "Contrarian",
  "Storytelling",
] as const;
export type Tone = (typeof TONES)[number];

export type ChatRole = "user" | "assistant" | "system";
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** If true, this message is a canvas update summary, not a conversational reply */
  isCanvasUpdate?: boolean;
}

export interface WorkspaceState {
  // Draft
  draftId: string | null;
  draft: string;
  title: string;
  titleEdited: boolean;
  tone: Tone;
  images: string[];
  attachments: AttachmentItem[];
  saving: boolean;
  // Generation
  generating: boolean;
  error: string | null;
  success: string | null;
  // Chat
  messages: ChatMessage[];
  // Publish
  publishing: boolean;
  linkedinConnected: boolean | null;
  // Counts
  charCount: number;
  wordCount: number;
  overLimit: boolean;
}

export interface WorkspaceActions {
  setDraft: (d: string) => void;
  setTitle: (t: string) => void;
  setTitleEdited: (v: boolean) => void;
  setTone: (t: Tone) => void;
  setImages: React.Dispatch<React.SetStateAction<string[]>>;
  setAttachments: React.Dispatch<React.SetStateAction<AttachmentItem[]>>;
  setError: (e: string | null) => void;
  setSuccess: (s: string | null) => void;
  handleFiles: (files: FileList | null) => Promise<void>;
  removeImage: (idx: number) => void;
  handleAttachFiles: (files: FileList | null) => Promise<void>;
  removeAttachment: (idx: number) => void;
  saveDraft: (asPublished?: boolean) => Promise<string | null>;
  /** Send a message: first turn = generate, subsequent = refine */
  sendMessage: (userInput: string) => Promise<void>;
  publish: () => Promise<void>;
  loadDraft: (row: {
    id: string;
    content: string;
    title: string;
    tone: string;
    images: string[];
    attachments: AttachmentItem[];
    raw_input: string;
  }) => void;
  newDraft: () => void;
}

type WorkspaceCtx = WorkspaceState & WorkspaceActions;

const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

function deriveTitle(content: string): string {
  const cleaned = content
    .replace(/[#*_`>~]+/g, " ")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Untitled draft";
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  let t = firstSentence.trim();
  const MAX = 60;
  if (t.length > MAX) {
    const slice = t.slice(0, MAX);
    const lastSpace = slice.lastIndexOf(" ");
    t = (lastSpace > 30 ? slice.slice(0, lastSpace) : slice).trim() + "…";
  }
  t = t.replace(/[.,;:!?\-–—]+$/g, "").trim();
  return t || "Untitled draft";
}

function makeId() {
  return Math.random().toString(36).slice(2);
}

/** Reads an SSE stream and accumulates the full text, calling onChunk for each delta. */
async function consumeSseStream(resp: Response, onChunk: (chunk: string) => void): Promise<void> {
  if (!resp.body) throw new Error("Empty response body.");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;
  while (!done) {
    const { done: sd, value } = await reader.read();
    if (sd) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
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
        if (typeof parsed.error === "string") throw new Error(parsed.error);
        const content: string | undefined = parsed.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("Untitled draft");
  const [titleEdited, setTitleEdited] = useState(false);
  const [tone, setTone] = useState<Tone>("Authoritative & Warm");
  const [images, setImages] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [linkedinConnected, setLinkedinConnected] = useState<boolean | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ── LinkedIn connection check ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase
        .from("linkedin_connections")
        .select("user_id, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setLinkedinConnected(!!data && new Date(data.expires_at).getTime() > Date.now());
    };
    void check();
    const channel = supabase
      .channel(`linkedin-ws-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "linkedin_connections",
          filter: `user_id=eq.${user.id}`,
        },
        () => void check(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !draft.trim() || generating) return;
    const t = setTimeout(() => {
      void saveDraft(false);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, title, images, attachments, user, generating]);

  // ── Auto-derive title ───────────────────────────────────────────────────────
  useEffect(() => {
    if (generating || titleEdited || !draft.trim()) return;
    const suggested = deriveTitle(draft);
    if (suggested && suggested !== title) setTitle(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating, draft, titleEdited]);

  // ── Counts ──────────────────────────────────────────────────────────────────
  const charCount = draft.length;
  const overLimit = charCount > 3000;
  const wordCount = useMemo(() => draft.trim().split(/\s+/).filter(Boolean).length, [draft]);

  // ── File helpers ────────────────────────────────────────────────────────────
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const existingBytes = images.reduce((s, src) => s + dataUrlByteSize(src), 0);
      const { accepted, errors } = validateImageBatch(
        Array.from(files),
        images.length,
        existingBytes,
      );
      if (errors.length) setError(errors.join(" "));
      else setError(null);
      if (!accepted.length) return;
      const dataUrls = await Promise.all(
        accepted.map(
          (f) =>
            new Promise<string>((res, rej) => {
              const r = new FileReader();
              r.onload = () => res(String(r.result));
              r.onerror = () => rej(r.error);
              r.readAsDataURL(f);
            }),
        ),
      );
      setImages((prev) => [...prev, ...dataUrls].slice(0, MAX_IMAGES));
    },
    [images],
  );

  const removeImage = useCallback((idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAttachFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const { accepted, errors } = validateAttachmentBatch(Array.from(files), attachments.length);
      if (errors.length) setError(errors.join(" "));
      else setError(null);
      if (!accepted.length) return;
      const items = await Promise.all(
        accepted.map(
          (f) =>
            new Promise<AttachmentItem>((res, rej) => {
              const r = new FileReader();
              r.onload = () =>
                res({
                  name: f.name,
                  size: f.size,
                  type: f.type || "application/octet-stream",
                  dataUrl: String(r.result),
                });
              r.onerror = () => rej(r.error);
              r.readAsDataURL(f);
            }),
        ),
      );
      setAttachments((prev) => [...prev, ...items].slice(0, MAX_ATTACHMENTS));
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Save draft ──────────────────────────────────────────────────────────────
  const saveDraft = useCallback(
    async (asPublished = false): Promise<string | null> => {
      if (!user || !draft.trim()) return null;
      setSaving(true);
      try {
        const payload = {
          user_id: user.id,
          content: draft,
          raw_input: messages.filter((m) => m.role === "user")[0]?.content ?? "",
          tone,
          char_count: draft.length,
          title: title.trim() || "Untitled draft",
          images,
          attachments: attachments as unknown as Json,
          media_bytes:
            images.reduce((s, u) => s + dataUrlByteSize(u), 0) +
            attachments.reduce((s, a) => s + (a.size || dataUrlByteSize(a.dataUrl)), 0),
          ...(asPublished ? { published: true } : {}),
        };
        if (draftId) {
          const { error: upErr } = await supabase
            .from("drafts")
            .update(payload)
            .eq("id", draftId)
            .eq("user_id", user.id);
          if (upErr) throw upErr;
          return draftId;
        } else {
          const { data, error: insErr } = await supabase
            .from("drafts")
            .insert(payload)
            .select("id")
            .single();
          if (insErr) throw insErr;
          if (data?.id) setDraftId(data.id);
          return data?.id ?? null;
        }
      } catch (e) {
        console.error("saveDraft failed", e);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [user, draft, messages, tone, title, images, attachments, draftId],
  );

  // ── Send message (generate / refine) ───────────────────────────────────────
  const sendMessage = useCallback(
    async (userInput: string) => {
      if (!userInput.trim() || generating) return;
      setError(null);
      setSuccess(null);

      const userMsg: ChatMessage = { id: makeId(), role: "user", content: userInput };
      const isFirstTurn = messages.length === 0;

      setMessages((prev) => [...prev, userMsg]);
      setGenerating(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      try {
        if (isFirstTurn) {
          // ── First turn: generate ──────────────────────────────────────────────
          setDraft("");
          setDraftId(null);
          setTitle("Untitled draft");
          setTitleEdited(false);

          const resp = await fetch("/api/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ input: userInput, tone, images }),
            signal: controller.signal,
          });

          if (!resp.ok || !resp.body) {
            const data = await resp.json().catch(() => null);
            throw new Error(data?.error ?? "Generation failed.");
          }

          let accumulated = "";
          await consumeSseStream(resp, (chunk) => {
            accumulated += chunk;
            setDraft(accumulated);
          });

          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "system",
              content: "Generated a first draft.",
              isCanvasUpdate: true,
            },
          ]);
        } else {
          // ── Subsequent turns: refine ──────────────────────────────────────────
          const currentDraft = draft; // capture for closure

          const refineInput = `Current draft:\n"""\n${currentDraft}\n"""\n\nInstruction: ${userInput}\n\nApply the instruction and return only the updated post text. No preamble, no labels.`;

          const resp = await fetch("/api/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ input: refineInput, tone, images }),
            signal: controller.signal,
          });

          if (!resp.ok || !resp.body) {
            const data = await resp.json().catch(() => null);
            throw new Error(data?.error ?? "Refinement failed.");
          }

          let accumulated = "";
          await consumeSseStream(resp, (chunk) => {
            accumulated += chunk;
            setDraft(accumulated);
          });

          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "assistant",
              content: `Applied: "${userInput.slice(0, 80)}${userInput.length > 80 ? "…" : ""}"`,
              isCanvasUpdate: true,
            },
          ]);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
          return;
        }
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      } finally {
        setGenerating(false);
      }
    },
    [generating, messages, draft, tone, images],
  );

  // ── Publish ─────────────────────────────────────────────────────────────────
  const publish = useCallback(async () => {
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: draft, images }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      code?: string;
    };
    setPublishing(false);
    if (resp.ok && data.success) {
      setSuccess("Published to LinkedIn successfully.");
      if (user) await saveDraft(true);
    } else {
      if (data.code === "LINKEDIN_TOKEN_EXPIRED") setLinkedinConnected(false);
      setError(data.error ?? "Failed to publish.");
    }
  }, [overLimit, draft, publishing, images, user, saveDraft]);

  // ── Load existing draft ─────────────────────────────────────────────────────
  const loadDraft = useCallback(
    (row: {
      id: string;
      content: string;
      title: string;
      tone: string;
      images: string[];
      attachments: AttachmentItem[];
      raw_input: string;
    }) => {
      setDraftId(row.id);
      setDraft(row.content);
      setTitle(row.title || "Untitled draft");
      setTitleEdited(true);
      setTone((TONES.includes(row.tone as Tone) ? row.tone : TONES[0]) as Tone);
      setImages(row.images ?? []);
      setAttachments(row.attachments ?? []);
      setError(null);
      setSuccess(null);
      setMessages(
        row.raw_input
          ? [
              { id: makeId(), role: "user", content: row.raw_input },
              {
                id: makeId(),
                role: "system",
                content: "Loaded from saved draft.",
                isCanvasUpdate: true,
              },
            ]
          : [],
      );
    },
    [],
  );

  // ── New draft ───────────────────────────────────────────────────────────────
  const newDraft = useCallback(() => {
    abortRef.current?.abort();
    setDraftId(null);
    setDraft("");
    setTitle("Untitled draft");
    setTitleEdited(false);
    setTone("Authoritative & Warm");
    setImages([]);
    setAttachments([]);
    setMessages([]);
    setError(null);
    setSuccess(null);
  }, []);

  const ctx: WorkspaceCtx = {
    draftId,
    draft,
    title,
    titleEdited,
    tone,
    images,
    attachments,
    saving,
    generating,
    error,
    success,
    messages,
    publishing,
    linkedinConnected,
    charCount,
    wordCount,
    overLimit,
    setDraft,
    setTitle,
    setTitleEdited,
    setTone,
    setImages,
    setAttachments,
    setError,
    setSuccess,
    handleFiles,
    removeImage,
    handleAttachFiles,
    removeAttachment,
    saveDraft,
    sendMessage,
    publish,
    loadDraft,
    newDraft,
  };

  return <WorkspaceContext.Provider value={ctx}>{children}</WorkspaceContext.Provider>;
}
