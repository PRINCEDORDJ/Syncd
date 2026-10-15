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

const SYSTEM_PROMPT_POST = `You are Syncd, an expert AI LinkedIn writing assistant and post generator.

Your role is twofold:
1. Act as a thoughtful, insightful writing coach in the chat conversation.
2. Generate and refine polished LinkedIn posts directly on the Canvas.

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

OUTPUT FORMAT RULES:
Always structure your response using this exact delimiter:

<<<THOUGHTS>>>
[Your complete, helpful response to the user. Be concise but thorough. Use a friendly, expert tone. Give actionable advice, specific examples, or clear brainstorming output as needed.]

Do NOT include a <<<POST>>> section. You are in assistant mode — just provide helpful conversational responses.`;

const VALID_TONES = [
  "Authoritative & Warm",
  "Conversational",
  "Contrarian",
  "Storytelling",
] as const;
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
  return "The AI provider is unavailable. Please try again.";
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_CHARS = 4000;

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

function toSseStream(
  textStream: AsyncIterable<string>,
  userId: string,
  creditType: "subscription" | "topup" | "auto" = "auto",
  workspaceId?: string,
) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of textStream) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`,
            ),
          );
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

        const { input, tone, images, mode, workspaceId, history, currentDraft } = (body ?? {}) as {
          input?: unknown;
          tone?: unknown;
          images?: unknown;
          mode?: unknown;
          workspaceId?: unknown;
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

        // 2. Resolve plan and check feature gating (voice notes require Studio or Teams)
        const [planRes, profRes] = await Promise.all([
          resolvedWsId
            ? supabaseAdmin.rpc("get_workspace_plan", { p_workspace_id: resolvedWsId })
            : supabaseAdmin.rpc("get_user_plan", { _user_id: userId }),
          supabaseAdmin.from("profiles").select("voice_notes").eq("user_id", userId).maybeSingle(),
        ]);
        const userPlan = (planRes.data as PlanTier | null) ?? "trial";
        const allowsVoiceMapping = PLAN_LIMITS[userPlan]?.voiceMapping ?? false;
        const rawVoiceNotes = (profRes.data?.voice_notes ?? "").trim();
        const voiceNotes = allowsVoiceMapping ? rawVoiceNotes : "";

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
          const message =
            credit?.reason === "daily_limit_reached"
              ? "You've hit today's 5-generation cap on the Free plan. Come back tomorrow or upgrade to Studio."
              : credit?.reason === "no_credits"
                ? "You're out of credits. Upgrade or buy a top-up pack to keep generating."
                : "You don't have enough credits for this generation.";
          return jsonResponse({ error: message, code: "NO_CREDITS" }, 402);
        }
        const creditSource = (
          credit?.source === "topup"
            ? "topup"
            : credit?.source === "subscription"
              ? "subscription"
              : "auto"
        ) as "subscription" | "topup" | "auto";

        const isAssistantMode = mode === "assistant";
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
        const voiceBlock = voiceNotes
          ? `\n\nWriter's voice notes (follow these strictly):\n"""\n${voiceNotes.slice(0, 1500)}\n"""`
          : "";
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
            history: conversationHistory,
          });
        } catch (error) {
          console.error("[generate] AI provider request failed", error);
          await refundCredit(userId, creditSource, resolvedWsId);
          return jsonResponse({ error: providerErrorMessage(error) }, 502);
        }

        return new Response(toSseStream(textStream, userId, creditSource, resolvedWsId), {
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
