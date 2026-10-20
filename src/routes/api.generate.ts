import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import {
  AiConfigurationError,
  createAiTextStream,
  type AiChatMessage,
  type AiImageInput,
} from "@/lib/ai-provider.server";
import { PLAN_LIMITS, type PlanTier } from "@/lib/plans";
import { renderVoiceProfileBlock, type VoiceProfile } from "@/lib/voice-profile";
import { parseDualStream, isCanvasEditResult } from "@/lib/ai-reply-format";

const SYSTEM_PROMPT_POST = `You are Syncd, an expert AI LinkedIn writing assistant and post generator.

Your role is twofold:
1. Act as a thoughtful, insightful writing coach in the chat conversation.
2. Generate and refine polished LinkedIn posts directly on the Canvas.

MEMORY: The full conversation history is provided to you with every turn — you always have it. Never claim you lack memory of the conversation; refer to prior turns freely.

OUTPUT FORMAT RULES:
Always structure your response using these exact delimiters:

<<<THOUGHTS>>>
[1 to 3 friendly, expert sentences to the writer in chat. Explain your strategic angle, hook rationale, what you changed, or answer any specific questions/brainstorming prompts.]
<<<POST>>> or <<<EDIT>>>
[Exactly one of the two sections below — never both.]

FULL POST (use when generating from scratch, when the writer asks for a full rewrite, or when the canvas is empty):
<<<POST>>>
[The full polished LinkedIn post text to appear on the Canvas.
Rules for the post:
- Plain text only with natural line breaks. Do NOT use markdown formatting (no **, no #, no bullet asterisks).
- Open with a strong, arresting first line hook.
- Use short, breathable paragraphs separated by blank lines.
- Include specific details, real tension, or actionable takeaways — never corporate buzzwords or generic platitudes.
- End with a quiet payoff or one natural open question — never cliché "What do you think?" or "Let me know in the comments".
- Strictly match the requested tone.
- Stay under 2,800 characters.]

TARGETED EDIT (use for refinement turns when the canvas already has text — "make it punchier", "cut paragraph 2", "swap the hook"):
<<<EDIT>>>
<<<OLD>>>
[An exact, verbatim substring copied from the current canvas — the precise text you want to replace. Copy it character-for-character, including line breaks and punctuation. Never paraphrase, never elide with "...".]
<<<END_OLD>>>
<<<NEW>>>
[Your replacement text for that span only.]
<<<END_NEW>>>
<<<END_EDIT>>>
[Repeat the OLD/NEW pair inside the single EDIT block for each separate spot you want to change. Only touch the spans the writer asked to change — leave every other part of the canvas untouched. Quote text only when you are replacing it.]

If the user is ONLY asking a question, asking for advice, or chatting without requesting a post draft creation or change:
<<<THOUGHTS>>>
[Your complete helpful response to the user's question]
<<<POST>>>
KEEP_CURRENT`;

const SYSTEM_PROMPT_ASSISTANT = `You are Syncd, an expert AI writing assistant and LinkedIn strategist.

Your role is to be a helpful brainstorming partner, writing coach, and strategy advisor. You help users think through ideas, craft better hooks, understand LinkedIn best practices, and develop their content strategy.

MEMORY: The full conversation history is provided to you with every turn — you always have it. Never claim you lack memory of the conversation; refer to prior turns freely.

OUTPUT FORMAT RULES:
Always structure your response using this exact delimiter:

<<<THOUGHTS>>>
[Your complete, helpful response to the user. Be concise but thorough. Use a friendly, expert tone. Give actionable advice, specific examples, or clear brainstorming output as needed.]

Do NOT include a <<<POST>>> section. You are in assistant mode — just provide helpful conversational responses.`;

const VALID_TONES = ["Authoritative & Warm", "Conversational", "Expert", "Storytelling"] as const;
type Tone = (typeof VALID_TONES)[number];

function isValidTone(t: unknown): t is Tone {
  return typeof t === "string" && (VALID_TONES as readonly string[]).includes(t);
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function refundCredit(
  userId: string,
  creditType: "subscription" | "topup" | "auto" = "auto",
  workspaceId?: string,
) {
  const { error } = await supabaseAdmin.rpc("refund_credit", {
    _user_id: userId,
    _reason: "ai_provider_error",
    _credit_type: creditType,
    _workspace_id: workspaceId,
  });
  if (error) console.error("[generate] refund_credit failed", error);
}

function providerErrorMessage(error: unknown): string {
  if (error instanceof AiConfigurationError) return error.message;
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 401 || status === 403) {
    return "The AI provider rejected the API key on the server. Please contact support.";
  }
  if (status === 429) {
    return "The AI provider is rate-limited right now. Please try again in a moment.";
  }
  if (status === 404) {
    return "The configured AI model was not found on the provider. Please contact support.";
  }
  if (status === 402) {
    return "The AI provider account has insufficient credit. Please try again later.";
  }
  return "The AI provider is unavailable. Please try again.";
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_CHARS = 4000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THREAD_TITLE_MAX = 80;

/** Validates and trims the client-supplied conversation history (oldest first). */
function sanitizeHistory(raw: unknown): AiChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: AiChatMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    cleaned.push({ role, content: trimmed.slice(0, MAX_HISTORY_MESSAGE_CHARS) });
  }
  // Keep only the most recent turns if the client overshoots.
  return cleaned.slice(-MAX_HISTORY_MESSAGES);
}

/** First user message of a thread becomes its title (truncated, ellipsised). */
function threadTitleFromMessage(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  const truncated = t.slice(0, THREAD_TITLE_MAX);
  return (t.length > THREAD_TITLE_MAX ? `${truncated}…` : truncated) || "New chat";
}

function assistantFallbackContent(input: string, isKeepCurrent: boolean): string {
  const clipped = input.slice(0, 80);
  return isKeepCurrent
    ? "I've reviewed your request."
    : `Applied: "${clipped}${input.length > 80 ? "…" : ""}"`;
}

interface TurnContext {
  userId: string;
  workspaceId: string;
  threadId: string;
  draftId: string | null;
  input: string;
  isAssistantMode: boolean;
}

/**
 * Server-authoritative memory: rebuilds the conversation from persisted
 * chat_messages rows for the caller's thread. Runs BEFORE the current turn is
 * stored, so the just-arrived message can never appear twice. The
 * client-supplied history is only a fallback for threads without persisted
 * rows yet.
 */
async function fetchThreadHistory(
  ctx: TurnContext,
  fallback: AiChatMessage[],
): Promise<AiChatMessage[]> {
  try {
    // Ownership gate: a thread row not owned by the caller yields no history
    // (persistUserTurn applies the same rule, so nothing leaks).
    const { data: thread } = await supabaseAdmin
      .from("chat_threads")
      .select("id")
      .eq("thread_id", ctx.threadId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!thread) return fallback;
    const { data: rows, error } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content")
      .eq("thread_id", ctx.threadId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);
    if (error) throw error;
    const restored = (rows ?? []).map((row) => ({
      role: row.role as AiChatMessage["role"],
      content: row.content,
    }));
    // rows came newest-first; rebuild oldest-first and reuse the sanitizer for
    // role/content validation and the per-message char cap.
    return sanitizeHistory(restored.reverse());
  } catch (e) {
    console.error("[generate] thread history load failed", e);
    return fallback;
  }
}

/**
 * Upserts the thread row and stores the user's message. Runs before the AI
 * provider call so a turn is never lost on provider failure (credits are still
 * refunded on that path). Returns the draft linkage committed to the thread.
 */
async function persistUserTurn(ctx: TurnContext): Promise<string | null> {
  const preview = ctx.input.trim().slice(0, 120);
  const now = new Date().toISOString();
  let threadDraftId: string | null = null;
  try {
    const { data: existing } = await supabaseAdmin
      .from("chat_threads")
      .select("draft_id, title")
      .eq("thread_id", ctx.threadId)
      .maybeSingle();
    if (existing) {
      threadDraftId = existing.draft_id ?? ctx.draftId;
      const patch: {
        last_message_preview: string;
        last_message_at: string;
        title?: string;
        draft_id?: string | null;
      } = {
        last_message_preview: preview,
        last_message_at: now,
      };
      if ((existing.title ?? "") === "New chat") patch.title = threadTitleFromMessage(ctx.input);
      // Keep an already-committed linkage; adopt the client draft only if the
      // thread was never linked (never unlinks a chat from a draft).
      if (ctx.draftId && !existing.draft_id) patch.draft_id = ctx.draftId;
      await supabaseAdmin.from("chat_threads").update(patch).eq("thread_id", ctx.threadId);
    } else {
      threadDraftId = ctx.draftId;
      await supabaseAdmin.from("chat_threads").insert({
        thread_id: ctx.threadId,
        user_id: ctx.userId,
        workspace_id: ctx.workspaceId,
        draft_id: ctx.draftId,
        title: threadTitleFromMessage(ctx.input),
        last_message_preview: preview,
        last_message_at: now,
      });
    }
    const { error: insertErr } = await supabaseAdmin.from("chat_messages").insert({
      user_id: ctx.userId,
      workspace_id: ctx.workspaceId,
      thread_id: ctx.threadId,
      draft_id: threadDraftId,
      role: "user",
      content: ctx.input,
      is_canvas_update: false,
      canvas_edited: false,
    });
    if (insertErr) console.error("[generate] user message persist failed", insertErr);
  } catch (e) {
    console.error("[generate] user turn persist failed", e);
  }
  return threadDraftId;
}

/** Stores the assistant's reply after the stream completed successfully. */
async function persistAssistantTurn(ctx: TurnContext, threadDraftId: string | null, raw: string) {
  try {
    const parsed = parseDualStream(raw);
    const content =
      parsed.thoughts.trim() || assistantFallbackContent(ctx.input, parsed.isKeepCurrent);
    await supabaseAdmin.from("chat_messages").insert({
      user_id: ctx.userId,
      workspace_id: ctx.workspaceId,
      thread_id: ctx.threadId,
      draft_id: threadDraftId,
      role: "assistant",
      content,
      // Server-side best estimate: the client re-checks exact edit matches
      // before touching the canvas, so a failed targeted edit may still be
      // flagged here — the badge is cosmetic only.
      is_canvas_update: false,
      canvas_edited: ctx.isAssistantMode ? false : isCanvasEditResult(parsed),
    });
  } catch (e) {
    console.error("[generate] assistant turn persist failed", e);
  }
}

function toSseStream(
  textStream: AsyncIterable<string>,
  userId: string,
  creditType: "subscription" | "topup" | "auto" = "auto",
  workspaceId?: string,
  turn?: { ctx: TurnContext; threadDraftId: string | null },
) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let accumulated = "";
        for await (const chunk of textStream) {
          accumulated += chunk;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`,
            ),
          );
        }
        if (turn) {
          await persistAssistantTurn(turn.ctx, turn.threadDraftId, accumulated);
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[generate] AI stream failed", error);
        await refundCredit(userId, creditType, workspaceId);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: providerErrorMessage(error) })}\n\n`),
        );
        controller.close();
      }
    },
  });
}

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }

        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
          authHeader.slice(7),
        );
        if (userErr || !userData.user) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }
        const userId = userData.user.id;

        // 1. Validate request payload BEFORE charging any credits
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body." }, 400);
        }

        const { input, tone, images, mode, workspaceId, threadId, draftId, history, currentDraft } =
          (body ?? {}) as {
            input?: unknown;
            tone?: unknown;
            images?: unknown;
            mode?: unknown;
            workspaceId?: unknown;
            threadId?: unknown;
            draftId?: unknown;
            history?: unknown;
            currentDraft?: unknown;
          };
        let resolvedWsId = typeof workspaceId === "string" ? workspaceId : undefined;
        // When the client doesn't send a workspace, resolve the caller's owned
        // workspace server-side so the charge always hits a deterministic pool.
        if (!resolvedWsId) {
          const { data: ownedWs } = await supabaseAdmin
            .from("workspaces")
            .select("id")
            .eq("owner_id", userId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          resolvedWsId = ownedWs?.id;
        }
        const conversationHistory = sanitizeHistory(history);
        const canvasText =
          typeof currentDraft === "string" && currentDraft.trim().length > 0
            ? currentDraft.slice(0, 4000)
            : null;
        if (typeof input !== "string" || input.trim().length === 0) {
          return jsonResponse({ error: "Please provide some raw material to work from." }, 400);
        }
        if (input.length > 4000) {
          return jsonResponse({ error: "Raw material is too long (max 4,000 characters)." }, 400);
        }
        // Conversation thread — message persistence keys on it.
        if (typeof threadId !== "string" || !UUID_RE.test(threadId)) {
          return jsonResponse({ error: "Invalid conversation thread." }, 400);
        }
        // Optional draft linkage: accepted only when the draft belongs to the
        // caller (a chat thread can be attached to at most one draft).
        let turnDraftId: string | null = null;
        if (typeof draftId === "string" && UUID_RE.test(draftId)) {
          const { data: draftRow } = await supabaseAdmin
            .from("drafts")
            .select("id")
            .eq("id", draftId)
            .eq("user_id", userId)
            .maybeSingle();
          if (draftRow) turnDraftId = draftRow.id;
        }

        // 2. Resolve plan and check feature gating (voice notes require Studio or Teams).
        //    Admins get full plan access server-side regardless of their
        //    workspace's stored plan tier.
        const [planRes, profRes, roleRes] = await Promise.all([
          resolvedWsId
            ? supabaseAdmin.rpc("get_workspace_plan", { p_workspace_id: resolvedWsId })
            : supabaseAdmin.rpc("get_user_plan", { _user_id: userId }),
          supabaseAdmin
            .from("profiles")
            .select("voice_notes, voice_profile")
            .eq("user_id", userId)
            .maybeSingle(),
          supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
        ]);
        const isAdminUser = !!roleRes.data?.some((r) => r.role === "admin");
        const userPlan: PlanTier = isAdminUser
          ? "teams"
          : ((planRes.data as PlanTier | null) ?? "trial");
        const allowsVoiceMapping = PLAN_LIMITS[userPlan]?.voiceMapping ?? false;
        const rawVoiceNotes = (profRes.data?.voice_notes ?? "").trim();
        const voiceNotes = allowsVoiceMapping ? rawVoiceNotes : "";
        const voiceMapBlock = allowsVoiceMapping
          ? renderVoiceProfileBlock(
              (profRes.data?.voice_profile ?? null) as unknown as VoiceProfile | null,
            )
          : "";

        // 3. Deduct credit from workspace
        const { data: creditRes, error: creditErr } = await supabaseAdmin.rpc("consume_credit", {
          _user_id: userId,
          _workspace_id: resolvedWsId,
        });
        if (creditErr) {
          console.error("[generate] consume_credit failed", creditErr);
          return jsonResponse({ error: "Could not verify your credit balance." }, 500);
        }
        const credit = creditRes as {
          success?: boolean;
          reason?: string;
          source?: string;
        } | null;
        if (!credit?.success) {
          switch (credit?.reason) {
            case "daily_limit_reached":
              return jsonResponse(
                {
                  error:
                    "You've hit today's 5-generation cap on the Free plan. Come back tomorrow or upgrade to Studio.",
                  code: "NO_CREDITS",
                },
                402,
              );
            case "no_credits":
              return jsonResponse(
                {
                  error: "You're out of credits. Upgrade or buy a top-up pack to keep generating.",
                  code: "NO_CREDITS",
                },
                402,
              );
            case "not_a_member":
              // Caller is no longer an active member of the target workspace.
              console.error("[generate] consume_credit not_a_member", { userId, resolvedWsId });
              return jsonResponse(
                {
                  error: "You don't have access to this workspace anymore.",
                  code: "NOT_WORKSPACE_MEMBER",
                },
                403,
              );
            case "no_workspace":
              return jsonResponse(
                {
                  error: "No workspace found for your account. Create one to start generating.",
                  code: "NO_WORKSPACE",
                },
                409,
              );
            default:
              console.error("[generate] consume_credit unexpected reason", credit?.reason, {
                userId,
                resolvedWsId,
              });
              return jsonResponse(
                { error: "You don't have enough credits for this generation.", code: "NO_CREDITS" },
                402,
              );
          }
        }
        const creditSource = (
          credit?.source === "topup"
            ? "topup"
            : credit?.source === "subscription"
              ? "subscription"
              : "auto"
        ) as "subscription" | "topup" | "auto";

        const isAssistantMode = mode === "assistant";

        // Persist the user's turn before the provider call. consume_credit may
        // have resolved an owned workspace server-side, so confirm the id of
        // the workspace before touching thread/message tables (chat tables key
        // on workspace_id).
        if (!resolvedWsId) {
          const { data: ownedWs } = await supabaseAdmin
            .from("workspaces")
            .select("id")
            .eq("owner_id", userId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          resolvedWsId = ownedWs?.id;
        }
        let turnCtx: TurnContext | undefined;
        let threadDraftId: string | null = turnDraftId;
        let effectiveHistory: AiChatMessage[] = conversationHistory;
        if (resolvedWsId) {
          turnCtx = {
            userId,
            workspaceId: resolvedWsId,
            threadId,
            draftId: turnDraftId,
            input,
            isAssistantMode,
          };
          // Server-authoritative memory: rebuild the conversation from
          // persisted rows BEFORE the current turn is stored (ordering keeps
          // the just-arrived message out of the rebuilt history).
          effectiveHistory = await fetchThreadHistory(turnCtx, conversationHistory);
          threadDraftId = await persistUserTurn(turnCtx);
        }
        const systemPrompt = isAssistantMode ? SYSTEM_PROMPT_ASSISTANT : SYSTEM_PROMPT_POST;

        const imageInputs: AiImageInput[] = [];
        if (Array.isArray(images)) {
          for (const image of images.slice(0, 4)) {
            if (typeof image !== "string" || !image.startsWith("data:image/")) continue;
            if (image.length >= 7_000_000) continue;
            const match = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(image);
            if (!match) continue;
            imageInputs.push({ dataUrl: image, mimeType: match[1], base64: match[2] });
          }
        }

        const safeTone: Tone = isValidTone(tone) ? tone : "Authoritative & Warm";
        const voiceNotesBlock = voiceNotes
          ? `\n\nFree-form voice notes (secondary context — the structured voice map above wins on conflicts):\n"""\n${voiceNotes.slice(0, 1500)}\n"""`
          : "";
        const voiceBlock = voiceMapBlock
          ? voiceNotesBlock
            ? `\n\n${voiceMapBlock}${voiceNotesBlock}`
            : `\n\n${voiceMapBlock}`
          : voiceNotesBlock;
        const imageInstruction = imageInputs.length
          ? `\n\nThe writer attached ${imageInputs.length} image(s) as additional context. Weave relevant visual details (people, places, screenshots, products, moments) into the post naturally if they add specificity.`
          : "";
        const canvasBlock = canvasText
          ? `\n\nCurrent canvas (the live post — source of truth, includes manual edits):\n"""\n${canvasText}\n"""`
          : "";
        const userPrompt = isAssistantMode
          ? `User message:\n"""\n${input.trim()}\n"""\n\nRespond helpfully as a writing and LinkedIn strategy advisor.`
          : canvasText
            ? `Tone: ${safeTone}${voiceBlock}${imageInstruction}${canvasBlock}

The writer's instruction for this turn:
"""
${input.trim()}
"""

Apply the instruction to the current canvas without disturbing parts the instruction doesn't concern.
- For a targeted change (shorten, reword, cut/replace a span), reply with <<<THOUGHTS>>> plus a <<<EDIT>>> block whose <<<OLD>>> content is an exact verbatim substring of the current canvas.
- Use a full <<<POST>>> rewrite only when the instruction calls for a complete rewrite.
- If the instruction is a question or needs no canvas change, use KEEP_CURRENT.`
            : `Tone: ${safeTone}${voiceBlock}${imageInstruction}

Raw material from the writer:
"""
${input.trim()}
"""

Write the LinkedIn post now.`;

        let textStream: AsyncIterable<string>;
        try {
          textStream = await createAiTextStream({
            systemPrompt,
            userPrompt,
            images: isAssistantMode ? [] : imageInputs,
            history: effectiveHistory,
          });
        } catch (error) {
          console.error("[generate] AI provider request failed", error);
          await refundCredit(userId, creditSource, resolvedWsId);
          return jsonResponse({ error: providerErrorMessage(error) }, 502);
        }

        const turn = turnCtx ? { ctx: turnCtx, threadDraftId } : undefined;
        return new Response(toSseStream(textStream, userId, creditSource, resolvedWsId, turn), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
