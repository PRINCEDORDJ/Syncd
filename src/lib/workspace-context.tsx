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
import { createUniqueChannel } from "@/lib/realtime";
import type { Json } from "@/integrations/supabase/types";
import type { Workspace } from "@/lib/workspace-access";
import {
  MAX_IMAGES,
  MAX_ATTACHMENTS,
  dataUrlByteSize,
  validateImageBatch,
  validateAttachmentBatch,
  type AttachmentItem,
} from "@/lib/image-validation";
import {
  parseDualStream,
  applyCanvasResult,
  EDIT_FAILURE_MESSAGE,
  type EditOp,
} from "@/lib/ai-reply-format";

const ACTIVE_WORKSPACE_KEY = "syncd:active-workspace";
const AI_MODE_KEY = "syncd:ai-mode";

export const TONES = [
  "Authoritative & Warm",
  "Conversational",
  "Contrarian",
  "Storytelling",
] as const;
export type Tone = (typeof TONES)[number];

export type AiMode = "assistant" | "post-generator";

export type ChatRole = "user" | "assistant" | "system";
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** If true, this message is a canvas update summary, not a conversational reply */
  isCanvasUpdate?: boolean;
  /** If true, this turn changed the canvas (rendered as a "Canvas updated" chip) */
  canvasEdited?: boolean;
}

export interface WorkspaceState {
  // Workspace
  activeWorkspaceId: string | null;
  // Draft
  draftId: string | null;
  draft: string;
  title: string;
  titleEdited: boolean;
  tone: Tone;
  aiMode: AiMode;
  images: string[];
  attachments: AttachmentItem[];
  saving: boolean;
  /** Conversation thread id — shared with chat_messages / drafts.thread_id */
  threadId: string;
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
  setActiveWorkspace: (ws: Workspace) => void;
  setDraft: (d: string) => void;
  setTitle: (t: string) => void;
  setTitleEdited: (v: boolean) => void;
  setTone: (t: Tone) => void;
  setAiMode: (m: AiMode) => void;
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
  /** Abort an in-flight generation/stream */
  abortGeneration: () => void;
  /**
   * Start a fresh conversation. When a draft is open the new thread attaches to
   * it on the next turn (many chats per draft); with no draft this is a new
   * draft session.
   */
  newChat: () => void;
  /**
   * Open a chat thread (from the history list) and restore its transcript.
   * Standalone threads reset the canvas; threads linked to a draft load it.
   */
  openThread: (thread: { thread_id: string; draft_id: string | null }) => Promise<void>;
  publish: () => Promise<void>;
  loadDraft: (row: {
    id: string;
    content: string;
    title: string;
    tone: string;
    images: string[];
    attachments: AttachmentItem[];
    raw_input: string;
    thread_id?: string | null;
  }) => void;
  newDraft: () => void;
}

type WorkspaceCtx = WorkspaceState & WorkspaceActions;

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

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

function newThreadId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `thr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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
      const payloadStr = line.slice(6).trim();
      if (payloadStr === "[DONE]") {
        done = true;
        break;
      }
      try {
        const parsed = JSON.parse(payloadStr);
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

function readStoredWorkspaceId(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (!raw) return null;
    const ws = JSON.parse(raw) as Workspace;
    return ws.id ?? null;
  } catch {
    return null;
  }
}

function persistActiveWorkspace(ws: Workspace) {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(ws));
  } catch {
    // storage unavailable — non-fatal
  }
}

function readStoredAiMode(): AiMode {
  try {
    const v = localStorage.getItem(AI_MODE_KEY);
    if (v === "assistant" || v === "post-generator") return v;
  } catch {
    // storage unavailable — non-fatal
  }
  return "post-generator";
}

function persistAiMode(mode: AiMode) {
  try {
    localStorage.setItem(AI_MODE_KEY, mode);
  } catch {
    // storage unavailable — non-fatal
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() =>
    readStoredWorkspaceId(),
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string>(() => newThreadId());
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("Untitled draft");
  const [titleEdited, setTitleEdited] = useState(false);
  const [tone, setTone] = useState<Tone>("Authoritative & Warm");
  const [aiMode, setAiModeState] = useState<AiMode>(() => readStoredAiMode());
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
  // Latest committed canvas text — used to validate targeted edit ops at stream
  // completion even if the closure value is stale.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  // Monotonic token so a slow chat-history fetch never overwrites newer state.
  const loadSeqRef = useRef(0);

  // Reset all workspace state on account switch / sign-out so a previous
  // user's in-progress draft is never carried into another session
  // (important now that the provider lives above all routes).
  useEffect(() => {
    loadSeqRef.current += 1;
    setDraftId(null);
    setThreadId(newThreadId());
    setDraft("");
    setTitle("Untitled draft");
    setTitleEdited(false);
    setTone("Authoritative & Warm");
    setImages([]);
    setAttachments([]);
    setMessages([]);
    setError(null);
    setSuccess(null);
  }, [userId]);

  // Ensure active workspace is resolved and valid for current user.
  // Source of truth order: localStorage (fast cache) → profiles.active_workspace_id
  // (server-persisted, follows the user across devices) → owned workspace →
  // first active membership. Everything is validated against workspace access.
  useEffect(() => {
    if (!user) {
      setActiveWorkspaceId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      // 1. Validate the cached choice
      if (activeWorkspaceId) {
        const { data: hasAccess } = await supabase.rpc("has_workspace_access", {
          _user_id: user.id,
          _workspace_id: activeWorkspaceId,
        });
        if (hasAccess) return;
      }

      // 2. Server-persisted active workspace
      const { data: profile } = await supabase
        .from("profiles")
        .select("active_workspace_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const serverWsId = profile?.active_workspace_id;
      if (serverWsId) {
        const { data: hasAccess } = await supabase.rpc("has_workspace_access", {
          _user_id: user.id,
          _workspace_id: serverWsId,
        });
        if (hasAccess) {
          const { data: ws } = await supabase
            .from("workspaces")
            .select("id, name, owner_id, created_at, updated_at")
            .eq("id", serverWsId)
            .maybeSingle();
          if (ws) {
            setActiveWorkspaceId(ws.id);
            persistActiveWorkspace(ws as Workspace);
            return;
          }
        }
      }

      // 3. Fall back to the owned workspace, then first active membership
      const { data: owned } = await supabase
        .from("workspaces")
        .select("id, name, owner_id, created_at, updated_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let ws = owned as Workspace | undefined;
      if (!ws) {
        const { data: memberRows } = await supabase
          .from("workspace_members")
          .select("workspace:workspaces(id, name, owner_id, created_at, updated_at)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1);
        ws = memberRows?.[0]?.workspace as unknown as Workspace | undefined;
      }

      if (cancelled) return;
      if (ws) {
        setActiveWorkspaceId(ws.id);
        persistActiveWorkspace(ws);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
    const channel = createUniqueChannel(`linkedin-ws-${user.id}`)
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
      if (!user || !draft.trim() || !activeWorkspaceId) return null;
      setSaving(true);
      try {
        const payload = {
          user_id: user.id,
          workspace_id: activeWorkspaceId!,
          content: draft,
          raw_input: messages.filter((m) => m.role === "user")[0]?.content ?? "",
          thread_id: threadId,
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
          if (data?.id) {
            setDraftId(data.id);
            // Attach this thread to the new draft (many chats per draft: the
            // thread keeps its identity, the draft row is just linked).
            void (async () => {
              try {
                const { error: linkErr } = await supabase
                  .from("chat_threads")
                  .update({ draft_id: data.id })
                  .eq("thread_id", threadId)
                  .is("draft_id", null);
                if (linkErr) console.error("chat thread link failed", linkErr);
              } catch (e) {
                console.error("chat thread link failed", e);
              }
            })();
          }
          return data?.id ?? null;
        }
      } catch (e) {
        console.error("saveDraft failed", e);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [user, draft, messages, tone, title, images, attachments, draftId, activeWorkspaceId, threadId],
  );

  // ── Send message (generate / refine) ───────────────────────────────────────
  const sendMessage = useCallback(
    async (userInput: string) => {
      if (!userInput.trim() || generating) return;
      setError(null);
      setSuccess(null);

      const trimmedInput = userInput.trim();
      const userMsg: ChatMessage = { id: makeId(), role: "user", content: trimmedInput };
      const assistantMsgId = makeId();
      // `messages` is the conversation BEFORE this turn — the placeholder below
      // only exists in state, never in this closure.
      const isFirstTurn = messages.length === 0;
      const isPostMode = aiMode === "post-generator";
      const hasCanvas = draft.trim().length > 0;
      // The live canvas travels as structured context; the model quotes exact
      // substrings from it for targeted edits (empty canvas → raw-material path).
      const canvasForTurn = isPostMode && hasCanvas ? draft : null;

      // Pending history hydration must not clobber the turn we are about to add.
      loadSeqRef.current += 1;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantMsgId, role: "assistant", content: "", isCanvasUpdate: false },
      ]);
      setGenerating(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setGenerating(false);
        setError("Please sign in to generate posts.");
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== assistantMsgId));
        return;
      }

      const history = messages
        .filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") && !m.isCanvasUpdate && m.content.trim(),
        )
        .slice(-12)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      try {
        if (isPostMode && isFirstTurn && !hasCanvas) {
          setDraft("");
          draftRef.current = "";
          setDraftId(null);
          setTitle("Untitled draft");
          setTitleEdited(false);
        }

        const resp = await fetch("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            input: trimmedInput,
            tone,
            images,
            mode: aiMode,
            workspaceId: activeWorkspaceId ?? undefined,
            threadId,
            ...(draftId ? { draftId } : {}),
            history,
            ...(canvasForTurn ? { currentDraft: canvasForTurn } : {}),
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errData = (await resp.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || `Generation failed (${resp.status})`);
        }

        let accumulated = "";
        await consumeSseStream(resp, (chunk) => {
          accumulated += chunk;
          const { thoughts, post, isKeepCurrent } = parseDualStream(accumulated);

          if (thoughts) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, content: thoughts } : m)),
            );
          }

          // Stream fresh generations token-by-token. Refine turns never mutate
          // the canvas mid-stream — targeted edits and rewrites apply atomically
          // once the full response has arrived.
          if (isPostMode && canvasForTurn === null && post !== null && !isKeepCurrent) {
            setDraft(post);
            draftRef.current = post;
            if (!titleEdited) {
              setTitle(deriveTitle(post));
            }
          }
        });

        const parsed = parseDualStream(accumulated);
        let assistantContent =
          parsed.thoughts.trim() ||
          (parsed.isKeepCurrent
            ? "I've reviewed your request."
            : `Applied: "${trimmedInput.slice(0, 80)}${trimmedInput.length > 80 ? "…" : ""}"`);
        let canvasEditedFlag = false;

        if (isPostMode) {
          const outcome = applyCanvasResult(draftRef.current, parsed);
          if (outcome.status === "failed") {
            assistantContent = assistantContent
              ? `${assistantContent}\n\n${outcome.message}`
              : outcome.message;
          } else if (outcome.status === "replace") {
            setDraft(outcome.text);
            draftRef.current = outcome.text;
            if (!titleEdited) {
              setTitle(deriveTitle(outcome.text));
            }
            canvasEditedFlag = !isFirstTurn;
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: assistantContent,
                  canvasEdited: canvasEditedFlag || undefined,
                }
              : m,
          ),
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== assistantMsgId));
          return;
        }
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== assistantMsgId));
      } finally {
        setGenerating(false);
      }
    },
    [
      generating,
      messages,
      draft,
      tone,
      images,
      titleEdited,
      aiMode,
      activeWorkspaceId,
      threadId,
      draftId,
    ],
  );

  // ── Abort an in-flight generation ──────────────────────────────────────────
  const abortGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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

  // ── Chat transcript helpers ────────────────────────────────────────────────
  const fetchThreadMessages = useCallback(async (threadUid: string, seq: number) => {
    try {
      const { data: rows, error: fetchErr } = await supabase
        .from("chat_messages")
        .select("id, role, content, is_canvas_update, canvas_edited")
        .eq("thread_id", threadUid)
        .order("created_at", { ascending: true })
        .limit(200);
      if (fetchErr) throw fetchErr;
      const restored: ChatMessage[] = (rows ?? []).map((r) => ({
        id: r.id,
        role: r.role as ChatRole,
        content: r.content,
        canvasEdited:
          r.role === "assistant" && (r.canvas_edited || r.is_canvas_update) ? true : undefined,
      }));
      if (seq !== loadSeqRef.current) return;
      if (restored.length) setMessages(restored);
    } catch (e) {
      console.error("chat history load failed", e);
    }
  }, []);

  const applyDraftRow = useCallback(
    (
      row: {
        id: string;
        content: string;
        title: string;
        tone: string;
        images: string[];
        attachments: AttachmentItem[];
        raw_input: string;
        thread_id?: string | null;
      },
      seq: number,
    ) => {
      setDraftId(row.id);
      setThreadId(row.thread_id ?? newThreadId());
      setDraft(row.content);
      draftRef.current = row.content;
      setTitle(row.title || "Untitled draft");
      setTitleEdited(true);
      setTone((TONES.includes(row.tone as Tone) ? row.tone : TONES[0]) as Tone);
      setImages(row.images ?? []);
      setAttachments(row.attachments ?? []);
      setError(null);
      setSuccess(null);
      // Immediate fallback (drafts whose thread is being resolved)…
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
      // …then restore the thread transcript. A draft can have several chats;
      // open the most recently active one, falling back to the legacy
      // drafts.thread_id column.
      void (async () => {
        let effective = row.thread_id ?? null;
        try {
          const { data: latest, error: threadErr } = await supabase
            .from("chat_threads")
            .select("thread_id")
            .eq("draft_id", row.id)
            .order("last_message_at", { ascending: false })
            .limit(1);
          if (threadErr) throw threadErr;
          if (latest?.[0]?.thread_id) effective = latest[0].thread_id;
        } catch (e) {
          console.error("chat thread lookup failed", e);
        }
        if (seq !== loadSeqRef.current) return;
        if (effective) {
          setThreadId(effective);
          await fetchThreadMessages(effective, seq);
        }
      })();
    },
    [fetchThreadMessages],
  );

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
      thread_id?: string | null;
    }) => {
      applyDraftRow(row, ++loadSeqRef.current);
    },
    [applyDraftRow],
  );

  // ── Open a thread from the history list ─────────────────────────────────────
  const openThread = useCallback(
    async (thread: { thread_id: string; draft_id: string | null }) => {
      const seq = ++loadSeqRef.current;
      abortRef.current?.abort();
      setError(null);
      setSuccess(null);
      if (thread.draft_id) {
        const { data: row, error: fetchErr } = await supabase
          .from("drafts")
          .select("id, content, title, tone, images, attachments, raw_input, thread_id")
          .eq("id", thread.draft_id)
          .maybeSingle();
        if (fetchErr) {
          console.error("thread draft load failed", fetchErr);
          return;
        }
        if (row) {
          applyDraftRow(
            {
              id: row.id,
              content: row.content,
              title: row.title,
              tone: row.tone,
              images: (row.images as string[] | null) ?? [],
              attachments: (row.attachments as unknown as AttachmentItem[] | null) ?? [],
              raw_input: (row.raw_input as string | null) ?? "",
              thread_id: (row as { thread_id?: string | null }).thread_id ?? null,
            },
            seq,
          );
          return;
        }
        // Draft was deleted in the meantime — the thread cascade should have
        // removed it too; fall through and treat it as a standalone chat.
      }
      // Standalone chat: reset the canvas entirely.
      setDraftId(null);
      setDraft("");
      draftRef.current = "";
      setTitle("Untitled draft");
      setTitleEdited(false);
      setTone("Authoritative & Warm");
      setImages([]);
      setAttachments([]);
      setMessages([]);
      setThreadId(thread.thread_id);
      await fetchThreadMessages(thread.thread_id, seq);
    },
    [applyDraftRow, fetchThreadMessages],
  );

  // ── New draft ───────────────────────────────────────────────────────────────
  const newDraft = useCallback(() => {
    loadSeqRef.current += 1;
    abortRef.current?.abort();
    setDraftId(null);
    setThreadId(newThreadId());
    setDraft("");
    draftRef.current = "";
    setTitle("Untitled draft");
    setTitleEdited(false);
    setTone("Authoritative & Warm");
    setImages([]);
    setAttachments([]);
    setMessages([]);
    setError(null);
    setSuccess(null);
  }, []);

  // ── New chat ───────────────────────────────────────────────────────────────
  // Many chats per draft: with a draft open the conversation resets but the
  // canvas stays — the next turn's thread attaches to that draft server-side.
  // Without a draft this starts a fresh draft session.
  const newChat = useCallback(() => {
    if (!draftId) {
      newDraft();
      return;
    }
    loadSeqRef.current += 1;
    abortRef.current?.abort();
    setThreadId(newThreadId());
    setMessages([]);
    setError(null);
    setSuccess(null);
  }, [draftId, newDraft]);

  // ── AI Mode ────────────────────────────────────────────────────────────────
  const setAiMode = useCallback((m: AiMode) => {
    setAiModeState(m);
    persistAiMode(m);
  }, []);

  // ── Workspace switching ─────────────────────────────────────────────────────
  const setActiveWorkspace = useCallback((ws: Workspace) => {
    loadSeqRef.current += 1;
    setActiveWorkspaceId(ws.id);
    persistActiveWorkspace(ws);
    // Persist the choice server-side so it follows the user across devices.
    // Fire-and-forget — a failed write must not block the switch.
    void supabase.rpc("set_active_workspace", { p_workspace_id: ws.id }).then(({ error }) => {
      if (error) console.error("[workspace] set_active_workspace failed", error);
    });
    // Clear the canvas for the new workspace
    abortRef.current?.abort();
    setDraftId(null);
    setThreadId(newThreadId());
    setDraft("");
    draftRef.current = "";
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
    activeWorkspaceId,
    draftId,
    threadId,
    draft,
    title,
    titleEdited,
    tone,
    aiMode,
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
    setActiveWorkspace,
    setDraft,
    setTitle,
    setTitleEdited,
    setTone,
    setAiMode,
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
    abortGeneration,
    publish,
    loadDraft,
    openThread,
    newChat,
    newDraft,
  };

  return <WorkspaceContext.Provider value={ctx}>{children}</WorkspaceContext.Provider>;
}
